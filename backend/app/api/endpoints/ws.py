
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
import json
import logging
from app.core.config import settings
from app.services.persistence_queue import persistence_queue
from app.services.streaming_orchestrator import StreamingOrchestrator, get_provider_factory

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/translate")
async def websocket_translate(websocket: WebSocket):
    await websocket.accept()
    
    try:
        asr_service, trans_service = get_provider_factory()
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Provider init error: {str(e)}"})
        await websocket.close()
        return

    orchestrator = StreamingOrchestrator(asr_service, trans_service, websocket)
    finalized = False

    try:
        raw_msg = await websocket.receive_text()
        try:
            config = json.loads(raw_msg)
            # Direct text-to-text translation support
            if "text_to_translate" in config:
                txt = config["text_to_translate"].strip()
                src = config.get("source_language", "auto")
                tgt = config.get("target_language", "hi")
                if src == "auto":
                    from app.services.streaming_orchestrator import detect_script_language
                    detected = detect_script_language(txt)
                    if not detected:
                        from app.services.providers.sarvam import identify_text_language
                        detected = await identify_text_language(txt)
                    src = detected or "en"
                if src == tgt:
                    translated = txt
                else:
                    trans_res = await trans_service.translate_final(txt, src, tgt)
                    translated = trans_res.get("translated_text", txt)

                await websocket.send_json({
                    "type": "translation_final",
                    "status": "success",
                    "text": translated,
                    "translated_text": translated,
                    "language": src,
                    "target_language": tgt,
                    "is_final": True
                })
                await websocket.close()
                return

            if not all(k in config for k in [
                "session_id",
                "source_language",
                "target_language",
                "token",
            ]):
                raise ValueError("Missing config fields")
            if config["source_language"] != "auto" and config["source_language"] == config["target_language"]:
                raise ValueError("Source and target languages must be different")
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid initial configuration"})
            await websocket.close()
            return

        if config["source_language"] == "auto" and settings.TRANSLATION_PROVIDER != "sarvam":
            await websocket.send_json({
                "type": "error",
                "message": "Auto-detection requires TRANSLATION_PROVIDER=sarvam."
            })
            await websocket.close()
            return
            
        try:
            await orchestrator.handle_config(config)
        except Exception as e:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
            return

        while True:
            message = await websocket.receive()
            if "bytes" in message:
                chunk = message["bytes"]
                if not chunk: continue
                # Audio format validation handled inherently if provider requires it
                await orchestrator.process_audio(chunk)
            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                except Exception:
                    await websocket.send_json({"type": "error", "message": "Malformed client message"})
                    continue
                if data.get("type") == "end_utterance":
                    await orchestrator.finalize()
                    finalized = True
                    await persistence_queue.queue.join()
                    break
                elif "text_to_translate" in data:
                    txt = data["text_to_translate"].strip()
                    src = data.get("source_language") or orchestrator.source_lang or "auto"
                    tgt = data.get("target_language") or orchestrator.target_lang or "hi"
                    if src == "auto":
                        from app.services.streaming_orchestrator import detect_script_language
                        detected = detect_script_language(txt)
                        if not detected:
                            from app.services.providers.sarvam import identify_text_language
                            detected = await identify_text_language(txt)
                        src = detected or "en"
                    if src == tgt:
                        translated = txt
                    else:
                        trans_res = await trans_service.translate_final(txt, src, tgt)
                        translated = trans_res.get("translated_text", txt)
                    await websocket.send_json({
                        "type": "translation_final",
                        "status": "success",
                        "text": translated,
                        "translated_text": translated,
                        "language": src,
                        "target_language": tgt,
                        "is_final": True
                    })

    except WebSocketDisconnect:
        if not finalized:
            await orchestrator.finalize()
            await persistence_queue.queue.join()
    except Exception as e:
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
    finally:
        try:
            await asr_service.close()
        except Exception:
            logger.exception("Failed to close ASR provider")
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.close()
