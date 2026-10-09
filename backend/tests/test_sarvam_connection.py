import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from app.services.providers.sarvam import SarvamASRService
from app.core.config import settings

@pytest.mark.asyncio
async def test_sarvam_websockets_version_compat():
    """
    Test that the SarvamASRService calls websockets.connect with the correct arguments
    for the currently installed version of websockets.
    """
    service = SarvamASRService()
    
    # We mock websockets.connect to verify it accepts additional_headers without throwing TypeError
    with patch("websockets.connect", new_callable=AsyncMock) as mock_connect:
        mock_ws = AsyncMock()
        async def mock_recv():
            await asyncio.sleep(3600)
            return '{"event": "session.begin"}'
        mock_ws.recv = mock_recv
        mock_connect.return_value = mock_ws
        
        # Ensure it doesn't raise TypeError: ... unexpected keyword argument
        await service.start_stream({"source_language": "en", "target_language": "hi"})
        
        mock_connect.assert_called_once()
        _, kwargs = mock_connect.call_args
        
        assert "additional_headers" in kwargs, "Expected 'additional_headers' in connect kwargs for websockets >= 14.0"
        assert kwargs["additional_headers"]["api-subscription-key"] == settings.SARVAM_API_KEY