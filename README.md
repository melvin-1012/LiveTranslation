# LiveIndicTranslator (`FrontGenAI` Branch)

Real-time, bidirectional speech-to-text and text translation system connecting English and Indic languages (Tamil, Hindi, Telugu, Kannada, and Malayalam).

This branch (`FrontGenAI`) integrates the **LiveIndicTranslator** frontend with a live streaming **FastAPI** backend that orchestrates:
- **Real-Time Speech-to-Text (STT)** powered by the **Deepgram Live Streaming WebSocket API** (`nova-2` model).
- **Live Text Translation** powered by the **Google Cloud Translation v2 REST API**.
- **Bidirectional Language Switching & Swapping** with dynamic Deepgram socket re-negotiation.
- **Text-to-Text Live Translation** with debounced typing detection.
- **Python Streaming Test Client** (`test_client.py`) for terminal-based verification without a browser.

---

## 1. Features & Capabilities

- **Live Microphone Audio Streaming**: Captures raw PCM audio (16-bit, 16000 Hz, mono) directly from the user's microphone via the browser Web Audio API and streams binary chunks over a persistent WebSocket.
- **Low-Latency Multilingual ASR**: Transcribes speech in real time with partial/interim hypothesis rendering and final sentence detection via Deepgram's streaming engine.
- **Instant Indic Translation**: Automatically translates finalized sentences into target Indic languages using Google Cloud Translation.
- **Dynamic Language Selection & Switching**: Change source or target language on the fly without refreshing the page. When the source speaking language changes, the backend dynamically reconnects to Deepgram with the updated language parameter while preserving the audio stream queue.
- **Language Swap Button**: Instantly swaps source and target languages in the UI and pushes the new configuration to the backend.
- **Direct Text-to-Text Translation**: Type into the recognized speech textarea to get debounced (800ms) automatic translations without speaking into a microphone.
- **CLI Testing Tool (`test_client.py`)**: Terminal-based test script capturing local microphone audio via `sounddevice` to test the backend WebSocket pipeline directly.
- **Modern Responsive UI**: Dark-mode AI theme with glassmorphic cards, live status indicator (*Ready*, *Live Streaming*), animated audio equalizer waves, character counters, clipboard utilities, session history drawer, and demo auth portal.

---

## 2. Technologies, Libraries, APIs & AI Models

### Backend (`server.py` & `test_client.py`)
- **Python**: 3.10+ (tested with Python 3.14).
- **FastAPI**: Asynchronous web framework serving the `/ws/translate` WebSocket endpoint.
- **Uvicorn**: ASGI web server hosting the application on `0.0.0.0:8000`.
- **websockets**: Async WebSocket library managing client connections and upstream Deepgram connections.
- **requests**: Synchronous HTTP client dispatched via `asyncio.get_event_loop().run_in_executor()` for thread-pooled calls to Google Cloud Translation.
- **python-dotenv**: Loads environment variables from the root `.env` file.
- **sounddevice**: Cross-platform PortAudio wrapper used in `test_client.py` for raw microphone capture (`16000 Hz`, `int16`, mono).

### AI Models & Cloud APIs
- **Deepgram Live Streaming WebSocket API**:
  - **Model**: `nova-2` (`wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language={current_source_lang}`)
  - **Audio Format**: `linear16` (16-bit signed PCM), sample rate `16000 Hz`.
  - **Authentication**: Bearer token via `Authorization: Token {DEEPGRAM_API_KEY}`.
- **Google Cloud Translation Basic API (v2 REST)**:
  - **Endpoint**: `https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}`
  - **Payload**: `{"q": text, "target": target_lang, "format": "text"}`
  - **Authentication**: API key via query parameter.

### Frontend (`index.html`, `style.css`, `app.ts`, `ws_translation.js`)
- **TypeScript 5.4+**: Compiles `app.ts` into `dist/app.js` using `tsconfig.json` (`ES2020` target).
- **Web Audio API**: Downsamples and converts browser `getUserMedia` float32 audio buffers into `Int16Array` PCM binary chunks.
- **Native WebSockets (`ws_translation.js`)**: Connects to `ws://localhost:8000/ws/translate`, sends control JSON and binary audio, and receives interim and final translation payloads.

### Supported Languages (ISO 639-1 Mapping)
| Language Name | Language Code | Deepgram STT Code | Google Translate Target Code |
| :--- | :--- | :--- | :--- |
| **English** | `en` | `en` | `en` |
| **Tamil** | `ta` | `ta` | `ta` |
| **Hindi** | `hi` | `hi` | `hi` |
| **Telugu** | `te` | `te` | `te` |
| **Kannada** | `kn` | `kn` | `kn` |
| **Malayalam** | `ml` | `ml` | `ml` |

---

## 3. Prerequisites & Installation

