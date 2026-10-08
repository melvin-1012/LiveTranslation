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
