# Live Indic Translator - Database & Backend Architecture

> Production-Grade Supabase PostgreSQL Database, Asynchronous Persistence Queue, and Streaming FastAPI Backend for Indic Language Translation  
> **Repository Branch:** `database-final`

---

## 1. Project Overview

The **`database-final`** branch of **Live Indic Translator** encapsulates the production-ready database architecture and streaming backend service for real-time speech recognition and translation across English and Indic languages (Hindi, Tamil, Telugu, Kannada, and Malayalam).

This branch unifies:
1. **Hardened PostgreSQL Schema**: An 18-table relational database managed via Supabase, enforcing Row Level Security (RLS) on all tables, automated authentication triggers, composite indexes for high-frequency queries, and 4 analytical views secured with `security_invoker = true`.
2. **Idempotent 5-Stage Migrations**: An incremental, strictly ordered migration sequence in [supabase/migrations](supabase/migrations/) covering table initialization, language seeding, user profile preferences, production hardening, and multilingual Indic benchmark seeds.
3. **FastAPI Streaming Engine**: An asynchronous Python backend providing real-time WebSocket communication ([/ws/translate](backend/app/api/endpoints/ws.py)), state-machine-driven orchestrators, progressive caption versioning, and latency profiling.
4. **Decoupled Persistence Queue**: An in-memory asynchronous worker ([backend/app/services/persistence_queue.py](backend/app/services/persistence_queue.py)) that offloads translation results and latency metrics to PostgreSQL without blocking the live WebSocket audio stream.
5. **Runtime Verification Harness**: A comprehensive 12-item runtime verification script ([backend/verify_database_final.py](backend/verify_database_final.py)) validating end-to-end migrations, RLS isolation between users, WebSocket streaming, and database integrity.

> **Branch Context**: This branch is dedicated to the database architecture and backend services. It contains the complete Python backend, database migrations, configuration files, and test suites. Frontend web assets (`index.html`, `app.ts`) are hosted on separate branches; integration contracts for client applications are fully documented in [DATABASE_README.md](DATABASE_README.md).

---

## 2. Key Features

- **Hardened PostgreSQL Database (18 Tables, 4 Views)**:
  - Strict **Row Level Security (RLS)** active across every single table.
  - Auto-provisioning user profile trigger (`handle_new_user()`) bound to Supabase `auth.users`.
  - Deterministic sequence ordering on utterances and progressive versioning on translations.
  - Dedicated analytical views with `WITH (security_invoker = true)` ensuring queries automatically inherit the caller's RLS constraints.
- **Asynchronous Persistence Queue (`persistence_queue.py`)**:
  - Leverages an `asyncio.Queue` worker initialized inside the FastAPI `lifespan` context manager.
  - Enqueues ASR results, multi-version translation outputs, and calculated metrics instantly.
  - Decouples database I/O latency from live audio chunk delivery, ensuring zero streaming stalls.
- **WebSocket Streaming Translation (`/ws/translate`)**:
  - Accepts initial JSON configuration payload specifying session ID, source/target languages, and caller JWT.
  - Ingests raw binary PCM audio chunks and streams progressive events (`asr_partial`, `translation_partial`, `asr_final`, `translation_final`).
  - Supports clean utterance termination via `{"type": "end_utterance"}` text messages.
- **Partial Translation Stabilization & Progressive Versioning**:
  - Uses `_is_stable_partial` thresholding in [backend/app/services/streaming_orchestrator.py](backend/app/services/streaming_orchestrator.py) to suppress translation requests until an utterance expands by $\ge 2$ words.
  - Emits version-stamped translations (`version_number: 1`, `version_number: 2`, ..., `vFinal`). Only the finalized translation sets `is_final = True` in PostgreSQL.
- **Fine-Grained Latency Profiling**:
  - Monotonic timestamp tracking in [backend/app/core/metrics.py](backend/app/core/metrics.py) across 5 pipeline stages (`audio_received_at`, `asr_first_at`, `translation_first_at`, `translation_final_at`, `output_at`).
  - Automatically calculates `asr_latency_ms`, `time_to_first_translation_ms`, `final_translation_latency_ms`, and `end_to_end_latency_ms`.
