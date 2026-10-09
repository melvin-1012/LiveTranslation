
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

def detect_script_language(text: str) -> Optional[str]:
    for char in text:
        cp = ord(char)
        if 0x0900 <= cp <= 0x097F:
            return "hi"
        if 0x0B80 <= cp <= 0x0BFF:
            return "ta"
        if 0x0C00 <= cp <= 0x0C7F:
            return "te"
        if 0x0C80 <= cp <= 0x0CFF:
            return "kn"
        if 0x0D00 <= cp <= 0x0D7F:
            return "ml"
    return None

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
            if self.session_id and not str(self.session_id).startswith("guest-"):
                res = create_utterance(self.db, self.session_id, self.sequence_number)
                self.utterance_id = res["id"]
            else:
                self.utterance_id = str(uuid.uuid4())
        except Exception as e:
            logger.warning(f"Could not initialize utterance in DB (offline fallback): {e}")
            self.utterance_id = str(uuid.uuid4())
            
        await self.asr.start_stream(config)

    async def process_audio(self, chunk: bytes):
        self.metrics.mark_audio_received()
        
        if self.state == StreamingState.PERSISTED:
            # Sentence reset: previous utterance was finalized.
            logger.info("SENTENCE_FINALIZED - Starting new utterance.")
            self.sequence_number += 1
            try:
                from app.services.supabase_client import get_supabase_client
                from app.services.translation_db_service import create_utterance
                db = get_supabase_client(self.token)
                res = create_utterance(db, self.session_id, self.sequence_number)
                self.utterance_id = res["id"]
            except Exception as e:
                logger.error(f"Failed to initialize new utterance in DB: {e}")
                raise ValueError(f"DB Error: {e}")
            self.state = None
            from app.core.metrics import TranslationMetricsTracker
            self.metrics = TranslationMetricsTracker()
            self.translation_version = 0
            self.last_asr_text = ""
            
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

    def _is_stable_partial(self, new_text: str) -> tuple[bool, str]:
        import string
        def normalize(t):
            return t.lower().translate(str.maketrans('', '', string.punctuation)).split()
            
        last_words = normalize(self.last_asr_text)
        new_words = normalize(new_text)
        
        if last_words == new_words:
            return False, "duplicate"
            
        common_prefix = 0
        for w1, w2 in zip(last_words, new_words):
            if w1 == w2:
                common_prefix += 1
            else:
                break
                
        if common_prefix < len(last_words):
            return True, "correction"
            
        added_words = len(new_words) - common_prefix
        if added_words >= 2:
            return True, "extension"
            
        return False, "insignificant"

    async def _handle_asr_result(self, asr_result: dict):
        is_final = asr_result.get("is_final", False)
        text = asr_result.get("text", "")
        detected_language = asr_result.get("language")
        known_ids = {
            "en": "43a7cfdc-c0dc-4a19-9901-27f536165d45",
            "hi": "7e0d2af7-cab7-4190-ac2d-6a32f574db38",
            "ta": "2d0800b5-746d-4389-adcf-d0167a33e6b1",
            "te": "f3e1d3a6-d031-4b11-9659-32e51183c1a1",
            "kn": "6dc5cdd2-a18d-443d-9a9f-cccb4c7da3ce",
            "ml": "3bc98387-7244-4d1b-a63e-b314190a2b53",
        }
        if self.auto_detect and text.strip():
            script_lang = detect_script_language(text)
            if script_lang:
                self.source_lang = script_lang
            elif detected_language:
                try:
                    from app.services.providers.sarvam import map_lang_reverse, identify_text_language
                    rev_lang = map_lang_reverse(detected_language)
                    if rev_lang == "en" and is_final:
                        lid_lang = await identify_text_language(text)
                        self.source_lang = lid_lang or rev_lang
                    else:
                        self.source_lang = rev_lang
                except ValueError:
                    self.source_lang = None

            if self.source_lang is None:
                try:
                    from app.services.providers.sarvam import identify_text_language
                    detected = await identify_text_language(text)
                    if detected:
                        self.source_lang = detected
                except Exception as e:
                    logger.debug("LID fallback notice: %s", e)

            if self.source_lang:
                if self.source_lang not in self.language_id_cache:
                    try:
                        self.language_id_cache[self.source_lang] = get_language_id(
                            self.db, self.source_lang
                        )
                    except Exception as err:
                        self.language_id_cache[self.source_lang] = known_ids.get(self.source_lang)
                self.source_language_id = self.language_id_cache.get(self.source_lang)
                if self.session_id and not self.session_source_language_set:
                    self.session_source_language_set = True
        elif detected_language and self.auto_detect:
            try:
                from app.services.providers.sarvam import map_lang_reverse
                self.source_lang = map_lang_reverse(detected_language)
                if self.source_lang not in self.language_id_cache:
                    self.language_id_cache[self.source_lang] = known_ids.get(self.source_lang)
                self.source_language_id = self.language_id_cache.get(self.source_lang)
            except ValueError:
                pass

        self.metrics.mark_asr_first()
        
        if is_final:
            await self.transition_state(StreamingState.ASR_FINAL)
            # Store final ASR result
            if self.token and self.token != "guest":
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
        if not is_final:
            self.metrics.increment_candidate()
            is_stable, reason = self._is_stable_partial(text)
            if not is_stable:
                self.metrics.increment_suppressed()
                logger.info(f"PARTIAL_TRANSLATION_SUPPRESSED ({reason})")
                return
            else:
                self.metrics.increment_emitted()
                if reason == "correction":
                    logger.info("TRANSLATION_CORRECTION")
                    self.metrics.increment_rewrite()
                else:
                    logger.info(f"PARTIAL_TRANSLATION_EMITTED ({reason})")
        else:
            logger.info("PARTIAL_TRANSLATION_CANDIDATE (is_final)")

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
            "is_final": is_final,
            "language": self.source_lang,
            "target_language": self.target_lang
        })

        metrics_data = None
        if is_final:
            metrics_data = self.metrics.calculate_metrics()
            
        # Ensure only the final result has is_final = true
        if self.token and self.token != "guest":
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
