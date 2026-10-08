
from supabase import Client
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

def create_session(db: Client, user_id: str, mode: str, src_lang: str = None, tgt_lang: str = None) -> Dict[str, Any]:
    data = {"user_id": user_id, "mode": mode}
    if src_lang: data["source_language_id"] = src_lang
    if tgt_lang: data["target_language_id"] = tgt_lang
    res = db.table('translation_sessions').insert(data).execute()
    return res.data[0]

def end_session(db: Client, session_id: str, status: str = 'completed') -> Dict[str, Any]:
    res = db.table('translation_sessions').update({"status": status, "ended_at": "now()"}).eq('id', session_id).execute()
    return res.data[0] if res.data else {}

def get_sessions(db: Client) -> List[Dict[str, Any]]:
    # RLS restricts this to the user's sessions automatically
    res = db.table('translation_sessions').select('*').execute()
    return res.data

def get_session_details(db: Client, session_id: str) -> Dict[str, Any]:
    res = db.table('translation_sessions').select('*').eq('id', session_id).execute()
    if not res.data: return None
    return res.data[0]

def create_utterance(db: Client, session_id: str, sequence_number: int) -> Dict[str, Any]:
    res = db.table('utterances').insert({"session_id": session_id, "sequence_number": sequence_number}).execute()
    return res.data[0]

def store_asr_result(db: Client, utterance_id: str, model_name: str, transcript: str, is_final: bool) -> Dict[str, Any]:
    res = db.table('asr_results').insert({
        "utterance_id": utterance_id, 
        "model_name": model_name, 
        "transcript": transcript,
        "is_final": is_final,
        "asr_status": "final" if is_final else "partial"
    }).execute()
    return res.data[0]

def store_translation_result(db: Client, utterance_id: str, model_name: str, translated_text: str, version_number: int, is_final: bool) -> Dict[str, Any]:
    # upsert could be used but we rely on UNIQUE constraint and version increments for append-only log
    res = db.table('translation_results').insert({
        "utterance_id": utterance_id,
        "model_name": model_name,
        "translated_text": translated_text,
        "translation_status": "final" if is_final else "partial",
        "is_final": is_final,
        "version_number": version_number
    }).execute()
    return res.data[0]

def store_translation_metrics(db: Client, translation_result_id: str, metrics: dict) -> Dict[str, Any]:
    # translation_result_id is the fk to translation_results(id)
    # Wait, utterance_id is not translation_result_id. We need the actual trans id.
    res = db.table('translation_metrics').insert({
        "translation_result_id": translation_result_id,
        **metrics
    }).execute()
    return res.data[0]

def get_session_history(db: Client, user_id: str):
    res = db.table('session_history_view').select('*').eq('user_id', user_id).execute()
    return res.data
