
import os
from pydantic_settings import BaseSettings

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
        env_file = ".env"

settings = Settings()