- **Pluggable AI Provider Architecture**:
  - `mock`: Deterministic offline test harness mimicking progressive ASR and translation without external network calls or API keys.
  - `sarvam`: Real-time streaming ASR via WebSocket (`wss://api.sarvam.ai/speech-to-text`) and REST translation (`https://api.sarvam.ai/translate`) with Indic-to-Indic and English-to-Indic support and code-mixing preservation.
- **User-Scoped REST API Endpoints**:
  - Validates user identity via Supabase JWT Bearer tokens and propagates credentials to PostgREST for native RLS policy evaluation.
- **Automated Runtime Verification**:
  - Dedicated script ([backend/verify_database_final.py](backend/verify_database_final.py)) validating 12 critical runtime invariants: schema migrations, trigger execution, JWT scoping, RLS isolation, queue persistence, WebSocket streaming, and test execution.

---

## 3. Architecture and Data Flow

```
                                  CLIENT APPLICATION
                       (WebSocket Audio Stream & REST Requests)
                                      |         ^
       1. REST Calls with JWT Bearer  |         |  5. Streamed Events:
          (POST /sessions, GET, etc.) |         |     - asr_partial / asr_final
       2. Initial Config JSON (WS)    |         |     - translation_partial / final
       3. Binary Audio Chunks (PCM)   v         |
+-----------------------------------------------------------------------------------------+
|                               FASTAPI APPLICATION BACKEND                               |
|                                                                                         |
|  +-------------------------------------+   +-----------------------------------------+  |
|  |           REST Routers              |   |          WebSocket Router (/ws)         |  |
|  |  - /sessions (sessions.py)          |   |  - /translate (ws.py)                   |  |
|  |  - /sessions/{id}/utterances        |   +--------------------+--------------------+  |
|  |  - /glossary (glossary.py)          |                        |                       |
|  +------------------+------------------+                        v                       |
|                     |                       +----------------------------------------+  |
|                     |                       |      StreamingOrchestrator             |  |
|                     |                       |  - Manages StreamingState machine      |  |
|                     |                       |  - Enforces _is_stable_partial (>= 2w) |  |
|                     |                       |  - Manages translation versioning      |  |
|                     |                       +-------+------------------------+-------+  |
|                     |                               |                        |          |
|                     |                  Audio Chunks v                        v Text     |
|                     |                       +---------------+        +---------------+  |
|                     |                       |  ASR Service  |        |  Translation  |  |
|                     |                       | (Sarvam/Mock) |        | (Sarvam/Mock) |  |
|                     |                       +-------+-------+        +-------+-------+  |
|                     |                               |                        |          |
|                     |                               +-----------+------------+          |
|                     |                                           |                       |
|                     |                                           v                       |
|                     |                       +----------------------------------------+  |
|                     |                       |       TranslationMetricsTracker        |  |
|                     |                       |  Records 5 monotonic pipeline timings  |  |
|                     |                       +-------------------+--------------------+  |
|                     |                                           |                       |
|                     |                                           v Non-blocking enqueue  |
|                     |                       +----------------------------------------+  |
|                     |                       | PersistenceQueue (asyncio.Queue)       |  |
|                     |                       | Background worker task (app lifespan)  |  |
|                     |                       +-------------------+--------------------+  |
+---------------------+-------------------------------------------+-----------------------+
                      |                                           |
                      | User-Scoped JWT PostgREST Queries         | Async Background Writes
                      v                                           v
+-----------------------------------------------------------------------------------------+
|                                   SUPABASE POSTGRESQL                                   |
|                                                                                         |
|  18 Relational Tables (All RLS Enabled):                                                |
|  - profiles, supported_languages, translation_sessions, session_participants            |
|  - utterances, utterance_segments, asr_results, translation_results, translation_metrics|
|  - baseline_runs, baseline_results, evaluation_datasets, evaluation_samples              |
|  - evaluation_results, glossary_terms, audio_assets, experiments, experiment_runs       |
|                                                                                         |
|  4 Analytical Views (security_invoker = true):                                          |
|  - session_history_view, translation_performance_view                                   |
|  - language_pair_performance_view, system_vs_baseline_comparison_view                   |
+-----------------------------------------------------------------------------------------+
```

---

## 4. Technology Stack

