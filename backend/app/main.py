from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# 1. Create the FastAPI app FIRST
app = FastAPI(
    title="AI Women's Security & Emergency Response API",
    version="0.1.0",
    description="Backend API for location-aware emergency response"
)

# 2. Add the startup task SECOND
@app.on_event("startup")
async def init_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Updated CORS Middleware allowing all origins and exposing headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"status": "ok", "service": "AI Women's Security API"}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)