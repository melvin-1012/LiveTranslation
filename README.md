# Hacknex 2026: LiveTranslation (Indic Languages)

A real-time, low-latency Speech-to-Speech and Speech-to-Text translation engine built specifically for the complexities of Dravidian languages (Tamil, Telugu, Kannada, Malayalam) with seamless fallback to global languages (English, Hindi).

## 🚀 The Architecture

This project is built around an **Intelligent Routing Engine** that dynamically switches between multiple AI models mid-stream to guarantee the lowest latency and highest accuracy depending on the exact language pair being spoken.

### 1. Real-Time Speech Recognition (ASR)
- **Deepgram `nova-3` / `nova-2`:** Used for English and Hindi audio streaming.
- **Sarvam AI `saaras:v4` (Realtime WebSocket):** Automatically routed to for Dravidian source languages, leveraging their highly optimized Indic language models.

### 2. Intelligent Translation Routing
- **Sarvam Translate (`sarvam-translate:v1`):** Triggered automatically when translating between two Dravidian languages or from a Dravidian language to English.
- **Google Cloud Translate:** Seamlessly handles translation when translating English to other languages or any unsupported edge-case pairs.

### 3. Natural Speech-to-Speech (TTS)
- **Sarvam TTS (`bulbul:v3`):** Once translation is finalized, the backend instantly generates natural-sounding Indian voices (using the `ritu` speaker) and streams the raw Base64 audio down the WebSocket for **zero-latency in-memory browser playback**.

### 4. Database Persistence (Supabase)
- Every single translation session, utterance, ASR result, and translation result is logged instantly to a hosted **Supabase (PostgreSQL)** database using optimized foreign-key relationships to power the History tab.

---

## 🛠️ Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js (for frontend serving if using Vite)
- API Keys for: Sarvam AI, Deepgram, Google Cloud, and Supabase.

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
# AI Providers
SARVAM_API_KEY=your_sarvam_key
DEEPGRAM_API_KEY=your_deepgram_key
GOOGLE_API_KEY=your_google_translate_key

# Database
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key
```

### 2. Install Dependencies
```bash
# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate  # (Windows)
# source venv/bin/activate (Mac/Linux)

# Install required packages
pip install -r requirements.txt
```

### 3. Run the Backend Server
The FastAPI backend handles the WebSocket connections, dynamic model routing, and database writes.
```bash
python server.py
```
*The server will start on `ws://localhost:8000/ws/translate`.*

### 4. Run the Frontend
You can serve the frontend static files using any simple HTTP server or Vite.
```bash
# Example using Python's built in server
python -m http.server 3000
```
Navigate to `http://localhost:3000` to access the application.

---

## 🧠 How the Speech-to-Speech Pipeline Works

Unlike traditional apps that save `.mp3` files to disk and force the browser to make a second HTTP request to fetch them, our pipeline is entirely memory-based:

1. **Audio Capture:** `ws_translation.js` intercepts microphone data, converts it to 16kHz PCM, and streams it as raw binary over the WebSocket.
2. **ASR Processing:** `server.py` routes the binary chunks to either Deepgram or Sarvam based on the dropdown selection.
3. **Translation & TTS:** Once a sentence is finished (`is_final == True`), the text is translated. The backend immediately hits Sarvam's TTS API, grabs the Base64 audio, and attaches it directly to the JSON payload sent back to the browser.
4. **Playback:** The frontend detects the `audio_base64` property and instantly plays it using `new Audio("data:audio/wav;base64,...")`. 

Zero disk I/O. Maximum speed.

---

## 📁 Project Structure

```text
.
├── index.html              # Main User Interface
├── style.css               # Styling and animations
├── ws_translation.js       # Frontend WebSocket, Audio Processing, & Playback engine
├── server.py               # Main Backend Server (FastAPI + AI Routing Logic)
├── requirements.txt        # Python Dependencies
├── .env                    # Secret API Keys (Not committed)
└── STS_FEATURE_README.md   # Deep dive on the Speech-to-Speech implementation
```
