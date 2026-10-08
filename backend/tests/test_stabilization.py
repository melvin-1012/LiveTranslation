import pytest
from app.services.streaming_orchestrator import StreamingOrchestrator, MockASRService, MockTranslationService
from unittest.mock import AsyncMock, patch

@pytest.fixture
def orchestrator():
    asr = MockASRService()
    translator = MockTranslationService()
    ws = AsyncMock()
    return StreamingOrchestrator(asr, translator, ws)

def test_stabilization_duplicate(orchestrator):
    orchestrator.last_asr_text = "A B C"
    is_stable, reason = orchestrator._is_stable_partial("A B C")
    assert is_stable is False
    assert reason == "duplicate"

def test_stabilization_insignificant(orchestrator):
    orchestrator.last_asr_text = "A B C"
    is_stable, reason = orchestrator._is_stable_partial("A B C.")
    assert is_stable is False
    assert reason == "duplicate" # string normalized so it becomes duplicate

def test_stabilization_meaningful_extension(orchestrator):
    orchestrator.last_asr_text = "A B"
    is_stable, reason = orchestrator._is_stable_partial("A B C D")
    assert is_stable is True
    assert reason == "extension"

def test_stabilization_meaningful_correction(orchestrator):
    orchestrator.last_asr_text = "A B hos"
    is_stable, reason = orchestrator._is_stable_partial("A B hospital")
    assert is_stable is True
    assert reason == "correction"
    
def test_stabilization_late_semantic_correction(orchestrator):
    # Simulate an Indic-style sentence where a later ASR segment changes the meaning.
    orchestrator.last_asr_text = "mai ghar ja"
    is_stable, reason = orchestrator._is_stable_partial("mai ghar ja raha tha")
    assert is_stable is True
    assert reason == "extension"
    
    orchestrator.last_asr_text = "mai ghar ja raha tha"
    # Oh wait, the user changes the verb: "raha tha" -> "rahi thi"
    is_stable, reason = orchestrator._is_stable_partial("mai ghar ja rahi thi")
    assert is_stable is True
    assert reason == "correction"

@pytest.mark.asyncio
async def test_final_result_always_emits(orchestrator):
    orchestrator.last_asr_text = "A B C"
    orchestrator.metrics = AsyncMock()
    orchestrator.transition_state = AsyncMock()
    orchestrator._emit_ws = AsyncMock()
    orchestrator.translator.translate_final = AsyncMock(return_value={"translated_text": "A B C final"})
    from app.core.metrics import TranslationMetricsTracker
    orchestrator.metrics = TranslationMetricsTracker()
    
    # Send a tiny insignificant update but with is_final=True
    await orchestrator._handle_asr_result({"text": "A B C.", "is_final": True})
    
    orchestrator._emit_ws.assert_called()
    call_args = orchestrator._emit_ws.call_args[0][0]
    assert call_args["type"] == "translation_final"
    assert call_args["is_final"] is True

@pytest.mark.asyncio
async def test_sentence_reset(orchestrator):
    # Mock db functions
    with patch("app.services.streaming_orchestrator.get_supabase_client"), \
         patch("app.services.translation_db_service.create_utterance", return_value={"id": "new_id"}):
        
        from app.core.state import StreamingState
        orchestrator.state = StreamingState.PERSISTED
        orchestrator.sequence_number = 1
        orchestrator.last_asr_text = "done"
        
        # When process_audio is called while in PERSISTED state, it should reset and process the chunk
        await orchestrator.process_audio(b"fake audio")
        
        assert orchestrator.sequence_number == 2
        assert orchestrator.last_asr_text == "mock partial 1"
        assert orchestrator.translation_version == 1
        assert orchestrator.state == StreamingState.TRANSLATION_PARTIAL # mock ASR returns partial, emitted
        assert orchestrator.utterance_id == "new_id"

@pytest.mark.asyncio
async def test_version_ordering(orchestrator):
    with patch("app.services.streaming_orchestrator.get_supabase_client"), \
         patch("app.services.translation_db_service.create_utterance", return_value={"id": "new_id"}):
        
        from app.core.state import StreamingState
        orchestrator.state = StreamingState.UTTERANCE_STARTED
        orchestrator._emit_ws = AsyncMock()
        
        # First partial
        await orchestrator._handle_asr_result({"text": "Hello world it is", "is_final": False})
        call1 = orchestrator._emit_ws.call_args_list[-1][0][0]
        v1 = call1["version_number"]
        
        # Second partial
        await orchestrator._handle_asr_result({"text": "Hello world it is a beautiful", "is_final": False})
        call2 = orchestrator._emit_ws.call_args_list[-1][0][0]
        v2 = call2["version_number"]
        
        # Final
        await orchestrator._handle_asr_result({"text": "Hello world it is a beautiful day.", "is_final": True})
        call3 = orchestrator._emit_ws.call_args_list[-1][0][0]
        v3 = call3["version_number"]
        
        assert v1 < v2 < v3
