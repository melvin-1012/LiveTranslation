# Live Indic Translator

Live Indic Translator is a browser-based, real-time speech translation prototype. It captures microphone audio, streams it to a FastAPI WebSocket backend, transcribes speech, translates between supported Indian languages and English, and displays the transcript and translation. Authenticated users can save language preferences and view session history through the existing hosted Supabase project.

The application supports English, Hindi, Tamil, Telugu, Kannada, and Malayalam. Translation is configured by selecting distinct source and target languages.

## How it works

1. The TypeScript frontend signs users in with Supabase Auth and creates an authenticated translation session.
2. The browser requests microphone permission, converts microphone samples to PCM16, and streams them over WebSocket to the backend on port `8000`.
3. The backend connects to a speech-recognition provider and passes recognized text to the translation provider.
4. Transcript and translation results are returned to the browser and persisted against the session using the existing Supabase schema and the user's JWT.
5. On stop, the backend flushes the final recognition result and the frontend marks the session complete.

Audio is streamed for recognition; this application does not save a raw audio recording. Persisted session data includes recognized speech and translation results.

## Technologies and services

### Frontend

- TypeScript 5
- Vite 8
- Supabase JavaScript client (`@supabase/supabase-js` 2)
- Browser `getUserMedia`, Web Audio API, and WebSocket APIs

### Backend

- Python 3
- FastAPI and Uvicorn
- Supabase Python client and PostgreSQL Row Level Security
- `websockets` for the real-time speech provider connection
- `httpx` for the translation provider request

### Models and providers

- **Sarvam Saaras v4**: real-time speech recognition when `TRANSLATION_PROVIDER=sarvam`
- **Sarvam Translate v1**: text translation when `TRANSLATION_PROVIDER=sarvam`
- **Mock provider**: local development/test implementation; it generates mock text and does not recognize real speech

The backend defaults to `TRANSLATION_PROVIDER=mock`. Sarvam mode requires a valid Sarvam API key. Exact availability and behavior depend on provider credentials, network access, and provider-side support.

## Prerequisites

- Node.js and npm
- Python 3.10 or newer
- A running backend on port `8000`
- Access to the already-configured hosted Supabase project
- For actual speech recognition and translation: a Sarvam API key and `TRANSLATION_PROVIDER=sarvam`
- A browser with microphone/Web Audio support; use `localhost` or HTTPS so the browser permits microphone access

The frontend is configured to use the hosted Supabase project. It does not require or start a local Supabase stack. Do not run `supabase db reset` or apply migrations as part of ordinary setup: the hosted database is expected to already contain the project's schema and seed data.

## Install dependencies

### Frontend

From the repository root:

```sh
npm install
```

### Backend

Create and activate a virtual environment from the repository root.

PowerShell:

```powershell
py -m venv backend\venv
.\backend\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn pydantic pydantic-settings supabase python-dotenv httpx websockets
```

macOS/Linux:

```sh
python3 -m venv backend/venv
source backend/venv/bin/activate
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn pydantic pydantic-settings supabase python-dotenv httpx websockets
```

For the focused Sarvam provider tests, also install:

```sh
python -m pip install pytest pytest-asyncio
```

## Configure the backend

Create `backend/.env` (this file is ignored by Git) and set values for the hosted Supabase project:

```dotenv
SUPABASE_URL=https://yisescosbfuwpddywurr.supabase.co
SUPABASE_ANON_KEY=<hosted-project-publishable-or-anon-key>
SUPABASE_KEY=<server-only-service-role-key>

# Use mock for a provider-free API/persistence smoke test.
TRANSLATION_PROVIDER=mock

# Needed only when TRANSLATION_PROVIDER=sarvam.
SARVAM_API_KEY=<sarvam-api-key>
```

Use the hosted project's own keys. The service-role key must remain backend-only: never put it in frontend code or commit it. The frontend's existing Supabase URL and publishable key are configured in `app.ts`; only a publishable/anon key belongs in browser code.

