
from abc import ABC, abstractmethod
from typing import Optional
import uuid
import logging
from app.core.state import StreamingState, is_valid_transition
from app.core.metrics import TranslationMetricsTracker
from app.services.persistence_queue import persistence_queue
from app.services.supabase_client import get_supabase_client
from app.services.translation_db_service import create_utterance, store_asr_result

logger = logging.getLogger(__name__)

class ASRService(ABC):
    @abstractmethod
    async def start_stream(self, config: dict): pass
    @abstractmethod
    async def process_audio_chunk(self, chunk: bytes) -> Optional[dict]: pass
    @abstractmethod
    async def finalize(self) -> Optional[dict]: pass
    @abstractmethod
    async def close(self): pass

class TranslationService(ABC):
    @abstractmethod
    async def translate_partial(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict: pass
    @abstractmethod
    async def translate_final(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict: pass

class MockASRService(ASRService):
    async def start_stream(self, config: dict): pass
    async def process_audio_chunk(self, chunk: bytes) -> Optional[dict]:
        return {"type": "asr_partial", "text": "mock partial", "is_final": False}
    async def finalize(self) -> Optional[dict]:
        return {"type": "asr_final", "text": "mock final", "is_final": True}
    async def close(self): pass

class MockTranslationService(TranslationService):
    async def translate_partial(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return {"translated_text": "mock translated partial", "confidence": 0.9}
    async def translate_final(self, text: str, source_lang: str, target_lang: str, glossary: dict = None) -> dict:
        return {"translated_text": "mock translated final", "confidence": 0.95}

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

    async def transition_state(self, new_state: StreamingState):
        if not is_valid_transition(self.state, new_state):
            raise ValueError(f"Invalid state transition from {self.state} to {new_state}")
        self.state = new_state

    async def handle_config(self, config: dict):
        self.source_lang = config.get("source_language")
        self.target_lang = config.get("target_language")
        self.session_id = config.get("session_id")
        self.token = config.get("token")
        
        # We block briefly to create the utterance synchronously so we have an ID for the live stream
        try:
            db = get_supabase_client(self.token)
            res = create_utterance(db, self.session_id, self.sequence_number)
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
        if asr_result:
            await self._handle_asr_result(asr_result)

    async def finalize(self):
        asr_result = await self.asr.finalize()
        if asr_result:
            await self._handle_asr_result(asr_result)
        await self.asr.close()

    async def _handle_asr_result(self, asr_result: dict):
        is_final = asr_result.get("is_final", False)
        text = asr_result.get("text", "")
        self.metrics.mark_asr_first()
        
        if is_final:
            await self.transition_state(StreamingState.ASR_FINAL)
            # Store final ASR result asynchronously without blocking
            # Assuming store_asr_result in queue
            pass
        else:
            if self.state == StreamingState.UTTERANCE_STARTED:
                await self.transition_state(StreamingState.ASR_PARTIAL)
            else:
                await self.transition_state(StreamingState.ASR_UPDATED)

        await self._emit_ws({
            "type": "asr_final" if is_final else "asr_partial",
            "utterance_id": self.utterance_id,
            "text": text,
            "sequence_number": self.sequence_number
        })

        if is_final:
            trans_res = await self.translator.translate_final(text, self.source_lang, self.target_lang)
            self.translation_version += 1
            await self.transition_state(StreamingState.TRANSLATION_FINAL)
            self.metrics.mark_translation_final()
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
            
        await persistence_queue.enqueue("store_translation_result", self.token, {
            "utterance_id": self.utterance_id,
            "translated_text": trans_res["translated_text"],
            "version_number": self.translation_version,
            "is_final": is_final,
            "metrics": metrics_data
        })

        if is_final:
            await self.transition_state(StreamingState.PERSISTED)

    async def _emit_ws(self, payload: dict):
        self.metrics.mark_output()
        if hasattr(self.websocket, 'send_json'):
            await self.websocket.send_json(payload)
