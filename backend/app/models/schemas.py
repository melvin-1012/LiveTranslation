from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class CreateSession(BaseModel):
    user_id: str
    source_language_id: Optional[str] = None
    target_language_id: Optional[str] = None
    mode: str = "one_way"

class EndSession(BaseModel):
    status: str = "completed"

class CreateUtterance(BaseModel):
    sequence_number: int
    participant_id: Optional[str] = None
    detected_language_id: Optional[str] = None

class ASRResult(BaseModel):
    model_name: str
    model_version: Optional[str] = None
    transcript: str
    language_id: Optional[str] = None
    confidence: Optional[float] = None
    processing_latency_ms: Optional[int] = None
    is_final: bool = True
    asr_status: str = "final"
    error_message: Optional[str] = None

class TranslationResult(BaseModel):
    model_name: str
    model_version: Optional[str] = None
    translated_text: str
    translation_status: str
    is_final: bool = False
    version_number: int = 1
    confidence: Optional[float] = None
    error_message: Optional[str] = None

class TranslationMetrics(BaseModel):
    time_to_first_translation_ms: Optional[int] = None
    end_to_end_latency_ms: Optional[int] = None
    translation_processing_ms: Optional[int] = None
    asr_latency_ms: Optional[int] = None
    segmentation_latency_ms: Optional[int] = None
    caption_rewrite_count: int = 0
    caption_stability_score: Optional[float] = None
    confidence: Optional[float] = None

class SessionHistory(BaseModel):
    session_id: str
    user_id: str
    source_language: Optional[str] = None
    source_language_code: Optional[str] = None
    target_language: Optional[str] = None
    target_language_code: Optional[str] = None
    mode: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    total_utterances: int

class SessionDetails(BaseModel):
    session_id: str
    history: SessionHistory
    # Add lists of utterances and translations as needed

class GlossaryTerm(BaseModel):
    id: Optional[str] = None
    source_language_id: Optional[str] = None
    target_language_id: Optional[str] = None
    source_term: str
    target_term: str
    term_type: str = "general"
    description: Optional[str] = None
    is_active: bool = True
