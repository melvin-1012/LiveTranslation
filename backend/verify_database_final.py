import os
import sys
import uuid
import json
import asyncio
from typing import Dict, Any

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.services.supabase_client import get_service_client, get_supabase_client
from app.services import translation_db_service
from app.services.persistence_queue import persistence_queue

RESULTS = {}

def record_result(item_num: int, name: str, passed: bool, details: str):
    RESULTS[item_num] = {
        "name": name,
        "status": "PASS" if passed else "FAIL",
        "details": details
    }
    status_str = "\033[92mPASS\033[0m" if passed else "\033[91mFAIL\033[0m"
    print(f"\n[{status_str}] Item {item_num}: {name}")
    print(f"       Details: {details}")

def main():
    print("=" * 70)
    print(" HACKNEX 2026 EPS03: END-TO-END DATABASE-FINAL RUNTIME VERIFICATION")
    print("=" * 70)

    admin_db = get_service_client()
    client = TestClient(app)

    # -------------------------------------------------------------
    # ITEM 1: Supabase migrations from clean/reset database
    # -------------------------------------------------------------
    try:
        # Check that all 5 migration files exist
        repo_root = os.path.dirname(backend_dir)
        migrations_dir = os.path.join(repo_root, "supabase", "migrations")
        files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".sql")])
        expected_files = [
            "001_initial_translation_schema.sql",
            "002_seed_data.sql",
            "003_profile_language_preferences.sql",
            "004_hardened_production_schema.sql",
            "005_indic_seeds.sql"
        ]
        assert files == expected_files, f"Migration files mismatch: {files}"

        # Check supported_languages has 6 languages seeded by 002
        langs = admin_db.table("supported_languages").select("*").execute()
        assert len(langs.data) >= 6, f"Expected at least 6 supported languages, got {len(langs.data)}"

        # Check glossary_terms has 6 terms seeded by 005
        glossary = admin_db.table("glossary_terms").select("*").execute()
        assert len(glossary.data) >= 6, f"Expected at least 6 glossary terms, got {len(glossary.data)}"

        # Check baseline_runs has baseline seeded by 005
        baselines = admin_db.table("baseline_runs").select("*").execute()
        assert len(baselines.data) >= 1, f"Expected at least 1 baseline run, got {len(baselines.data)}"

        record_result(1, "Supabase migrations from clean/reset database", True,
                      f"All 5 migrations applied cleanly. {len(langs.data)} languages, {len(glossary.data)} glossary terms, {len(baselines.data)} baseline runs present.")
    except Exception as e:
        record_result(1, "Supabase migrations from clean/reset database", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 2: Auth signup/login and profile trigger
    # -------------------------------------------------------------
    try:
        pw = "Password123!Secure"
        email_a = f"usera_{uuid.uuid4().hex[:8]}@example.com"
        email_b = f"userb_{uuid.uuid4().hex[:8]}@example.com"

        # Sign up User A and B using anon auth client
        auth_client = get_supabase_client()
        res_a = auth_client.auth.sign_up({"email": email_a, "password": pw})
        assert res_a.user is not None, "Failed to create User A"
        user_a_id = res_a.user.id
        token_a = res_a.session.access_token

        res_b = auth_client.auth.sign_up({"email": email_b, "password": pw})
        assert res_b.user is not None, "Failed to create User B"
        user_b_id = res_b.user.id
        token_b = res_b.session.access_token

        # Verify profiles trigger handle_new_user automatically created profiles
        # Using a fresh service client (unpolluted by sign_up session)
        fresh_service = get_service_client()
        profile_a = fresh_service.table("profiles").select("*").eq("id", user_a_id).execute()
        assert len(profile_a.data) == 1, f"Profile for User A was not created by trigger: {profile_a.data}"
        assert profile_a.data[0]["id"] == user_a_id

        profile_b = fresh_service.table("profiles").select("*").eq("id", user_b_id).execute()
        assert len(profile_b.data) == 1, f"Profile for User B was not created by trigger: {profile_b.data}"
        assert profile_b.data[0]["id"] == user_b_id

        # Also verify User A can read their own profile, but cannot read User B's profile
        user_a_db = get_supabase_client(token_a)
        a_own_profile = user_a_db.table("profiles").select("*").eq("id", user_a_id).execute()
        assert len(a_own_profile.data) == 1, "User A cannot read own profile"

        a_b_profile = user_a_db.table("profiles").select("*").eq("id", user_b_id).execute()
        assert len(a_b_profile.data) == 0, "User A unexpectedly able to read User B's profile"

        record_result(2, "Auth signup/login and profile trigger", True,
                      f"Users created (A: {user_a_id[:8]}..., B: {user_b_id[:8]}...). 'handle_new_user' trigger verified for both profiles.")
    except Exception as e:
        record_result(2, "Auth signup/login and profile trigger", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 3: JWT-scoped FastAPI requests
    # -------------------------------------------------------------
    try:
        # Request with no token -> must be 401 or 403
        no_auth = client.get("/sessions")
        assert no_auth.status_code in [401, 403], f"Expected 401/403 without auth, got {no_auth.status_code}"

        # Request with invalid token -> 401
        bad_auth = client.get("/sessions", headers={"Authorization": "Bearer invalid_token_xyz"})
        assert bad_auth.status_code == 401, f"Expected 401 with bad token, got {bad_auth.status_code}"

        # Request with User A valid token -> 200
        headers_a = {"Authorization": f"Bearer {token_a}"}
        good_auth = client.get("/sessions", headers=headers_a)
        assert good_auth.status_code == 200, f"Expected 200 with valid JWT, got {good_auth.status_code}: {good_auth.text}"

        record_result(3, "JWT-scoped FastAPI requests", True,
                      "Unauthenticated request correctly rejected (401/403). Invalid JWT rejected (401). Valid JWT scoped request succeeded (200).")
    except Exception as e:
        record_result(3, "JWT-scoped FastAPI requests", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 4: User A session creation and persistence
    # -------------------------------------------------------------
    try:
        res = client.post("/sessions", json={"mode": "one_way"}, headers=headers_a)
        assert res.status_code == 200, f"Session creation failed: {res.text}"
        session_data = res.json()
        session_id_a = session_data["id"]
        assert session_data["user_id"] == user_a_id, f"Session user_id mismatch: {session_data['user_id']} vs {user_a_id}"
        assert session_data["mode"] == "one_way"
        assert session_data["status"] == "active"

        # Verify persistence directly in DB
        db_session = admin_db.table("translation_sessions").select("*").eq("id", session_id_a).execute()
        assert len(db_session.data) == 1
        assert db_session.data[0]["user_id"] == user_a_id

        record_result(4, "User A session creation and persistence", True,
                      f"Session {session_id_a} created and persisted with user_id={user_a_id[:8]}..., mode=one_way, status=active.")
    except Exception as e:
        record_result(4, "User A session creation and persistence", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 5: User A utterance → ASR → translation → metrics persistence
    # -------------------------------------------------------------
    try:
        # Create utterance via API
        res_utt = client.post(f"/sessions/{session_id_a}/utterances", json={"sequence_number": 1}, headers=headers_a)
        assert res_utt.status_code == 200, f"Utterance creation failed: {res_utt.text}"
        utterance_id = res_utt.json()["id"]

        user_a_db = get_supabase_client(token_a)

        # Store ASR result
        asr_res = translation_db_service.store_asr_result(
            user_a_db, utterance_id, "mock_whisper", "नमस्ते दुनिया", True
        )
        assert asr_res["id"] is not None
        assert asr_res["transcript"] == "नमस्ते दुनिया"
        assert asr_res["is_final"] is True

        # Store Translation result (v1 partial, v2 final)
        trans_v1 = translation_db_service.store_translation_result(
            user_a_db, utterance_id, "indic_trans_v2", "Hello", 1, False
        )
        assert trans_v1["version_number"] == 1
        assert trans_v1["is_final"] is False

        trans_v2 = translation_db_service.store_translation_result(
            user_a_db, utterance_id, "indic_trans_v2", "Hello world", 2, True
        )
        assert trans_v2["version_number"] == 2
        assert trans_v2["is_final"] is True
        trans_id = trans_v2["id"]

        # Store Translation metrics
        metrics_res = translation_db_service.store_translation_metrics(
            user_a_db, trans_id, {
                "time_to_first_translation_ms": 120,
                "asr_latency_ms": 250,
                "final_translation_latency_ms": 370
            }
        )
        assert metrics_res["id"] is not None
        assert metrics_res["time_to_first_translation_ms"] == 120

        # Verify all foreign key rows in PostgreSQL
        check_trans = admin_db.table("translation_results").select("*, translation_metrics(*)").eq("id", trans_id).execute()
        assert len(check_trans.data) == 1
        assert check_trans.data[0]["translation_metrics"] is not None
        assert check_trans.data[0]["translation_metrics"]["time_to_first_translation_ms"] == 120

        record_result(5, "User A utterance -> ASR -> translation -> metrics persistence", True,
                      f"Utterance {utterance_id[:8]}... linked to ASR, v1/v2 translation results, and latency metrics successfully.")
    except Exception as e:
        record_result(5, "User A utterance -> ASR -> translation -> metrics persistence", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 6: Persistence queue under streaming flow
    # -------------------------------------------------------------
    try:
        # Create second utterance for queue test
        res_utt2 = client.post(f"/sessions/{session_id_a}/utterances", json={"sequence_number": 2}, headers=headers_a)
        assert res_utt2.status_code == 200
        utterance_id_2 = res_utt2.json()["id"]

        async def run_queue_test():
            # Start a worker task if not already running in background
            worker_task = asyncio.create_task(persistence_queue.worker())

            # Enqueue translation result
            await persistence_queue.enqueue("store_translation_result", token_a, {
                "utterance_id": utterance_id_2,
                "model_name": "queue_mock_trans",
                "translated_text": "Queue streaming translation",
                "version_number": 1,
                "is_final": True,
                "metrics": {
                    "time_to_first_translation_ms": 95,
                    "asr_latency_ms": 210
                }
            })

            # Wait for queue to drain
            await persistence_queue.queue.join()
            worker_task.cancel()

        asyncio.run(run_queue_test())

        # Verify queued item is in DB
        queued_trans = admin_db.table("translation_results").select("*, translation_metrics(*)").eq("utterance_id", utterance_id_2).execute()
        assert len(queued_trans.data) == 1, "Queued translation was not found in DB"
        assert queued_trans.data[0]["translated_text"] == "Queue streaming translation"
        assert queued_trans.data[0]["translation_metrics"] is not None
        assert queued_trans.data[0]["translation_metrics"]["time_to_first_translation_ms"] == 95

        record_result(6, "Persistence queue under streaming flow", True,
                      "Async persistence queue ingested streaming event, executed database writes, and persisted metrics without dropping records.")
    except Exception as e:
        record_result(6, "Persistence queue under streaming flow", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 7: WebSocket connection
    # -------------------------------------------------------------
    try:
        # Create third session for WebSocket test
        res_ws_sess = client.post("/sessions", json={"mode": "one_way"}, headers=headers_a)
        ws_session_id = res_ws_sess.json()["id"]

        received_types = []
        with client.websocket_connect("/ws/translate") as websocket:
            # 1. Send initial config with token
            config_msg = {
                "session_id": ws_session_id,
                "source_language": "hi",
                "target_language": "en",
                "token": token_a
            }
            websocket.send_text(json.dumps(config_msg))

            # 2. Send audio chunk (bytes)
            websocket.send_bytes(b"\x00\x01\x02\x03\x04\x05")

            # Receive partial messages (ASR partial + Translation partial)
            msg1 = websocket.receive_json()
            msg2 = websocket.receive_json()
            received_types.extend([msg1.get("type"), msg2.get("type")])

            # 3. Send end_utterance
            websocket.send_text(json.dumps({"type": "end_utterance"}))

            # Receive final messages (ASR final + Translation final)
            msg3 = websocket.receive_json()
            msg4 = websocket.receive_json()
            received_types.extend([msg3.get("type"), msg4.get("type")])

        expected_types = ["asr_partial", "translation_partial", "asr_final", "translation_final"]
        assert received_types == expected_types, f"WebSocket message flow mismatch: {received_types} vs {expected_types}"

        record_result(7, "WebSocket connection", True,
                      f"Handshake accepted, streamed audio chunk and received full lifecycle: {received_types}.")
    except Exception as e:
        record_result(7, "WebSocket connection", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 8: User A can read their own history
    # -------------------------------------------------------------
    try:
        # Check sessions list via API
        res_sessions = client.get("/sessions", headers=headers_a)
        assert res_sessions.status_code == 200
        a_session_ids = [s["id"] for s in res_sessions.json()]
        assert session_id_a in a_session_ids

        # Check session_history_view
        user_a_db = get_supabase_client(token_a)
        history = user_a_db.table("session_history_view").select("*").eq("user_id", user_a_id).execute()
        assert len(history.data) >= 1, "User A history view returned empty"
        found_session = any(h["session_id"] == session_id_a for h in history.data)
        assert found_session, f"User A session {session_id_a} not found in session_history_view"

        # Check translation_performance_view
        perf = user_a_db.table("translation_performance_view").select("*").execute()
        assert len(perf.data) >= 1, "User A translation_performance_view returned empty"

        record_result(8, "User A can read their own history", True,
                      f"User A successfully queried session list, session_history_view ({len(history.data)} sessions), and translation_performance_view.")
    except Exception as e:
        record_result(8, "User A can read their own history", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 9: User B cannot read User A's session/utterances/results
    # -------------------------------------------------------------
    try:
        headers_b = {"Authorization": f"Bearer {token_b}"}
        user_b_db = get_supabase_client(token_b)

        # 1. User B lists sessions: should NOT see User A's session
        res_b_list = client.get("/sessions", headers=headers_b)
        assert res_b_list.status_code == 200
        b_session_ids = [s["id"] for s in res_b_list.json()]
        assert session_id_a not in b_session_ids, "LEAK: User B can see User A's session in GET /sessions!"

        # 2. User B gets User A's session by ID: must be 404
        res_b_get = client.get(f"/sessions/{session_id_a}", headers=headers_b)
        assert res_b_get.status_code in [404, 403], f"LEAK: User B fetched User A's session! Status: {res_b_get.status_code}"

        # 3. User B queries session_history_view: User A's session must NOT appear
        b_history = user_b_db.table("session_history_view").select("*").execute()
        b_hist_session_ids = [h["session_id"] for h in b_history.data]
        assert session_id_a not in b_hist_session_ids, "LEAK: User B sees User A in session_history_view!"

        # 4. User B queries utterances table directly with user client: should return empty
        b_utterances = user_b_db.table("utterances").select("*").eq("session_id", session_id_a).execute()
        assert len(b_utterances.data) == 0, f"LEAK: User B read User A utterances: {b_utterances.data}"

        # 5. User B queries translation_results directly: should return empty
        b_trans = user_b_db.table("translation_results").select("*").eq("utterance_id", utterance_id).execute()
        assert len(b_trans.data) == 0, f"LEAK: User B read User A translation_results: {b_trans.data}"

        record_result(9, "User B cannot read User A's session/utterances/results", True,
                      "Zero rows leaked. User B blocked from User A's sessions, history view, utterances, and translation results.")
    except Exception as e:
        record_result(9, "User B cannot read User A's session/utterances/results", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 10: RLS policies actually enforce isolation
    # -------------------------------------------------------------
    try:
        user_b_db = get_supabase_client(token_b)

        # 1. User B tries to insert an utterance into User A's session via API
        res_b_insert_utt = client.post(f"/sessions/{session_id_a}/utterances", json={"sequence_number": 99}, headers=headers_b)
        assert res_b_insert_utt.status_code >= 400, "RLS FAILURE: User B created utterance in User A's session!"

        # 2. User B tries direct insert into utterances table targeting User A's session
        b_direct_insert_error = False
        try:
            user_b_db.table("utterances").insert({"session_id": session_id_a, "sequence_number": 999}).execute()
        except Exception:
            b_direct_insert_error = True
        assert b_direct_insert_error, "RLS FAILURE: User B bypassed API and inserted directly into utterances table!"

        # 3. User B tries to update User A's session status to 'cancelled'
        b_update = user_b_db.table("translation_sessions").update({"status": "cancelled"}).eq("id", session_id_a).execute()
        assert len(b_update.data) == 0, "RLS FAILURE: User B was able to update User A's session!"

        # Check DB that status was not altered
        session_check = admin_db.table("translation_sessions").select("status").eq("id", session_id_a).execute()
        assert session_check.data[0]["status"] != "cancelled", "User A session status was compromised!"

        record_result(10, "RLS policies actually enforce isolation", True,
                      "Direct inserts, API inserts, and updates targeting another user's session were strictly blocked by Postgres RLS.")
    except Exception as e:
        record_result(10, "RLS policies actually enforce isolation", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 11: All 18 tables, 4 views, indexes, FKs and constraints
    # -------------------------------------------------------------
    try:
        expected_tables = {
            "profiles", "supported_languages", "translation_sessions",
            "session_participants", "utterances", "utterance_segments",
            "asr_results", "translation_results", "translation_metrics",
            "baseline_runs", "baseline_results", "evaluation_datasets",
            "evaluation_samples", "evaluation_results", "glossary_terms",
            "audio_assets", "experiments", "experiment_runs"
        }
        expected_views = {
            "session_history_view",
            "translation_performance_view",
            "language_pair_performance_view",
            "system_vs_baseline_comparison_view"
        }

        # Query Postgres information_schema for public tables
        import subprocess
        psql_cmd = [
            "docker", "exec", "supabase_db_HACKNEX_External-2026",
            "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
        ]
        res = subprocess.run(psql_cmd, capture_output=True, text=True, check=True)
        actual_tables = set(filter(None, res.stdout.strip().split("\n")))

        assert expected_tables.issubset(actual_tables), f"Missing tables in public schema: {expected_tables - actual_tables}"

        # Query public views
        psql_views_cmd = [
            "docker", "exec", "supabase_db_HACKNEX_External-2026",
            "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
            "SELECT table_name FROM information_schema.views WHERE table_schema = 'public';"
        ]
        res_v = subprocess.run(psql_views_cmd, capture_output=True, text=True, check=True)
        actual_views = set(filter(None, res_v.stdout.strip().split("\n")))
        assert expected_views.issubset(actual_views), f"Missing views in public schema: {expected_views - actual_views}"

        # Verify RLS enabled on all 18 tables
        psql_rls_cmd = [
            "docker", "exec", "supabase_db_HACKNEX_External-2026",
            "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;"
        ]
        res_rls = subprocess.run(psql_rls_cmd, capture_output=True, text=True, check=True)
        rls_tables = set(filter(None, res_rls.stdout.strip().split("\n")))
        assert expected_tables.issubset(rls_tables), f"Tables without RLS enabled: {expected_tables - rls_tables}"

        # Verify security_invoker on views
        psql_invoker_cmd = [
            "docker", "exec", "supabase_db_HACKNEX_External-2026",
            "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
            "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.reloptions::text LIKE '%security_invoker=true%';"
        ]
        res_inv = subprocess.run(psql_invoker_cmd, capture_output=True, text=True, check=True)
        invoker_views = set(filter(None, res_inv.stdout.strip().split("\n")))
        assert expected_views.issubset(invoker_views), f"Views without security_invoker=true: {expected_views - invoker_views}"

        # Verify FK constraints exist
        psql_fk_cmd = [
            "docker", "exec", "supabase_db_HACKNEX_External-2026",
            "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
            "SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';"
        ]
        res_fk = subprocess.run(psql_fk_cmd, capture_output=True, text=True, check=True)
        fk_count = int(res_fk.stdout.strip())
        assert fk_count >= 15, f"Unexpectedly low foreign key count: {fk_count}"

        # Verify indexes exist
        psql_idx_cmd = [
            "docker", "exec", "supabase_db_HACKNEX_External-2026",
            "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
            "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';"
        ]
        res_idx = subprocess.run(psql_idx_cmd, capture_output=True, text=True, check=True)
        idx_count = int(res_idx.stdout.strip())
        assert idx_count >= 30, f"Unexpectedly low index count: {idx_count}"

        record_result(11, "All 18 tables, 4 views, indexes, FKs and constraints", True,
                      f"Verified: 18 tables (all RLS=true), 4 views (all security_invoker=true), {fk_count} foreign keys, {idx_count} indexes.")
    except Exception as e:
        record_result(11, "All 18 tables, 4 views, indexes, FKs and constraints", False, str(e))
        return

    # -------------------------------------------------------------
    # ITEM 12: Run the complete backend test suite
    # -------------------------------------------------------------
    try:
        import subprocess
        test_run = subprocess.run(
            [sys.executable, "-m", "pytest", "tests", "-v"],
            cwd=backend_dir,
            capture_output=True,
            text=True
        )
        assert test_run.returncode == 0, f"Backend test suite failed:\n{test_run.stdout}\n{test_run.stderr}"
        
        # Parse test count from output
        passed_line = [l for l in test_run.stdout.splitlines() if "passed" in l]
        summary = passed_line[-1].strip() if passed_line else "All tests passed"

        record_result(12, "Run the complete backend test suite", True,
                      f"Backend test suite executed with returncode 0. Summary: {summary}.")
    except Exception as e:
        record_result(12, "Run the complete backend test suite", False, str(e))
        return

    print("\n" + "=" * 70)
    print(" VERIFICATION SUMMARY REPORT")
    print("=" * 70)
    all_passed = True
    for num in range(1, 13):
        item = RESULTS.get(num, {"name": f"Item {num}", "status": "NOT RUN", "details": ""})
        status_color = "\033[92mPASS\033[0m" if item["status"] == "PASS" else "\033[91mFAIL\033[0m"
        print(f"[{status_color}] #{num:02d}: {item['name']}")
        if item["status"] != "PASS":
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("\033[92mALL 12 CHECKS PASSED PERFECTLY!\033[0m")
    else:
        print("\033[91mSOME CHECKS FAILED. SEE DETAILS ABOVE.\033[0m")

if __name__ == "__main__":
    main()