### Backend Framework & Core Libraries
- **Python**: 3.10+ (tested with Python 3.14 on Windows)
- **FastAPI**: Asynchronous web framework for high-concurrency REST endpoints and WebSockets
- **Uvicorn**: Asynchronous ASGI server for production and development hosting
- **Pydantic & Pydantic-Settings**: Schema validation, request parsing, and environment variable binding
- **Supabase Python Client (`supabase`)**: PostgREST client and authentication handling with JWT header propagation
- **HTTPX**: High-performance async HTTP client for external translation requests
- **WebSockets (`websockets`)**: Streaming client for bidirectional speech-to-text protocols
- **Python-dotenv**: Automatic environment file loading (`.env`)

### Database & Security Layer
- **PostgreSQL 15+ (via Supabase)**: Relational database hosting core schemas
- **Row Level Security (RLS)**: Enforced on all 18 tables to guarantee tenant and user isolation
- **PostgreSQL Functions & Triggers**: Automated profile creation (`handle_new_user`) and update timestamping (`handle_updated_at`)
- **Security Invoker Views**: Views defined with `WITH (security_invoker = true)` inheriting calling user permissions

### Speech & Translation Integrations
- **Sarvam AI Streaming ASR**: WebSocket streaming via `wss://api.sarvam.ai/speech-to-text`
- **Sarvam AI Translation API**: REST endpoint `https://api.sarvam.ai/translate` with code-mixing support
- **Internal Mock Provider**: Deterministic local fallback for offline development and CI environments

### Testing & Verification
- **Pytest & Pytest-asyncio**: Unit and integration test runners
- **FastAPI TestClient**: In-process HTTP and WebSocket testing suite
- **Standalone Verification Harness**: [backend/verify_database_final.py](backend/verify_database_final.py)

---

## 5. Repository Structure

```
LiveIndicTranslator/
├── DATABASE_README.md                         # Detailed database architecture & schema documentation
├── README.md                                  # Root project documentation (this file)
├── create_backend.py                          # Bootstrap utility for generating backend layout
├── update_backend.py                          # Incremental updater for streaming and state components
├── .gitignore                                 # Git ignore file for Python, environments, and caches
│
├── backend/
│   ├── .env.example                           # Example environment configuration template
│   ├── README.md                              # Backend architectural notes and provider configuration
│   ├── requirements.txt                       # Backend Python dependencies
│   ├── verify_database_final.py               # Complete 12-item end-to-end runtime verification script
│   │
│   ├── app/
│   │   ├── main.py                            # FastAPI application entry point, lifespan, CORS, routers
│   │   │
│   │   ├── api/
│   │   │   ├── deps.py                        # Dependency injection for user auth, JWT, and Supabase client
│   │   │   └── endpoints/
│   │   │       ├── sessions.py                # REST API: Session creation, listing, details, and closure
│   │   │       ├── utterances.py              # REST API: Utterance creation within sessions
│   │   │       ├── ws.py                      # WebSocket API: /ws/translate live streaming endpoint
│   │   │       ├── glossary.py                # REST API: Domain glossary term retrieval
│   │   │       └── evaluation.py              # REST API: Benchmark evaluation runner endpoint
│   │   │
│   │   ├── core/
│   │   │   ├── config.py                      # Pydantic BaseSettings environment loader
│   │   │   ├── state.py                       # StreamingState enum and valid state transition definitions
│   │   │   └── metrics.py                     # TranslationMetricsTracker for monotonic timing calculation
│   │   │
│   │   ├── db/
│   │   │   └── supabase_client.py             # Client helper functions
│   │   │
│   │   ├── models/
│   │   │   ├── schemas.py                     # Pydantic request and response schemas
│   │   │   ├── payload_schemas.py             # WebSocket message schemas
│   │   │   └── database_models.py             # Database entity representations
│   │   │
│   │   └── services/
│   │       ├── streaming_orchestrator.py      # Core streaming state machine & provider factory
│   │       ├── persistence_queue.py           # Non-blocking asyncio.Queue background worker
│   │       ├── translation_db_service.py      # Database CRUD operations with PostgREST
│   │       ├── supabase_client.py             # User-scoped and service-role client factories
│   │       ├── evaluation_service.py          # Benchmark and baseline evaluation service stubs
│   │       ├── glossary_service.py            # Glossary management operations
│   │       └── providers/
│   │           ├── mock.py                    # Deterministic mock ASR and translation implementations
│   │           └── sarvam.py                  # Sarvam AI streaming WebSocket ASR and REST translation
│   │
│   └── tests/
│       ├── test_streaming.py                  # Unit tests: Orchestrator flow, state transitions, metrics
│       └── test_integration.py                # Integration tests: RLS isolation, full persistence, queue failure
│
└── supabase/
    ├── config.toml                            # Supabase CLI project configuration (HACKNEX_External-2026)
    └── migrations/
        ├── 001_initial_translation_schema.sql         # 18 base tables, constraints, baseline RLS policies
        ├── 002_seed_data.sql                         # Seeds 6 supported languages & dev evaluation samples
        ├── 003_profile_language_preferences.sql      # Profile language preference columns and foreign keys
        ├── 004_hardened_production_schema.sql        # Hardened schema: streaming segments, metrics, views, indexes
        └── 005_indic_seeds.sql                       # Multilingual Indic benchmark datasets & global glossary
```

