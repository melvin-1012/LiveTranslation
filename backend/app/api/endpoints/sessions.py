from fastapi import APIRouter, HTTPException
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
