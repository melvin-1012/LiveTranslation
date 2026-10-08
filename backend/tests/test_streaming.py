import pytest
import asyncio
import uuid
from unittest.mock import patch
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
