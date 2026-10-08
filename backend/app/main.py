from fastapi import FastAPI
from app.api.endpoints import sessions, utterances, glossary, evaluation, ws

app = FastAPI(title="Live Translation API")

app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(utterances.router, prefix="/utterances", tags=["utterances"])
app.include_router(glossary.router, prefix="/glossary", tags=["glossary"])
app.include_router(evaluation.router, prefix="/evaluation", tags=["evaluation"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])

@app.get("/")
def read_root():
    return {"message": "Live Translation API Running"}
