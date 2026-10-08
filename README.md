# Live Indic Translator

> Real-Time Speech Recognition, Streaming Translation, and Asynchronous Persistence for English and Indic Languages  
> **Repository Branch:** `Sarvam-DB-Integration`

---

## 1. Project Title and Overview

**Live Indic Translator** is an end-to-end speech-to-text and translation platform engineered specifically for bidirectional communication between English and Indian languages, including Hindi, Tamil, Telugu, Kannada, and Malayalam.

The `Sarvam-DB-Integration` branch represents the unified integration of three core layers:
1. **TypeScript Client**: A modern, responsive web application supporting live speech capture, language selection, session tracking, and authentication interfaces.
2. **FastAPI Streaming Engine**: An asynchronous Python backend providing real-time WebSocket communication (`/ws/translate`), pluggable ASR and translation orchestrators, progressive caption versioning, and latency profiling.
3. **Supabase Database Architecture**: A hardened PostgreSQL schema with Row Level Security (RLS), audit tracking, and a non-blocking background persistence queue for session, utterance, and latency metric storage.

The platform provides a dual-provider architecture: a live integration with **Sarvam AI** APIs for real-time Indic speech-to-text and translation, alongside a deterministic **Mock Provider** for offline development, local demonstration, and automated testing without external dependencies.

---

## 2. Key Features

- **Real-Time WebSocket Streaming (`/ws/translate`)**: Low-latency bidirectional streaming supporting initial JSON session negotiation followed by raw binary audio chunk ingestion.
- **Pluggable AI Providers**:
  - `sarvam`: Real-time streaming ASR via WebSocket (`wss://api.sarvam.ai/speech-to-text`) and REST translation (`https://api.sarvam.ai/translate`) with Indic-to-Indic and English-to-Indic support and code-mixing preservation.
  - `mock`: Fully offline, deterministic test harness mimicking progressive ASR and translation events for zero-cost testing.
- **Partial Translation Stabilization**: Intelligent boundary evaluation (`_is_stable_partial`) that suppresses partial translation requests until an utterance has grown by at least two additional words, minimizing API load and caption flicker.
- **Progressive Caption Versioning**: Emits ordered caption revisions (`version_number: 1`, `version_number: 2`, ..., `vFinal`) with explicit `is_final` demarcation. Only finalized translations trigger database final status.
- **Asynchronous Persistence Queue (`persistence_queue.py`)**: An in-memory `asyncio.Queue` background worker spawned during the FastAPI lifespan. Decouples PostgreSQL database writes from real-time audio processing to eliminate I/O lag on the streaming connection.
- **Monotonic Latency Profiling**: Tracks 5 distinct timing stages (`audio_received_at`, `asr_first_at`, `translation_first_at`, `translation_final_at`, `output_at`) to calculate granular operational latencies (`asr_latency_ms`, `time_to_first_translation_ms`, `final_translation_latency_ms`, `end_to_end_latency_ms`).
- **RESTful Session Management**: Endpoints for creating sessions (`POST /sessions`), updating session lifecycle (`PATCH /sessions/{id}/end`), creating utterances (`POST /sessions/{id}/utterances`), and querying domain terminology (`GET /glossary`).
- **TypeScript Web Frontend**: Strongly-typed browser client (`app.ts` compiled to `dist/app.js`), featuring Web Speech API integration, language swapping, session history views, and authentication modals with form validation.
- **Hardened PostgreSQL Schema**: Complete 5-stage migration path incorporating user profiles, session tracking, utterance versioning, performance metrics, and evaluation datasets protected by Supabase Row Level Security.

---

## 3. Architecture and Data Flow

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT APPLICATION                                    |
|   (Browser: index.html + style.css + compiled dist/app.js from app.ts)                  |
+-----------------------------------------------------------------------------------------+
       |                                                    ^
       | 1. Config JSON: {session_id, langs, token}         | 5. Streamed Events:
       | 2. Binary Audio Chunks (16kHz PCM)                 |    - asr_partial / asr_final
       v                                                    |    - translation_partial / final