---

## 6. Prerequisites

Ensure your system meets the following requirements before setting up:

1. **Operating System**: Windows 10/11 (PowerShell instructions provided), Linux, or macOS.
2. **Python**: Python 3.10 to 3.14 installed and available on PATH.
3. **Supabase Environment**: Either:
   - A remote Supabase project (Project URL, Anon Key, and Service Role Key).
   - A local Supabase CLI installation running via Docker (`supabase start`).
4. **Sarvam AI API Key** *(Optional)*: Required only if running live speech recognition and translation with `TRANSLATION_PROVIDER=sarvam`. For offline testing and default development, `TRANSLATION_PROVIDER=mock` requires no external API keys.

---

## 7. Setup and Run Instructions

Follow these step-by-step instructions in **Windows PowerShell**:

### Step 1: Navigate to the Repository

```powershell
cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator
```

### Step 2: Create and Activate Python Virtual Environment

```powershell
# Create virtual environment named .venv
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1
```

> **PowerShell Execution Policy Note**: If script activation is blocked, execute:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
> .\.venv\Scripts\Activate.ps1
> ```

### Step 3: Install Dependencies

```powershell
# Install backend requirements
pip install -r backend/requirements.txt
```

### Step 4: Configure Environment Variables

```powershell
# Copy the example environment file
Copy-Item backend\.env.example backend\.env
```

Open [backend/.env](backend/.env) and configure your Supabase connection parameters (detailed in [Section 8](#8-environment-variable-configuration)).

### Step 5: Start the FastAPI Backend Server

```powershell
# Navigate into backend directory
cd backend

# Start the Uvicorn server with hot reloading
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Once running, the backend exposes:
- **Root Health / Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) (OpenAPI Swagger UI)
- **Alternative Docs**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **WebSocket Streaming**: `ws://127.0.0.1:8000/ws/translate`

---

## 8. Environment-Variable Configuration

The backend configuration is managed by [backend/app/core/config.py](backend/app/core/config.py) using Pydantic `BaseSettings`. Variables are loaded automatically from [backend/.env](backend/.env).

A template is provided in [backend/.env.example](backend/.env.example):

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_KEY=your-service-role-key

TRANSLATION_PROVIDER=mock
SARVAM_API_KEY=your-sarvam-api-key
```

### Configuration Variables Reference

| Variable | Required | Default | Purpose & Description |
| :--- | :---: | :---: | :--- |
| `SUPABASE_URL` | Yes | `""` | Base URL of the Supabase project (e.g. `http://127.0.0.1:54321` or `https://xyz.supabase.co`). |
| `SUPABASE_ANON_KEY` | Yes | `""` | Public/anon API key. Used when instantiating user-scoped clients with JWT headers. |
| `SUPABASE_KEY` | Yes | `""` | Service-role secret key. Bypasses RLS for administrative tasks. **Never expose to clients.** |
| `TRANSLATION_PROVIDER` | Yes | `mock` | Selects active ASR/translation provider: `mock` (offline deterministic) or `sarvam` (Sarvam AI). |
| `SARVAM_API_KEY` | Conditional | `""` | API key for Sarvam AI. Required when `TRANSLATION_PROVIDER=sarvam`. |
| `ASR_API_KEY` | No | `""` | Optional override key for generic ASR provider integrations. |
| `TRANSLATION_API_KEY` | No | `""` | Optional override key for generic translation provider integrations. |
| `TTS_API_KEY` | No | `""` | Optional override key for future text-to-speech integrations. |

