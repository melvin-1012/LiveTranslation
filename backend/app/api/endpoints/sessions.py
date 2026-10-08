
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import CreateSession, EndSession
from app.services import translation_db_service
from app.api.deps import get_db, get_current_user
from supabase import Client

router = APIRouter()

@router.post("", response_model=dict)
def create_session(data: CreateSession, db: Client = Depends(get_db), user_id: str = Depends(get_current_user)):
    try:
        return translation_db_service.create_session(db, user_id, data.mode)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{session_id}/end", response_model=dict)
def end_session(session_id: str, data: EndSession, db: Client = Depends(get_db), user_id: str = Depends(get_current_user)):
    try:
        return translation_db_service.end_session(db, session_id, data.status)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=list)
def get_sessions(db: Client = Depends(get_db), user_id: str = Depends(get_current_user)):
    try:
        return translation_db_service.get_sessions(db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{session_id}", response_model=dict)
def get_session_details(session_id: str, db: Client = Depends(get_db), user_id: str = Depends(get_current_user)):
    try:
        session = translation_db_service.get_session_details(db, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or forbidden")
        return session
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