+-----------------------------------------------------------------------------------------+
|                             FASTAPI BACKEND (/ws/translate)                             |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  |                       StreamingOrchestrator (State Machine)                       |  |
|  |   States: UTTERANCE_STARTED -> ASR_PARTIAL -> TRANSLATION_PARTIAL -> ... -> FINAL |  |
|  +-----------------------------------------------------------------------------------+  |
|         |                                                       |                        |
|         v (Audio Chunks)                                        v (Stabilized Text)      |
|  +------------------------------+               +-------------------------------------+  |
|  |          ASR Service         |               |         Translation Service         |  |
|  |  - SarvamASRService (WSS)    |               |  - SarvamTranslationService (REST)  |  |
|  |  - MockASRService            |               |  - MockTranslationService           |  |
|  +------------------------------+               +-------------------------------------+  |
|         |                                                       |                        |
|         +---------------------------+---------------------------+                        |
|                                     |                                                    |
|                                     v                                                    |
|                   +-----------------------------------+                                  |
|                   |     TranslationMetricsTracker     |                                  |
|                   |  - audio_received_at              |                                  |
|                   |  - asr_first_at                   |                                  |
|                   |  - translation_first_at           |                                  |
|                   |  - translation_final_at           |                                  |
|                   |  - output_at                      |                                  |
|                   +-----------------------------------+                                  |
|                                     |                                                    |
|                                     v Non-blocking Enqueue                               |
|                   +-----------------------------------+                                  |
|                   | PersistenceQueue (asyncio.Queue)  |                                  |
|                   | Worker task runs in app lifespan  |                                  |
|                   +-----------------------------------+                                  |
+-----------------------------------------------------------------------------------------+
                                      |
                                      | Async DB Persistence
                                      v
+-----------------------------------------------------------------------------------------+
|                                   SUPABASE POSTGRESQL                                   |
|   Tables: translation_sessions, utterances, asr_results, translation_results,           |
|           translation_metrics, profiles, supported_languages, glossary_terms             |
|   Security: Row Level Security (RLS) enforced via User JWT Headers                      |
+-----------------------------------------------------------------------------------------+
```

### Architectural Component Breakdown

| Component | File Location | Responsibility |
| :--- | :--- | :--- |
| **WebSocket Router** | `backend/app/api/endpoints/ws.py` | Manages client WebSocket connections, accepts initial JSON configuration, and streams binary audio. |
| **Streaming Orchestrator** | `backend/app/services/streaming_orchestrator.py` | Coordinates ASR, stability thresholding, translation calls, version numbering, and state transitions. |
| **Metrics Tracker** | `backend/app/core/metrics.py` | Records monotonic timestamps across 5 milestones and computes pipeline latency figures in milliseconds. |
| **Provider Factory** | `backend/app/services/streaming_orchestrator.py` | Dynamically initializes `Sarvam` or `Mock` service instances based on environment configuration. |
| **Sarvam Provider** | `backend/app/services/providers/sarvam.py` | Connects to Sarvam streaming ASR WebSocket and executes translation REST calls with BCP-47 language mapping. |
| **Persistence Queue** | `backend/app/services/persistence_queue.py` | Decoupled background queue worker processing asynchronous inserts to Supabase tables. |
| **Database Service** | `backend/app/services/translation_db_service.py` | Executes PostgREST operations against Supabase tables with user JWT token propagation. |
| **REST API Endpoints** | `backend/app/api/endpoints/` | Provides HTTP routes for `/sessions`, `/sessions/{id}/utterances`, and `/glossary`. |
| **Frontend Application** | `app.ts` & `dist/app.js` | TypeScript client managing user interaction, audio input, session history, and authentication modals. |

---

## 4. Technology Stack

### Backend
- **Python**: 3.10+ (tested on Python 3.14 on Windows)
- **FastAPI**: Modern, asynchronous web framework for building REST and WebSocket APIs
- **Uvicorn**: Lightning-fast ASGI web server implementation
- **Pydantic & Pydantic-Settings**: Data validation, payload schemas, and environment variable management
- **Supabase Python Client (`supabase`)**: PostgREST and Auth integration with JWT token propagation
- **HTTPX**: Asynchronous HTTP client used for REST translation calls
- **WebSockets (`websockets`)**: Python WebSocket client for streaming audio to Sarvam AI
- **Python-dotenv**: Automatic loading of `.env` configuration files
- **Google Cloud Translate & Requests**: Ancillary translation and HTTP request utilities

### Frontend
- **TypeScript**: 5.4+ strongly typed implementation compiled to ES2020 JavaScript
- **HTML5 & CSS3**: Responsive UI styling with custom color schemes and modal overlays
- **Browser Web APIs**: Web Speech API (`webkitSpeechRecognition`), Web Audio API, and Fetch API

### Database & Authentication
- **Supabase / PostgreSQL**: PostgreSQL 15+ database hosting relational session tables
- **Row Level Security (RLS)**: Fine-grained user access control enforced at the database level
- **Supabase Auth**: JWT-based authentication propagated from client to PostgREST

### AI & Speech Services
- **Sarvam AI Streaming ASR**: `wss://api.sarvam.ai/speech-to-text?language={lang}`
- **Sarvam AI Translate API**: `https://api.sarvam.ai/translate`
- **Internal Mock Provider**: Zero-dependency local mock for offline testing and CI workflows

