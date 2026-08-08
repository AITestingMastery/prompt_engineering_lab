"""
FastAPI application assembly for Prompt Bench.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ANTHROPIC_MODEL
from routes import router

app = FastAPI(title="Prompt Bench API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "model": ANTHROPIC_MODEL}