> **Security Note**: Never commit [backend/.env](backend/.env) to version control. The `.env` file is excluded in [.gitignore](.gitignore).

---

## 9. Database Setup and Migrations

The database layer consists of 5 SQL migration files in [supabase/migrations](supabase/migrations/) designed for clean, sequential execution.

### Migration Sequence

| Step | Migration File | Key Responsibilities |
| :---: | :--- | :--- |
| **001** | [001_initial_translation_schema.sql](supabase/migrations/001_initial_translation_schema.sql) | Bootstraps the 18 core tables, initial constraints, foreign keys, `handle_new_user()` trigger on `auth.users`, and baseline Row Level Security policies. |
| **002** | [002_seed_data.sql](supabase/migrations/002_seed_data.sql) | Seeds authoritative `supported_languages` catalog (`en`, `hi`, `ta`, `te`, `kn`, `ml`) and initial development evaluation samples. |
| **003** | [003_profile_language_preferences.sql](supabase/migrations/003_profile_language_preferences.sql) | Adds `preferred_source_language_id` and `preferred_target_language_id` columns to `profiles` with foreign keys to `supported_languages`. |
| **004** | [004_hardened_production_schema.sql](supabase/migrations/004_hardened_production_schema.sql) | Production hardening: adds streaming segment progression, isolates ASR errors from translation errors, creates composite query indexes, and builds analytical views with `security_invoker = true`. |
| **005** | [005_indic_seeds.sql](supabase/migrations/005_indic_seeds.sql) | Seeds multilingual Indic benchmark evaluation datasets (noisy audio, code-mixed, long sentences), baseline run entries, and domain glossary terms. |

### Applying Migrations

#### Option A: Using Supabase CLI (Local Development)
If you have Supabase CLI and Docker installed:
```powershell
# Start local Supabase instance
supabase start

# Apply all migrations and seeds
supabase db reset
```

#### Option B: Using Supabase Dashboard (Cloud Hosted)
1. Open your Supabase Project Dashboard -> **SQL Editor**.
2. Run each migration file from [supabase/migrations](supabase/migrations/) in numerical order (`001` -> `002` -> `003` -> `004` -> `005`).

### Analytical Views Overview

All 4 views are created with `WITH (security_invoker = true)`, guaranteeing that they execute with the permissions of the calling user rather than the view creator:

1. **`session_history_view`**: Aggregates user sessions with language codes (`source_language_code`, `target_language_code`), status, start/end timestamps, and total utterance counts.
2. **`translation_performance_view`**: Provides completed utterances with transcripts, final translations, and linked latency metrics (`time_to_first_translation_ms`, `end_to_end_latency_ms`).
3. **`language_pair_performance_view`**: Aggregates average latencies, stability scores, and rewrite counts across each source-target language combination.
4. **`system_vs_baseline_comparison_view`**: Head-to-head comparison between system predictions and baseline models on identical benchmark samples.

For complete architectural details, schema diagrams, and table ownership matrices, refer to [DATABASE_README.md](DATABASE_README.md).

---

## 10. Available API Endpoints

The FastAPI backend ([backend/app/main.py](backend/app/main.py)) exposes the following REST and WebSocket endpoints:

### REST Endpoints

All protected endpoints require an `Authorization: Bearer <token>` header containing a valid Supabase user JWT.

| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/sessions` | Yes | Creates a new translation session for the authenticated user. Body: `{"mode": "one_way", "source_language_id": "<uuid>", "target_language_id": "<uuid>"}`. |
| `GET` | `/sessions` | Yes | Lists all translation sessions belonging to the authenticated user. |
| `GET` | `/sessions/{session_id}` | Yes | Retrieves details for a specific session. Protected by RLS (returns `404` if session belongs to another user). |
| `PATCH` | `/sessions/{session_id}/end` | Yes | Updates session status to `completed` or `cancelled` and records `ended_at`. Body: `{"status": "completed"}`. |
| `POST` | `/sessions/{session_id}/utterances` | Yes | Creates an utterance within a session. Body: `{"sequence_number": 1, "participant_id": null, "detected_language_id": null}`. |
| `GET` | `/glossary` | Yes | Returns active terminology and domain protection terms from `glossary_terms`. |

### WebSocket Endpoint: `/ws/translate`

The WebSocket endpoint manages real-time streaming audio ingestion and progressive caption emission:

```
Client                                                  Backend (/ws/translate)
  |                                                                |
  | -------- 1. Text: Initial Config JSON -----------------------> |
  |          {"session_id": "...", "source_language": "hi",        |
  |           "target_language": "en", "token": "<jwt>"}          |
  |                                                                |
  | -------- 2. Binary: Raw Audio Chunks (bytes) ----------------> |
  | <------- 3. Text: asr_partial -------------------------------- |
  | <------- 4. Text: translation_partial (version_number: 1) ---- |
  |                                                                |
  | -------- 5. Binary: Additional Audio Chunks -----------------> |
  | <------- 6. Text: asr_partial (updated) ---------------------- |
  |                                                                |
  | -------- 7. Text: Control Message {"type": "end_utterance"} -> |
  | <------- 8. Text: asr_final ---------------------------------- |
  | <------- 9. Text: translation_final (version_number: 2, is_final: true) |