---

## 5. Repository Structure

```
LiveIndicTranslator/
├── index.html                                 # Frontend HTML entry point
├── style.css                                  # Application styling and modal overlays
├── app.ts                                     # Frontend TypeScript application source
├── dist/
│   └── app.js                                 # Compiled browser JavaScript (ES2020)
├── tsconfig.json                              # TypeScript compiler configuration
├── package.json                               # Frontend npm scripts and TypeScript devDependency
├── requirements.txt                           # Root Python dependencies
├── DATABASE_README.md                         # Detailed database architecture documentation
├── README.md                                  # Root project documentation (this file)
│
├── backend/
│   ├── .env.example                           # Template environment variables
│   ├── requirements.txt                       # Backend Python dependencies
│   ├── README.md                              # Backend architectural notes
│   │
│   ├── app/
│   │   ├── main.py                            # FastAPI entry point, lifespan, CORS, and routers
│   │   │
│   │   ├── api/
│   │   │   ├── deps.py                        # FastAPI dependency injection (DB, Auth, JWT)
│   │   │   └── endpoints/
│   │   │       ├── ws.py                      # WebSocket endpoint: /ws/translate
│   │   │       ├── sessions.py                # REST endpoints: /sessions
│   │   │       ├── utterances.py              # REST endpoints: /sessions/{id}/utterances
│   │   │       ├── glossary.py                # REST endpoints: /glossary
│   │   │       └── evaluation.py              # Evaluation benchmark trigger
│   │   │
│   │   ├── core/
│   │   │   ├── config.py                      # Pydantic BaseSettings configuration loader
│   │   │   ├── state.py                       # StreamingState enum and valid transitions
│   │   │   └── metrics.py                     # TranslationMetricsTracker latency profiling
│   │   │
│   │   ├── db/
│   │   │   └── supabase_client.py             # Supabase client instantiation helper
│   │   │
│   │   ├── models/
│   │   │   ├── schemas.py                     # Pydantic request/response schemas
│   │   │   ├── payload_schemas.py             # WebSocket message schemas
│   │   │   └── database_models.py             # Internal database data models
│   │   │
│   │   └── services/
│   │       ├── streaming_orchestrator.py      # Core streaming state machine & provider factory
│   │       ├── persistence_queue.py           # Asynchronous asyncio.Queue background worker
│   │       ├── translation_db_service.py      # Supabase CRUD service functions
│   │       ├── supabase_client.py             # Client factory with user JWT header support
│   │       └── providers/
│   │           ├── mock.py                    # Deterministic mock ASR & translation services
│   │           └── sarvam.py                  # Sarvam AI ASR WebSocket & Translation REST client
│   │
│   └── tests/
│       ├── test_streaming.py                  # Unit tests for state transitions and orchestrator
│       └── test_integration.py                # Integration tests for RLS, session CRUD, and queue
│
└── supabase/
    ├── config.toml                            # Supabase CLI project configuration
    └── migrations/
        ├── 001_initial_translation_schema.sql         # Base tables, constraints, and baseline RLS
        ├── 002_seed_data.sql                         # Supported languages & initial evaluation seeds
        ├── 003_profile_language_preferences.sql      # User profile language preferences migration
        ├── 004_hardened_production_schema.sql        # Hardened schema: metrics, indexes, views
        └── 005_indic_seeds.sql                       # Multilingual Indic seeds and global glossary
```

