import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

import server


def test_clean_api_key_filters_mock_and_empty_values():
    assert server.clean_api_key(None) == ""
    assert server.clean_api_key("") == ""
    assert server.clean_api_key("   ") == ""
    assert server.clean_api_key("mock") == ""
    assert server.clean_api_key("mock-asr-key") == ""
    assert server.clean_api_key("mock-translation-key") == ""
    assert server.clean_api_key("your-deepgram-api-key") == ""
    assert server.clean_api_key("  'valid-key-123'  ") == "valid-key-123"
    assert server.clean_api_key('"valid-key-456"') == "valid-key-456"


def test_deepgram_manual_language_routing_parameters():
    # Dravidian languages use nova-3
    for lang in ("ta", "te", "kn"):
        url, headers, provider, use_sarvam = server.get_asr_backend(lang, "dg-key-123", "")
        assert "api.deepgram.com" in url
        assert "model=nova-3" in url
        assert f"language={lang}" in url
        assert "encoding=linear16" in url
        assert "sample_rate=16000" in url
        assert headers == {"Authorization": "Token dg-key-123"}
        assert provider == "deepgram-nova-3"
        assert use_sarvam is False

    # English and Hindi use nova-2
    for lang in ("en", "hi"):
        url, headers, provider, use_sarvam = server.get_asr_backend(lang, "dg-key-123", "")
        assert "api.deepgram.com" in url
        assert "model=nova-2" in url
        assert f"language={lang}" in url
        assert headers == {"Authorization": "Token dg-key-123"}
        assert provider == "deepgram-nova-2"
        assert use_sarvam is False


def test_sarvam_fallback_when_deepgram_unconfigured_or_mock():
    # When deepgram_api_key is empty or a mock placeholder, manual languages fall back to Sarvam
    for mock_dg in ("", "mock-asr-key", "none", "   "):
        url, headers, provider, use_sarvam = server.get_asr_backend("en", mock_dg, "sarvam-key-real")
        assert "api.sarvam.ai" in url
        assert "language_code=en-IN" in url
        assert "model=saaras:v4" in url
        assert headers == {"api-subscription-key": "sarvam-key-real"}
        assert provider == "sarvam-saaras-v4"
        assert use_sarvam is True

        url_ta, _, provider_ta, use_sarvam_ta = server.get_asr_backend("ta", mock_dg, "sarvam-key-real")
        assert "language_code=ta-IN" in url_ta
        assert provider_ta == "sarvam-saaras-v4"
        assert use_sarvam_ta is True


def test_mock_asr_mode_when_no_credentials():
    url, headers, provider, use_sarvam = server.get_asr_backend("en", "", "")
    assert url is None
    assert headers == {}
    assert provider == "mock-asr"
    assert use_sarvam is False

    url_auto, _, provider_auto, _ = server.get_asr_backend("ml", "", "")
    assert url_auto is None
    assert provider_auto == "mock-asr"


def test_auto_detection_requires_sarvam_key():
    with pytest.raises(ValueError, match="Auto-detection requires SARVAM_API_KEY"):
        server.get_asr_backend("auto", "some-dg-key", "")

    with pytest.raises(ValueError, match="Auto-detection requires SARVAM_API_KEY"):
        server.get_asr_backend("auto", "", "mock-translation-key")


class FakeConnectContext:
    def __init__(self, exc):
        self.exc = exc

    async def __aenter__(self):
        raise self.exc

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


def test_websocket_handles_provider_http_401(monkeypatch):
    class FakeInvalidStatus(Exception):
        def __init__(self):
            super().__init__("server rejected WebSocket connection: HTTP 401")
            self.response = MagicMock(status_code=401)

    monkeypatch.setattr(server.ws_client, "connect", lambda *args, **kwargs: FakeConnectContext(FakeInvalidStatus()))
    monkeypatch.setattr(server, "DEEPGRAM_API_KEY", "test-dg-key")

    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate") as ws:
        ws.send_text(json.dumps({
            "session_id": "test-session",
            "source_language": "en",
            "target_language": "hi",
            "token": "guest"
        }))

        response = ws.receive_json()
        assert response["type"] == "error"
        assert response["error_code"] == "asr_auth_failed"
        assert response["error_category"] == "authentication_error"
        assert "HTTP 401" in response["message"]


