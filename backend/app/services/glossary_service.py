from app.services.supabase_client import get_supabase
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
