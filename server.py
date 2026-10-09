from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import asyncio
import os
import sys
import uuid
import time
import httpx
import base64
from pathlib import Path
from dotenv import load_dotenv
import websockets as ws_client
import requests

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Load variables from root .env and backend/.env
root_dir = Path(__file__).resolve().parent
load_dotenv(root_dir / ".env")
load_dotenv(root_dir / "backend" / ".env")

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY") or os.environ.get("ASR_API_KEY", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY") or os.environ.get("TRANSLATION_API_KEY", "")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yisescosbfuwpddywurr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_GjdQtqDNXkJbuRJaGHi-qw_cEf7I9Z3")

DRAVIDIAN_LANGUAGES = {'ta', 'te', 'kn', 'ml'}

LANGUAGE_MAP = {
    "en": "en-IN",
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN"
}


def get_asr_backend(source_language: str, deepgram_api_key: str, sarvam_api_key: str):
    if source_language == "auto":
        if not sarvam_api_key:
            raise ValueError("Auto-detection requires SARVAM_API_KEY to be configured.")
        return (
            "wss://api.sarvam.ai/speech-to-text-realtime/ws"
            "?language_code=auto&model=saaras:v4",
            {"api-subscription-key": sarvam_api_key},
            "sarvam-saaras-v4",
            True,
        )

    use_sarvam = source_language == "ml" or (
        not deepgram_api_key and bool(sarvam_api_key)
    )
    if use_sarvam and sarvam_api_key:
        sarvam_language = LANGUAGE_MAP.get(source_language, "ml-IN")
        return (
            "wss://api.sarvam.ai/speech-to-text-realtime/ws"
            f"?language_code={sarvam_language}&model=saaras:v4",
            {"api-subscription-key": sarvam_api_key},
            "sarvam-saaras-v4",
            True,
        )
    if deepgram_api_key:
        deepgram_model = "nova-3" if source_language in DRAVIDIAN_LANGUAGES else "nova-2"
        return (
            "wss://api.deepgram.com/v1/listen"
            f"?model={deepgram_model}&encoding=linear16&sample_rate=16000"
            f"&language={source_language}",
            {"Authorization": f"Token {deepgram_api_key}"},
            f"deepgram-{deepgram_model}",
            False,
        )
    return None, {}, "mock-asr", False


def normalize_sarvam_language(language: str) -> str | None:
    if not isinstance(language, str) or not language:
        return None
    normalized = language.lower().replace("_", "-").split("-", 1)[0]
    return normalized if normalized in LANGUAGE_MAP else None


def parse_sarvam_transcript(response: dict) -> dict | None:
    event = response.get("event") or ""
    transcript = response.get("text") or response.get("transcript") or ""
    if not transcript or not isinstance(event, str) or not event.startswith("transcript"):
        return None
    return {
        "text": transcript,
        "is_final": response.get("is_final", event.endswith(".final")),
        "language": response.get("language"),
        "language_confidence": response.get("language_confidence"),
    }


def get_supabase_client(token: str = None):
    try:
        from supabase import create_client, ClientOptions
        if token:
            return create_client(
                SUPABASE_URL,
                SUPABASE_ANON_KEY,
                options=ClientOptions(headers={"Authorization": f"Bearer {token}"})
            )
        if SUPABASE_KEY:
            return create_client(SUPABASE_URL, SUPABASE_KEY)
        if SUPABASE_ANON_KEY:
            return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    except Exception as e:
        print(f"Supabase client initialization notice: {e}")
    return None

