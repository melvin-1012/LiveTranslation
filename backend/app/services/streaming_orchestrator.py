
from abc import ABC, abstractmethod
from typing import Optional
import uuid
import logging
from app.core.state import StreamingState, is_valid_transition
from app.core.metrics import TranslationMetricsTracker
from app.services.persistence_queue import persistence_queue
from app.services.supabase_client import get_supabase_client
from app.services.translation_db_service import (
    create_utterance,
    get_language_id,
)

logger = logging.getLogger(__name__)

class ASRService(ABC):
    @abstractmethod
    async def start_stream(self, config: dict): pass
    @abstractmethod
    async def process_audio_chunk(self, chunk: bytes) -> Optional[dict | list[dict]]: pass
    @abstractmethod
    async def finalize(self) -> Optional[dict | list[dict]]: pass
    @abstractmethod
    async def close(self): pass

class TranslationService(ABC):
    @abstractmethod
    async def translate_partial(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict: pass
    @abstractmethod
    async def translate_final(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict: pass

class MockASRService(ASRService):
    def __init__(self):
        self.chunk_count = 0
    async def start_stream(self, config: dict): pass
    async def process_audio_chunk(self, chunk: bytes) -> Optional[dict]:
        self.chunk_count += 1
        return {"type": "asr_partial", "text": f"mock partial {self.chunk_count}", "is_final": False}
    async def finalize(self) -> Optional[dict]:
        return {"type": "asr_final", "text": "mock final", "is_final": True}
    async def close(self): pass

class MockTranslationService(TranslationService):
    async def translate_partial(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return {"translated_text": f"mock translated partial for {text}", "confidence": 0.9}
    async def translate_final(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return {"translated_text": f"mock translated final for {text}", "confidence": 0.95}

class StreamingOrchestrator:
    def __init__(self, asr: ASRService, translator: TranslationService, websocket):
        self.asr = asr
        self.translator = translator
        self.websocket = websocket
        self.utterance_id = None
        self.state: Optional[StreamingState] = None
        self.metrics = TranslationMetricsTracker()
        self.translation_version = 0
        self.sequence_number = 1
        self.source_lang = None
        self.target_lang = None
        self.session_id = None
        self.token = None
        self.source_language_id = None
        self.target_language_id = None
        self.last_asr_text = ""
        self.db = None
        self.language_id_cache = {}
        self.session_source_language_set = False
        self.auto_detect = False

    async def transition_state(self, new_state: StreamingState):
        if not is_valid_transition(self.state, new_state):
            raise ValueError(f"Invalid state transition from {self.state} to {new_state}")
        self.state = new_state

    async def handle_config(self, config: dict):
        configured_source = config.get("source_language")
        self.auto_detect = configured_source == "auto"
        self.source_lang = None if configured_source == "auto" else configured_source
        self.target_lang = config.get("target_language")
        self.session_id = config.get("session_id")
        self.token = config.get("token")
        self.source_language_id = config.get("source_language_id")
        self.target_language_id = config.get("target_language_id")
        self.session_source_language_set = self.source_language_id is not None
        
        try:
            self.db = get_supabase_client(self.token)
            res = create_utterance(self.db, self.session_id, self.sequence_number)
            self.utterance_id = res["id"]
        except Exception as e:
            logger.error(f"Failed to initialize utterance in DB: {e}")
            raise ValueError(f"DB Error: {e}")
            
        await self.asr.start_stream(config)

    async def process_audio(self, chunk: bytes):
        self.metrics.mark_audio_received()
        if self.state is None:
            await self.transition_state(StreamingState.UTTERANCE_STARTED)
        asr_result = await self.asr.process_audio_chunk(chunk)
        results = asr_result if isinstance(asr_result, list) else [asr_result]
        for result in results:
            if result:
                await self._handle_asr_result(result)

    async def finalize(self):
        asr_result = await self.asr.finalize()
        results = asr_result if isinstance(asr_result, list) else [asr_result]
        for result in results:
            if result:
                await self._handle_asr_result(result)

    def _is_stable_partial(self, new_text: str) -> bool:
        # Task 8: Partial Translation Strategy
        # Only translate if text length is significantly larger than previous or has boundary
        if len(new_text.split()) >= len(self.last_asr_text.split()) + 2:
            return True
        return False

    async def _handle_asr_result(self, asr_result: dict):
        is_final = asr_result.get("is_final", False)
        text = asr_result.get("text", "")
        detected_language = asr_result.get("language")
        if detected_language and self.auto_detect:
            try:
                from app.services.providers.sarvam import map_lang_reverse
                self.source_lang = map_lang_reverse(detected_language)
                if self.source_lang not in self.language_id_cache:
                    self.language_id_cache[self.source_lang] = get_language_id(
                        self.db, self.source_lang
                    )
                self.source_language_id = self.language_id_cache[self.source_lang]
                if self.session_id and not self.session_source_language_set:
                    self.session_source_language_set = True
            except ValueError:
                logger.warning("Ignoring unsupported detected language: %s", detected_language)
                self.source_lang = None
                self.source_language_id = None

        self.metrics.mark_asr_first()
        
        if is_final:
            await self.transition_state(StreamingState.ASR_FINAL)
            # Store final ASR result
            await persistence_queue.enqueue("store_asr_result", self.token, {
                "utterance_id": self.utterance_id,
                "model_name": "sarvam_asr",
                "transcript": text,
                "is_final": True,
                "language_id": self.source_language_id,
                "confidence": asr_result.get("language_confidence"),
                "session_id": self.session_id if self.auto_detect else None
            })
        else:
            if self.state == StreamingState.UTTERANCE_STARTED:
                await self.transition_state(StreamingState.ASR_PARTIAL)
            else:
                await self.transition_state(StreamingState.ASR_UPDATED)

        await self._emit_ws({
            "type": "asr_final" if is_final else "asr_partial",
            "utterance_id": self.utterance_id,
            "text": text,
            "sequence_number": self.sequence_number,
            "language": self.source_lang,
            "language_confidence": asr_result.get("language_confidence")
        })

        if self.source_lang is None:
            if is_final and self.auto_detect:
                await self._emit_ws({
                    "type": "language_detection_failed",
                    "message": "Could not detect a supported source language. Please try speaking again."
                })
            return

        # Partial translation strategy check
        if not is_final and not self._is_stable_partial(text):
            return

        self.last_asr_text = text

        if is_final:
            if self.source_lang == self.target_lang:
                trans_res = {"translated_text": text, "provider": "identity"}
            else:
                trans_res = await self.translator.translate_final(text, self.source_lang, self.target_lang)
            self.translation_version += 1
            await self.transition_state(StreamingState.TRANSLATION_FINAL)
            self.metrics.mark_translation_final()
        else:
            if self.source_lang == self.target_lang:
                trans_res = {"translated_text": text, "provider": "identity"}
            else:
                trans_res = await self.translator.translate_partial(text, self.source_lang, self.target_lang)
            self.translation_version += 1
            self.metrics.mark_translation_first()
            if self.state == StreamingState.ASR_PARTIAL:
                await self.transition_state(StreamingState.TRANSLATION_PARTIAL)
            else:
                await self.transition_state(StreamingState.TRANSLATION_UPDATED)

        trans_type = "translation_final" if is_final else "translation_partial"
        await self._emit_ws({
            "type": trans_type,
            "utterance_id": self.utterance_id,
            "text": trans_res["translated_text"],
            "version_number": self.translation_version,
            "is_final": is_final
        })

        metrics_data = None
        if is_final:
            metrics_data = self.metrics.calculate_metrics()
            
        # Ensure only the final result has is_final = true
        await persistence_queue.enqueue("store_translation_result", self.token, {
            "utterance_id": self.utterance_id,
            "model_name": trans_res.get("provider", "sarvam_translation"),
            "translated_text": trans_res["translated_text"],
            "version_number": self.translation_version,
            "is_final": is_final,
            "source_language_id": self.source_language_id,
            "target_language_id": self.target_language_id,
            "metrics": metrics_data
        })

        if is_final:
            await self.transition_state(StreamingState.PERSISTED)

    async def _emit_ws(self, payload: dict):
        self.metrics.mark_output()
        if hasattr(self.websocket, 'send_json'):
            await self.websocket.send_json(payload)

def get_provider_factory():
    from app.core.config import settings
    if settings.TRANSLATION_PROVIDER == "sarvam":
        from app.services.providers.sarvam import SarvamASRService, SarvamTranslationService
        return SarvamASRService(), SarvamTranslationService()
    else:
        return MockASRService(), MockTranslationService()
