
import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from backend directory or project root
backend_dir = Path(__file__).resolve().parent.parent.parent
backend_env = backend_dir / ".env"
root_env = backend_dir.parent / ".env"

if backend_env.exists():
    load_dotenv(backend_env)
if root_env.exists():
    load_dotenv(root_env)

class Settings(BaseSettings):
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    
    # Provider Configs
    TRANSLATION_PROVIDER: str = os.getenv("TRANSLATION_PROVIDER", "mock")
    SARVAM_API_KEY: str = os.getenv("SARVAM_API_KEY", "")
    ASR_API_KEY: str = os.getenv("ASR_API_KEY", "")
    TRANSLATION_API_KEY: str = os.getenv("TRANSLATION_API_KEY", "")
    TTS_API_KEY: str = os.getenv("TTS_API_KEY", "")

    class Config:
        extra = "ignore"

settings = Settings()
