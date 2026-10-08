from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.services.streaming_orchestrator import StreamingOrchestrator, MockASRService, MockTranslationService

router = APIRouter()

@router.websocket("/translate")
async def websocket_translate(websocket: WebSocket):
    await websocket.accept()
    asr_service = MockASRService()
    trans_service = MockTranslationService()
    orchestrator = StreamingOrchestrator(asr_service, trans_service, websocket)

    try:
        raw_msg = await websocket.receive_text()
        try:
            config = json.loads(raw_msg)
            if not all(k in config for k in ["session_id", "source_language", "target_language"]):
                raise ValueError("Missing config fields")
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid initial configuration"})
            await websocket.close()
            return
            
        await orchestrator.handle_config(config)

        while True:
            message = await websocket.receive()
            if "bytes" in message:
                chunk = message["bytes"]
                if not chunk: continue
                await orchestrator.process_audio(chunk)
            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    if data.get("type") == "end_utterance":
                        await orchestrator.finalize()
                except Exception:
                    await websocket.send_json({"type": "error", "message": "Malformed client message"})

    except WebSocketDisconnect:
        await orchestrator.finalize()
    except Exception as e:
        if websocket.client_state.value != 3:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
