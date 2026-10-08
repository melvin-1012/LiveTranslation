
import asyncio
import json
import logging
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
    return LANGUAGE_MAP.get(app_lang, "en-IN")

def map_lang_reverse(sarvam_lang: str) -> str:
    for k, v in LANGUAGE_MAP.items():
        if v == sarvam_lang:
            return k
    return "en"

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
        
        # Determine language (Mode A/B)
        lang = config.get("source_language", "auto")
        sarvam_lang = map_lang(lang) if lang != "auto" else "unknown"
        
        uri = f"wss://api.sarvam.ai/speech-to-text?language={sarvam_lang}"
        # A true implementation might vary slightly based on Sarvam's exact API shape
        try:
            self.ws = await websockets.connect(
                uri,
                additional_headers={"Authorization": f"Bearer {self.api_key}"}
            )
            self.is_connected = True
            # Start background receive task
            self.receive_task = asyncio.create_task(self._receive_loop())
        except Exception as e:
            logger.error(f"Sarvam ASR Connection Error: {e}")
            raise

    async def _receive_loop(self):
        try:
            while self.is_connected:
                message = await self.ws.recv()
                data = json.loads(message)
                # Parse Sarvam's format (assume {"transcript": "...", "is_final": bool, "language": "hi-IN"})
                transcript = data.get("transcript", "")
                is_final = data.get("is_final", False)
                if transcript:
                    await self.result_queue.put({
                        "text": transcript,
                        "is_final": is_final,
                        "language": map_lang_reverse(data.get("language", map_lang(self.config.get("source_language", "en"))))
                    })
        except Exception as e:
            logger.error(f"Sarvam ASR Receive loop error: {e}")
            self.is_connected = False

    async def process_audio_chunk(self, chunk: bytes) -> Optional[dict]:
        # Enforce audio format: Assume front-end is sending 16kHz PCM or valid format expected by Sarvam
        if self.is_connected and chunk:
            try:
                await self.ws.send(chunk)
            except Exception as e:
                logger.error(f"Sarvam ASR Send Error: {e}")
                self.is_connected = False
                
        # Drain queue if any results
        if not self.result_queue.empty():
            return await self.result_queue.get()
        return None

    async def finalize(self) -> Optional[dict]:
        if self.is_connected:
            # Send EOF/EOS signal to Sarvam
            try:
                await self.ws.send(json.dumps({"type": "eof"}))
                # Wait briefly for final result
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
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # Support code mixing based on env or language combinations
        payload = {
            "text": text,
            "source_language": map_lang(source_lang),
            "target_language": map_lang(target_lang),
            "enable_code_mixing": True
        }
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(self.url, json=payload, headers=headers, timeout=5.0)
                resp.raise_for_status()
                data = resp.json()
                # Assume {"translated_text": "...", "confidence": 0.98}
                return {
                    "translated_text": data.get("translated_text", text),
                    "confidence": data.get("confidence", None),
                    "provider": "sarvam"
                }
            except Exception as e:
                logger.error(f"Sarvam Translation Error: {e}")
                return {"translated_text": f"[Error: {str(e)}]", "confidence": 0.0, "provider": "sarvam"}

    async def translate_partial(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return await self._translate(text, source_lang, target_lang)

    async def translate_final(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return await self._translate(text, source_lang, target_lang)
