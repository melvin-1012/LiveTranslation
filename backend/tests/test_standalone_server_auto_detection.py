import pytest

import server


def test_auto_detection_uses_sarvam_even_when_deepgram_is_configured() -> None:
    url, headers, provider, use_sarvam = server.get_asr_backend(
        "auto", "deepgram-test-key", "sarvam-test-key"
    )

    assert "language_code=auto" in url
    assert "model=saaras:v4" in url
    assert headers == {"api-subscription-key": "sarvam-test-key"}
    assert provider == "sarvam-saaras-v4"
    assert use_sarvam is True


def test_auto_detection_requires_sarvam_instead_of_falling_back_to_deepgram() -> None:
    with pytest.raises(ValueError, match="Auto-detection requires SARVAM_API_KEY"):
        server.get_asr_backend("auto", "deepgram-test-key", "")


def test_manual_english_keeps_existing_deepgram_route() -> None:
    url, headers, provider, use_sarvam = server.get_asr_backend(
        "en", "deepgram-test-key", "sarvam-test-key"
    )

    assert "api.deepgram.com" in url
    assert "language=en" in url
    assert headers == {"Authorization": "Token deepgram-test-key"}
    assert provider == "deepgram-nova-2"
    assert use_sarvam is False


def test_manual_malayalam_keeps_existing_sarvam_route() -> None:
    url, headers, provider, use_sarvam = server.get_asr_backend(
        "ml", "deepgram-test-key", "sarvam-test-key"
    )

    assert "language_code=ml-IN" in url
    assert headers == {"api-subscription-key": "sarvam-test-key"}
    assert provider == "sarvam-saaras-v4"
    assert use_sarvam is True


@pytest.mark.parametrize(
    ("provider_code", "expected"),
    [
        ("en-IN", "en"),
        ("ta-IN", "ta"),
        ("hi", "hi"),
        ("kn_in", "kn"),
        ("unsupported-IN", None),
    ],
)
def test_normalizes_detected_language_codes(provider_code: str, expected: str | None) -> None:
    assert server.normalize_sarvam_language(provider_code) == expected


@pytest.mark.parametrize(
    ("event", "is_final"),
    [
        ("transcript.partial", False),
        ("transcript.final", True),
    ],
)
def test_parses_sarvam_transcript_events(event: str, is_final: bool) -> None:
    result = server.parse_sarvam_transcript({
        "event": event,
        "text": "வணக்கம்",
        "language": "ta-IN",
        "language_confidence": 0.98,
    })

    assert result == {
        "text": "வணக்கம்",
        "is_final": is_final,
        "language": "ta-IN",
        "language_confidence": 0.98,
    }


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("क्या हाल है?", "hi"),
        ("வணக்கம்", "ta"),
        ("నమస్కారం", "te"),
        ("ನಮಸ್ಕಾರ", "kn"),
        ("നമസ്കാരം", "ml"),
        ("Hello, how are you?", "en"),
        ("", None),
    ],
)
def test_detect_script_language(text: str, expected: str | None) -> None:
    assert server.detect_script_language(text) == expected


@pytest.mark.asyncio
async def test_route_translation_same_language() -> None:
    res, provider = await server.route_translation("क्या हाल है?", "hi", "hi")
    assert res == "क्या हाल है?"
    assert provider == "same-language"

    res_en, provider_en = await server.route_translation("Hello", "en", "en")
    assert res_en == "Hello"
    assert provider_en == "same-language"


@pytest.mark.asyncio
async def test_route_translation_corrects_script_when_mistakenly_passed_as_en(monkeypatch) -> None:
    calls = []

    async def mock_translate_sarvam(text, src, tgt):
        calls.append((src, tgt))
        return "How are you?"

    monkeypatch.setattr(server, "SARVAM_API_KEY", "test-key")
    monkeypatch.setattr(server, "translate_text_sarvam", mock_translate_sarvam)

    res, provider = await server.route_translation("क्या हाल है?", "en", "en")
    # Even though source was passed as "en", Devanagari script is detected as "hi",
    # so it routes hi -> en rather than failing or returning same-language
    assert calls == [("hi", "en")]
    assert res == "How are you?"
    assert provider == "sarvam-translate:v1"