---

## 6. Prerequisites

Before setting up the project, ensure your environment satisfies the following requirements:

1. **Operating System**: Windows 10/11 (PowerShell instructions provided), macOS, or Linux.
2. **Python**: Python 3.10 to 3.14 installed and accessible via `python` in PATH.
3. **Node.js**: Node.js v18 or later with `npm` installed.
4. **Supabase Project**: An active Supabase project (hosted or local CLI instance).
5. **Sarvam AI API Key** *(Optional)*: Required only if running live speech-to-text with `TRANSLATION_PROVIDER=sarvam`. For local testing, `TRANSLATION_PROVIDER=mock` requires no external keys.

---

## 7. Installation and Setup

Open a **Windows PowerShell** terminal and execute the following steps from the project root directory:

### Step 1: Clone and Navigate to the Repository

```powershell
# Ensure you are in the project directory on branch Sarvam-DB-Integration
cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator
git status
```

### Step 2: Set Up Python Virtual Environment

```powershell
# Create a virtual environment named .venv
python -m venv .venv

# Activate the virtual environment in PowerShell
.\.venv\Scripts\Activate.ps1
```

> **Note**: If PowerShell displays an execution policy error, enable script execution for the current session:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
> .\.venv\Scripts\Activate.ps1
> ```

### Step 3: Install Python Dependencies

```powershell
# Install backend requirements
pip install -r backend/requirements.txt

# Install root requirements (includes google-cloud-translate and requests)
pip install -r requirements.txt
```

### Step 4: Install Frontend Dependencies and Build TypeScript

```powershell
# Install TypeScript devDependencies
npm install

# Compile app.ts into dist/app.js
npm run build
```

To continuously watch and recompile TypeScript changes during development:
```powershell
npm run watch
```

---

## 8. Environment Configuration

The backend reads configuration settings from `backend/.env`. A template is provided in `backend/.env.example`.

### Step 1: Create the Environment File

```powershell
# Copy the example file to backend/.env
Copy-Item backend/.env.example backend/.env
```

### Step 2: Configure Environment Variables

Edit `backend/.env` with your project parameters:

```env
# ==========================================
# Supabase Configuration
# ==========================================
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_KEY=your-supabase-service-role-key

# ==========================================
# Translation Provider Configuration
# ==========================================
# Options: "mock" (offline test harness) or "sarvam" (Sarvam AI APIs)
TRANSLATION_PROVIDER=mock

# Required when TRANSLATION_PROVIDER=sarvam
SARVAM_API_KEY=your-sarvam-api-key

