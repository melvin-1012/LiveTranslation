
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
from app.services.persistence_queue import persistence_queue
from app.api.endpoints import sessions, utterances, ws, glossary

@asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task = asyncio.create_task(persistence_queue.worker())
    yield
    worker_task.cancel()

app = FastAPI(title="Live Translation API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(utterances.router, prefix="/sessions", tags=["utterances"]) # Note prefix
app.include_router(ws.router, prefix="/ws", tags=["websocket"])
app.include_router(glossary.router, prefix="/glossary", tags=["glossary"])
