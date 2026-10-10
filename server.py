from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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

def clean_api_key(val: str | None) -> str:
    if not val:
        return ""
    cleaned = str(val).strip().strip('"').strip("'")
    if cleaned.lower() in {
        "mock", "mock-key", "mock-asr-key", "mock-translation-key",
        "mock-tts-key", "none", "null", "undefined", ""
    } or cleaned.startswith("your-"):
        return ""
    return cleaned

DEEPGRAM_API_KEY = clean_api_key(os.environ.get("DEEPGRAM_API_KEY"))
GOOGLE_API_KEY = clean_api_key(os.environ.get("GOOGLE_API_KEY"))
SARVAM_API_KEY = clean_api_key(os.environ.get("SARVAM_API_KEY"))

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
    deepgram_key = clean_api_key(deepgram_api_key)
    sarvam_key = clean_api_key(sarvam_api_key)

    if source_language == "auto":
        if not sarvam_key:
            raise ValueError("Auto-detection requires SARVAM_API_KEY to be configured.")
        return (
            "wss://api.sarvam.ai/speech-to-text-realtime/ws"
            "?language_code=auto&model=saaras:v4",
            {"api-subscription-key": sarvam_key},
            "sarvam-saaras-v4",
            True,
        )

    if source_language == "ml":
        if sarvam_key:
            return (
                "wss://api.sarvam.ai/speech-to-text-realtime/ws"
                "?language_code=ml-IN&model=saaras:v4",
                {"api-subscription-key": sarvam_key},
                "sarvam-saaras-v4",
                True,
            )

    if deepgram_key:
        deepgram_model = "nova-3" if source_language in DRAVIDIAN_LANGUAGES else "nova-2"
        return (
            "wss://api.deepgram.com/v1/listen"
            f"?model={deepgram_model}&encoding=linear16&sample_rate=16000"
            f"&language={source_language}",
            {"Authorization": f"Token {deepgram_key}"},
            f"deepgram-{deepgram_model}",
            False,
        )

    if sarvam_key:
        sarvam_language = LANGUAGE_MAP.get(source_language, f"{source_language}-IN")
        return (
            "wss://api.sarvam.ai/speech-to-text-realtime/ws"
            f"?language_code={sarvam_language}&model=saaras:v4",
            {"api-subscription-key": sarvam_key},
            "sarvam-saaras-v4",
            True,
        )

    return None, {}, "mock-asr", False


def normalize_sarvam_language(language: str) -> str | None:
    if not isinstance(language, str) or not language:
        return None
    normalized = language.lower().replace("_", "-").split("-", 1)[0]
    return normalized if normalized in LANGUAGE_MAP else None


def resolve_conversation_turn(
    text: str,
    detected_language: str | None,
    language_confidence: float | str | None,
    languages: list[str],
) -> tuple[str | None, str | None, str | None]:
    """Resolve a final turn to the selected pair, or return a correction reason."""
    script_language = detect_script_language(text)
    provider_language = normalize_sarvam_language(detected_language or "")
    raw_provider_language = (
        detected_language.lower().replace("_", "-").split("-", 1)[0]
        if isinstance(detected_language, str) and detected_language
        else None
    )

    # Indic script is stronger evidence than a conflicting provider guess.
    candidate = (
        script_language
        if script_language in {"hi", "ta", "te", "kn", "ml"}
        else (provider_language or raw_provider_language or script_language)
    )
    if language_confidence is not None:
        try:
            if not 0.6 <= float(language_confidence) <= 1.0:
                return None, None, "uncertain"
        except (TypeError, ValueError):
            return None, None, "uncertain"
    if candidate is None:
        return None, None, "uncertain"
    if candidate not in languages:
        return candidate, None, "outside_pair"
    target_language = languages[1] if candidate == languages[0] else languages[0]
    return candidate, target_language, None


def normalize_lang_code(lang: str | None) -> str:
    if not lang or not isinstance(lang, str):
        return "auto"
    cleaned = lang.strip().lower().replace("_", "-").split("-")[0]
    names = {
        "english": "en", "hindi": "hi", "tamil": "ta",
        "telugu": "te", "kannada": "kn", "malayalam": "ml",
        "auto": "auto"
    }
    return names.get(cleaned, cleaned if cleaned in LANGUAGE_MAP else "auto")