# Optional provider overrides
ASR_API_KEY=
TRANSLATION_API_KEY=
TTS_API_KEY=
```

### Environment Variable Reference

| Variable Name | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `SUPABASE_URL` | Yes | `""` | The URL of your Supabase instance (e.g. `https://xyz.supabase.co`). |
| `SUPABASE_ANON_KEY` | Yes | `""` | The Supabase anonymous/public key used for client and user-scoped requests. |
| `SUPABASE_KEY` | Yes | `""` | The Supabase service-role secret key used for administrative and backend tasks. **Never expose to client.** |
| `TRANSLATION_PROVIDER` | Yes | `mock` | Selects the active pipeline provider: `mock` (deterministic local) or `sarvam` (Sarvam AI API). |
| `SARVAM_API_KEY` | Conditional | `""` | Authentication API key for Sarvam AI. Required if `TRANSLATION_PROVIDER=sarvam`. |
| `ASR_API_KEY` | No | `""` | Generic ASR key override placeholder. |
| `TRANSLATION_API_KEY` | No | `""` | Generic translation key override placeholder. |
| `TTS_API_KEY` | No | `""` | Text-to-speech key placeholder. |

> **Security Warning**: Never commit `backend/.env` or expose `SUPABASE_KEY` / `SARVAM_API_KEY` to public repositories or frontend code.

---

## 9. Running the Application

### 1. Start the FastAPI Backend

With your virtual environment activated, navigate to the `backend` directory and start Uvicorn:

```powershell
# Navigate into backend directory
cd backend

# Start the development server with live reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend server will start at `http://127.0.0.1:8000`.
- **Interactive OpenAPI Documentation**: `http://127.0.0.1:8000/docs`
- **ReDoc Documentation**: `http://127.0.0.1:8000/redoc`
- **WebSocket Translation Endpoint**: `ws://127.0.0.1:8000/ws/translate`

### 2. Start the Frontend Client

In a separate PowerShell terminal, serve the frontend static files from the repository root:

