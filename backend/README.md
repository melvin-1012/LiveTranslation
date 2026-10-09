# HACKNEX 2026 EPS03 - Live Translation Backend

This is the FastAPI backend for the Live Translation project. It integrates seamlessly with Supabase for persistent storage, authentication, and live tracking, as well as AI providers for live translation.

## AI Provider Configuration (Sector 3)

The pipeline is integrated with **Sarvam AI** as the primary Real-time ASR and Translation provider.

### Setup and Switching Providers
Providers are decoupled via a factory mechanism (`get_provider_factory` in `ws.py`). You can toggle between `mock` and `sarvam`.

In your `backend/.env`:
```env
TRANSLATION_PROVIDER=sarvam
SARVAM_API_KEY=your-sarvam-key-here
```
If you set `TRANSLATION_PROVIDER=mock`, the system will use a local test harness that mimics AI responses, which is completely free and requires no internet/keys.

### Language Mapping
The application internally uses standard ISO codes (`en`, `hi`, `ta`, `te`, `kn`, `ml`). For automatic source-language detection, the backend connects with `language_code=auto` and normalizes Sarvam's detected language back to one of the supported app codes.
The backend automatically maps these to Sarvam's specific BCP-47 codes:
- `en` → `en-IN`
- `hi` → `hi-IN`
- `ta` → `ta-IN`
- `te` → `te-IN`
- `kn` → `kn-IN`
- `ml` → `ml-IN`

### ASR Architecture & Audio Format
The backend uses Python's `websockets` package to establish a dedicated, asynchronous streaming connection to `wss://api.sarvam.ai/speech-to-text`.
- **Audio Format:** The provider generally expects raw PCM or WAV data (16kHz). The frontend is responsible for transmitting the correct bytes over the WebSocket.
- The `SarvamASRService` drains an asyncio queue for partial/final results, including Sarvam's detected language and final language confidence when auto-detection is enabled. The orchestrator uses that detected language for translation and persists it to the utterance. Mock mode does not perform language detection.

### Translation Architecture
The backend uses `httpx.AsyncClient` to asynchronously call Sarvam's `https://api.sarvam.ai/translate` endpoint for text translation. 
It cleanly supports Indic to Indic, English to Indic, and Indic to English, with explicit code-mixing flags enabled where structurally appropriate.

### Partial Translation & Versioning Strategy
To avoid overloading the Translation API and to reduce flashing for users, the `StreamingOrchestrator` distinguishes between "Unstable" and "Stable" ASR partials. 
- The Translation API is **ONLY** called if the partial string has grown by at least two words, or a boundary is detected.
- **Versioning:** 
  - Version 1: First stable partial translation
  - Version 2: Updated partial translation
  - Version X: Final translation (`is_final = True`)
- Only the final translation sets `is_final: True` in the PostgreSQL database.

### Latency Metrics
The `TranslationMetricsTracker` records monotonic timestamps across the pipeline:
- `audio_received_at`
- `asr_first_at`
- `translation_first_at`
- `translation_final_at`
- `output_at`
These metrics calculate exactly how much latency is introduced by ASR vs Translation, persisting directly to Supabase asynchronously.

### Real Provider Smoke Test
To test the real Sarvam connection without running the full frontend:
1. Obtain a valid `SARVAM_API_KEY` and set `TRANSLATION_PROVIDER=sarvam` in `.env`.
2. Connect a tool like `wscat` or Postman to `ws://localhost:8000/ws/translate`.
3. Send the config JSON: `{"session_id": "<uuid>", "source_language": "en", "target_language": "ta", "token": "<supabase-jwt>"}`.
4. Send raw audio bytes and observe the translation payloads.

## Persistence Architecture & REST Endpoints
*(See previous documentation regarding Supabase integration, `PersistenceQueue`, and RLS).*