`mock` mode is useful for verifying that the backend WebSocket and database persistence path are reachable, but it does not test real microphone transcription. Use `sarvam` mode and a valid API key for actual ASR and translation:

```dotenv
TRANSLATION_PROVIDER=sarvam
SARVAM_API_KEY=<sarvam-api-key>
```

## Run the system

Start the backend in one terminal:

```sh
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend from the repository root in a second terminal:

```sh
npm run dev
```

Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`). The WebSocket client connects to port `8000` on the same host used to open the frontend. Keep the frontend and backend ports available while using live translation.

To produce the compiled TypeScript output:

```sh
npm run build
```

The app loads `dist/app.js`; after changing frontend TypeScript, run the build before testing the page. For local frontend development, Vite serves the project while the backend remains a separate process.

## Reproduce the demonstrated flow

1. Start the backend and frontend as described above.
2. Sign up or sign in with an account in the hosted Supabase project.
3. Select different source and target languages. Save preferences if desired.
4. Select Sarvam mode with a valid `SARVAM_API_KEY` to exercise real speech recognition and translation.
5. Allow microphone access, click **Start Speaking**, and speak clearly.
6. Confirm recognized text appears in the source panel and translated text appears in the target panel.
7. Click **Stop** to flush the final result and finish the session.
8. Open **History** while signed in to inspect persisted sessions.

The available Sarvam language codes are `en`, `hi`, `ta`, `te`, `kn`, and `ml`, mapped by the backend to the corresponding `*-IN` provider codes. Provider output can vary with audio quality, network latency, API availability, and the selected language pair.

For a provider-independent persistence check, select mock mode and complete a session. Mock mode returns synthetic transcripts/translations; it is not a demonstration of actual speech recognition quality.

## Tests and checks

From the repository root:

```sh
npx tsc --noEmit
npx tsc
node --check ws_translation.js
```

The Sarvam language mapping and request-payload unit tests can be run from `backend` after installing the test dependencies:

```sh
python -m pytest tests/test_sarvam_provider.py
```

Integration tests in `backend/tests` may require configured Supabase credentials and a reachable project. Do not run destructive database setup/reset commands against the hosted project.

No BLEU scores, latency benchmarks, or other quantitative quality results are asserted in this README. To reproduce a quality evaluation, use the evaluation datasets and result tables already present in the project's Supabase schema and record provider, language pair, sample set, and run configuration.

## Troubleshooting

- **`Failed to fetch` during login/profile sync:** verify browser connectivity to the hosted Supabase project and inspect the failing request in DevTools → Network. A valid publishable key is public, but never share access tokens or passwords.
- **Microphone unavailable:** allow microphone access, use `localhost`/HTTPS, and verify the selected input device is available.
- **WebSocket connection failed:** confirm Uvicorn is running on port `8000` on the same host as the Vite page.
- **No real transcript in mock mode:** expected; mock mode does not perform ASR. Enable Sarvam mode and configure a valid key for real transcription.
- **Session status update rejected:** inspect the Supabase response body and timestamps. The existing database enforces that `ended_at` must not be earlier than `started_at`.

## Project layout

```text
.
├── app.ts                         # Frontend behavior, auth, profiles, history, sessions
├── dist/app.js                    # Compiled frontend entry point
├── index.html                     # Existing application UI
├── ws_translation.js              # Microphone, audio processing, backend WebSocket client
├── backend/
│   ├── app/                       # FastAPI routes, streaming, providers, persistence
│   ├── tests/                     # Backend unit and integration tests
│   └── requirements.txt           # Backend dependency manifest
└── supabase/
    └── migrations/                # Existing database schema and seed migrations
```

## Security and data notes

- Browser-side Supabase access uses the project's publishable/anon key and the signed-in user's JWT.
- Keep Supabase service-role and Sarvam API keys in backend environment variables only.
- Row Level Security is expected to restrict user-owned profile, session, transcript, and translation data.
- This project streams audio for processing and stores transcript/translation records; it does not store raw audio files.
