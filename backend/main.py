import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.llm import stream_chat

load_dotenv()

app = FastAPI(title="Thinking Buddy")


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str


@app.post("/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        stream_chat(req.messages, req.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/models")
async def get_models():
    raw = os.getenv(
        "AVAILABLE_MODELS",
        "anthropic/claude-3.5-sonnet:online,openai/gpt-4o:online",
    )
    models = [m.strip() for m in raw.split(",") if m.strip()]
    default = os.getenv("DEFAULT_MODEL", "").strip() or models[0]
    # If DEFAULT_MODEL isn't in the list, prepend it so it's always selectable
    if default not in models:
        models.insert(0, default)
    return {"models": models, "default": default}


@app.get("/")
async def root():
    return FileResponse("frontend/index.html")


app.mount("/static", StaticFiles(directory="frontend"), name="static")
