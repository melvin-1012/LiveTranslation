import asyncio

class PersistenceQueue:
    def __init__(self):
        self.queue = asyncio.Queue()

    async def enqueue(self, event_type: str, data: dict):
        await self.queue.put({"type": event_type, "data": data})

    async def worker(self):
        while True:
            item = await self.queue.get()
            # db abstraction: call translation_db_service
            self.queue.task_done()

persistence_queue = PersistenceQueue()
