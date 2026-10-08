# LiveIndicTranslator (`Gen-AI` Branch)

Real-time speech-to-text and translation backend service for the LiveIndicTranslator project.

This branch (`Gen-AI`) contains the core Gen-AI pipeline:
1. A **FastAPI WebSocket backend** (`server.py`) that bridges incoming raw PCM audio streams directly to Deepgram's live streaming API for English speech recognition and translates finalized transcripts into Indic languages using Google Cloud Translation API v2.
2. A **terminal-based microphone test client** (`test_client.py`) that captures live audio from your computer microphone and streams it to the backend to verify transcription and translation without needing a web browser.

---

## 1. Project Purpose & Features

- **Real-Time Speech-to-Text (STT)**: Accepts continuous 16-bit linear PCM audio over WebSockets and streams it upstream to Deepgram for low-latency speech recognition.
- **Live Interim Transcripts**: Streams intermediate partial hypotheses back to the client in real time so users see speech forming as words are spoken.
- **Automated Text Translation**: When Deepgram detects a completed utterance (`is_final: True`), the backend automatically submits the transcript to Google Cloud Translation API v2 and returns the translated text.
- **Default Target Language (Hindi)**: Defaults to translating into Hindi (`hi`).
- **Dynamic Target Language Configuration**: Supports client JSON messages over the WebSocket (`{"language": "<target_lang_code>"}`) to switch the translation target language on the fly.
- **Terminal Microphone Client**: Standalone Python client (`test_client.py`) that records microphone input via `sounddevice` and prints partial transcripts and final translations directly in the console.

---

## 2. Technologies, Libraries, APIs & Models

Based strictly on the verified source code of this branch:

### Backend Framework & Networking
- **FastAPI**: Provides the application instance (`app = FastAPI()`) and manages the `/ws/translate` WebSocket endpoint (`@app.websocket("/ws/translate")`).
- **Uvicorn**: ASGI server used as the runtime entry point: `uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)`.
- **WebSockets**:
  - `server.py`: Uses `websockets` (imported as `ws_client`) to establish an upstream client connection to Deepgram's streaming WebSocket API.
  - `test_client.py`: Uses `websockets` to connect to `ws://localhost:8000/ws/translate`.
- **asyncio & json**: Standard Python libraries managing concurrent sender/receiver coroutines, event queues, and message serialization.

### Cloud APIs & Models
- **Deepgram Live Streaming WebSocket API**:
  - Endpoint: `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&language=en`
  - Source Language: English (`language=en`, fixed in `server.py`).
  - Audio Format: `linear16` (16-bit signed PCM), sample rate `16000 Hz`.
  - Authentication: Bearer token header `Authorization: Token {DEEPGRAM_API_KEY}`.
- **Google Cloud Translation API (v2 REST)**:
  - Endpoint: `https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}`
  - Method: HTTP POST with JSON payload `{"q": text, "target": target_lang, "format": "text"}`.
  - Authentication: Query parameter `key={GOOGLE_API_KEY}`.

### Helper & Client Libraries
- **python-dotenv**: Loads environment variables from `.env` via `load_dotenv()`.
- **requests**: Synchronous HTTP client executed inside `loop.run_in_executor()` in `server.py` to make thread-pooled calls to Google Cloud Translation API.
- **sounddevice**: Cross-platform audio library used in `test_client.py` (`sd.InputStream`) to capture real-time microphone audio chunks (`16000 Hz`, mono, `int16`, block size `4096`).

---

## 3. Prerequisites & Installation

### Prerequisites
- **Python 3.10 or newer is recommended; the exact tested version has not been verified.**
- A working microphone connected to your system.
- Valid API keys for **Deepgram** and **Google Cloud Translation**.

### Setup Instructions (Windows PowerShell)

1. Open Windows PowerShell in the project root directory:

```powershell
# 1. Create a virtual environment
py -m venv venv

# 2. Activate the virtual environment
.\venv\Scripts\Activate.ps1

# 3. Upgrade pip
python -m pip install --upgrade pip

# 4. Install dependencies from requirements.txt
pip install -r requirements.txt
```

### Important Missing Dependencies

The current `requirements.txt` file specifies:
```text
fastapi
uvicorn
websockets
google-cloud-translate
python-dotenv
```

However, the source code imports two additional packages:
- `requests` is imported and used by `server.py` to call Google Cloud Translation.
- `sounddevice` is imported and used by `test_client.py` to capture microphone audio.

Without modifying `requirements.txt`, install these missing dependencies using:

```powershell
pip install requests sounddevice
```

---

## 4. Environment Variables & Configuration

Create a `.env` file in the repository root directory (where `server.py` resides):

```dotenv
# Deepgram API key for streaming speech-to-text
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Google Cloud API key for text translation
GOOGLE_API_KEY=your_google_cloud_api_key_here
```

> **Security Note:** Never commit your `.env` file or share real secrets. `.env` is listed in `.gitignore`.

### Missing Variable Behaviors

- **If `DEEPGRAM_API_KEY` is missing**:
  When a client connects to `ws://localhost:8000/ws/translate`, `server.py` sends a JSON error payload and immediately closes the connection:
  ```json
  {"error": "DEEPGRAM_API_KEY is not set in environment variables."}
  ```
- **If `GOOGLE_API_KEY` is missing**:
  Speech recognition continues to function, but translation calls return a fallback string:
  ```text
  [Translation missing - GOOGLE_API_KEY not set]
  ```

---

