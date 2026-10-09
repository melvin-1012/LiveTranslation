
import asyncio
import json
import logging
import base64
from typing import Optional
import httpx
import websockets
from app.core.config import settings
from app.services.streaming_orchestrator import ASRService, TranslationService

logger = logging.getLogger(__name__)

LANGUAGE_MAP = {
    "en": "en-IN",
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN"
}

def map_lang(app_lang: str) -> str:
    try:
        return LANGUAGE_MAP[app_lang]
    except KeyError as exc:
        raise ValueError(f"Unsupported Sarvam language code: {app_lang}") from exc

def map_lang_reverse(sarvam_lang: str) -> str:
    normalized = sarvam_lang.lower().replace("_", "-")
    for k, v in LANGUAGE_MAP.items():
        if v.lower() == normalized or k == normalized:
            return k
    raise ValueError(f"Unsupported Sarvam language code: {sarvam_lang}")


def map_translation_pair(source_lang: str, target_lang: str) -> tuple[str, str]:
    if source_lang == target_lang:
        raise ValueError("Source and target languages must be different.")
    return map_lang(source_lang), map_lang(target_lang)

class SarvamASRService(ASRService):
    def __init__(self):
        self.ws = None
        self.config = {}
        self.api_key = settings.SARVAM_API_KEY
        self.receive_task = None
        self.result_queue = asyncio.Queue()
        self.is_connected = False

    async def start_stream(self, config: dict):
        if not self.api_key:
            raise ValueError("SARVAM_API_KEY is not configured.")
        self.config = config
        
        lang = config.get("source_language", "auto")
        sarvam_lang = "auto" if lang == "auto" else map_lang(lang)
        
        uri = f"wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code={sarvam_lang}&model=saaras:v4"
        try:
            self.ws = await websockets.connect(
                uri,
                additional_headers={"api-subscription-key": self.api_key}
            )
            self.is_connected = True
            self.receive_task = asyncio.create_task(self._receive_loop())
        except Exception as e:
            logger.error(f"Sarvam ASR Connection Error: {e}")
            raise

    async def _receive_loop(self):
        try:
            while self.is_connected:
                message = await self.ws.recv()
                data = json.loads(message)
                event = data.get("event", "")
                transcript = data.get("text") or data.get("transcript") or ""
                is_final = data.get("is_final", event.endswith(".final"))
                if transcript and (event.startswith("transcript") or "transcript" in data):
                    language = data.get("language")
                    if not language and self.config.get("source_language") != "auto":
                        language = self.config.get("source_language")
                    result = {
                        "text": transcript,
                        "is_final": is_final,
                        "language": language,
                    }
                    confidence = data.get("language_confidence")
                    if confidence is not None:
                        result["language_confidence"] = confidence
                    await self.result_queue.put(result)
                elif event == "error":
                    logger.error(
                        "Sarvam ASR error %s: %s",
                        data.get("code", "unknown"),
                        data.get("message", "No error message"),
                    )
        except Exception as e:
            logger.error(f"Sarvam ASR Receive loop error: {e}")
            self.is_connected = False

    async def process_audio_chunk(self, chunk: bytes) -> Optional[dict]:
        if self.is_connected and chunk:
            try:
                b64 = base64.b64encode(chunk).decode("utf-8")
                await self.ws.send(json.dumps({"event": "audio_input", "audio": b64}))
            except Exception as e:
                logger.error(f"Sarvam ASR Send Error: {e}")
                self.is_connected = False
                
        # Drain queue if any results
        if not self.result_queue.empty():
            return await self.result_queue.get()
        return None

    async def finalize(self) -> Optional[dict]:
        if self.is_connected:
            try:
                await self.ws.send(json.dumps({"event": "flush"}))
                try:
                    res = await asyncio.wait_for(self.result_queue.get(), timeout=2.0)
                    return res
                except asyncio.TimeoutError:
                    pass
            except Exception as e:
                logger.error(f"Sarvam ASR Finalize Error: {e}")
        return None

    async def close(self):
        self.is_connected = False
        if self.receive_task:
            self.receive_task.cancel()
        if self.ws:
            await self.ws.close()

class SarvamTranslationService(TranslationService):
    def __init__(self):
        self.api_key = settings.SARVAM_API_KEY
        self.url = "https://api.sarvam.ai/translate"

    async def _translate(self, text: str, source_lang: str, target_lang: str) -> dict:
        if not self.api_key:
            raise ValueError("SARVAM_API_KEY is not configured.")
        
        headers = {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json"
        }
        
        sarvam_source, sarvam_target = map_translation_pair(source_lang, target_lang)
        payload = {
            "input": text,
            "text": text,
            "source_language_code": sarvam_source,
            "target_language_code": sarvam_target,
            "source_language": sarvam_source,
            "target_language": sarvam_target,
            "speaker_gender": "Male",
            "mode": "formal",
            "model": "sarvam-translate:v1",
            "enable_code_mixing": True
        }
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(self.url, json=payload, headers=headers, timeout=5.0)
                resp.raise_for_status()
                data = resp.json()
                translated_text = data.get("translated_text") or data.get("translation")
                if not isinstance(translated_text, str) or not translated_text.strip():
                    translated_text = text
                return {
                    "translated_text": translated_text,
                    "confidence": data.get("confidence", 0.95),
                    "provider": "sarvam"
                }
            except Exception as e:
                logger.error(f"Sarvam Translation Error: {e}")
                raise

    async def translate_partial(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return await self._translate(text, source_lang, target_lang)

    async def translate_final(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return await self._translate(text, source_lang, target_lang)
