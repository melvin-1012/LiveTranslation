
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
from app.core.config import settings
from app.services.persistence_queue import persistence_queue
from app.services.streaming_orchestrator import (
    StreamingOrchestrator,
    detect_script_language,
    get_provider_factory,
)

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

    async def translate_text_message(data: dict) -> None:
        text = (data.get("text_to_translate") or "").strip()
        source_language = data.get("source_language") or "auto"
        target_language = data.get("target_language") or "hi"
        if source_language == "auto":
            source_language = detect_script_language(text) or "en"

        if source_language == target_language:
            translated_text = text
        else:
            result = await trans_service.translate_final(
                text, source_language, target_language
            )
            translated_text = result.get("translated_text", text)

        await websocket.send_json({
            "type": "translation_final",
            "status": "success",
            "text": translated_text,
            "original_text": text,
            "translated_text": translated_text,
            "language": source_language,
            "detected_language": source_language,
            "source_language": source_language,
            "target_language": target_language,
            "is_final": True,
            "is_text_to_text": True,
        })

    try:
        raw_msg = await websocket.receive_text()
        try:
            config = json.loads(raw_msg)
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid initial configuration"})
            await websocket.close()
            return

        if "text_to_translate" in config:
            await translate_text_message(config)
            return

        if not all(k in config for k in [
            "session_id",
            "source_language",
            "target_language",
            "token",
        ]):
            await websocket.send_json({"type": "error", "message": "Invalid initial configuration"})
            await websocket.close()
            return

        if (
            config["source_language"] == "auto"
            and settings.TRANSLATION_PROVIDER != "sarvam"
        ):
            await websocket.send_json({
                "type": "error",
                "message": "Auto-detection requires TRANSLATION_PROVIDER=sarvam.",
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
                if "text_to_translate" in data:
                    await translate_text_message(data)

    except WebSocketDisconnect:
        if not finalized:
            try:
                await orchestrator.finalize()
                await persistence_queue.queue.join()
            except Exception:
                pass
    except Exception as e:
        logger.exception("WebSocket error")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except RuntimeError:
            pass # Already closed
    finally:
        try:
            await asr_service.close()
        except Exception:
            logger.exception("Failed to close ASR provider")
        
        try:
            await websocket.close()
        except RuntimeError:
            pass # Already closed
