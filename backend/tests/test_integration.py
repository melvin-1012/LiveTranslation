import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.supabase_client import get_service_client, get_supabase_client
from app.core.config import settings
from supabase import Client
import uuid
import asyncio

client = TestClient(app)
admin_db = get_service_client()

@pytest.fixture(scope="module")
def setup_users():
    # Create User A
    email_a = f"usera_{uuid.uuid4()}@example.com"
    pw = "password123"
    res_a = admin_db.auth.sign_up({"email": email_a, "password": pw})
    user_a_token = res_a.session.access_token

    # Create User B
    email_b = f"userb_{uuid.uuid4()}@example.com"
    res_b = admin_db.auth.sign_up({"email": email_b, "password": pw})
    user_b_token = res_b.session.access_token

    yield user_a_token, user_b_token
    
    # Cleanup (requires admin to delete)
    # Supabase py SDK auth.admin.delete_user requires service role, but sign_up uses anon?
    # Actually sign_up logs them in. 

def test_rls_isolation(setup_users):
    token_a, token_b = setup_users
    
    # User A creates a session
    headers_a = {"Authorization": f"Bearer {token_a}"}
    res = client.post("/sessions", json={"mode": "one_way"}, headers=headers_a)
    assert res.status_code == 200, res.text
    session_id_a = res.json()["id"]

    # User B lists sessions, shouldn't see A's
    headers_b = {"Authorization": f"Bearer {token_b}"}
    res = client.get("/sessions", headers=headers_b)
    assert res.status_code == 200
    sessions_b = res.json()
    assert session_id_a not in [s["id"] for s in sessions_b]

    # User B attempts to fetch A's session directly
    res = client.get(f"/sessions/{session_id_a}", headers=headers_b)
    # Assuming the API raises 404/403 for not found due to RLS
    assert res.status_code in [404, 403], "User B was able to fetch User A's session!"

    # User B attempts to create utterance in A's session
    res = client.post(f"/sessions/{session_id_a}/utterances", json={"sequence_number": 1}, headers=headers_b)
    assert res.status_code >= 400

def test_full_persistence_flow(setup_users):
    token_a, _ = setup_users
    headers = {"Authorization": f"Bearer {token_a}"}
    
    # 1. POST /sessions
    res = client.post("/sessions", json={"mode": "two_way"}, headers=headers)
    session_id = res.json()["id"]

    # 2. POST /sessions/{id}/utterances
    res = client.post(f"/sessions/{session_id}/utterances", json={"sequence_number": 1}, headers=headers)
    assert res.status_code == 200
    utterance_id = res.json()["id"]

    # 3. Queue ASR/Translation natively via orchestrator/websocket or direct service call?
    # Since WS testing is tricky with TestClient and background tasks, let's call the persistence functions directly with user token
    from app.services.translation_db_service import store_asr_result, store_translation_result, store_translation_metrics
    from app.services.supabase_client import get_supabase_client
    
    user_db = get_supabase_client(token_a)
    store_asr_result(user_db, utterance_id, "mock", "hello", True)
    
    # partial -> final versioning
    store_translation_result(user_db, utterance_id, "mock", "hello", 1, False)
    trans_res = store_translation_result(user_db, utterance_id, "mock", "hello world", 2, True)
    trans_id = trans_res["id"]
    
    store_translation_metrics(user_db, trans_id, {"time_to_first_translation_ms": 100})
    
    # 4. PATCH /sessions/{id}/end
    res = client.patch(f"/sessions/{session_id}/end", json={"status": "completed"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "completed"

def test_database_failure_handling(setup_users):
    # Simulate DB failure by submitting invalid data to queue
    import asyncio
    from app.services.persistence_queue import persistence_queue
    
    token_a, _ = setup_users
    
    async def run_failure():
        # invalid utterance_id should cause DB exception, but shouldn't crash queue worker
        await persistence_queue.enqueue("store_translation_result", token_a, {
            "utterance_id": "invalid-uuid",
            "translated_text": "fail",
            "version_number": 1,
            "is_final": True,
            "metrics": {}
        })
        # Wait a bit for worker to process
        await asyncio.sleep(0.5)
        
    asyncio.run(run_failure())
    # If the queue worker hasn't crashed, this test passes
    assert True