```

#### Expected WebSocket Message Payloads

- **Initial Config Message (Client -> Server)**:
  ```json
  {
    "session_id": "00000000-0000-0000-0000-000000000001",
    "source_language": "hi",
    "target_language": "en",
    "token": "optional-user-supabase-jwt"
  }
  ```
- **Partial Translation Event (Server -> Client)**:
  ```json
  {
    "type": "translation_partial",
    "utterance_id": "d1c2b3a4-0000-0000-0000-000000000001",
    "text": "Hello world",
    "version_number": 1,
    "is_final": false
  }
  ```
- **Final Translation Event (Server -> Client)**:
  ```json
  {
    "type": "translation_final",
    "utterance_id": "d1c2b3a4-0000-0000-0000-000000000001",
    "text": "Hello world, welcome to live translation",
    "version_number": 2,
    "is_final": true
  }
  ```

---

## 11. Tests and Verification

### 1. Automated Test Suite (Pytest)

The repository includes unit and integration test suites in [backend/tests](backend/tests/):

- **[backend/tests/test_streaming.py](backend/tests/test_streaming.py)**:
  - `test_state_transitions`: Validates `StreamingState` state-machine transitions.
  - `test_streaming_orchestrator_flow`: Mocks WebSocket communication and tests audio processing, progressive version increments (`v1` partial -> `v2` final), and message emission.
  - `test_metrics`: Validates monotonic timestamp calculation in `TranslationMetricsTracker`.
- **[backend/tests/test_integration.py](backend/tests/test_integration.py)**:
  - `test_rls_isolation`: Validates that User B cannot read User A's session or insert utterances into User A's session.
  - `test_full_persistence_flow`: Validates session creation, utterance creation, versioned translation storage, latency metric persistence, and session termination.
  - `test_database_failure_handling`: Confirms that invalid payloads submitted to `PersistenceQueue` do not crash the background queue worker.

#### Running Tests with Pytest

To run tests, activate your virtual environment and execute pytest from the `backend` directory:

```powershell
cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator\backend
..\.venv\Scripts\Activate.ps1
pytest tests -v
```

> **Note on Integration Tests**: `test_integration.py` interacts with Supabase Auth and PostgREST. It requires valid `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_KEY` configured in [backend/.env](backend/.env).

---

### 2. End-to-End Runtime Verification Script

The [backend/verify_database_final.py](backend/verify_database_final.py) script is a comprehensive runtime verification harness that executes 12 end-to-end checks against the live database and FastAPI application:

```powershell
cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator\backend
python verify_database_final.py
```

#### What the Verification Script Validates:

| Check # | Verification Item | Description of Assertion |
| :---: | :--- | :--- |
| **01** | **Supabase Migrations** | Confirms all 5 migration files exist and seeded data (`supported_languages`, `glossary_terms`, `baseline_runs`) is present. |
| **02** | **Auth & Profile Trigger** | Registers User A and User B via Supabase Auth; verifies `handle_new_user()` trigger auto-created both profiles in `profiles`. |
| **03** | **JWT-Scoped Requests** | Asserts unauthenticated requests are rejected (`401`/`403`), bad tokens return `401`, and valid user JWT returns `200`. |
| **04** | **Session Persistence** | Creates session for User A and verifies row presence in `translation_sessions`. |
| **05** | **Utterance & Metric Pipeline** | Creates utterance, persists ASR transcript, persists `v1` partial and `v2` final translations, and verifies linked row in `translation_metrics`. |
| **06** | **Persistence Queue** | Enqueues streaming translation into `PersistenceQueue` background worker and verifies database write completes without record loss. |
| **07** | **WebSocket Connection** | Connects to `/ws/translate`, sends config JSON, streams audio bytes, sends `end_utterance`, and verifies reception of `asr_partial`, `translation_partial`, `asr_final`, and `translation_final`. |
| **08** | **History Views Access** | Confirms User A can query `session_history_view` and `translation_performance_view`. |
| **09** | **Cross-User Data Isolation** | Confirms User B receives zero rows when attempting to read User A's session, utterances, translation results, or history view. |
| **10** | **RLS Direct Enforcement** | Confirms direct database inserts, updates, and API calls by User B targeting User A's sessions are blocked by PostgreSQL RLS. |
| **11** | **Schema Completeness** | Validates presence of all 18 tables (all RLS enabled), all 4 views (all `security_invoker = true`), foreign keys, and indexes. |
| **12** | **Backend Test Suite** | Spawns `pytest tests -v` and verifies all backend tests pass. |

---

## 12. Troubleshooting

### 1. `ModuleNotFoundError: No module named 'supabase'` or `'pydantic_settings'`
- **Cause**: Packages were installed into the global Python environment rather than the activated `.venv`, or the virtual environment is not active.
- **Solution**:
  ```powershell
  cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator
  .\.venv\Scripts\Activate.ps1
  pip install -r backend/requirements.txt
  ```

### 2. WebSocket Closes Immediately with `Invalid initial configuration`
- **Cause**: The client did not send the required configuration JSON as its first message, or the JSON is missing `session_id`, `source_language`, or `target_language`.
- **Solution**: Ensure your WebSocket client transmits the configuration payload immediately upon connection before sending any audio bytes:
  ```json
  {"session_id": "<uuid>", "source_language": "hi", "target_language": "en"}
  ```

### 3. `SARVAM_API_KEY is not configured` Error
- **Cause**: `TRANSLATION_PROVIDER=sarvam` is configured in [backend/.env](backend/.env), but `SARVAM_API_KEY` is empty.
- **Solution**: Set a valid Sarvam API key in `backend/.env`, or switch to offline mock mode:
  ```env
  TRANSLATION_PROVIDER=mock
  ```

### 4. Supabase RLS Permission Denied (`401` or `403`)
- **Cause**: The request lacks an `Authorization: Bearer <token>` header, or the JWT token has expired.
- **Solution**: Authenticate using Supabase Auth (`auth.sign_in_with_password` or `auth.sign_up`) and pass `res.session.access_token` in the `Authorization` header.

### 5. `docker: command not found` during `verify_database_final.py` Item 11
- **Cause**: Verification Check 11 queries the local Supabase Docker container directly via `docker exec`.
- **Solution**: Ensure Docker Desktop is running if performing local container-level schema inspection. Checks 1 through 10 and 12 validate the system via PostgREST and FastAPI without requiring direct Docker CLI commands.

---

## 13. Security Notes

- **Service-Role Key Segregation**: `SUPABASE_KEY` bypasses all Row Level Security policies. It is restricted strictly to backend service environments and must never be committed to source control or distributed to client applications.
- **Client Security Model**: Client applications must only access the database using `SUPABASE_ANON_KEY` accompanied by the caller's JWT token.
- **JWT Header Propagation**: The backend propagates the caller's Bearer token directly into the PostgREST client:
  ```python
  client.options.headers["Authorization"] = f"Bearer {token}"
  ```
  This ensures that every query executes strictly within the permissions granted to that user's identity under PostgreSQL RLS.
- **CORS Configuration**: The development server currently allows all origins (`allow_origins=["*"]`) in [backend/app/main.py](backend/app/main.py). For production deployment, restrict this setting to your verified client origins.
