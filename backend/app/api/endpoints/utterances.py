
from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import CreateUtterance
from app.services import translation_db_service
from app.api.deps import get_db, get_current_user
from supabase import Client

router = APIRouter()

@router.post("/{session_id}/utterances", response_model=dict)
def create_utterance(session_id: str, data: CreateUtterance, db: Client = Depends(get_db), user_id: str = Depends(get_current_user)):
    try:
        return translation_db_service.create_utterance(db, session_id, data.sequence_number)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
