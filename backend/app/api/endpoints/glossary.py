from fastapi import APIRouter
from app.services import glossary_service

router = APIRouter()

@router.get("")
def get_terms(user_id: str, source_lang: str, target_lang: str):
    # return glossary_service.get_glossary_terms(user_id, source_lang, target_lang)
    return []

@router.post("")
def add_term(data: dict):
    return {"status": "placeholder"}