def detect_script_language(text: str) -> str | None:
    """Detects supported language code based on unicode character script blocks."""
    if not text or not isinstance(text, str):
        return None
    counts = {
        "hi": 0,
        "ta": 0,
        "te": 0,
        "kn": 0,
        "ml": 0,
        "en": 0,
    }
    for char in text:
        cp = ord(char)
        if 0x0900 <= cp <= 0x097F:
            counts["hi"] += 1
        elif 0x0B80 <= cp <= 0x0BFF:
            counts["ta"] += 1
        elif 0x0C00 <= cp <= 0x0C7F:
            counts["te"] += 1
        elif 0x0C80 <= cp <= 0x0CFF:
            counts["kn"] += 1
        elif 0x0D00 <= cp <= 0x0D7F:
            counts["ml"] += 1
        elif (0x0041 <= cp <= 0x005A) or (0x0061 <= cp <= 0x007A):
            counts["en"] += 1

    # Check for Indic scripts first
    for lang in ("hi", "ta", "te", "kn", "ml"):
        if counts[lang] > 0 and counts[lang] >= counts["en"]:
            return lang
    if counts["en"] > 0:
        return "en"
    return None


def parse_sarvam_transcript(response: dict) -> dict | None:
    event = response.get("event") or ""
    transcript = response.get("text") or response.get("transcript") or ""
    if not transcript or not isinstance(event, str) or not event.startswith("transcript"):
        return None
    raw_lang = response.get("language") or response.get("language_code")
    raw_conf = response.get("language_confidence")
    if raw_conf is None:
        raw_conf = response.get("language_probability")
    return {
        "text": transcript,
        "is_final": response.get("is_final", event.endswith(".final")),
        "language": raw_lang,
        "language_confidence": raw_conf,
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

# Persistent Keep-Alive HTTP client for low-latency connections (eliminates per-call TLS/TCP handshakes)
global_http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(10.0, connect=4.0),
    limits=httpx.Limits(max_keepalive_connections=30, max_connections=60, keepalive_expiry=60.0),
    headers={"Accept-Encoding": "gzip, deflate"}
)

# In-memory LRU caches for translations and TTS to resolve repeated phrases in <1ms
TRANSLATION_CACHE: dict[tuple[str, str, str], str] = {}
MAX_TRANSLATION_CACHE_SIZE = 3000
TTS_CACHE: dict[tuple[str, str], str] = {}
MAX_TTS_CACHE_SIZE = 500


def get_cached_translation(text: str, src: str, tgt: str) -> str | None:
    cleaned = text.strip().lower()
    return TRANSLATION_CACHE.get((cleaned, src, tgt))


def set_cached_translation(text: str, src: str, tgt: str, translated: str):
    if not translated or not text:
        return
    if len(TRANSLATION_CACHE) >= MAX_TRANSLATION_CACHE_SIZE:
        for k in list(TRANSLATION_CACHE.keys())[:int(MAX_TRANSLATION_CACHE_SIZE * 0.2)]:
            TRANSLATION_CACHE.pop(k, None)
    cleaned = text.strip().lower()
    TRANSLATION_CACHE[(cleaned, src, tgt)] = translated


def get_cached_tts(text: str, lang: str) -> str | None:
    cleaned = text.strip().lower()
    return TTS_CACHE.get((cleaned, lang))


def set_cached_tts(text: str, lang: str, audio_b64: str):
    if not audio_b64 or not text:
        return
    if len(TTS_CACHE) >= MAX_TTS_CACHE_SIZE:
        for k in list(TTS_CACHE.keys())[:int(MAX_TTS_CACHE_SIZE * 0.2)]:
            TTS_CACHE.pop(k, None)
    cleaned = text.strip().lower()
    TTS_CACHE[(cleaned, lang)] = audio_b64