def test_websocket_handles_provider_http_429(monkeypatch):
    class FakeInvalidStatus(Exception):
        def __init__(self):
            super().__init__("server rejected WebSocket connection: HTTP 429")
            self.response = MagicMock(status_code=429)

    monkeypatch.setattr(server.ws_client, "connect", lambda *args, **kwargs: FakeConnectContext(FakeInvalidStatus()))
    monkeypatch.setattr(server, "SARVAM_API_KEY", "test-sarvam-key")

    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate") as ws:
        ws.send_text(json.dumps({
            "session_id": "test-session",
            "source_language": "auto",
            "target_language": "en",
            "token": "guest"
        }))

        response = ws.receive_json()
        assert response["type"] == "error"
        assert response["error_code"] == "asr_quota_exceeded"
        assert response["error_category"] == "provider_limits"


def test_websocket_handles_sarvam_in_stream_error_event(monkeypatch):
    class FakeSarvamSocket:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def recv(self):
            return json.dumps({
                "event": "error",
                "code": "invalid_subscription_key",
                "message": "Invalid subscription key",
                "status_code": 401,
                "is_fatal": True
            })

        async def send(self, data):
            pass

        async def close(self):
            pass

    monkeypatch.setattr(server.ws_client, "connect", lambda *args, **kwargs: FakeSarvamSocket())
    monkeypatch.setattr(server, "SARVAM_API_KEY", "test-sarvam-key")

    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate") as ws:
        ws.send_text(json.dumps({
            "session_id": "test-session",
            "source_language": "auto",
            "target_language": "en",
            "token": "guest"
        }))

        response = ws.receive_json()
        assert response["type"] == "error"
        assert response["error_code"] == "asr_auth_failed"
        assert response["error_category"] == "authentication_error"
        assert "Sarvam" in response["message"]


def test_websocket_handles_deepgram_in_stream_error_event(monkeypatch):
    class FakeDeepgramSocket:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def recv(self):
            return json.dumps({
                "type": "Error",
                "message": "Token expired or invalid"
            })

        async def send(self, data):
            pass

        async def close(self):
            pass

    monkeypatch.setattr(server.ws_client, "connect", lambda *args, **kwargs: FakeDeepgramSocket())
    monkeypatch.setattr(server, "DEEPGRAM_API_KEY", "test-dg-key")

    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate") as ws:
        ws.send_text(json.dumps({
            "session_id": "test-session",
            "source_language": "en",
            "target_language": "hi",
            "token": "guest"
        }))

        response = ws.receive_json()
        assert response["type"] == "error"
        assert response["error_code"] == "asr_provider_error"
        assert response["error_category"] == "provider_error"


def test_websocket_mock_asr_mode_sends_info(monkeypatch):
    monkeypatch.setattr(server, "DEEPGRAM_API_KEY", "")
    monkeypatch.setattr(server, "SARVAM_API_KEY", "")

    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate") as ws:
        ws.send_text(json.dumps({
            "session_id": "test-session",
            "source_language": "en",
            "target_language": "hi",
            "token": "guest"
        }))

        response = ws.receive_json()
        assert response["type"] == "info"
        assert response["provider"] == "mock-asr"
        assert "Mock ASR mode active" in response["message"]


def test_text_to_text_translation_regression():
    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate") as ws:
        ws.send_text(json.dumps({
            "text_to_translate": "Hello",
            "source_language": "en",
            "target_language": "hi",
        }))

        response = ws.receive_json()
        assert response["type"] == "translation_final"
        assert response["status"] == "success"
        assert response["original_text"] == "Hello"
        assert response["target_language"] == "hi"
        assert response["is_final"] is True
