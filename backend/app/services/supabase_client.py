from supabase import create_client, Client
from app.core.config import settings

def get_supabase() -> Client:
    # Use SERVICE ROLE key to bypass RLS when acting as backend service
    # Or use ANON KEY + set auth token if acting on behalf of user
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
