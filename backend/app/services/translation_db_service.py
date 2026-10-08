from app.services.supabase_client import get_supabase
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
