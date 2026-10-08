from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
import json
import asyncio
import os
from dotenv import load_dotenv
import websockets as ws_client
import requests

load_dotenv() # Load variables from .env file

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

app = FastAPI()

TARGET_LANGUAGE = "hi" # Default to Hindi (can be changed dynamically later)

async def translate_text(text: str, target_lang: str) -> str:
    if not GOOGLE_API_KEY:
        return "[Translation missing - GOOGLE_API_KEY not set]"
    if not text.strip():
        return ""
        
    def fetch_translation():
        url = f"https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}"
        payload = {
            "q": text,
            "target": target_lang,
            "format": "text"
        }
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            return response.json()["data"]["translations"][0]["translatedText"]
        else:
            print(f"Translation error: {response.text}")
            return "[Translation Error]"

    # We run the blocking requests call in a thread pool to avoid freezing the WebSocket
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, fetch_translation)
    return result

@app.websocket("/ws/translate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend Client connected!")
    
    if not DEEPGRAM_API_KEY:
        error_msg = {"error": "DEEPGRAM_API_KEY is not set in environment variables."}
        await websocket.send_text(json.dumps(error_msg))
        await websocket.close()
        return

    # Deepgram WebSocket URL for streaming. 
    dg_url = "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&language=en"
    headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
    
    try:
        async with ws_client.connect(dg_url, additional_headers=headers) as deepgram_ws:
            
            async def sender():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await deepgram_ws.send(data)
                except WebSocketDisconnect:
                    print("Frontend client disconnected.")
                except Exception as e:
                    print(f"Sender Error: {e}")
                finally:
                    await deepgram_ws.send(b'')

            async def receiver():
                try:
                    while True:
                        response_str = await deepgram_ws.recv()
                        response_json = json.loads(response_str)
                        
                        is_final = response_json.get("is_final")
                        alternatives = response_json.get("channel", {}).get("alternatives", [])
                        
                        if alternatives:
                            transcript = alternatives[0].get("transcript", "")
                            
                            if transcript and is_final:
                                print(f"Final Transcript: {transcript}")
                                translated = await translate_text(transcript, TARGET_LANGUAGE)
                                print(f"Translated ({TARGET_LANGUAGE}): {translated}")
                                
                                payload = {
                                    "status": "success",
                                    "original_text": transcript,
                                    "translated_text": translated,
                                    "is_final": True
                                }
                                await websocket.send_text(json.dumps(payload))
                                
                            elif transcript:
                                payload = {
                                    "status": "success",
                                    "original_text": transcript,
                                    "translated_text": "...", 
                                    "is_final": False
                                }
                                await websocket.send_text(json.dumps(payload))

                except ws_client.exceptions.ConnectionClosed:
                    print("Deepgram connection closed.")
                except Exception as e:
                    print(f"Receiver Error: {e}")

            await asyncio.gather(sender(), receiver())
            
    except Exception as e:
        print(f"Deepgram connection failed: {e}")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
