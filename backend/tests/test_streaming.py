import pytest
import asyncio
import uuid
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.state import StreamingState, is_valid_transition
from app.core.metrics import TranslationMetricsTracker
from app.services.streaming_orchestrator import StreamingOrchestrator, MockASRService, MockTranslationService

class MockWebSocket:
    def __init__(self):
        self.sent_messages = []
    async def send_json(self, payload):
        self.sent_messages.append(payload)


def test_auto_detection_fails_clearly_when_mock_provider_is_active(monkeypatch):
    monkeypatch.setattr(settings, "TRANSLATION_PROVIDER", "mock")
    client = TestClient(app)

    with client.websocket_connect("/ws/translate") as websocket:
        websocket.send_json({
            "session_id": str(uuid.uuid4()),
            "source_language": "auto",
            "target_language": "ta",
            "token": "test-token",
        })
        response = websocket.receive_json()

    assert response == {
        "type": "error",
        "message": "Auto-detection requires TRANSLATION_PROVIDER=sarvam.",
    }


@pytest.mark.asyncio
async def test_state_transitions():
    assert is_valid_transition(None, StreamingState.UTTERANCE_STARTED)
    assert is_valid_transition(StreamingState.UTTERANCE_STARTED, StreamingState.ASR_PARTIAL)
    assert is_valid_transition(StreamingState.ASR_UPDATED, StreamingState.ASR_UPDATED)
    assert is_valid_transition(StreamingState.ASR_FINAL, StreamingState.TRANSLATION_FINAL)
    assert not is_valid_transition(StreamingState.UTTERANCE_STARTED, StreamingState.TRANSLATION_FINAL)


@pytest.mark.asyncio
async def test_consecutive_unstable_asr_partials_do_not_break_state_machine(monkeypatch):
    class RepeatedPartialASR(MockASRService):
        async def process_audio_chunk(self, chunk: bytes):
            return {
                "text": "hello",
                "is_final": False,
            }

    monkeypatch.setattr("app.services.streaming_orchestrator.get_supabase_client", lambda token: None)
    websocket = MockWebSocket()
    orchestrator = StreamingOrchestrator(
        RepeatedPartialASR(),
        MockTranslationService(),
        websocket,
    )
    await orchestrator.handle_config({
        "session_id": "guest-test",
        "source_language": "en",
        "target_language": "ta",
        "token": "guest",
    })

    await orchestrator.process_audio(b"audio 1")
    await orchestrator.process_audio(b"audio 2")
    await orchestrator.process_audio(b"audio 3")

    assert orchestrator.state == StreamingState.ASR_UPDATED
    assert [message["type"] for message in websocket.sent_messages] == [
        "asr_partial",
        "asr_partial",
        "asr_partial",
    ]


@pytest.mark.asyncio
@patch("app.services.streaming_orchestrator.create_utterance")
@patch("app.services.streaming_orchestrator.get_supabase_client")
async def test_streaming_orchestrator_flow(mock_get_db, mock_create):
    mock_create.return_value = {"id": str(uuid.uuid4())}
    ws = MockWebSocket()
    orchestrator = StreamingOrchestrator(MockASRService(), MockTranslationService(), ws)
    
    await orchestrator.handle_config({"session_id": str(uuid.uuid4()), "source_language": "en", "target_language": "ta"})
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


@pytest.mark.asyncio
async def test_auto_detected_language_drives_translation_and_persistence(monkeypatch):
    class DetectedASR(MockASRService):
        async def process_audio_chunk(self, chunk: bytes):
            return {
                "text": "வணக்கம் உலகம்",
                "is_final": False,
                "language": "ta-IN",
                "language_confidence": 0.98,
            }

        async def finalize(self):
            return {
                "text": "வணக்கம் உலகம்",
                "is_final": True,
                "language": "ta-IN",
                "language_confidence": 0.99,
            }

    class RecordingTranslator(MockTranslationService):
        def __init__(self):
            self.sources = []

        async def translate_partial(self, text, source_lang, target_lang, glossary=None):
            self.sources.append(source_lang)
            return {"translated_text": "Hello world", "provider": "test"}

        async def translate_final(self, text, source_lang, target_lang, glossary=None):
            self.sources.append(source_lang)
            return {"translated_text": "Hello world", "provider": "test"}

    queued = []

    async def enqueue(event_type, token, data):
        queued.append((event_type, data))

    monkeypatch.setattr("app.services.streaming_orchestrator.get_supabase_client", lambda token: object())
    monkeypatch.setattr("app.services.streaming_orchestrator.create_utterance", lambda *args: {"id": "utterance-id"})
    monkeypatch.setattr("app.services.streaming_orchestrator.get_language_id", lambda db, code: "tamil-id")
    monkeypatch.setattr("app.services.streaming_orchestrator.persistence_queue.enqueue", enqueue)

    websocket = MockWebSocket()
    translator = RecordingTranslator()
    orchestrator = StreamingOrchestrator(DetectedASR(), translator, websocket)
    await orchestrator.handle_config({
        "session_id": str(uuid.uuid4()),
        "source_language": "auto",
        "target_language": "en",
        "target_language_id": "english-id",
        "token": "test-token",
    })

    await orchestrator.process_audio(b"audio")
    await orchestrator.finalize()

    assert translator.sources == ["ta", "ta"]
    assert [message["language"] for message in websocket.sent_messages if message["type"].startswith("asr_")] == [
        "ta",
        "ta",
    ]
    asr_persistence = next(data for event, data in queued if event == "store_asr_result")
    translation_persistence = next(data for event, data in queued if event == "store_translation_result" and data["is_final"])
    assert asr_persistence["language_id"] == "tamil-id"
    assert asr_persistence["confidence"] == 0.99
    assert asr_persistence["session_id"] == orchestrator.session_id
    assert translation_persistence["source_language_id"] == "tamil-id"
    assert orchestrator.state == StreamingState.PERSISTED


@pytest.mark.asyncio
async def test_manual_source_language_is_not_overridden_by_asr_metadata(monkeypatch):
    class ConflictingASR(MockASRService):
        async def process_audio_chunk(self, chunk: bytes):
            return {
                "text": "Hello there",
                "is_final": False,
                "language": "ta-IN",
            }

    class RecordingTranslator(MockTranslationService):
        def __init__(self):
            self.sources = []

        async def translate_partial(self, text, source_lang, target_lang, glossary=None):
            self.sources.append(source_lang)
            return {"translated_text": "வணக்கம்", "provider": "test"}

    monkeypatch.setattr("app.services.streaming_orchestrator.get_supabase_client", lambda token: object())
    monkeypatch.setattr("app.services.streaming_orchestrator.create_utterance", lambda *args: {"id": "utterance-id"})
    websocket = MockWebSocket()
    translator = RecordingTranslator()
    orchestrator = StreamingOrchestrator(ConflictingASR(), translator, websocket)

    await orchestrator.handle_config({
        "session_id": str(uuid.uuid4()),
        "source_language": "en",
        "target_language": "ta",
        "source_language_id": "english-id",
    })
    await orchestrator.process_audio(b"audio")

    assert translator.sources == ["en"]
    asr_message = next(message for message in websocket.sent_messages if message["type"] == "asr_partial")
    assert asr_message["language"] == "en"


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
