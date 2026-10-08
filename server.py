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

    # Run blocking requests call in a thread pool
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

    # Default states
    current_target_lang = "hi" 
    current_source_lang = "en"
    
    # Use a Queue to buffer frontend audio/text while Deepgram is reconnecting
    message_queue = asyncio.Queue()

    # 1. Task to read from frontend and put into Queue
    async def frontend_receiver():
        nonlocal current_target_lang, current_source_lang
        try:
            while True:
                message = await websocket.receive()
                
                if "text" in message and message["text"]:
                    try:
                        data = json.loads(message["text"])
                        if "language" in data:
                            current_target_lang = data["language"]
                            print(f"🔄 Target switched to: {current_target_lang}")
                            
                        if "source_language" in data:
                            current_source_lang = data["source_language"]
                            print(f"🔄 Source switched to: {current_source_lang}")
                            # Send a control message to the queue to trigger reconnect
                            await message_queue.put({"type": "reconnect"})
                            
                        if "text_to_translate" in data:
                            txt = data["text_to_translate"]
                            print(f"📝 Text-to-Text Request: {txt}")
                            translated = await translate_text(txt, current_target_lang)
                            payload = {
                                "status": "success",
                                "original_text": txt,
                                "translated_text": translated,
                                "target_language": current_target_lang,
                                "is_final": True,
                                "is_text_to_text": True
                            }
                            await websocket.send_text(json.dumps(payload))
                    except json.JSONDecodeError:
                        pass
                        
                elif "bytes" in message and message["bytes"]:
                    await message_queue.put({"type": "audio", "data": message["bytes"]})
                    
        except WebSocketDisconnect:
            print("Frontend client disconnected.")
            await message_queue.put({"type": "disconnect"})

    # 2. Task to handle Deepgram connection
    async def deepgram_handler():
        headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        
        while True:
            # Note: added model=nova-2 for better multilingual support
            dg_url = f"wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language={current_source_lang}"
            
            try:
                async with ws_client.connect(dg_url, additional_headers=headers) as deepgram_ws:
                    
                    async def sender():
                        while True:
                            msg = await message_queue.get()
                            if msg["type"] == "disconnect":
                                raise asyncio.CancelledError()
                            elif msg["type"] == "reconnect":
                                return "reconnect"
                            elif msg["type"] == "audio":
                                await deepgram_ws.send(msg["data"])

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
                                        print(f"Final Transcript ({current_source_lang}): {transcript}")
                                        translated = await translate_text(transcript, current_target_lang)
                                        print(f"Translated ({current_target_lang}): {translated}")
                                        
                                        payload = {
                                            "status": "success",
                                            "original_text": transcript,
                                            "translated_text": translated,
                                            "target_language": current_target_lang,
                                            "is_final": True
                                        }
                                        await websocket.send_text(json.dumps(payload))
                                        
                                    elif transcript:
                                        payload = {
                                            "status": "success",
                                            "original_text": transcript,
                                            "translated_text": "...", 
                                            "target_language": current_target_lang,
                                            "is_final": False
                                        }
                                        await websocket.send_text(json.dumps(payload))
                        except ws_client.exceptions.ConnectionClosed:
                            print("Deepgram connection closed.")

                    sender_task = asyncio.create_task(sender())
                    receiver_task = asyncio.create_task(receiver())
                    
                    done, pending = await asyncio.wait(
                        [sender_task, receiver_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    
                    for task in pending:
                        task.cancel()
                    
                    if sender_task in done:
                        try:
                            result = sender_task.result()
                            if result == "reconnect":
                                print("Reconnecting to Deepgram to switch listening language...")
                                await deepgram_ws.send(b'')
                                continue 
                        except asyncio.CancelledError:
                            break 
                            
                    break 
                    
            except Exception as e:
                print(f"Deepgram connection failed: {e}")
                break 
                
    await asyncio.gather(frontend_receiver(), deepgram_handler())

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