## 5. How to Run the System

Run the backend and test client in **two separate Windows PowerShell terminals**.

### Terminal 1: Start the FastAPI Backend Server

```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Start the server
py server.py
```

*Alternative command:*
```powershell
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

The server will start on `http://0.0.0.0:8000` with the WebSocket endpoint active at `ws://localhost:8000/ws/translate`.

### Terminal 2: Run the Terminal Microphone Test Client

```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Run the client
py test_client.py
```

---

## 6. How to Reproduce Results

### Step-by-Step Verification

1. Ensure `server.py` is running in Terminal 1 with valid `.env` keys.
2. In Terminal 2, run `py test_client.py`.
3. The client connects and displays:
   ```text
   [OK] Connected to Backend WebSocket Server!
   [INFO] Recording... Speak into your mic! (Press Ctrl+C to stop)
   ```
4. Speak an English sentence into your microphone (e.g., *"Hello, how are you today?"*).
5. **Partial Transcripts**: While speaking, interim hypotheses update live on the console:
   ```text
   â³ [Partial]: Hello how are...
   ```
6. **Final Result**: Once you pause, Deepgram finalizes the utterance (`is_final: True`), the partial line clears, and the transcript and translation are printed:
   ```text
   [English]: Hello, how are you today?
[Hindi]: [Example translated text]
   ```
7. Press `Ctrl+C` to stop recording.

### Default Target Language & Configuration Messages

- **Default Target**: In `server.py`, `current_target_lang = "hi"`. Because `test_client.py` only sends raw audio bytes, all translations default to Hindi (`hi`).
- **Configuration Messages**: `server.py` checks incoming WebSocket messages. If a text message is received containing JSON such as:
  ```json
  {"language": "ta"}
  ```
  `server.py` dynamically updates `current_target_lang` to the specified language code (e.g., `ta` for Tamil, `te` for Telugu, `kn` for Kannada, `ml` for Malayalam) for all subsequent translations in that session.

---

## 7. Repository Structure

```text
LiveIndicTranslator/
+-- .gitignore          # Ignores .env, venv/, __pycache__/, *.pyc
+-- requirements.txt    # Python dependencies manifest
+-- server.py           # FastAPI WebSocket backend (Deepgram STT + Google Translate v2)
+-- test_client.py      # Terminal microphone streaming test client (sounddevice)
\-- README.md           # Documentation for the Gen-AI branch
```

### File Details
- **`server.py`**: Accepts WebSocket connections at `/ws/translate`. Receives binary PCM audio chunks and forwards them to Deepgram (`wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&language=en`). Reads Deepgram responses, invokes Google Cloud Translation v2 on finalized text, and returns translation payloads to the client.
- **`test_client.py`**: Opens a local microphone stream via `sounddevice` at 16000 Hz, 1 channel, 16-bit integer PCM with block size 4096. Sends raw audio bytes to `ws://localhost:8000/ws/translate` and prints live partial and final results.
- **`requirements.txt`**: Declares `fastapi`, `uvicorn`, `websockets`, `google-cloud-translate`, and `python-dotenv`.
- **`.gitignore`**: Excludes local environment files (`.env`), virtual environment directories (`venv/`), and Python bytecode caches (`__pycache__/`, `*.pyc`).

---

## 8. Troubleshooting & Known Limitations

### Troubleshooting

- **`ModuleNotFoundError: No module named 'requests'`**:
  Occurs when starting `server.py` without installing `requests`. Run:
  ```powershell
  pip install requests
  ```
- **`ModuleNotFoundError: No module named 'sounddevice'`**:
  Occurs when starting `test_client.py` without installing `sounddevice`. Run:
  ```powershell
  pip install sounddevice
  ```
- **`âŒ Could not connect. Make sure server.py is running in another terminal first!`**:
  The test client cannot reach `ws://localhost:8000/ws/translate`. Verify `server.py` is running in Terminal 1 without errors.
- **Deepgram Connection Fails (`Deepgram connection failed: ...`)**:
  - Check that `DEEPGRAM_API_KEY` is set correctly in `.env`.
  - Verify your computer has internet access to `api.deepgram.com`.
- **Google Translation Fails (`[Translation Error]`)**:
  - Check that `GOOGLE_API_KEY` is valid and the Cloud Translation API v2 is enabled in your Google Cloud Console.
- **Microphone / Sounddevice Audio Errors (`Audio Error: ...` or `PortAudioError`)**:
  - Verify your microphone is plugged in, set as the default recording device in Windows Sound settings, and permitted in Windows Privacy Settings (*Settings > Privacy & security > Microphone*).
- **Port 8000 In Use (`[Errno 10048]`)**:
  Another application is using port 8000. Identify the process with:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
  ```
  Close the conflicting process or change the port in `server.py` and `test_client.py`.

### Known Limitations

1. **Fixed English Source Language**: `server.py` connects to Deepgram with a hardcoded query parameter `language=en`. On this branch, only spoken English is transcribed; Indic speech recognition is not configured in `server.py`.
2. **Missing Dependencies in `requirements.txt`**: `requests` and `sounddevice` are required at runtime but are omitted from `requirements.txt`.
3. **No Web Frontend on this Branch**: The `Gen-AI` branch contains only the Python backend and CLI test client. Web UI files (`index.html`, `style.css`, etc.) reside on frontend branches.
4. **No Database Persistence on this Branch**: Transcripts and translations are streamed in memory over WebSockets and are not saved to a database.









