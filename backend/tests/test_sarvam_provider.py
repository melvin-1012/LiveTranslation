import asyncio

import pytest

from app.services.providers import sarvam


@pytest.mark.parametrize(
    ("source", "target", "expected_source", "expected_target"),
    [
        ("ta", "en", "ta-IN", "en-IN"),
        ("ta", "te", "ta-IN", "te-IN"),
        ("kn", "ml", "kn-IN", "ml-IN"),
        ("te", "kn", "te-IN", "kn-IN"),
    ],
)
def test_maps_dravidian_translation_pairs(
    source: str,
    target: str,
    expected_source: str,
    expected_target: str,
) -> None:
    assert sarvam.map_translation_pair(source, target) == (
        expected_source,
        expected_target,
    )


def test_rejects_unsupported_or_identical_language_pairs() -> None:
    with pytest.raises(ValueError, match="Unsupported Sarvam language"):
        sarvam.map_translation_pair("xx", "en")

    with pytest.raises(ValueError, match="must be different"):
        sarvam.map_translation_pair("ta", "ta")


@pytest.mark.parametrize(
    ("provider_language", "expected"),
    [
        ("en-IN", "en"),
        ("ta-IN", "ta"),
        ("hi", "hi"),
        ("te-in", "te"),
        ("kn_IN", "kn"),
        ("ml", "ml"),
    ],
)
def test_normalizes_detected_language_codes(provider_language: str, expected: str) -> None:
    assert sarvam.map_lang_reverse(provider_language) == expected


def test_rejects_detected_languages_outside_application_support() -> None:
    with pytest.raises(ValueError, match="Unsupported Sarvam language"):
        sarvam.map_lang_reverse("bn-IN")
    with pytest.raises(ValueError, match="Unsupported Sarvam language"):
        sarvam.map_lang_reverse("ta-XX")


@pytest.mark.asyncio
async def test_auto_stream_uses_sarvam_adaptive_language_detection(monkeypatch) -> None:
    requested = {}

    class Socket:
        async def recv(self):
            await asyncio.Event().wait()

        async def close(self):
            return None

    async def connect(uri, *, additional_headers):
        requested["uri"] = uri
        return Socket()

    monkeypatch.setattr(sarvam.websockets, "connect", connect)
    service = sarvam.SarvamASRService()
    service.api_key = "test-key"

    await service.start_stream({"source_language": "auto"})
    await service.close()

    assert "language_code=auto" in requested["uri"]
    assert "model=saaras:v4" in requested["uri"]


@pytest.mark.asyncio
async def test_reads_detected_language_and_confidence_from_realtime_event() -> None:
    class Socket:
        def __init__(self):
            self.messages = [
                '{"event":"transcript.final","text":"வணக்கம்","language":"ta-IN","language_confidence":0.98}'
            ]

        async def recv(self):
            if self.messages:
                return self.messages.pop(0)
            raise RuntimeError("end test receive loop")

    service = sarvam.SarvamASRService()
    service.config = {"source_language": "auto"}
    service.ws = Socket()
    service.is_connected = True

    await service._receive_loop()

    assert await service.result_queue.get() == {
        "text": "வணக்கம்",
        "is_final": True,
        "language": "ta-IN",
        "language_confidence": 0.98,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source", "target", "expected_source", "expected_target"),
    [
        ("ta", "en", "ta-IN", "en-IN"),
        ("ta", "te", "ta-IN", "te-IN"),
        ("kn", "ml", "kn-IN", "ml-IN"),
    ],
)
async def test_translation_request_uses_selected_language_pair(
    monkeypatch,
    source: str,
    target: str,
    expected_source: str,
    expected_target: str,
) -> None:
    request = {}

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, str]:
            return {"translated_text": "வணக்கம்"}

    class AsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, json, headers, timeout):
            request.update(json)
            return Response()

    monkeypatch.setattr(sarvam.httpx, "AsyncClient", AsyncClient)
    service = sarvam.SarvamTranslationService()
    service.api_key = "test-key"

    result = await service.translate_final("Hello", source, target)

    assert request["source_language"] == expected_source
    assert request["target_language"] == expected_target
    assert result["translated_text"] == "வணக்கம்"
