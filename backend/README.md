# HACKNEX 2026 EPS03 - Live Translation Backend

This is the FastAPI backend for the Live Translation project. It integrates seamlessly with Supabase for persistent storage, authentication, and live tracking.

## Architecture & Persistence

The backend acts as an orchestrator and gateway between the user's audio input, the AI translation pipeline, and the Supabase PostgreSQL database.

**Live Pipeline Flow:**
`Audio Chunk -> ASR -> State Machine -> Translation -> WebSocket Emit -> Persistence Queue -> Supabase`

The architecture guarantees that database writes do NOT block the WebSocket streaming connection. All DB inserts are enqueued in a `PersistenceQueue` handled by an async background worker. If Supabase goes down, the background worker logs the error, but the live audio and translation streams will continue without interruption.

## Supabase & Local Setup

### 1. Start Local Supabase
Install Docker Desktop and the Supabase CLI, then run:
```bash
npx supabase start
```
This boots the local Postgres, PostgREST API, Auth, and Storage services. 

### 2. Environment Variables
Create a `.env` file in the `backend/` directory. You can obtain these keys by running `npx supabase status`.

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_KEY=<your-service-role-key> # Used strictly for admin bypassing/testing
```
*Note: Never commit your actual `.env` file or expose your `SUPABASE_KEY` to the frontend.*

### 3. Start FastAPI
```bash
cd backend
python -m uvicorn app.main:app --reload
```

## Authentication & RLS Behavior

The backend adheres strictly to Supabase's Row Level Security (RLS). 
- All protected REST endpoints require a standard `Authorization: Bearer <access_token>` header.
- The `get_current_user` FastAPI dependency extracts this token and calls the Supabase Auth API to securely verify the user identity.
- We do NOT trust the frontend to provide `user_id` in JSON bodies.
- Instead of using the `service_role` key to write user data, the backend dynamically instantiates a user-bound `Client` and injects the Bearer token into PostgREST. This ensures that every insert/select query respects the PostgreSQL RLS policies defined in the `translation_sessions` and `glossary_terms` tables.

## REST Endpoints

- `POST /sessions` - Create a new session.
- `GET /sessions` - Get all sessions belonging to the authenticated user.
- `GET /sessions/{id}` - Get session details (restricted by RLS).
- `PATCH /sessions/{id}/end` - Mark a session as completed.
- `POST /sessions/{id}/utterances` - Create an utterance container.
- `GET /glossary` - Fetch glossary terms restricted to the user and global languages.

## WebSocket Endpoint

- `ws://localhost:8000/ws/translate` - Streams binary audio chunks.
  - The first message must be a JSON config containing: `{"session_id": "...", "source_language": "en", "target_language": "hi", "token": "..."}`.
  - Subsequent messages can be binary audio bytes.
  - The WebSocket emits structured JSON payloads representing state machine transitions (`asr_partial`, `translation_final`, etc.).

## Testing

The testing suite uses `pytest` and is divided into unit tests (mocked dependencies) and integration tests (hitting the live local Supabase DB).

### Run Unit Tests
```bash
export PYTHONPATH="." # (Linux/Mac)
$env:PYTHONPATH="."   # (Windows)
pytest tests/test_streaming.py -v
```

### Run Integration Tests
Integration tests require local Supabase to be running (`npx supabase start`).
```bash
pytest tests/test_integration.py -v -s
```