### Prerequisites
1. **Python 3.10 or higher** (verify using `py --version` or `python --version`).
2. **Node.js (v18+) & npm** (verify using `node -v` and `npm -v`).
3. **Deepgram API Key** ([deepgram.com](https://deepgram.com)).
4. **Google Cloud API Key** with the Cloud Translation API enabled.
5. A working microphone and a modern web browser (Google Chrome, Microsoft Edge, or Mozilla Firefox).

### Backend Setup (Windows PowerShell)

```powershell
# 1. Create and activate a Python virtual environment
py -m venv venv
.\venv\Scripts\Activate.ps1

# 2. Upgrade pip
python -m pip install --upgrade pip

# 3. Install dependencies from requirements.txt
pip install -r requirements.txt

# 4. Install additional runtime dependencies required by server.py and test_client.py
pip install requests sounddevice
```

> **Note on Dependencies:** `server.py` imports `requests` directly, and `test_client.py` imports `sounddevice`. While `requirements.txt` specifies `fastapi`, `uvicorn`, `websockets`, `google-cloud-translate`, and `python-dotenv`, ensure `requests` and `sounddevice` are also installed.

### Frontend Setup (Windows PowerShell)

```powershell
# Install TypeScript dev dependencies
npm install

# Compile TypeScript source (app.ts -> dist/app.js)
npm run build
```

---

## 4. Environment Variables & Configuration

Create a `.env` file in the repository root directory. The application loads this file automatically on startup via `python-dotenv`.

```dotenv
# Deepgram API key for real-time speech recognition
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Google Cloud API key for text translation
GOOGLE_API_KEY=your_google_cloud_api_key_here
```

### Configuration Notes
- **`DEEPGRAM_API_KEY`**: If this variable is omitted or empty, `server.py` rejects incoming WebSocket connections with an error message: `{"error": "DEEPGRAM_API_KEY is not set in environment variables."}`.
- **`GOOGLE_API_KEY`**: If this variable is omitted or empty, speech recognition still functions, but translated outputs will display: `"[Translation missing - GOOGLE_API_KEY not set]"`.
- **Security**: Never commit `.env` or share API keys. `.env` is listed in `.gitignore`.

---

## 5. Starting the Backend and Frontend

### Step 1: Start the Backend Server

In a PowerShell terminal with the virtual environment activated:

```powershell
py server.py
```

*Alternatively, run Uvicorn directly:*
```powershell
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

The server will start at `http://0.0.0.0:8000`, with the WebSocket endpoint listening at `ws://localhost:8000/ws/translate`.

### Step 2: Start the Frontend HTTP Server

In a second terminal:

> **Important:** `index.html` loads `dist/app.js` as an ES module (`type="module"`). Modern browsers block ES modules when opened via the `file:///` protocol due to CORS policy. You must serve `index.html` using a local HTTP server.

```powershell
# Option A: Using Python's built-in HTTP server
py -m http.server 8080

# Option B: Using Node npx serve
npx serve . -p 8080
```

Open your browser and navigate to:
```text
http://localhost:8080
```

---

## 6. How to Test & Reproduce Demonstrated Results

### A. Run Verification Checks (Verified in this environment)

Run these commands from the repository root:

1. **Verify TypeScript compilation**:
   ```powershell
   & "C:\Program Files\nodejs\node.exe" node_modules\typescript\bin\tsc --noEmit
   ```
   *(Result: 0 errors; clean compilation).*

2. **Verify frontend WebSocket bridge script**:
   ```powershell
   & "C:\Program Files\nodejs\node.exe" --check ws_translation.js
   ```
   *(Result: Syntax valid; 0 errors).*

3. **Verify Python scripts syntax**:
   ```powershell
   py -m py_compile server.py test_client.py
   ```
   *(Result: Syntax valid; 0 errors).*

### B. Test via the CLI Client (`test_client.py`)

To verify the audio streaming and translation pipeline without browser interaction:

1. Ensure `server.py` is running in Terminal 1.
2. In Terminal 2 (with virtual environment activated):
   ```powershell
   py test_client.py
   ```
3. Speak into your laptop/desktop microphone in English.
4. Verify the terminal prints:
   - `✅ Connected to Backend WebSocket Server!`
   - `🎙️ Recording... Speak into your mic! (Press Ctrl+C to stop)`
   - `⏳ [Partial]: <live interim transcript>...`
   - `🗣️ [English]: <final recognized transcript>`
   - `🌐 [Hindi]  : <translated text>`

### C. Test via the Web Application (`http://localhost:8080`)

1. Start both `server.py` (port 8000) and the frontend HTTP server (port 8080).
2. Open `http://localhost:8080` in your browser.
3. Select your desired language pair (e.g., **Source**: `English`, **Target**: `Tamil`).
4. Click **Start Speaking** and grant microphone permissions when prompted.
5. The status badge will display **Live Streaming**, and the audio waves will animate.
6. Speak clearly. Notice:
   - Partial speech appears live in the **Recognized Speech** textarea.
   - Once a sentence completes, the final transcript locks in and the translation appears in the **Live Translated Text** textarea.
7. Click **Stop** to conclude the session.
8. **Test Text-to-Text Translation**: While the microphone is stopped, type a phrase into the **Recognized Speech** box (e.g. `Where is the nearest railway station?`). Within 800ms of pausing typing, the translation appears in the target box.
9. **Test Language Swap**: Click the **Swap Languages** button to reverse source and target languages. The backend automatically updates the target language and reconnects to Deepgram for the new source language.

---

## 7. Repository Structure

```text
LiveIndicTranslator/
├── .gitignore              # Ignores .env, venv/, __pycache__/, *.pyc, node_modules/
├── package.json            # Node project configuration and build scripts
├── package-lock.json       # Locked dependency versions for npm packages
├── tsconfig.json           # TypeScript configuration targeting ES2020
├── requirements.txt        # Python backend dependency manifest
├── server.py               # FastAPI backend with /ws/translate WebSocket (Deepgram + Google Translate)
├── test_client.py          # Standalone CLI test client streaming microphone audio to WebSocket
├── ws_translation.js       # Frontend Web Audio PCM capture & WebSocket client bridge
├── app.ts                  # Frontend application TypeScript source (UI state, auth modal, history drawer)
├── dist/
│   └── app.js              # Compiled browser JavaScript generated from app.ts
├── index.html              # Main HTML user interface
├── style.css               # Styling, layout, and animations
└── README.md               # Project documentation for the FrontGenAI branch
```

### Important Files & Roles
- **`server.py`**: The core backend service. Establishes bidirectional communication with the frontend client, pipes raw PCM audio to Deepgram Nova-2 via WebSocket, and passes final transcripts to Google Cloud Translation.
- **`ws_translation.js`**: Frontend streaming bridge. Replaces dummy Web Speech API listeners on the UI buttons, captures raw mic audio with Web Audio API, downsamples to 16 kHz PCM 16-bit, and streams chunks to `server.py`.
- **`test_client.py`**: Developer verification tool using `sounddevice` to stream microphone audio directly from Python to test STT and translation latency.
- **`app.ts` / `dist/app.js`**: Frontend logic managing UI state, dropdown selections, language swap UI, character counters, demo auth modal, and mock history drawer.
- **`index.html` & `style.css`**: The complete single-page user interface.

---

## 8. Troubleshooting & Known Limitations

### Troubleshooting
- **`DEEPGRAM_API_KEY is not set in environment variables`**:
  - The backend will reject WebSocket connections. Ensure `.env` exists in the directory from which `server.py` is executed, and contains a valid `DEEPGRAM_API_KEY`.
- **`[Translation missing - GOOGLE_API_KEY not set]`**:
  - Speech recognition works, but translation is bypassed. Ensure `GOOGLE_API_KEY` is present in `.env`.
- **`Connection failed. Make sure server.py is running!` in browser**:
  - Confirm `server.py` is actively running on port 8000 and accessible at `ws://localhost:8000/ws/translate`.
- **Microphone permission denied / audio capture failed**:
  - Browsers restrict microphone access to secure contexts (`https://` or `http://localhost` / `http://127.0.0.1`).
  - Check browser permissions (lock icon in address bar) and ensure Windows Microphone privacy settings permit browser access.
- **`ModuleNotFoundError: No module named 'requests'` or `'sounddevice'`**:
  - Run `pip install requests sounddevice` in your active Python environment.
- **Port 8000 or 8080 already in use**:
  - Check active ports in Windows PowerShell using:
    ```powershell
    Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
    ```
    Terminate conflicting processes or adjust the port argument.

### Known Limitations & Verification Notes
- **Language Model Recognition Range**: Deepgram Nova-2 provides high accuracy for English and Hindi. Regional Indic language transcription (Tamil, Telugu, Kannada, Malayalam) accuracy is dependent on Deepgram's model coverage for those language codes.
- **Web Audio `ScriptProcessorNode`**: `ws_translation.js` utilizes `createScriptProcessor` to capture audio frames. While supported across all major desktop browsers, modern Web Audio specifications recommend `AudioWorkletNode` for lower latency.
- **Database & Persistence Scope**: On this branch (`FrontGenAI`), translation sessions are streamed live in memory and rendered on the frontend; translation records are not persisted to a database (the history drawer displays local mock sessions).
- **Authentication Scope**: The Login/Register modal on the frontend operates in demo mode; credentials are not verified against a remote identity provider on this branch.
