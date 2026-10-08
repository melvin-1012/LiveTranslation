import os

files = {
    "backend/app/core/state.py": """from enum import Enum

class StreamingState(str, Enum):
    UTTERANCE_STARTED = "UTTERANCE_STARTED"
    ASR_PARTIAL = "ASR_PARTIAL"
    TRANSLATION_PARTIAL = "TRANSLATION_PARTIAL"
    ASR_UPDATED = "ASR_UPDATED"
    TRANSLATION_UPDATED = "TRANSLATION_UPDATED"
    ASR_FINAL = "ASR_FINAL"
    TRANSLATION_FINAL = "TRANSLATION_FINAL"
    PERSISTED = "PERSISTED"

def is_valid_transition(current: StreamingState, next_state: StreamingState) -> bool:
    transitions = {
        None: [StreamingState.UTTERANCE_STARTED],
        StreamingState.UTTERANCE_STARTED: [StreamingState.ASR_PARTIAL, StreamingState.ASR_FINAL],
        StreamingState.ASR_PARTIAL: [StreamingState.TRANSLATION_PARTIAL, StreamingState.ASR_UPDATED, StreamingState.ASR_FINAL],
        StreamingState.TRANSLATION_PARTIAL: [StreamingState.ASR_UPDATED, StreamingState.TRANSLATION_UPDATED, StreamingState.ASR_FINAL, StreamingState.TRANSLATION_FINAL],
        StreamingState.ASR_UPDATED: [StreamingState.TRANSLATION_UPDATED, StreamingState.ASR_FINAL],
        StreamingState.TRANSLATION_UPDATED: [StreamingState.ASR_UPDATED, StreamingState.TRANSLATION_UPDATED, StreamingState.ASR_FINAL, StreamingState.TRANSLATION_FINAL],
        StreamingState.ASR_FINAL: [StreamingState.TRANSLATION_FINAL],
        StreamingState.TRANSLATION_FINAL: [StreamingState.PERSISTED],
        StreamingState.PERSISTED: []
    }
    return next_state in transitions.get(current, [])
""",
    "backend/app/services/persistence_queue.py": """import asyncio

class PersistenceQueue:
    def __init__(self):
        self.queue = asyncio.Queue()

    async def enqueue(self, event_type: str, data: dict):
        await self.queue.put({"type": event_type, "data": data})

    async def worker(self):
        while True:
            item = await self.queue.get()
            # db abstraction: call translation_db_service
            self.queue.task_done()

persistence_queue = PersistenceQueue()
""",
    "backend/app/services/streaming_orchestrator.py": """from abc import ABC, abstractmethod
from typing import Optional
import uuid
from app.core.state import StreamingState, is_valid_transition
from app.core.metrics import TranslationMetricsTracker
from app.services.persistence_queue import persistence_queue

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
        self.utterance_id = str(uuid.uuid4())
        self.state: Optional[StreamingState] = None
        self.metrics = TranslationMetricsTracker()
        self.translation_version = 0
        self.sequence_number = 1
        self.source_lang = None
        self.target_lang = None
        self.session_id = None

    async def transition_state(self, new_state: StreamingState):
        if not is_valid_transition(self.state, new_state):
            raise ValueError(f"Invalid state transition from {self.state} to {new_state}")
        self.state = new_state

    async def handle_config(self, config: dict):
        self.source_lang = config.get("source_language")
        self.target_lang = config.get("target_language")
        self.session_id = config.get("session_id")
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

        await persistence_queue.enqueue("store_translation_result", {
            "utterance_id": self.utterance_id,
            "translated_text": trans_res["translated_text"],
            "version_number": self.translation_version,
            "is_final": is_final,
            "status": "final" if is_final else "partial"
        })

        if is_final:
            metrics_data = self.metrics.calculate_metrics()
            await persistence_queue.enqueue("store_translation_metrics", {
                "translation_result_id": self.utterance_id,
                **metrics_data
            })
            await self.transition_state(StreamingState.PERSISTED)

    async def _emit_ws(self, payload: dict):
        self.metrics.mark_output()
        if hasattr(self.websocket, 'send_json'):
            await self.websocket.send_json(payload)
""",
    "backend/app/api/endpoints/ws.py": """from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.services.streaming_orchestrator import StreamingOrchestrator, MockASRService, MockTranslationService

router = APIRouter()

@router.websocket("/translate")
async def websocket_translate(websocket: WebSocket):
    await websocket.accept()
    asr_service = MockASRService()
    trans_service = MockTranslationService()
    orchestrator = StreamingOrchestrator(asr_service, trans_service, websocket)

    try:
        raw_msg = await websocket.receive_text()
        try:
            config = json.loads(raw_msg)
            if not all(k in config for k in ["session_id", "source_language", "target_language"]):
                raise ValueError("Missing config fields")
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid initial configuration"})
            await websocket.close()
            return
            
        await orchestrator.handle_config(config)

        while True:
            message = await websocket.receive()
            if "bytes" in message:
                chunk = message["bytes"]
                if not chunk: continue
                await orchestrator.process_audio(chunk)
            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    if data.get("type") == "end_utterance":
                        await orchestrator.finalize()
                except Exception:
                    await websocket.send_json({"type": "error", "message": "Malformed client message"})

    except WebSocketDisconnect:
        await orchestrator.finalize()
    except Exception as e:
        if websocket.client_state.value != 3:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
""",
    "backend/app/main.py": """from fastapi import FastAPI
from app.api.endpoints import sessions, utterances, glossary, evaluation, ws

app = FastAPI(title="Live Translation API")

app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(utterances.router, prefix="/utterances", tags=["utterances"])
app.include_router(glossary.router, prefix="/glossary", tags=["glossary"])
app.include_router(evaluation.router, prefix="/evaluation", tags=["evaluation"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])

@app.get("/")
def read_root():
    return {"message": "Live Translation API Running"}
""",
    "backend/tests/test_streaming.py": """import pytest
import asyncio
from app.core.state import StreamingState, is_valid_transition
from app.core.metrics import TranslationMetricsTracker
from app.services.streaming_orchestrator import StreamingOrchestrator, MockASRService, MockTranslationService

class MockWebSocket:
    def __init__(self):
        self.sent_messages = []
    async def send_json(self, payload):
        self.sent_messages.append(payload)

@pytest.mark.asyncio
async def test_state_transitions():
    assert is_valid_transition(None, StreamingState.UTTERANCE_STARTED)
    assert is_valid_transition(StreamingState.UTTERANCE_STARTED, StreamingState.ASR_PARTIAL)
    assert is_valid_transition(StreamingState.ASR_FINAL, StreamingState.TRANSLATION_FINAL)
    assert not is_valid_transition(StreamingState.UTTERANCE_STARTED, StreamingState.TRANSLATION_FINAL)

@pytest.mark.asyncio
async def test_streaming_orchestrator_flow():
    ws = MockWebSocket()
    orchestrator = StreamingOrchestrator(MockASRService(), MockTranslationService(), ws)
    
    await orchestrator.handle_config({"session_id": "1", "source_language": "en", "target_language": "ta"})
    assert orchestrator.state is None
    
    await orchestrator.process_audio(b"fake audio chunk")
    
    assert orchestrator.state == StreamingState.TRANSLATION_PARTIAL
    assert orchestrator.translation_version == 1
    assert len(ws.sent_messages) == 2
    assert ws.sent_messages[0]["type"] == "asr_partial"
    assert ws.sent_messages[1]["type"] == "translation_partial"
    assert ws.sent_messages[1]["version_number"] == 1
    assert not ws.sent_messages[1]["is_final"]

    await orchestrator.finalize()
    assert orchestrator.state == StreamingState.PERSISTED
    assert orchestrator.translation_version == 2
    assert ws.sent_messages[2]["type"] == "asr_final"
    assert ws.sent_messages[3]["type"] == "translation_final"
    assert ws.sent_messages[3]["version_number"] == 2
    assert ws.sent_messages[3]["is_final"]

def test_metrics():
    metrics = TranslationMetricsTracker()
    metrics.mark_audio_received()
    metrics.mark_asr_first()
    metrics.mark_translation_first()
    metrics.mark_translation_final()
    metrics.mark_output()
    res = metrics.calculate_metrics()
    assert "asr_latency_ms" in res
    assert "time_to_first_translation_ms" in res
    assert "final_translation_latency_ms" in res
"""
}

os.makedirs("backend/tests", exist_ok=True)
for filepath, content in files.items():
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
print("Files updated successfully")
