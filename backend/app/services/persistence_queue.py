
import asyncio
import logging
from app.services.supabase_client import get_supabase_client
from app.services import translation_db_service

logger = logging.getLogger(__name__)

class PersistenceQueue:
    def __init__(self):
        self.queue = asyncio.Queue()

    async def enqueue(self, event_type: str, token: str, data: dict):
        await self.queue.put({"type": event_type, "token": token, "data": data})

    async def worker(self):
        while True:
            item = await self.queue.get()
            try:
                db = get_supabase_client(item["token"])
                event = item["type"]
                data = item["data"]
                
                if event == "store_asr_result":
                    translation_db_service.store_asr_result(
                        db,
                        data["utterance_id"],
                        data.get("model_name", "sarvam_asr"),
                        data["transcript"],
                        data.get("is_final", True),
                        data.get("language_id"),
                    )
                    if data.get("is_final"):
                        translation_db_service.update_utterance_transcript(
                            db,
                            data["utterance_id"],
                            data["transcript"],
                            data.get("language_id"),
                        )
                elif event == "store_translation_result":
                    res = translation_db_service.store_translation_result(
                        db, data["utterance_id"], data.get("model_name", "mock_translator"), 
                        data["translated_text"], data["version_number"], data["is_final"],
                        data.get("source_language_id"), data.get("target_language_id")
                    )
                    if data.get("is_final") and "metrics" in data:
                        # We pass metrics along in the queue item to save the second lookup
                        translation_id = res['id']
                        translation_db_service.store_translation_metrics(db, translation_id, data["metrics"])
                        
            except Exception as e:
                logger.error(f"Persistence Queue Error processing {item['type']}: {str(e)}")
            finally:
                self.queue.task_done()

persistence_queue = PersistenceQueue()