```powershell
# Ensure you are at the repository root
cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator

# Serve files using Python's built-in HTTP server
python -m http.server 3000
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 10. WebSocket Smoke Test

You can verify the streaming translation pipeline without the browser frontend using a WebSocket testing utility such as `wscat` or a Python script.

### Using `wscat`

1. Install `wscat` globally if needed:
   ```powershell
   npm install -g wscat
   ```

2. Connect to the WebSocket translation endpoint:
   ```powershell
   wscat -c ws://127.0.0.1:8000/ws/translate
   ```

3. Send the mandatory initial JSON configuration payload:
   ```json
   {
     "session_id": "00000000-0000-0000-0000-000000000001",
     "source_language": "en",
     "target_language": "ta",
     "token": null
   }
   ```

4. Stream binary audio chunks (or mock audio frames). In response, the backend emits progressive ASR and translation events:
   ```json
   {
     "type": "asr_partial",
     "utterance_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
     "text": "mock partial 1",
     "sequence_number": 1
   }
   ```
   ```json
   {
     "type": "translation_partial",
     "utterance_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
     "text": "mock translated partial for mock partial 1",
     "version_number": 1,
     "is_final": false
   }
   ```

5. Send the completion text control message:
   ```json
   {
     "type": "end_utterance"
   }
   ```

6. The backend emits the finalized translation and latencies:
   ```json
   {
     "type": "translation_final",
     "utterance_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
     "text": "mock translated final for mock final",
     "version_number": 2,
     "is_final": true
   }
   ```

---

## 11. Database Setup and Migration Overview

The database schema is structured as an idempotent, 5-stage migration sequence located in `supabase/migrations/`.

### Migration Execution Sequence

1. **`001_initial_translation_schema.sql`**
   - Bootstraps the foundational database tables: `profiles`, `supported_languages`, `translation_sessions`, `session_participants`, `utterances`, `utterance_segments`, `asr_results`, `translation_results`, `translation_metrics`, `glossary_terms`, `evaluation_datasets`, `evaluation_samples`, and `evaluation_results`.
   - Establishes primary/foreign key relationships, triggers (`handle_new_user`, `handle_updated_at`), and baseline Row Level Security policies.

2. **`002_seed_data.sql`**
   - Seeds the 6 core supported languages: English (`en`), Tamil (`ta`), Hindi (`hi`), Telugu (`te`), Kannada (`kn`), and Malayalam (`ml`).
   - Populates initial baseline evaluation samples for benchmark testing.

3. **`003_profile_language_preferences.sql`**
   - Idempotently adds `preferred_source_language_id` and `preferred_target_language_id` to the `profiles` table with foreign key constraints to `supported_languages`.

4. **`004_hardened_production_schema.sql`**
   - Production hardening: adds streaming segment progression columns, isolates ASR errors from translation failures, adds translation confidence scores, and creates the secure `session_history_view` with `security_invoker = true`.
   - Creates composite production indexes across `translation_sessions(user_id, created_at)` and `utterances(session_id, sequence_number)`.

5. **`005_indic_seeds.sql`**
   - Ingests multilingual Indic benchmark datasets covering code-mixed sentences, noisy audio environments, long utterances, and medical/technical domain terminology.
   - Populates global domain glossary terms in `glossary_terms`.

### Applying Migrations

Migrations can be applied directly using the Supabase CLI or by running the SQL scripts in the Supabase Dashboard SQL Editor in numerical order:

```powershell
# Using Supabase CLI (if configured)
supabase db push
```

For complete architectural details, schema diagrams, RLS security proofs, and benchmark ablation studies, refer to the dedicated [DATABASE_README.md](file:///c:/Users/ilakk/student-portfolio/antigravity/LiveIndicTranslator/DATABASE_README.md).

---

## 12. Testing

The repository includes a suite of automated unit and integration tests located in `backend/tests/`.

### Available Test Suites

- **`backend/tests/test_streaming.py`**:
  - `test_state_transitions`: Validates state machine rules in `StreamingState` (e.g. `UTTERANCE_STARTED` cannot transition directly to `TRANSLATION_FINAL`).
  - `test_streaming_orchestrator_flow`: Mocks WebSocket communication and tests audio processing, partial version increments (`v1` partial -> `v2` final), and message emission.
  - `test_metrics`: Validates monotonic timestamp calculation in `TranslationMetricsTracker`.

- **`backend/tests/test_integration.py`**:
  - `test_rls_isolation`: Verifies that Row Level Security strictly isolates User A's translation sessions from User B.
  - `test_full_persistence_flow`: Exercises the complete lifecycle: `POST /sessions` -> `POST /sessions/{id}/utterances` -> DB persistence -> `PATCH /sessions/{id}/end`.
  - `test_database_failure_handling`: Verifies that database errors in `PersistenceQueue` do not crash the background worker.

### Running Tests

To run the test suite, ensure your virtual environment is active and all dependencies from `backend/requirements.txt` and `requirements.txt` are installed:

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Run pytest from the repository root
pytest backend/tests -v
```

> **Environment Note**: Running tests without an activated virtual environment or without installing dependencies (`supabase`, `httpx`, `fastapi`, `pydantic-settings`) will fail with `ModuleNotFoundError`. Additionally, `test_integration.py` requires valid Supabase test credentials configured in `backend/.env`.

---

## 13. Latency Metrics and Persistence

Real-time translation systems require strict latency profiling to guarantee low perceptual lag.

### 1. Monotonic Latency Profiling

The `TranslationMetricsTracker` (`backend/app/core/metrics.py`) records five distinct monotonic timestamps across the processing pipeline:

```
Audio Received (audio_received_at)
       |
       |----> ASR Partial/Final (asr_first_at)
       |             |
       |             |----> Translation Partial (translation_first_at)
       |             |             |
       |             |             |----> Translation Final (translation_final_at)
       |             |             |             |
       |             |             |             |----> Client Emitted (output_at)
```

Derived metrics calculated by `calculate_metrics()`:

