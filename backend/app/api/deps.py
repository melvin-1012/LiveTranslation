
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.supabase_client import get_supabase_client
from supabase import Client
import logging

security = HTTPBearer()
logger = logging.getLogger(__name__)

def get_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    return credentials.credentials

def get_db(token: str = Depends(get_token)) -> Client:
    return get_supabase_client(token)

def get_current_user(token: str = Depends(get_token)) -> str:
    client = get_supabase_client(token)
    try:
        user_response = client.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_response.user.id
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
