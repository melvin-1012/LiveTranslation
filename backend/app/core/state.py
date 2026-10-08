from enum import Enum

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
