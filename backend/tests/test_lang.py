import pytest
from app.services.providers.sarvam import map_lang, map_lang_reverse, map_translation_pair, identify_text_language
from unittest.mock import patch, AsyncMock

def test_map_lang():
    assert map_lang("en") == "en-IN"
    assert map_lang("hi") == "hi-IN"
    with pytest.raises(ValueError):
        map_lang("fr")

def test_map_lang_reverse():
    assert map_lang_reverse("en-IN") == "en"
    assert map_lang_reverse("hi-IN") == "hi"
    assert map_lang_reverse("ta-IN") == "ta"
    assert map_lang_reverse("te-IN") == "te"
    assert map_lang_reverse("kn-IN") == "kn"
    assert map_lang_reverse("ml-IN") == "ml"
    
    # Test normalization cases
    assert map_lang_reverse("en_in") == "en"
    assert map_lang_reverse("en-in") == "en"
    
    with pytest.raises(ValueError):
        map_lang_reverse("fr-FR")

def test_map_translation_pair():
    src, tgt = map_translation_pair("en", "hi")
    assert src == "en-IN"
    assert tgt == "hi-IN"
    
    with pytest.raises(ValueError, match="Source and target languages must be different"):
        map_translation_pair("en", "en")

@pytest.mark.asyncio
async def test_identify_text_language_success():
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_response = AsyncMock()
        from unittest.mock import MagicMock
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"language_code": "hi-IN"})
        mock_post.return_value = mock_response
        
        # Assume SARVAM_API_KEY is set in settings, if not we might need to patch it
        with patch("app.services.providers.sarvam.settings.SARVAM_API_KEY", "dummy_key"):
            lang = await identify_text_language("नमस्ते")
            assert lang == "hi"

@pytest.mark.asyncio
async def test_identify_text_language_failure():
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_response = AsyncMock()
        mock_response.status_code = 500
        mock_post.return_value = mock_response
        
        with patch("app.services.providers.sarvam.settings.SARVAM_API_KEY", "dummy_key"):
            lang = await identify_text_language("hello")
            assert lang is None

@pytest.mark.asyncio
async def test_identify_text_language_no_key():
    with patch("app.services.providers.sarvam.settings.SARVAM_API_KEY", ""):
        lang = await identify_text_language("hello")
        assert lang is None
