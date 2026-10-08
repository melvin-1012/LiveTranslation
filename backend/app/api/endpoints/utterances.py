from fastapi import APIRouter
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