| Metric Field | Calculation Formula | Description |
| :--- | :--- | :--- |
| `asr_latency_ms` | `(asr_first_at - audio_received_at) * 1000` | Latency from receiving first audio chunk to first ASR output. |
| `time_to_first_translation_ms` | `(translation_first_at - audio_received_at) * 1000` | Time elapsed from initial audio chunk to first emitted partial translation. |
| `final_translation_latency_ms` | `(translation_final_at - audio_received_at) * 1000` | Time elapsed from initial audio chunk to final translation generation. |
| `end_to_end_latency_ms` | `(output_at - audio_received_at) * 1000` | Complete round-trip duration from audio receipt to WebSocket transmission. |
| `caption_rewrite_count` | `caption_rewrite_count` | Total number of progressive partial translation revisions emitted for the utterance. |

### 2. Decoupled Persistence Architecture

Writing metrics and transcripts synchronously to a database introduces network latency that degrades live audio streaming. 

To solve this, `backend/app/services/persistence_queue.py` implements an asynchronous background worker:
1. When an utterance is finalized, `StreamingOrchestrator` calls:
   ```python
   await persistence_queue.enqueue("store_translation_result", self.token, {...})
   ```
2. The method returns immediately, allowing the WebSocket loop to continue streaming audio with zero delay.
3. The background worker (`persistence_queue.worker()`), spawned during FastAPI application startup (`lifespan`), pulls jobs from the queue and executes the PostgREST calls:
   - Stores finalized translation text in `translation_results`.
   - Stores computed latency metrics in `translation_metrics`.

---

## 14. Troubleshooting

### 1. `ModuleNotFoundError: No module named 'supabase'` or `'pydantic_settings'`
- **Cause**: Python dependencies were not installed into the active virtual environment, or commands are being run against global Python.
- **Fix**:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  pip install -r backend/requirements.txt
  pip install -r requirements.txt
  ```

### 2. WebSocket Connection Closes Immediately with Code 1008
- **Cause**: The WebSocket endpoint expects the first client message to be a valid JSON configuration containing `session_id`, `source_language`, and `target_language`. Sending binary audio or text before this message causes immediate rejection.
- **Fix**: Ensure your client sends the configuration payload before transmitting audio chunks:
  ```json
  {"session_id": "<uuid>", "source_language": "en", "target_language": "ta"}
  ```

### 3. Sarvam API Error: `SARVAM_API_KEY is not configured`
- **Cause**: `TRANSLATION_PROVIDER=sarvam` is configured in `backend/.env`, but `SARVAM_API_KEY` is missing or empty.
- **Fix**: Add a valid Sarvam API key to `backend/.env`, or set `TRANSLATION_PROVIDER=mock` for offline mock testing.

### 4. Supabase Database Connection / RLS Errors
- **Cause**: `SUPABASE_URL` or `SUPABASE_KEY` values are missing or invalid, or user authentication token is expired.
- **Fix**: Verify your credentials in `backend/.env`. If testing locally without Supabase, integration tests and live DB persistence require valid test instance credentials.

### 5. Frontend UI Not Updating After Changing TypeScript
- **Cause**: Changes to `app.ts` were made without recompiling to `dist/app.js`.
- **Fix**: Run `npm run build` or start `npm run watch`.

---

## 15. Security Notes

- **Service Role Key Isolation**: `SUPABASE_KEY` is the administrative service-role secret key that bypasses Row Level Security. It is strictly confined to `backend/.env` and must never be exposed to frontend code or client devices.
- **Row Level Security (RLS)**: Client operations utilize `SUPABASE_ANON_KEY` along with the user's Supabase JWT (`Authorization: Bearer <token>`). The backend propagates this token to PostgREST using:
  ```python
  client.options.headers["Authorization"] = f"Bearer {token}"
  ```
  This ensures that PostgreSQL policies automatically isolate user sessions and history.
- **CORS Hardening**: In `backend/app/main.py`, CORS middleware is configured to allow all origins (`allow_origins=["*"]`) for development convenience. For production deployments, restrict origins to your verified frontend domain.
- **Secret Management**: Ensure `.env` is included in `.gitignore` and never committed to version control.