async def translate_text_google(text: str, target_lang: str) -> str:
    if not GOOGLE_API_KEY or not text.strip():
        return ""
    url = f"https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}"
    payload = {"q": text, "target": target_lang, "format": "text"}
    try:
        resp = await global_http_client.post(url, json=payload, timeout=6.0)
        if resp.status_code == 200:
            return resp.json()["data"]["translations"][0]["translatedText"]
        return ""
    except Exception as e:
        print(f"Google Translation error: {e}")
        return ""


async def translate_text_sarvam(text: str, source_lang: str, target_lang: str) -> str:
    if not SARVAM_API_KEY or not text.strip():
        return ""
    
    src_code = LANGUAGE_MAP.get(source_lang, "en-IN")
    tgt_code = LANGUAGE_MAP.get(target_lang, "hi-IN")
    if src_code == tgt_code:
        return text

    url = "https://api.sarvam.ai/translate"
    payload = {
        "input": text,
        "source_language_code": src_code,
        "target_language_code": tgt_code,
        "speaker_gender": "Male",
        "mode": "formal",
        "model": "sarvam-translate:v1",
        "enable_code_mixing": True
    }
    headers = {"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"}
    
    try:
        resp = await global_http_client.post(url, json=payload, headers=headers, timeout=8.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get("translated_text") or data.get("translation") or text
    except Exception as e:
        err_detail = getattr(e, "response", None)
        err_text = err_detail.text if err_detail is not None else ""
        print(f"Sarvam Translate API Error: {e} {err_text}".strip())
        return ""


async def text_to_speech_sarvam(text: str, target_lang: str) -> str:
    """Returns Base64 encoded audio string from Sarvam TTS with caching and connection reuse"""
    if not SARVAM_API_KEY or not text.strip():
        return None
        
    cached_audio = get_cached_tts(text, target_lang)
    if cached_audio:
        return cached_audio

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
    
    try:
        resp = await global_http_client.post(url, json=payload, headers=headers, timeout=10.0)
        resp.raise_for_status()
        audio = resp.json().get("audios", [None])[0]
        if audio:
            set_cached_tts(text, target_lang, audio)
        return audio
    except Exception as e:
        print(f"Sarvam TTS Error: {e}")
        return None

async def route_translation(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    """Intelligently routes translation to Sarvam or Google, with graceful fallback."""
    if not text or not text.strip():
        return "", "none"

    src_norm = normalize_lang_code(source_lang)
    tgt_norm = normalize_lang_code(target_lang)
    if tgt_norm == "auto":
        tgt_norm = "hi"

    # Refine source language if text script provides unambiguous hint
    script_lang = detect_script_language(text)
    effective_src = src_norm
    if effective_src == "auto":
        effective_src = script_lang or "en"
    elif script_lang and script_lang != effective_src:
        effective_src = script_lang

    if effective_src and tgt_norm and effective_src == tgt_norm:
        return text, "same-language"

    # Fast in-memory cache check (<1ms)
    cached = get_cached_translation(text, effective_src, tgt_norm)
    if cached:
        return cached, "cache-hit"

    # Sarvam Translate handles all Indic pairs + English
    if SARVAM_API_KEY:
        try:
            print(f"--> [Translate] Routing {effective_src} -> {tgt_norm} to Sarvam Translate API")
            translated = await translate_text_sarvam(text, effective_src, tgt_norm)
            if translated and translated.strip():
                set_cached_translation(text, effective_src, tgt_norm, translated)
                return translated, "sarvam-translate:v1"
        except Exception as e:
            print(f"[Translate] Sarvam translation error: {e}")

    if GOOGLE_API_KEY:
        try:
            print(f"--> [Translate] Routing {effective_src} -> {tgt_norm} to Google Translate API")
            translated = await translate_text_google(text, tgt_norm)
            if translated and translated.strip():
                set_cached_translation(text, effective_src, tgt_norm, translated)
                return translated, "google-translate"
        except Exception as e:
            print(f"[Translate] Google translation error: {e}")

    # Fallback simulation if no API keys are present
    return f"[{tgt_norm.upper()}]: {text}", "mock-translation"


class TranslateTextRequest(BaseModel):
    text: str
    source_language: str = "auto"
    target_language: str = "hi"
    include_speech: bool = False


@app.post("/api/translate")
async def api_translate_text(req: TranslateTextRequest):
    text = (req.text or "").strip()
    if not text:
        return {
            "status": "success",
            "translated_text": "",
            "detected_language": "en",
            "target_language": req.target_language or "hi",
            "provider": "none",
            "audio_base64": None
        }

    src_norm = normalize_lang_code(req.source_language)
    tgt_norm = normalize_lang_code(req.target_language)
    if tgt_norm == "auto":
        tgt_norm = "hi"

    script_lang = detect_script_language(text)
    effective_src = src_norm
    if effective_src == "auto":
        effective_src = script_lang or "en"
    elif script_lang and script_lang != effective_src:
        effective_src = script_lang

    translated, provider = await route_translation(text, effective_src, tgt_norm)

    audio_b64 = None
    if req.include_speech and translated:
        try:
            audio_b64 = await text_to_speech_sarvam(translated, tgt_norm)
        except Exception as e:
            print(f"[TTS] Speech synthesis error: {e}")

    return {
        "status": "success",
        "translated_text": translated,
        "detected_language": effective_src,
        "target_language": tgt_norm,
        "provider": provider,
        "audio_base64": audio_b64
    }

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


async def async_save_turn_to_database(*args, **kwargs):
    """Executes database persistence in a threadpool executor to avoid blocking event loop."""
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: save_turn_to_database(*args, **kwargs))
    except Exception as e:
        print(f"[Notice] Async DB save error: {e}")

@app.websocket("/ws/translate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Frontend Client connected to /ws/translate")

    current_target_lang = "hi"
    current_source_lang = None
    is_auto_detect = False
    conversation_mode = False
    conversation_languages = []
    conversation_language_ids = {}
    session_id = None
    source_language_id = None
    target_language_id = None
    user_token = None
    db_client = None

    utterance_sequence = 0
    conversation_turn_sequence = 0
    message_queue = asyncio.Queue()
    config_received = asyncio.Event()

    async def frontend_receiver():
        nonlocal current_target_lang, current_source_lang, is_auto_detect, session_id
        nonlocal conversation_mode, conversation_languages, conversation_language_ids
        nonlocal source_language_id, target_language_id, user_token, db_client
        try:
            while True:
                try:
                    message = await websocket.receive()
                except WebSocketDisconnect:
                    config_received.set()
                    await message_queue.put({"type": "disconnect"})
                    break

                if message.get("type") == "websocket.disconnect":
                    config_received.set()
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
                        if "conversation_mode" in data:
                            conversation_mode = data["conversation_mode"] is True
                            selected_languages = data.get("conversation_languages")
                            if conversation_mode and (
                                not isinstance(selected_languages, list)
                                or len(selected_languages) != 2
                                or any(lang not in LANGUAGE_MAP for lang in selected_languages)
                                or selected_languages[0] == selected_languages[1]
                            ):
                                await websocket.send_text(json.dumps({
                                    "type": "error",
                                    "title": "Invalid conversation languages",
                                    "message": "Choose two different supported languages for Conversation Mode.",
                                }))
                                await message_queue.put({"type": "disconnect"})
                                return
                            conversation_languages = selected_languages or []
                            if conversation_mode:
                                conversation_language_ids = {
                                    conversation_languages[0]: source_language_id,
                                    conversation_languages[1]: target_language_id,
                                }

                        # Text-to-Text translation request - handle immediately without triggering ASR loop
                        if "text_to_translate" in data:
                            txt = (data.get("text_to_translate") or "").strip()
                            req_src = data.get("source_language") or current_source_lang or "auto"
                            req_tgt = data.get("target_language") or current_target_lang or "hi"
                            src_norm = normalize_lang_code(req_src)
                            tgt_norm = normalize_lang_code(req_tgt)
                            if tgt_norm == "auto":
                                tgt_norm = "hi"
                            script_lang = detect_script_language(txt)
                            effective_src = src_norm
                            if effective_src == "auto":
                                effective_src = script_lang or "en"
                            elif not data.get("conversation_correction") and script_lang and script_lang != effective_src:
                                effective_src = script_lang

                            translated, provider = await route_translation(
                                txt, effective_src, tgt_norm
                            )

                            audio_b64 = None
                            if data.get("include_speech") or data.get("speak"):
                                try:
                                    audio_b64 = await text_to_speech_sarvam(translated, tgt_norm)
                                except Exception as e:
                                    print(f"[WS TTS] Error: {e}")

                            payload = {
                                "type": "translation_final",
                                "status": "success",
                                "text": translated,
                                "original_text": txt,
                                "translated_text": translated,
                                "language": effective_src,
                                "detected_language": effective_src,
                                "source_language": effective_src,
                                "target_language": tgt_norm,
                                "is_final": True,
                                "is_text_to_text": True,
                                "provider": provider,
                                "audio_base64": audio_b64
                            }
                            if data.get("turn_id") is not None:
                                payload["turn_id"] = data["turn_id"]
                            await websocket.send_text(json.dumps(payload))
                            continue

                        old_source = current_source_lang
                        if "target_language" in data:
                            current_target_lang = data["target_language"]
                        elif "language" in data:
                            current_target_lang = data["language"]

                        if "source_language" in data:
                            current_source_lang = data["source_language"]
                            is_auto_detect = (current_source_lang == "auto")
                            if conversation_mode:
                                current_source_lang = "auto"
                                is_auto_detect = True
                                current_target_lang = conversation_languages[1]
                            config_received.set()
                            if old_source is not None and current_source_lang != old_source:
                                print(f"[Lang] Source language switch: {old_source} -> {current_source_lang}")
                                await message_queue.put({"type": "reconnect"})
                        else:
                            config_received.set()

                        if data.get("type") == "end_utterance":
                            await message_queue.put({"type": "end_utterance"})

                    except json.JSONDecodeError:
                        pass

                elif "bytes" in message and message["bytes"]:
                    config_received.set()
                    await message_queue.put({"type": "audio", "data": message["bytes"]})

        except WebSocketDisconnect:
            print("[WS] Frontend client disconnected.")
            config_received.set()
            await message_queue.put({"type": "disconnect"})

    async def asr_streaming_handler():
        nonlocal utterance_sequence
        nonlocal current_source_lang, source_language_id, is_auto_detect, current_target_lang
        nonlocal conversation_mode, conversation_languages, conversation_turn_sequence
        nonlocal source_language_id, target_language_id

        # Wait for initial frontend configuration (or audio/disconnect)
        try:
            await asyncio.wait_for(config_received.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            pass

        if current_source_lang is None or current_source_lang == "auto":
            current_source_lang = "auto"
            is_auto_detect = True
        else:
            is_auto_detect = (current_source_lang == "auto")

        while True:
            try:
                backend = get_asr_backend(
                    current_source_lang, DEEPGRAM_API_KEY, SARVAM_API_KEY
                )
            except ValueError as error:
                print(f"[ASR] Configuration notice: {error}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "error_code": "asr_config_error",
                    "error_category": "configuration_error",
                    "title": "ASR Configuration Error",
                    "message": str(error),
                }))
                return

            ws_url, headers, provider_label, use_sarvam_asr = backend
            key_configured = bool(SARVAM_API_KEY) if use_sarvam_asr else (bool(DEEPGRAM_API_KEY) if ws_url else False)
            print(f"[ASR] Selected provider: {provider_label} (source_language: {current_source_lang}, key_present: {key_configured})")

            if not ws_url:
                print("[ASR] Operating in mock ASR mode (no provider credentials configured). Real speech will not be transcribed.")
                await websocket.send_text(json.dumps({
                    "type": "info",
                    "provider": "mock-asr",
                    "title": "Mock ASR Active",
                    "message": "Mock ASR mode active (no live speech API key configured). Speech audio will not be transcribed.",
                }))
                try:
                    while True:
                        msg = await message_queue.get()
                        if msg["type"] == "disconnect":
                            return
                        if msg["type"] in ("end_utterance", "reconnect"):
                            break
                        if msg["type"] == "audio":
                            await asyncio.sleep(0.01)
                except asyncio.CancelledError:
                    return
                continue

            print(f"[ASR] Connecting to {provider_label}...")
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
                                        await ws_backend.send(json.dumps({"type": "Finalize"}))
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
                        nonlocal current_source_lang, current_target_lang
                        nonlocal source_language_id, target_language_id, is_auto_detect
                        nonlocal conversation_turn_sequence
                        try:
                            while True:
                                response_str = await ws_backend.recv()
                                response_json = json.loads(response_str)

                                # Provider-level error handling
                                if use_sarvam_asr:
                                    if response_json.get("event") == "error":
                                        code = response_json.get("code", "unknown")
                                        msg = response_json.get("message", "Sarvam error")
                                        status_code = response_json.get("status_code")
                                        is_auth = code in ("invalid_subscription_key", "unauthorized") or status_code == 401
                                        print(f"[ASR] Sarvam reported error: {code} - {msg}")
                                        await websocket.send_text(json.dumps({
                                            "type": "error",
                                            "error_code": "asr_auth_failed" if is_auth else "asr_provider_error",
                                            "error_category": "authentication_error" if is_auth else "provider_error",
                                            "provider": provider_label,
                                            "title": "Sarvam Authentication Failed" if is_auth else "Sarvam ASR Error",
                                            "message": f"Sarvam error: {msg}. Please check your SARVAM_API_KEY." if is_auth else f"Sarvam error: {msg}",
                                        }))
                                        return
                                else:
                                    if response_json.get("type") == "Error" or "error" in response_json:
                                        msg = response_json.get("message") or response_json.get("description") or "Deepgram streaming error"
                                        print(f"[ASR] Deepgram reported error: {msg}")
                                        await websocket.send_text(json.dumps({
                                            "type": "error",
                                            "error_code": "asr_provider_error",
                                            "error_category": "provider_error",
                                            "provider": provider_label,
                                            "title": "Deepgram Streaming Error",
                                            "message": f"Deepgram error: {msg}",
                                        }))
                                        return

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
                                    conversation_turn_id = None
                                    if conversation_mode and is_final:
                                        conversation_turn_sequence += 1
                                        conversation_turn_id = conversation_turn_sequence
                                        detected, turn_target, detection_issue = resolve_conversation_turn(
                                            transcript,
                                            detected_language,
                                            language_confidence,
                                            conversation_languages,
                                        )
                                        if detection_issue:
                                            await websocket.send_text(json.dumps({
                                                "type": "language_detection_failed",
                                                "turn_id": conversation_turn_id,
                                                "text": transcript,
                                                "language": detected,
                                                "conversation_languages": conversation_languages,
                                                "reason": detection_issue,
                                                "message": (
                                                    "Language detection was uncertain. Choose the language for this turn."
                                                    if detection_issue == "uncertain"
                                                    else "This turn was not in either selected conversation language. Choose its language to translate it."
                                                ),
                                            }))
                                            continue
                                        current_source_lang = detected
                                        current_target_lang = turn_target
                                        source_language_id = conversation_language_ids.get(current_source_lang)
                                        target_language_id = conversation_language_ids.get(current_target_lang)

                                    if is_auto_detect:
                                        script_lang = detect_script_language(transcript)
                                        sarvam_lang = normalize_sarvam_language(detected_language or "")
                                        candidate_lang = (
                                            script_lang
                                            if script_lang in (*DRAVIDIAN_LANGUAGES, "hi")
                                            else (sarvam_lang or script_lang)
                                        )

                                        if candidate_lang:
                                            if candidate_lang != current_source_lang:
                                                current_source_lang = candidate_lang
                                                try:
                                                    language_result = (
                                                        (db_client or get_supabase_client())
                                                        .table("supported_languages")
                                                        .select("id")
                                                        .eq("code", candidate_lang)
                                                        .maybe_single()
                                                        .execute()
                                                    )
                                                    if language_result and language_result.data:
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
                                        elif current_source_lang == "auto":
                                            if is_final:
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
                                    elif current_source_lang == "auto":
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
                                        final_script_lang = detect_script_language(transcript)
                                        if is_auto_detect and final_script_lang and final_script_lang in (*DRAVIDIAN_LANGUAGES, "hi"):
                                            current_source_lang = final_script_lang

                                        print(f"[ASR Final] ({current_source_lang}): {transcript}")

                                        # Route translation (Sarvam for Dravidian pairs, Google fallback)
                                        translated, trans_model = await route_translation(
                                            transcript, current_source_lang, current_target_lang
                                        )
                                        print(f"[Translation Final] ({current_target_lang}): {translated}")

                                        utterance_sequence += 1
                                        calc_latency = max(80, int((time.time() - start_time) * 1000) + 120)

                                        # Persist turn into Supabase Database in background (non-blocking)
                                        asyncio.create_task(
                                            async_save_turn_to_database(
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
                                        )

                                        # Send ASR Final and Translation Final to Frontend IMMEDIATELY
                                        cached_tts_audio = get_cached_tts(translated, current_target_lang)
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
                                            "language": current_source_lang,
                                            "is_final": True,
                                            "latency_ms": calc_latency,
                                            "audio_base64": cached_tts_audio
                                        }
                                        if conversation_mode:
                                            payload_asr["turn_id"] = conversation_turn_id
                                            payload_trans["turn_id"] = conversation_turn_id
                                        try:
                                            await websocket.send_text(json.dumps(payload_asr))
                                            await websocket.send_text(json.dumps(payload_trans))
                                        except WebSocketDisconnect:
                                            break

                                        # Deliver TTS concurrently without delaying text display
                                        if not cached_tts_audio:
                                            async def deliver_tts_stream(txt_to_speak, tgt_language):
                                                try:
                                                    audio_b64 = await text_to_speech_sarvam(txt_to_speak, tgt_language)
                                                    if audio_b64:
                                                        await websocket.send_text(json.dumps({
                                                            "type": "audio_ready",
                                                            "audio_base64": audio_b64,
                                                            "target_language": tgt_language
                                                        }))
                                                except Exception as err:
                                                    print(f"[Async TTS Notice]: {err}")

                                            asyncio.create_task(deliver_tts_stream(translated, current_target_lang))
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

                        except ws_client.exceptions.ConnectionClosed as cc:
                            if cc.code == 1003:
                                print(f"[ASR] Provider connection closed with code 1003 (Rate limit, quota or invalid key).")
                                try:
                                    await websocket.send_text(json.dumps({
                                        "type": "error",
                                        "error_code": "asr_auth_or_quota",
                                        "error_category": "authentication_error",
                                        "provider": provider_label,
                                        "title": "ASR Access Error",
                                        "message": f"{provider_label} closed connection: invalid key, quota or rate limit exceeded.",
                                    }))
                                except Exception:
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
                # Sanitize error output - never expose secrets or raw auth headers
                status_code = getattr(getattr(e, "response", None), "status_code", None)
                err_str = str(e)
                is_401 = status_code == 401 or "401" in err_str or "unauthorized" in err_str.lower()
                is_429 = status_code == 429 or "429" in err_str or "rate limit" in err_str.lower()
                print(f"ASR backend connection notice: {e}")

                if is_401:
                    print(f"[ASR] Authentication rejected by {provider_label}: HTTP 401 Unauthorized.")
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "error_code": "asr_auth_failed",
                            "error_category": "authentication_error",
                            "provider": provider_label,
                            "title": "ASR Authentication Failed",
                            "message": (
                                f"The speech recognition server rejected the connection (HTTP 401 Unauthorized) "
                                f"for {provider_label}. Please check that your API key is valid and active."
                            ),
                        }))
                    except Exception:
                        pass
                    return  # Do not repeatedly retry 401 errors!
                elif is_429:
                    print(f"[ASR] Rate limit or quota exceeded for {provider_label}: HTTP 429.")
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "error_code": "asr_quota_exceeded",
                            "error_category": "provider_limits",
                            "provider": provider_label,
                            "title": "Provider Limit Reached",
                            "message": f"Rate limit or quota exceeded for {provider_label}. Please check provider account usage.",
                        }))
                    except Exception:
                        pass
                    return
                else:
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "error_code": "asr_connection_failed",
                            "error_category": "network_failure",
                            "provider": provider_label,
                            "title": "ASR Connection Error",
                            "message": (
                                f"Could not connect to {provider_label}. "
                                "Please check your network connection and backend logs."
                            ),
                        }))
                    except Exception:
                        pass
                    return

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
