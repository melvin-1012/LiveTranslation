
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_db, get_current_user
from supabase import Client

router = APIRouter()

@router.get("")
def get_glossary(db: Client = Depends(get_db), user_id: str = Depends(get_current_user)):
    try:
        res = db.table('glossary_terms').select('*').execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