app = FastAPI(title="Live Indic Speech Translation Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST endpoints from backend app if available
try:
    import sys
    sys_path_backend = str(root_dir / "backend")
    if sys_path_backend not in sys.path:
        sys.path.insert(0, sys_path_backend)
    from app.api.endpoints import sessions, utterances, glossary
    app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
    app.include_router(utterances.router, prefix="/sessions", tags=["utterances"])
    app.include_router(glossary.router, prefix="/glossary", tags=["glossary"])
except Exception as e:
    print(f"[Notice] REST router inclusion: {e}")

async def translate_text_google(text: str, target_lang: str) -> str:
    if not GOOGLE_API_KEY or not text.strip():
        return ""
        
    def fetch_translation():
        url = f"https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}"
        payload = {"q": text, "target": target_lang, "format": "text"}
        response = requests.post(url, json=payload, timeout=6.0)
        if response.status_code == 200:
            return response.json()["data"]["translations"][0]["translatedText"]
        return ""

    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, fetch_translation)
    except Exception as e:
        print(f"Google Translation error: {e}")
        return ""

async def translate_text_sarvam(text: str, source_lang: str, target_lang: str) -> str:
    if not SARVAM_API_KEY or not text.strip():
        return ""
    
    url = "https://api.sarvam.ai/translate"
    payload = {
        "input": text,
        "source_language_code": LANGUAGE_MAP.get(source_lang, "en-IN"),
        "target_language_code": LANGUAGE_MAP.get(target_lang, "hi-IN"),
        "speaker_gender": "Male",
        "mode": "formal",
        "model": "sarvam-translate:v1",
        "enable_code_mixing": True
    }
    headers = {"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=8.0)
            resp.raise_for_status()
            data = resp.json()
            return data.get("translated_text") or data.get("translation") or text
        except Exception as e:
            print(f"Sarvam Translate API Error: {e}")
            return ""

async def text_to_speech_sarvam(text: str, target_lang: str) -> str:
    """Returns Base64 encoded audio string from Sarvam TTS"""
    if not SARVAM_API_KEY or not text.strip():
        return None
        
    url = "https://api.sarvam.ai/text-to-speech"
    payload = {
        "inputs": [text],
        "target_language_code": LANGUAGE_MAP.get(target_lang, "hi-IN"),
        "speaker": "ritu",
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.5,
        "speech_sample_rate": 8000,
        "enable_preprocessing": True,
        "model": "bulbul:v3"
    }
    headers = {"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=10.0)
            resp.raise_for_status()
            return resp.json().get("audios", [None])[0]
        except Exception as e:
            print(f"Sarvam TTS Error: {e}")
            return None

async def route_translation(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    """Intelligently routes translation to Sarvam or Google, with graceful fallback."""
    if not text.strip():
        return "", "none"
        
    is_dravidian_source = source_lang in DRAVIDIAN_LANGUAGES
    is_dravidian_or_en_target = target_lang in DRAVIDIAN_LANGUAGES or target_lang == "en"
    use_sarvam = (is_dravidian_source and is_dravidian_or_en_target) or (target_lang in DRAVIDIAN_LANGUAGES)

    if use_sarvam and SARVAM_API_KEY:
        print(f"--> [Translate] Routing {source_lang} -> {target_lang} to Sarvam Translate API (Dravidian Pair)")
        translated = await translate_text_sarvam(text, source_lang, target_lang)
        if translated:
            return translated, "sarvam-translate:v1"

    if GOOGLE_API_KEY:
        print(f"--> [Translate] Routing {source_lang} -> {target_lang} to Google Translate API")
        translated = await translate_text_google(text, target_lang)
        if translated:
            return translated, "google-translate"

    if SARVAM_API_KEY:
        translated = await translate_text_sarvam(text, source_lang, target_lang)
        if translated:
            return translated, "sarvam-translate:v1"

    # Fallback simulation if no API keys are present
    return f"[{target_lang.upper()}]: {text}", "mock-translation"

def save_turn_to_database(
    db,
    session_id: str,
    sequence_num: int,
    transcript: str,
    translated: str,
    source_lang_id: str = None,
    target_lang_id: str = None,
    asr_model: str = "asr-model",
    trans_model: str = "sarvam-translate:v1",
    latency_ms: int = 150
):
    if not db or not session_id or not transcript.strip():
        return
    try:
        u_id = str(uuid.uuid4())
        utterance_payload = {
            "id": u_id,
            "session_id": session_id,
            "sequence_number": sequence_num,
            "source_text": transcript,
            "is_code_mixed": False,
            "confidence": 0.95
        }
        if source_lang_id:
            utterance_payload["detected_language_id"] = source_lang_id

        db.table('utterances').insert(utterance_payload).execute()

        asr_payload = {
            "id": str(uuid.uuid4()),
            "utterance_id": u_id,
            "model_name": asr_model,
            "transcript": transcript,
            "is_final": True,
            "asr_status": "final",
            "confidence": 0.95
        }
        if source_lang_id:
            asr_payload["language_id"] = source_lang_id
        db.table('asr_results').insert(asr_payload).execute()

        tr_id = str(uuid.uuid4())
        trans_payload = {
            "id": tr_id,
            "utterance_id": u_id,
            "model_name": trans_model,
            "translated_text": translated,
            "translation_status": "final",
            "is_final": True,
            "version_number": 1,
            "confidence": 0.95
        }
        if source_lang_id:
            trans_payload["source_language_id"] = source_lang_id
        if target_lang_id:
            trans_payload["target_language_id"] = target_lang_id
        db.table('translation_results').insert(trans_payload).execute()

        try:
            db.table('translation_metrics').insert({
                "id": str(uuid.uuid4()),
                "translation_result_id": tr_id,
                "time_to_first_translation_ms": 120,
                "end_to_end_latency_ms": latency_ms,
                "caption_rewrite_count": 0,
                "caption_stability_score": 1.0
            }).execute()
        except Exception:
            pass

        print(f"[OK] Utterance #{sequence_num} persisted to Supabase database (Session: {session_id[:8]}...)")
    except Exception as e:
        print(f"[Notice] Database turn persistence: {e}")

@app.websocket("/ws/translate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Frontend Client connected to /ws/translate")

    current_target_lang = "hi"
    current_source_lang = "en"
    session_id = None
    source_language_id = None
    target_language_id = None
    user_token = None
    db_client = None

    utterance_sequence = 0
    message_queue = asyncio.Queue()

    async def frontend_receiver():
        nonlocal current_target_lang, current_source_lang, session_id
        nonlocal source_language_id, target_language_id, user_token, db_client
        try:
            while True:
                try:
                    message = await websocket.receive()
                except WebSocketDisconnect:
                    await message_queue.put({"type": "disconnect"})
                    break

                if message.get("type") == "websocket.disconnect":
                    await message_queue.put({"type": "disconnect"})
                    break

                if "text" in message and message["text"]:
                    try:
                        data = json.loads(message["text"])
                        # Initial configuration from ws_translation.js
                        if "session_id" in data:
                            session_id = data["session_id"]
                            print(f"[Session] Linked Translation Session ID: {session_id}")
                        if "token" in data:
                            user_token = data["token"]
                            db_client = get_supabase_client(user_token)
                        if "source_language_id" in data:
                            source_language_id = data["source_language_id"]
                        if "target_language_id" in data:
                            target_language_id = data["target_language_id"]

                        old_source = current_source_lang
                        if "target_language" in data:
                            current_target_lang = data["target_language"]
                        elif "language" in data:
                            current_target_lang = data["language"]

                        if "source_language" in data:
                            current_source_lang = data["source_language"]
                            if current_source_lang != old_source:
                                print(f"[Lang] Source language switch: {old_source} -> {current_source_lang}")
                                await message_queue.put({"type": "reconnect"})

                        if data.get("type") == "end_utterance":
                            await message_queue.put({"type": "end_utterance"})

                        # Text-to-Text translation request
                        if "text_to_translate" in data:
                            txt = data["text_to_translate"]
                            translated, provider = await route_translation(
                                txt, current_source_lang, current_target_lang
                            )
                            
                            # Get TTS Audio from Sarvam
                            audio_b64 = await text_to_speech_sarvam(translated, current_target_lang)
                            
                            payload = {
                                "type": "translation_final",
                                "status": "success",
                                "text": translated,
                                "original_text": txt,
                                "translated_text": translated,
                                "target_language": current_target_lang,
                                "is_final": True,
                                "is_text_to_text": True,
                                "audio_base64": audio_b64
                            }
                            await websocket.send_text(json.dumps(payload))

                    except json.JSONDecodeError:
                        pass

                elif "bytes" in message and message["bytes"]:
                    await message_queue.put({"type": "audio", "data": message["bytes"]})

        except WebSocketDisconnect:
            print("[WS] Frontend client disconnected.")
            await message_queue.put({"type": "disconnect"})

    async def asr_streaming_handler():
        nonlocal utterance_sequence
        nonlocal current_source_lang, source_language_id
        while True:
            try:
                backend = get_asr_backend(
                    current_source_lang, DEEPGRAM_API_KEY, SARVAM_API_KEY
                )
            except ValueError as error:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": str(error),
                }))
                return

            ws_url, headers, provider_label, use_sarvam_asr = backend

            if not ws_url:
                # Mock ASR loop
                try:
                    while True:
                        msg = await message_queue.get()
                        if msg["type"] == "disconnect":
                            return
                        if msg["type"] in ("end_utterance", "reconnect"):
                            break
                        if msg["type"] == "audio":
                            await asyncio.sleep(0.05)
                except asyncio.CancelledError:
                    return
                continue

            try:
                async with ws_client.connect(ws_url, additional_headers=headers) as ws_backend:
                    print(f"[ASR] Connected to {provider_label} for language: {current_source_lang}")

                    async def sender():
                        while True:
                            msg = await message_queue.get()
                            if msg["type"] == "disconnect":
                                raise asyncio.CancelledError()
                            elif msg["type"] == "reconnect":
                                return "reconnect"
                            elif msg["type"] == "end_utterance":
                                if use_sarvam_asr:
                                    try:
                                        await ws_backend.send(json.dumps({"event": "flush"}))
                                    except Exception:
                                        pass
                                else:
                                    try:
                                        await ws_backend.send(b'')
                                    except Exception:
                                        pass
                            elif msg["type"] == "audio":
                                if use_sarvam_asr:
                                    b64 = base64.b64encode(msg["data"]).decode("utf-8")
                                    await ws_backend.send(json.dumps({"event": "audio_input", "audio": b64}))
                                else:
                                    await ws_backend.send(msg["data"])

                    async def receiver():
                        nonlocal utterance_sequence
                        nonlocal current_source_lang, source_language_id
                        try:
                            while True:
                                response_str = await ws_backend.recv()
                                response_json = json.loads(response_str)

                                transcript = ""
                                is_final = False
                                detected_language = None
                                language_confidence = None

                                if use_sarvam_asr:
                                    parsed_result = parse_sarvam_transcript(response_json)
                                    if parsed_result:
                                        transcript = parsed_result["text"]
                                        is_final = parsed_result["is_final"]
                                        detected_language = parsed_result["language"]
                                        language_confidence = parsed_result["language_confidence"]
                                else:
                                    is_final = response_json.get("is_final", False)
                                    alternatives = response_json.get("channel", {}).get("alternatives", [])
                                    if alternatives:
                                        transcript = alternatives[0].get("transcript", "")

                                if transcript:
                                    if current_source_lang == "auto":
                                        normalized_language = normalize_sarvam_language(
                                            detected_language or ""
                                        )
                                        if normalized_language:
                                            current_source_lang = normalized_language
                                            try:
                                                language_result = (
                                                    (db_client or get_supabase_client())
                                                    .table("supported_languages")
                                                    .select("id")
                                                    .eq("code", normalized_language)
                                                    .maybe_single()
                                                    .execute()
                                                )
                                                if language_result.data:
                                                    source_language_id = language_result.data["id"]
                                                    if db_client and session_id:
                                                        db_client.table("translation_sessions").update({
                                                            "source_language_id": source_language_id
                                                        }).eq("id", session_id).execute()
                                            except Exception as error:
                                                print(
                                                    "[Notice] Could not persist detected source language: "
                                                    f"{error}"
                                                )
                                        elif is_final:
                                            await websocket.send_text(json.dumps({
                                                "type": "language_detection_failed",
                                                "message": (
                                                    "Could not detect a supported source language. "
                                                    "Please try speaking again."
                                                ),
                                            }))
                                            continue
                                        else:
                                            await websocket.send_text(json.dumps({
                                                "type": "asr_partial",
                                                "status": "success",
                                                "text": transcript,
                                                "original_text": transcript,
                                                "translated_text": "...",
                                                "target_language": current_target_lang,
                                                "is_final": False,
                                            }))
                                            continue

                                    start_time = time.time()
                                    if is_final:
                                        print(f"[ASR Final] ({current_source_lang}): {transcript}")

                                        # Route translation (Sarvam for Dravidian pairs, Google fallback)
                                        translated, trans_model = await route_translation(
                                            transcript, current_source_lang, current_target_lang
                                        )
                                        print(f"[Translation Final] ({current_target_lang}): {translated}")

                                        utterance_sequence += 1
                                        calc_latency = max(80, int((time.time() - start_time) * 1000) + 120)

                                        # Persist turn into Supabase Database
                                        save_turn_to_database(
                                            db=db_client or get_supabase_client(),
                                            session_id=session_id,
                                            sequence_num=utterance_sequence,
                                            transcript=transcript,
                                            translated=translated,
                                            source_lang_id=source_language_id,
                                            target_lang_id=target_language_id,
                                            asr_model=provider_label,
                                            trans_model=trans_model,
                                            latency_ms=calc_latency
                                        )

                                        # Get TTS Audio from Sarvam
                                        audio_b64 = await text_to_speech_sarvam(translated, current_target_lang)

                                        # Send ASR Final and Translation Final to Frontend
                                        payload_asr = {
                                            "type": "asr_final",
                                            "status": "success",
                                            "text": transcript,
                                            "original_text": transcript,
                                            "is_final": True,
                                            "language": current_source_lang,
                                            "language_confidence": language_confidence
                                        }
                                        payload_trans = {
                                            "type": "translation_final",
                                            "status": "success",
                                            "text": translated,
                                            "original_text": transcript,
                                            "translated_text": translated,
                                            "target_language": current_target_lang,
                                            "is_final": True,
                                            "audio_base64": audio_b64
                                        }
                                        try:
                                            await websocket.send_text(json.dumps(payload_asr))
                                            await websocket.send_text(json.dumps(payload_trans))
                                        except WebSocketDisconnect:
                                            break
                                    else:
                                        # Partial Transcript
                                        payload_partial = {
                                            "type": "asr_partial",
                                            "status": "success",
                                            "text": transcript,
                                            "original_text": transcript,
                                            "translated_text": "...",
                                            "target_language": current_target_lang,
                                            "is_final": False,
                                            "language": current_source_lang,
                                            "language_confidence": language_confidence
                                        }
                                        try:
                                            await websocket.send_text(json.dumps(payload_partial))
                                        except WebSocketDisconnect:
                                            break

                        except ws_client.exceptions.ConnectionClosed:
                            pass

                    sender_task = asyncio.create_task(sender())
                    receiver_task = asyncio.create_task(receiver())

                    done, pending = await asyncio.wait(
                        [sender_task, receiver_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )

                    for task in pending:
                        task.cancel()

                    if sender_task in done:
                        try:
                            result = sender_task.result()
                            if result == "reconnect":
                                try:
                                    await ws_backend.close()
                                except Exception:
                                    pass
                                continue
                        except asyncio.CancelledError:
                            break

                    break

            except Exception as e:
                print(f"ASR backend connection notice: {e}")
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": (
                            "Could not connect to the configured speech recognition provider. "
                            "Check the provider API key and backend log."
                        ),
                    }))
                except Exception:
                    pass
                break

    receiver_task = asyncio.create_task(frontend_receiver())
    asr_task = asyncio.create_task(asr_streaming_handler())

    try:
        done, pending = await asyncio.wait(
            [receiver_task, asr_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except (asyncio.CancelledError, WebSocketDisconnect):
        pass
    except Exception as e:
        print(f"[WS] Session error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        print(f"[WS] Cleaned up session: {session_id}")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
