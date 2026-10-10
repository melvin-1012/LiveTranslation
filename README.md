# Live Indic Translator

Live Indic Translator is a browser application for real-time speech and text translation. It captures microphone audio or accepts text typed/pasted into the source panel, sends requests to a Python backend, displays recognized or translated text, and can persist signed-in translation sessions and utterances to Supabase.

[**Open the hosted application**](https://liveindic-translator.onrender.com)

The application supports English, Hindi, Tamil, Telugu, Kannada, and Malayalam. Speakers can select a source language manually or choose **Auto-detect** and select a target language independently.

> **Important:** Auto-detect requires the Sarvam Saaras v4 real-time speech API and a valid `SARVAM_API_KEY`. Mock mode does not recognize real speech. Deepgram is used for supported manually selected source languages and is not sent `language=auto`.

## Contents

- [Features](#features)
- [Hosted application](#hosted-application)
- [System architecture](#system-architecture)
- [Technology stack and models](#technology-stack-and-models)
- [Requirements](#requirements)
- [End-to-end implementation flow](backend/README.md)
- [Install dependencies](#install-dependencies)
- [Configure services](#configure-services)
- [Run the application](#run-the-application)
- [Reproduce a live translation](#reproduce-a-live-translation)
- [Reproduce a two-way conversation](#reproduce-a-two-way-conversation)
- [Tests and validation](#tests-and-validation)
- [Troubleshooting](#troubleshooting)
- [Repository layout](#repository-layout)
- [Security and privacy](#security-and-privacy)

## Features

- Live microphone capture and PCM16 audio streaming.
- Type or paste text for translation without starting microphone capture; translation is debounced while typing and can also be requested with the Translate button or `Ctrl+Enter`.
- Automatic spoken-language detection for English, Hindi, Tamil, Telugu, Kannada, and Malayalam through Sarvam Saaras v4.
- Manual source-language selection with the existing provider routing retained.
- Real-time transcripts, detected-language badge, final translations, and optional synthesized speech.
- Optional playback of translated text when speech synthesis is available.
- Google OAuth sign-in and sign-up, email/password authentication, and password-reset email through Supabase Auth.
- Target-language selection independent of Auto-detect.
- Two-way Conversation Mode for a selected pair: each completed speech turn is detected, translated into the other language, and labeled by language; uncertain or out-of-pair turns can be corrected and translated.
- Supabase authentication, saved language preferences, session history, and transcript/translation persistence where credentials, schema, and authorization permit.
- Guest live sessions when session creation is unavailable; guest sessions are not associated with a signed-in account for history.
- Mock paths for development and automated tests. Mock ASR does **not** transcribe microphone audio.

## Hosted application

Try the deployed application at [liveindic-translator.onrender.com](https://liveindic-translator.onrender.com). Allow microphone access when prompted. Live speech recognition and translation depend on the deployed backend, valid provider credentials, network connectivity, and provider availability.

The frontend uses `http(s)://<current-host>:8000` locally by default. The hosted `liveindic-translator.onrender.com` frontend is configured to use `https://livetranslation-iok7.onrender.com`; the app converts this to WSS for the `/ws/translate` WebSocket and uses the same origin for HTTP API requests such as `/api/translate`. Local development continues to use the local backend. For any other deployment, set `window.LIVE_TRANSLATION_BACKEND_URL` to the backend's public HTTP(S) or WS(S) origin in a script loaded before `ws_translation.js`. An HTTPS frontend requires an HTTPS/WSS backend. For example, place this before the existing `ws_translation.js` script tag in `index.html`:

```html
<script>
  window.LIVE_TRANSLATION_BACKEND_URL = "https://your-backend.example.com";
</script>
```

Keep `SARVAM_API_KEY` and other provider credentials in the backend's environment only—never in frontend configuration.

## System architecture

```mermaid
flowchart LR
    Browser["Browser UI<br/>index.html + app.ts"]
    Capture["Microphone capture<br/>Web Audio API / AudioWorklet"]
    Client["WebSocket client<br/>ws_translation.js"]
    Text["Typed or pasted text"]
    Server["Standalone FastAPI server<br/>server.py"]
    ASR{"Source selection"}
    SarvamASR["Sarvam Saaras v4<br/>Auto: language_code=auto"]
    Deepgram["Deepgram Nova<br/>Manual supported languages"]
    Translation["Translation routing<br/>Sarvam / Google / local fallback"]
    TTS["Sarvam Bulbul v3<br/>Optional speech output"]
    Supabase[("Supabase<br/>Auth, sessions, history")]

    Browser --> Capture --> Client
    Browser --> Text -->|HTTP /api/translate<br/>WebSocket fallback| Server
    Client <-->|PCM16 audio and JSON events| Server
    Server --> ASR
    ASR -->|Auto-detect| SarvamASR
    ASR -->|Manual selection| Deepgram
    SarvamASR --> Translation
    Deepgram --> Translation
    Translation --> TTS
    Server <--> Supabase
    Server -->|Transcript, detected language,<br/>translation and optional audio| Client
```

### Audio and request flow

1. The browser asks for microphone access using `getUserMedia`.
2. Web Audio captures mono samples at 16 kHz and converts them to signed 16-bit PCM. The app uses `AudioWorklet` where available and falls back to `ScriptProcessorNode` in browsers that cannot load the worklet.
3. `ws_translation.js` streams the PCM frames to `ws://<same-host>:8000/ws/translate`.
4. `server.py` selects an ASR provider based on the chosen source language and configured credentials.
5. For Auto-detect, Sarvam returns transcript events and a detected language. The server normalizes the provider code, translates using the detected source, and includes the language in the transcript response.
6. The browser updates the transcript, language badge, and translation. When available, the server can also return generated speech.
7. When Supabase is available and the session is authenticated, final transcript and translation records can be saved. Audio itself is streamed, not stored as an audio recording.

### ASR routing

| Source selection | Provider behavior |
| --- | --- |
| Auto-detect | Requires `SARVAM_API_KEY`; connects to Saaras v4 using `language_code=auto`. It does not fall back to Deepgram. |
| Malayalam | Uses Sarvam Saaras v4 when the Sarvam key is configured. |
| Other manually selected languages | Uses Deepgram Nova when `DEEPGRAM_API_KEY` is configured. If Deepgram is not configured and Sarvam is, uses Sarvam with the selected language code. |
| No applicable ASR credentials | Enters a mock/no-provider path; real speech transcription is unavailable. |

For translation, the standalone server uses Sarvam Translate v1 for supported Indic language pairs when configured, can use Google Cloud Translation API v2 when `GOOGLE_API_KEY` is configured, and otherwise returns a local placeholder translation. Sarvam Bulbul v3 speech generation is optional and requires Sarvam credentials.

### Typed and pasted text flow

Text translation is independent of the microphone stream. Typing or pasting into the source textarea starts a short debounce; the **Translate** button and `Ctrl+Enter` request an immediate translation. The browser first posts to the standalone server's `POST /api/translate` endpoint. If that HTTP request is unavailable, it sends a `text_to_translate` message over a temporary `/ws/translate` connection. In Auto mode, the standalone backend detects supported Indic scripts from the text and treats otherwise undetected text as English. Translation then uses the configured provider route described above. Changing the target language while source text is present triggers a new translation.

### Two-way Conversation Mode

Choose **Two-way conversation**, select two different languages, and start the conversation. The microphone remains active while the realtime ASR provider marks completed turns; each detected turn is translated in the opposite direction, so either participant can speak next without restarting the stream. Turns are identified by language, not by speaker identity; this app does not perform voice diarization. If detection confidence is below 0.6, no translation is guessed: use that turn's language selector and **Correct & translate** to provide the intended language. Turns detected outside the selected pair also require correction. Live two-way language detection requires Sarvam Saaras v4 and `SARVAM_API_KEY`; one-way mode remains the default and keeps its existing routing.

## Technology stack and models

### Frontend

- HTML5 and CSS3.
- TypeScript 5, compiled to `dist/app.js`.
- Vite 8 for local development.
- Supabase JavaScript client (`@supabase/supabase-js`).
- TypeScript is compiled with `tsc`; Vite serves the local frontend during development.
- Browser APIs: `getUserMedia`, Web Audio API (`AudioWorklet` with compatibility fallback), and WebSocket.

### Backend

- Python 3.10 or newer.
- FastAPI and Uvicorn.
- `websockets` for provider and browser streaming connections.
- `httpx` for asynchronous API calls and `requests` for synchronous REST calls.
- Supabase Python client for session/history persistence.

### Providers, libraries, and models

| Component | Technology/model | Use |
| --- | --- | --- |
| Frontend | TypeScript, HTML, CSS, Vite, Supabase JS | Browser UI, auth, preferences, history, and local development |
| Audio capture | Web Audio API, AudioWorklet, PCM16 | Capture and stream microphone audio; ScriptProcessorNode is a compatibility fallback |
| Backend | Python, FastAPI, Uvicorn, `websockets`, `httpx` | REST endpoints and asynchronous browser/provider WebSocket connections |
| Speech recognition | Sarvam Saaras v4 | Real-time ASR and `language_code=auto` detection |
| Speech recognition | Deepgram Nova 2 / Nova 3 | Manual source-language ASR when configured |
| Translation | Sarvam Translate v1 | Translation for supported language pairs when configured |
| Translation fallback | Google Cloud Translation API v2 | Optional translation fallback when `GOOGLE_API_KEY` is configured |
| Speech synthesis | Sarvam Bulbul v3 | Optional spoken playback of translated text |
| Persistence/auth | Supabase JS and Python clients, PostgreSQL, RLS | Accounts, preferences, sessions, utterances, translations, and metrics |
| Development/testing | Mock providers, pytest, pytest-asyncio, Node.js checks | Local/test paths; mock ASR does not recognize microphone audio |

The root `requirements.txt` is used by `server.py`. `backend/requirements.txt` lists the modular service's Python dependencies. The frontend dependencies and exact versions are recorded in `package.json` and `package-lock.json`.

## Requirements

- Windows, macOS, or Linux.
- Git.
- Node.js and npm.
- Python 3.10 or newer.
- A browser with microphone and Web Audio support. Use `localhost` or HTTPS; browsers generally block microphone capture on insecure remote origins.
- For real Auto-detect: a valid Sarvam API key, internet access, and permission to use Sarvam Saaras v4.
- Optional: a Deepgram API key for manual source-language ASR.
- Optional: a Google Cloud API key for Google translation.
- Optional: a Supabase project with the schema and row-level-security policies used by the application for authenticated history and persistence.

## Install dependencies

Run commands from the repository root.

### Frontend

```powershell
npm ci
npm run build
```

### Python backend

Create a virtual environment:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Install the standalone server dependencies from the repository root:

```powershell
python -m pip install -r requirements.txt
```

If you plan to run the separate modular FastAPI service, install its dependencies as well:

```powershell
python -m pip install -r backend/requirements.txt
```

For bash shells, the equivalent install commands are:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements.txt
```

For the automated tests:

```powershell
python -m pip install pytest pytest-asyncio
```

## Configure services

### Recommended configuration for `server.py`

The standalone `server.py` loads environment variables from the repository-root `.env` first, then `backend/.env` for variables not already set. To avoid ambiguous values, keep one authoritative file for the server you run; for this standalone entry point, use the root `.env`.

Create `.env` in the repository root. Never commit it:

```dotenv
# Required for automatic spoken-language detection:
SARVAM_API_KEY=<your-sarvam-api-key>

# Optional: used for manually selected source-language ASR when configured.
DEEPGRAM_API_KEY=<your-deepgram-api-key>

# Optional: translation fallback.
GOOGLE_API_KEY=<your-google-cloud-api-key>

# Optional: Supabase persistence. Use credentials for the same project
# configured by the frontend, and only if the project schema/policies exist.
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_ANON_KEY=<your-supabase-publishable-or-anon-key>
SUPABASE_KEY=<server-only-service-role-key>
```

For Auto-detect, `SARVAM_API_KEY` is required even if a Deepgram key is present. The standalone server does not use `TRANSLATION_PROVIDER` to choose the ASR route; it selects based on the source language and available provider keys. Do not set `SARVAM_API_KEY` to a placeholder value.

`SUPABASE_KEY` is optional and must remain backend-only. The frontend already contains a Supabase project URL and publishable key in `app.ts`; use the matching project configuration if you want sessions and history stored in the same database. Do not use a local Supabase URL unless that local project is running and contains the required schema.

### Alternative: modular FastAPI service

The repository also contains a separate backend application at `backend/app/main.py`. It reads `backend/.env` (then root `.env` for missing variables) and selects providers using `TRANSLATION_PROVIDER`. To run this service instead of `server.py`, create `backend/.env` with at least:

```dotenv
TRANSLATION_PROVIDER=sarvam
SARVAM_API_KEY=<your-sarvam-api-key>
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_ANON_KEY=<your-supabase-publishable-or-anon-key>
```

For mock-only development, set `TRANSLATION_PROVIDER=mock`; mock mode does not recognize live speech and is not suitable for testing real Auto-detect.

Both backend entry points listen on port `8000` by default. **Run only one at a time**. The root README's recommended live demonstration below uses `server.py`, the standalone server where the current Auto-to-Sarvam behavior is implemented.

### Supabase schema

The SQL files in `supabase/migrations/` describe the project schema, language seeds, and related policies. For an existing hosted project, verify that the required migrations and seed data have already been applied before testing persistence. Do not reset or migrate a production/hosted project as part of ordinary local setup. Live speech can be tested independently of persistence if Supabase is unavailable; history and saved records then will not be available.

## Run the application

Start the backend and frontend in two separate terminals.

### Terminal 1: standalone backend

```powershell
cd C:\path\to\The-Unscripted
.\.venv\Scripts\Activate.ps1
python server.py
```

The server should report that Uvicorn is listening on port `8000`. For Auto-detect, after starting a session it should log a connection to `sarvam-saaras-v4` for language `auto`. If it reports `deepgram-nova-2` for `auto`, you are running an outdated copy of `server.py`.

### Terminal 2: frontend

```powershell
cd C:\path\to\The-Unscripted
npm run dev -- --host 127.0.0.1 --port 5500
```

Open the URL printed by Vite, usually `http://127.0.0.1:5500`. A static server such as VS Code Live Server on port `5500` can also serve the frontend, but Vite is the documented development setup. The page expects the compiled `dist/app.js`, so run `npm run build` after changing `app.ts`.

To use the modular backend instead, stop the standalone server and start this in a separate terminal:

```powershell
cd C:\path\to\The-Unscripted
.\.venv\Scripts\Activate.ps1
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Reproduce a live translation

1. Install the frontend and Python dependencies and configure the root `.env` as described above.
2. Start `python server.py` and the frontend server. Confirm that both terminals remain running.
3. Open the page on `localhost` and allow microphone access. Select the correct microphone in the browser/operating system if there is more than one.
4. Select **Auto-detect** as the source and choose a target language. Alternatively, select a source language manually to test the existing manual-provider path.
5. Click **Start Speaking** and speak a short, clear sentence in one supported language.
6. In Auto mode, confirm that the recognized-speech badge changes from **Detecting...** to the detected language and transcript text appears. Confirm the target panel shows the translation.
7. Click **Stop** to close the stream.
8. If signed into Supabase and persistence is configured, open **History** to inspect saved sessions and utterances. Guest sessions provide live use without account history.

To reproduce text translation without using a microphone:

1. Leave the microphone stopped and enter or paste a short sentence in the **Recognized Speech** textarea.
2. Select a source and target language, or keep **Auto-detect** as the source.
3. Wait for the debounced request, click **Translate**, or press `Ctrl+Enter` (`Cmd+Enter` on macOS).
4. Confirm the translated result appears in **Translated Text**. Click **Listen** to request speech playback when Sarvam TTS is configured and available.

## Reproduce a two-way conversation

Two-way Conversation Mode requires a real Sarvam Saaras v4 connection, a valid `SARVAM_API_KEY`, and two distinct supported languages. It is not available with mock ASR.

1. Start the standalone backend and frontend as described above.
2. In the language controls, choose **Two-way conversation** and select the two languages participants will use; do not select Auto as either pair member.
3. Click **Start Conversation** and allow microphone access.
4. Speak a short sentence in either selected language, then pause so the ASR provider can finalize the turn.
5. Confirm the conversation panel shows the detected direction and translated text. Speak in the other language without restarting the microphone; the translation direction should reverse.
6. If a final turn has low language confidence or is outside the selected pair, choose its language on that turn and click **Correct & translate**.
7. Click **Stop** when finished. If authenticated persistence is configured, inspect the completed session in **History**.

Conversation Mode labels turns by detected language; it does not identify individual speakers. When detection confidence is below `0.6`, the app requests correction rather than guessing.

### Expected behavior

- In Auto mode, the backend log identifies Sarvam Saaras v4 with `language: auto`; it must not request Deepgram using `language=auto`.
- Text requests use the separate HTTP/temporary-WebSocket path and do not require starting or stopping the microphone stream. The local mock translation returns a visibly marked placeholder, not a real translation.
- In Conversation Mode, final turns in the selected pair are translated toward the other selected language. Low-confidence or out-of-pair turns wait for user correction.
- A detected source language is used as the translation source and included in transcript response messages. Where the Supabase schema and access policies permit, it is associated with the utterance/session.
- Manual selection continues to use the provider route appropriate to its language and available keys.
- Mock ASR does not create real transcripts. A working microphone indicator or active WebSocket alone does not prove that a provider recognized speech.

Recognition and translation quality vary with the microphone, audio level, background noise, accent, network, API availability, and provider account limits. This project does not claim a quantified accuracy or latency benchmark.

## Tests and validation

Run frontend build and client checks from the repository root:

```powershell
npm run build
node backend\tests\test_frontend_ws_url.js
node --check ws_translation.js
node --check audio_capture_processor.js
git diff --check
```

Run the focused Python tests from the repository root:

```powershell
$env:PYTHONPATH = (Join-Path (Get-Location).Path 'backend') + ';' + (Get-Location).Path
python -m pytest -q backend\tests --ignore=backend\tests\test_integration.py
```

For bash, use:

```bash
PYTHONPATH=backend:. python -m pytest -q backend/tests --ignore=backend/tests/test_integration.py
```

The suite covers provider routing and errors, Auto-detection, text translation, Conversation Mode direction/correction, streaming behavior, stabilization, persistence orchestration, and frontend WebSocket URL configuration. The integration test is excluded because it can write to Supabase and requires a configured test project; do not run it against data you need to keep. Tests use mocks and test doubles, so passing them does not validate real provider credentials, external network availability, recognition quality, or production Supabase permissions.

## Troubleshooting

### The session closes shortly after clicking Start

- Check the browser console and the backend terminal for the first error.
- Confirm the browser is connected to port `8000` and only one backend process is running.
- If Auto is selected, confirm the **server process's** environment has a real `SARVAM_API_KEY` and restart the server after editing `.env`.
- If the log says `deepgram-nova-2 ... language: auto`, update the local checkout and run the new `server.py`; the standalone Auto fix routes to Sarvam.
- `server rejected WebSocket connection: HTTP 400` means the configured ASR provider rejected the connection. Verify provider routing, API key validity, account access, and the provider's current endpoint requirements.
- `[Errno 11001] getaddrinfo failed` on Windows indicates DNS/name resolution or network access failed before a provider connection was established.

### The microphone appears inactive or no speech is transcribed

- Use `http://localhost`/`http://127.0.0.1` or HTTPS, allow microphone permission, and check the selected input device.
- Keep the browser page open while speaking and verify the WebSocket is connected.
- Confirm that the selected ASR provider is configured. Mock ASR intentionally does not transcribe actual audio.
- If `audio_capture_processor.js` returns 404, ensure the frontend server is serving the repository root and the worklet file exists at that path.
- A ScriptProcessor deprecation warning is not itself an ASR error. The frontend prefers AudioWorklet and contains a compatibility fallback.

### `No module named 'pydantic_settings'`

Install it with `python -m pip install pydantic-settings`, then restart the server. In standalone `server.py`, the notice means optional REST routers could not be imported; it does not by itself explain a Sarvam/Deepgram WebSocket rejection.

### Supabase login, history, or persistence fails

- Confirm `SUPABASE_URL` points to the same project configured in `app.ts`, and that the project's schema, seed rows, and RLS policies are installed.
- Do not point only the backend at `127.0.0.1:54321` unless the local Supabase stack is running and the frontend is configured for that same local project.
- Inspect the failed Supabase request in the browser Network panel or the backend log. Do not share access tokens, passwords, or server keys.

### The frontend looks unchanged after a code update

- Confirm the browser is open to the checkout that contains the latest files. A second clone or a friend's folder does not update automatically when GitHub changes.
- Rebuild after editing TypeScript: `npm run build`.
- Restart the backend after changing Python code or environment values; verify the server process is running from the intended repository directory.

## Repository layout

```text
.
├── app.ts                         # Frontend auth, preferences, sessions, and history
├── audio_capture_processor.js     # AudioWorklet PCM16 capture processor
├── dist/app.js                    # Compiled frontend module loaded by index.html
├── index.html                     # Application interface
├── server.py                      # Standalone FastAPI/WebSocket server (recommended demo)
├── ws_translation.js              # Microphone, audio and WebSocket client
├── style.css                      # Application styles
├── backend/
│   ├── app/                       # Modular FastAPI service and streaming pipeline
│   ├── tests/                     # Provider, streaming, and routing tests
│   └── requirements.txt           # Modular-backend dependencies
├── requirements.txt               # Standalone server Python dependencies
└── supabase/
    └── migrations/                # Schema, policies, and supported-language seed data
```

## Security and privacy

- Keep Sarvam, Deepgram, Google, and Supabase server/service-role keys in local environment files or a secrets manager. Never commit `.env` files or paste secret values into issues, chat, or logs.
- The Supabase publishable/anon key is intended for client-side use; access control must be enforced by Supabase Row Level Security. Never put a service-role key in frontend code.
- Microphone audio is streamed to the selected speech provider for recognition. The application does not save a raw audio recording.
- Transcripts, translations, language metadata, and session information may be persisted when the configured Supabase project and authorization policies allow it.
- Check provider terms, account settings, regional availability, privacy requirements, and retention policies before using real user speech.
