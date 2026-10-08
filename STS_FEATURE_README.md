# Feature: Speech-to-Speech (STS) Translation

This branch (`STS`) introduces a complete Speech-to-Speech (STS) pipeline, allowing users to speak in one language, have it translated, and instantly hear the translated text spoken back to them in a natural, human-sounding voice.

## What was implemented

### 1. Sarvam AI Text-to-Speech (TTS) Engine
We integrated Sarvam AI's Text-to-Speech REST API (`api.sarvam.ai/text-to-speech`) directly into the backend `server.py`. 
- **Model:** `bulbul:v3` (Highly optimized for Indian languages)
- **Speaker:** `ritu` (A natural-sounding female voice)
- **Audio Output:** Configured to request raw PCM 8kHz audio which Sarvam encodes natively as a Base64 string.

### 2. Zero-Latency WebSocket Injection
Instead of saving the generated audio to disk as `.mp3` or `.wav` files and serving them via HTTP endpoints (which is slow and requires managing file cleanup), we built a zero-latency streaming architecture:
- When the backend generates the final translated text (`is_final == True`), it immediately requests the audio from Sarvam.
- The returned Base64 audio string is injected directly into the `translation_final` JSON payload alongside the translated text (`"audio_base64": "..."`).
- This happens for both microphone-based streaming translations AND text-to-text translations.

### 3. Frontend In-Memory Playback
In `ws_translation.js`, the WebSocket listener was upgraded to handle the new audio payloads:
- When a `translation_final` message is received, the script checks for the `audio_base64` property.
- If present, it uses the browser's native HTML5 Audio API (`new Audio("data:audio/wav;base64,...")`) to instantly decode and play the audio entirely in memory.
- No new API calls are made from the frontend, drastically reducing latency and complexity.

## How to Test
1. Make sure you are on the `STS` branch (`git checkout STS`).
2. Run your server: `python server.py`.
3. Open the UI, select your Source and Target languages.
4. Click **Start Speaking** and say a sentence (or type a sentence and click Translate).
5. The translated text will appear on the right, and the voice of "Ritu" will instantly read the translation aloud.

## Note on Autoplay
Modern browsers block audio autoplay unless the user has interacted with the page first. Because the user clicks the "Start Speaking" or "Swap" buttons to trigger this flow, the browser automatically grants the required autoplay permissions for the `Audio()` object.
