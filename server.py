from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
import json
import asyncio
import os
import uuid
import httpx
import base64
from dotenv import load_dotenv
import websockets as ws_client
import requests

load_dotenv() # Load variables from .env file

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase Database connected.")
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}")

DRAVIDIAN_LANGUAGES = {'ta', 'te', 'kn', 'ml'}

app = FastAPI()

async def translate_text_google(text: str, target_lang: str) -> str:
    if not GOOGLE_API_KEY:
        return "[Google API Key missing]"
    if not text.strip(): return ""
        
    def fetch_translation():
        url = f"https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}"
        payload = {"q": text, "target": target_lang, "format": "text"}
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            return response.json()["data"]["translations"][0]["translatedText"]
        return "[Google Translation Error]"

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fetch_translation)

async def translate_text_sarvam(text: str, source_lang: str, target_lang: str) -> str:
    if not SARVAM_API_KEY:
        return "[Sarvam API Key missing]"
    if not text.strip(): return ""
    
    lang_map = {"en": "en-IN", "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN", "kn": "kn-IN", "ml": "ml-IN"}
    url = "https://api.sarvam.ai/translate"
    payload = {
        "input": text,
        "source_language_code": lang_map.get(source_lang, "en-IN"),
        "target_language_code": lang_map.get(target_lang, "hi-IN"),
        "speaker_gender": "Male",
        "mode": "formal",
        "model": "sarvam-translate:v1",
        "enable_code_mixing": True
    }
    headers = {"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=10.0)
            resp.raise_for_status()
            # Sarvam API returns JSON containing 'translated_text'
            return resp.json().get("translated_text", text)
        except Exception as e:
            print(f"Sarvam API Error: {e}")
            return f"[Sarvam Error]"

@app.websocket("/ws/translate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend Client connected!")
    
    if not DEEPGRAM_API_KEY:
        await websocket.send_text(json.dumps({"error": "DEEPGRAM_API_KEY is not set."}))
        await websocket.close()
        return

    current_target_lang = "hi" 
    current_source_lang = "en"
    
    session_id = str(uuid.uuid4())
    utterance_sequence = 0
    
    if supabase_client:
        try:
            # The database expects UUIDs, not string codes like 'en'. We must look them up.
            src_id, tgt_id = None, None
            try:
                src_res = supabase_client.table('supported_languages').select('id').eq('code', current_source_lang).execute()
                if src_res.data: src_id = src_res.data[0]['id']
                tgt_res = supabase_client.table('supported_languages').select('id').eq('code', current_target_lang).execute()
                if tgt_res.data: tgt_id = tgt_res.data[0]['id']
            except: pass
            
            session_data = {
                "id": session_id,
                "user_id": str(uuid.uuid4()), # Must be a valid UUID format
                "mode": "live",
                "status": "active"
            }
            if src_id: session_data["source_language_id"] = src_id
            if tgt_id: session_data["target_language_id"] = tgt_id
            
            supabase_client.table('translation_sessions').insert(session_data).execute()
        except Exception:
            pass # Silently fail if auth.users FK constraint blocks it

    message_queue = asyncio.Queue()

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
                            await message_queue.put({"type": "reconnect"})
                            
                        if "text_to_translate" in data:
                            txt = data["text_to_translate"]

                            # All supported language pairs use Sarvam directly.
                            translated = await translate_text_sarvam(txt, current_source_lang, current_target_lang)

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

    async def deepgram_handler():
        nonlocal utterance_sequence
        
        while True:
            use_sarvam_asr = (current_source_lang == 'ml')
            
            if use_sarvam_asr:
                sarvam_lang = lang_map.get(current_source_lang, "ml-IN")
                ws_url = f"wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code={sarvam_lang}&model=saaras:v4"
                headers = {"api-subscription-key": SARVAM_API_KEY}
            else:
                deepgram_model = "nova-3" if current_source_lang in DRAVIDIAN_LANGUAGES else "nova-2"
                ws_url = f"wss://api.deepgram.com/v1/listen?model={deepgram_model}&encoding=linear16&sample_rate=16000&language={current_source_lang}"
                headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
            
            try:
                async with ws_client.connect(ws_url, additional_headers=headers) as ws_backend:
                    
                    async def sender():
                        while True:
                            msg = await message_queue.get()
                            if msg["type"] == "disconnect":
                                raise asyncio.CancelledError()
                            elif msg["type"] == "reconnect":
                                return "reconnect"
                            elif msg["type"] == "audio":
                                if use_sarvam_asr:
                                    b64 = base64.b64encode(msg["data"]).decode("utf-8")
                                    await ws_backend.send(json.dumps({"event": "audio_input", "audio": b64}))
                                else:
                                    await ws_backend.send(msg["data"])

                    async def receiver():
                        nonlocal utterance_sequence
                        try:
                            while True:
                                response_str = await ws_backend.recv()
                                response_json = json.loads(response_str)
                                
                                transcript = ""
                                is_final = False
                                
                                if use_sarvam_asr:
                                    if response_json.get("event") == "transcript":
                                        transcript = response_json.get("text", "")
                                        is_final = response_json.get("is_final", False)
                                else:
                                    is_final = response_json.get("is_final", False)
                                    alternatives = response_json.get("channel", {}).get("alternatives", [])
                                    if alternatives:
                                        transcript = alternatives[0].get("transcript", "")
                                
                                if transcript:
                                    if is_final:
                                        print(f"Final Transcript ({current_source_lang}): {transcript}")

                                        # All supported language pairs use Sarvam directly.
                                        print("--> Routing to Sarvam Translate API")
                                        translated = await translate_text_sarvam(transcript, current_source_lang, current_target_lang)
                                        provider = "sarvam"

                                        # Database Save
                                        utterance_sequence += 1
                                        if supabase_client:
                                            try:
                                                u_id = str(uuid.uuid4())
                                                # Use a dummy UUID for user_id to prevent syntax errors, though FK might still reject it if no auth exists
                                                supabase_client.table('utterances').insert({"id": u_id, "session_id": session_id, "sequence_number": utterance_sequence}).execute()
                                                supabase_client.table('asr_results').insert({"utterance_id": u_id, "model_name": "deepgram-nova2", "transcript": transcript, "is_final": True, "asr_status": "final"}).execute()
                                                supabase_client.table('translation_results').insert({"utterance_id": u_id, "model_name": provider, "translated_text": translated, "is_final": True, "translation_status": "final", "version_number": 1}).execute()
                                            except Exception:
                                                pass # Silently fail DB saves for MVP demo to avoid terminal spam

                                        try:
                                            payload = {
                                                "status": "success",
                                                "original_text": transcript,
                                                "translated_text": translated,
                                                "target_language": current_target_lang,
                                                "is_final": True
                                            }
                                            await websocket.send_text(json.dumps(payload))
                                        except WebSocketDisconnect:
                                            break # Frontend disconnected, exit cleanly
                                        
                                    elif transcript:
                                        try:
                                            payload = {
                                                "status": "success",
                                                "original_text": transcript,
                                                "translated_text": "...", 
                                                "target_language": current_target_lang,
                                                "is_final": False
                                            }
                                            await websocket.send_text(json.dumps(payload))
                                        except WebSocketDisconnect:
                                            break # Frontend disconnected, exit cleanly
                        except ws_client.exceptions.ConnectionClosed:
                            pass

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
                                await deepgram_ws.send(b'')
                                continue 
                        except asyncio.CancelledError:
                            break 
                            
                    break 
                    
            except Exception as e:
                print(f"Deepgram connection failed: {e}")
                break 
                
    await asyncio.gather(frontend_receiver(), deepgram_handler())
    
    if supabase_client:
        try:
            supabase_client.table('translation_sessions').update({"status": "completed", "ended_at": "now()"}).eq('id', session_id).execute()
        except:
            pass

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
