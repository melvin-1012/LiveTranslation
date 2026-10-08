
from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

def get_supabase_client(token: str = None) -> Client:
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    if token:
        # This propagates the user's JWT to PostgREST for RLS
        client.options.headers["Authorization"] = f"Bearer {token}"
        client.postgrest.auth(token)
    return client

def get_service_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
