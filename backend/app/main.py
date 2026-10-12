import logging
import os
import traceback
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api.v1.routes import api_router
from app.db.base import Base
from app.db.session import engine

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class ChatRequest(BaseModel):
    message: str


try:
    from google import genai
    from google.genai import types
except Exception as exc:  # pragma: no cover
    logger.warning("google-genai import failed: %s", exc)
    genai = None
    types = None


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


app = FastAPI(
    title="AI Women's Security & Emergency Response API",
    version="0.1.0",
    description="Backend API for location-aware emergency response"
)


@app.on_event("startup")
async def init_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.post("/api/chat")
async def api_chat(payload: ChatRequest):
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    logger.info("Incoming chat request received. Message length: %s", len(message))

    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY is not configured on the backend.")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the backend.")

    if genai is None or types is None:
        logger.error("google-genai package is not installed or failed to import.")
        raise HTTPException(status_code=500, detail="google-genai is not installed or failed to import.")

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        system_instruction = (
            "You are a calm, helpful, and empowering Women Safety Assistant. "
            "Give practical advice on personal safety, emergency preparedness, legal rights, "
            "domestic safety, harassment prevention, documentation strategies, immediate actions, "
            "and how to contact trusted help. Keep responses reassuring, clear, and actionable. "
            "Avoid judgmental language. Encourage reaching out to trusted people, local authorities, "
            "or emergency services when the situation is urgent."
        )

        logger.info("Calling Gemini model %s for chat response.", GEMINI_MODEL)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=message,
            config=types.GenerateContentConfig(system_instruction=system_instruction),
        )

        reply = getattr(response, "text", None) or str(response)
        logger.info("Gemini response returned successfully.")
        return {"reply": reply.strip()}
    except Exception as exc:
        logger.exception("Gemini chat generation failed. Full stack trace follows:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(exc)}") from exc


@app.get("/")
async def root():
    return {"status": "ok", "service": "AI Women's Security API"}


@app.get("/api/chat/health")
async def chat_health():
    return {
        "status": "ok" if GEMINI_API_KEY else "configuration_error",
        "configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)