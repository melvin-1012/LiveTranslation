# Live Translation Backend Architecture

This directory contains the FastAPI backend for the HackNEX 2026 EPS03 Live Translation system. It is designed to act as the real-time orchestrator between client microphones, ASR/Translation models, and the Supabase persistence layer.

## FastAPI → Supabase Architecture
The backend is fundamentally stateless during the streaming loop and offloads data persistence to Supabase PostgreSQL. Supabase is used strictly as an **asynchronous persistence layer**. 
- **`app/api/endpoints/`**: Exposes the REST API for creating sessions, fetching history, and saving metrics.
- **`app/services/translation_db_service.py`**: The Data Access layer. Encapsulates all calls to the Supabase client using the schemas defined in `app/models/schemas.py`.

## Live Pipeline & Asynchronous Persistence
**Crucial Rule**: Supabase must NOT block the live audio pipeline.

The intended live streaming flow is:
`Microphone` -> `WebSocket/FastAPI` -> `ASR` -> `Translation` -> `Live Output`

During this loop, the `StreamingOrchestrator` (`app/services/streaming_orchestrator.py`) handles the rapid chunking. Database persistence is handled **asynchronously**:
- We only save stable checkpoints (e.g. `translation_status = 'partial'`).
- We avoid executing blocking DB writes for every single token.

## Endpoint Responsibilities
The API is structured to decouple the streaming flow from historical persistence:
- **`POST /sessions`**: Initialize a translation session.
- **`POST /sessions/{id}/utterances`**: Mark the start of a new spoken utterance.
- **`POST /utterances/{id}/asr`**: Store the final transcription.
- **`POST /utterances/{id}/translations`**: Store translation checkpoints and the final text.
- **`POST /translations/{id}/metrics`**: Store latency and stability metrics.

## Metrics Flow
The `TranslationMetricsTracker` (`app/core/metrics.py`) tracks precise timestamps:
1. `mark_audio_received()`: Audio chunk arrives.
2. `mark_asr_first()`: First STT token appears.
3. `mark_translation_first()`: First translated token appears.
4. `mark_translation_final()`: Translation is stable.
5. `mark_output()`: Result is sent to frontend.

It calculates `asr_latency_ms`, `time_to_first_translation_ms`, `final_translation_latency_ms`, and `end_to_end_latency_ms` and passes them to the database.

## Streaming State Machine
The backend maintains the state of an utterance via `app.core.state.StreamingState`:
- `UTTERANCE_STARTED`
- `ASR_PARTIAL`
- `TRANSLATION_PARTIAL`
- `ASR_UPDATED`
- `TRANSLATION_UPDATED`
- `ASR_FINAL`
- `TRANSLATION_FINAL`
- `PERSISTED`

Partial translations are stored using `version_number` and `is_final=False` in the database to prevent duplicate row bloat while maintaining a history of corrections.

## Evaluation Flow
The `evaluation_service.py` handles executing baseline models and our system against the datasets in Supabase. It fetches `evaluation_samples`, streams them through our `StreamingOrchestrator` to simulate live audio, collects the latencies, and calculates quality scores (BLEU, chrF) before writing to `evaluation_results`.
