import os

files = {
    "backend/requirements.txt": """fastapi
uvicorn
pydantic
pydantic-settings
supabase
python-dotenv
""",
    "backend/.env.example": """SUPABASE_URL=your-project-url
SUPABASE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
ASR_API_KEY=your-asr-provider-key
TRANSLATION_API_KEY=your-translation-provider-key
TTS_API_KEY=your-tts-provider-key
""",
    "backend/app/__init__.py": "",
    "backend/app/core/__init__.py": "",
    "backend/app/models/__init__.py": "",
    "backend/app/services/__init__.py": "",
    "backend/app/api/__init__.py": "",
    "backend/app/api/endpoints/__init__.py": "",
    "backend/app/main.py": """from fastapi import FastAPI
from app.api.endpoints import sessions, utterances, glossary, evaluation

app = FastAPI(title="Live Translation API")

app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(utterances.router, prefix="/utterances", tags=["utterances"])
app.include_router(glossary.router, prefix="/glossary", tags=["glossary"])
app.include_router(evaluation.router, prefix="/evaluation", tags=["evaluation"])

@app.get("/")
def read_root():
    return {"message": "Live Translation API Running"}
""",
    "backend/app/core/config.py": """import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "") # Service role key for backend bypassing RLS
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    
    # Provider Configs
    ASR_API_KEY: str = os.getenv("ASR_API_KEY", "")
    TRANSLATION_API_KEY: str = os.getenv("TRANSLATION_API_KEY", "")
    TTS_API_KEY: str = os.getenv("TTS_API_KEY", "")

    class Config:
        env_file = ".env"

settings = Settings()
""",
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
""",
    "backend/app/core/metrics.py": """import time
from typing import Optional

class TranslationMetricsTracker:
    def __init__(self):
        self.audio_received_at: Optional[float] = None
        self.asr_first_at: Optional[float] = None
        self.translation_first_at: Optional[float] = None
        self.translation_final_at: Optional[float] = None
        self.output_at: Optional[float] = None
        self.caption_rewrite_count: int = 0
    
    def mark_audio_received(self):
        if not self.audio_received_at:
            self.audio_received_at = time.time()
            
    def mark_asr_first(self):
        if not self.asr_first_at:
            self.asr_first_at = time.time()

    def mark_translation_first(self):
        if not self.translation_first_at:
            self.translation_first_at = time.time()
            
    def mark_translation_final(self):
        self.translation_final_at = time.time()
        
    def increment_rewrite(self):
        self.caption_rewrite_count += 1
        
    def mark_output(self):
        self.output_at = time.time()

    def calculate_metrics(self):
        asr_latency_ms = int((self.asr_first_at - self.audio_received_at) * 1000) if self.asr_first_at and self.audio_received_at else None
        time_to_first_translation_ms = int((self.translation_first_at - self.audio_received_at) * 1000) if self.translation_first_at and self.audio_received_at else None
        final_translation_latency_ms = int((self.translation_final_at - self.audio_received_at) * 1000) if self.translation_final_at and self.audio_received_at else None
        end_to_end_latency_ms = int((self.output_at - self.audio_received_at) * 1000) if self.output_at and self.audio_received_at else None
        
        return {
            "asr_latency_ms": asr_latency_ms,
            "time_to_first_translation_ms": time_to_first_translation_ms,
            "final_translation_latency_ms": final_translation_latency_ms,
            "end_to_end_latency_ms": end_to_end_latency_ms,
            "caption_rewrite_count": self.caption_rewrite_count
        }
""",
    "backend/app/models/schemas.py": """from pydantic import BaseModel
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

class TranslationResult(BaseModel):
    model_name: str
    model_version: Optional[str] = None
    translated_text: str
    translation_status: str
    is_final: bool = False
    version_number: int = 1

class TranslationMetrics(BaseModel):
    time_to_first_translation_ms: Optional[int] = None
    end_to_end_latency_ms: Optional[int] = None
    translation_processing_ms: Optional[int] = None
    asr_latency_ms: Optional[int] = None
    segmentation_latency_ms: Optional[int] = None
    caption_rewrite_count: int = 0
    caption_stability_score: Optional[float] = None

class SessionHistory(BaseModel):
    session_id: str
    user_id: str
    source_language: Optional[str] = None
    target_language: Optional[str] = None
    mode: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    total_utterances: int

class SessionDetails(BaseModel):
    session_id: str
    history: SessionHistory
    # Add lists of utterances and translations as needed
""",
    "backend/app/services/supabase_client.py": """from supabase import create_client, Client
from app.core.config import settings

def get_supabase() -> Client:
    # Use SERVICE ROLE key to bypass RLS when acting as backend service
    # Or use ANON KEY + set auth token if acting on behalf of user
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
""",
    "backend/app/services/translation_db_service.py": """from app.services.supabase_client import get_supabase
from app.models.schemas import *
from typing import List, Dict, Any

db = get_supabase()

def create_session(data: CreateSession) -> Dict[str, Any]:
    # Placeholder for database call
    # result = db.table('translation_sessions').insert(data.model_dump()).execute()
    # return result.data[0]
    pass

def end_session(session_id: str, data: EndSession) -> Dict[str, Any]:
    # result = db.table('translation_sessions').update({"status": data.status, "ended_at": "now()"}).eq('id', session_id).execute()
    pass

def create_utterance(session_id: str, data: CreateUtterance) -> Dict[str, Any]:
    # result = db.table('utterances').insert({"session_id": session_id, **data.model_dump()}).execute()
    pass

def create_segment(utterance_id: str, segment_data: dict) -> Dict[str, Any]:
    # result = db.table('utterance_segments').insert({"utterance_id": utterance_id, **segment_data}).execute()
    pass

def store_asr_result(utterance_id: str, data: ASRResult) -> Dict[str, Any]:
    # result = db.table('asr_results').insert({"utterance_id": utterance_id, **data.model_dump()}).execute()
    pass

def store_translation_result(utterance_id: str, data: TranslationResult) -> Dict[str, Any]:
    # result = db.table('translation_results').insert({"utterance_id": utterance_id, **data.model_dump()}).execute()
    pass

def store_translation_metrics(translation_result_id: str, data: TranslationMetrics) -> Dict[str, Any]:
    # result = db.table('translation_metrics').insert({"translation_result_id": translation_result_id, **data.model_dump()}).execute()
    pass

def get_sessions(user_id: str) -> List[Dict[str, Any]]:
    # result = db.table('session_history_view').select('*').eq('user_id', user_id).execute()
    pass

def get_session_details(session_id: str) -> Dict[str, Any]:
    # session = db.table('session_history_view').select('*').eq('session_id', session_id).execute()
    # performance = db.table('translation_performance_view').select('*').eq('session_id', session_id).execute()
    pass
""",
    "backend/app/services/streaming_orchestrator.py": """from abc import ABC, abstractmethod
from typing import AsyncGenerator, Any

class ASRService(ABC):
    @abstractmethod
    async def process_audio_stream(self, audio_chunks: AsyncGenerator[bytes, None]) -> AsyncGenerator[dict, None]:
        pass

class TranslationService(ABC):
    @abstractmethod
    async def process_text_stream(self, text_chunks: AsyncGenerator[str, None], source_lang: str, target_lang: str, glossary: dict = None) -> AsyncGenerator[dict, None]:
        pass

class StreamingOrchestrator:
    def __init__(self, asr: ASRService, translator: TranslationService):
        self.asr = asr
        self.translator = translator

    async def handle_live_stream(self, session_id: str, audio_stream: AsyncGenerator[bytes, None]):
        # Orchestrate the flow:
        # Audio -> ASRService -> yields partial text -> TranslationService -> yields partial translations
        # Maintain State via app.core.state.StreamingState
        # Calculate latency via app.core.metrics.TranslationMetricsTracker
        # Persist asynchronously via translation_db_service
        pass
""",
    "backend/app/services/glossary_service.py": """from app.services.supabase_client import get_supabase
from typing import List, Dict, Any

db = get_supabase()

def get_glossary_terms(user_id: str, source_lang: str, target_lang: str) -> List[Dict[str, Any]]:
    # return db.table('glossary_terms').select('*').eq('created_by', user_id).eq('source_language_id', source_lang).eq('target_language_id', target_lang).execute()
    pass

def add_glossary_term(data: dict) -> Dict[str, Any]:
    pass

def update_glossary_term(term_id: str, data: dict) -> Dict[str, Any]:
    pass

def delete_glossary_term(term_id: str) -> bool:
    pass
""",
    "backend/app/services/evaluation_service.py": """from app.services.supabase_client import get_supabase
from typing import List, Dict, Any

db = get_supabase()

def run_baseline_evaluation(dataset_id: str, model_config: dict):
    # Fetch samples from evaluation_samples where dataset_id=dataset_id
    # Process through baseline model
    # Record to baseline_runs and baseline_results
    pass

def run_system_evaluation(dataset_id: str):
    # Fetch samples
    # Process through our StreamingOrchestrator architecture
    # Collect latencies
    # Calculate BLEU/chrF/Adequacy
    # Record to evaluation_results
    pass

def get_language_pair_breakdown():
    # Query language_pair_performance_view
    pass
""",
    "backend/app/api/endpoints/sessions.py": """from fastapi import APIRouter, HTTPException
from app.models.schemas import CreateSession, EndSession, SessionHistory, SessionDetails
from app.services import translation_db_service

router = APIRouter()

@router.post("", response_model=dict)
def create_session(data: CreateSession):
    # return translation_db_service.create_session(data)
    return {"status": "placeholder"}

@router.patch("/{session_id}/end", response_model=dict)
def end_session(session_id: str, data: EndSession):
    # return translation_db_service.end_session(session_id, data)
    return {"status": "placeholder"}

@router.get("", response_model=list)
def get_sessions(user_id: str):
    # return translation_db_service.get_sessions(user_id)
    return []

@router.get("/{session_id}", response_model=dict)
def get_session_details(session_id: str):
    # return translation_db_service.get_session_details(session_id)
    return {"status": "placeholder"}
""",
    "backend/app/api/endpoints/utterances.py": """from fastapi import APIRouter
from app.models.schemas import CreateUtterance, ASRResult, TranslationResult, TranslationMetrics
from app.services import translation_db_service

router = APIRouter()

@router.post("")
def create_utterance(session_id: str, data: CreateUtterance):
    # return translation_db_service.create_utterance(session_id, data)
    return {"status": "placeholder"}

@router.post("/{utterance_id}/asr")
def store_asr(utterance_id: str, data: ASRResult):
    # return translation_db_service.store_asr_result(utterance_id, data)
    return {"status": "placeholder"}

@router.post("/{utterance_id}/translations")
def store_translation(utterance_id: str, data: TranslationResult):
    # return translation_db_service.store_translation_result(utterance_id, data)
    return {"status": "placeholder"}

@router.post("/{translation_id}/metrics")
def store_metrics(translation_id: str, data: TranslationMetrics):
    # return translation_db_service.store_translation_metrics(translation_id, data)
    return {"status": "placeholder"}
""",
    "backend/app/api/endpoints/glossary.py": """from fastapi import APIRouter
from app.services import glossary_service

router = APIRouter()

@router.get("")
def get_terms(user_id: str, source_lang: str, target_lang: str):
    # return glossary_service.get_glossary_terms(user_id, source_lang, target_lang)
    return []

@router.post("")
def add_term(data: dict):
    return {"status": "placeholder"}
""",
    "backend/app/api/endpoints/evaluation.py": """from fastapi import APIRouter
from app.services import evaluation_service

router = APIRouter()

@router.post("/run-system")
def run_system_eval(dataset_id: str):
    # return evaluation_service.run_system_evaluation(dataset_id)
    return {"status": "placeholder"}
"""
}

for filepath, content in files.items():
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Backend files created successfully.")
