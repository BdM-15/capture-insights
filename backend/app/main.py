"""
capture-insights FastAPI backend (local workstation API).

Serves typed endpoints for filters, data, summaries, chat, and profile generation.
Designed to be consumed by a local modern frontend (React/TS etc.) and/or CLI/MCP clients.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from capture_insights.config import settings

# Placeholder: real lifespan will init DuckDB, Chroma, MCP clients, Ollama health etc.
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[capture-insights] Starting backend v{settings.app_version} env={settings.app_env}")
    print(f"[capture-insights] DuckDB: {settings.duckdb_path}")
    print(f"[capture-insights] Chroma:  {settings.chroma_path}")
    # TODO: connect_duckdb(), init_chroma(), mcp_client_manager.start(), ollama health check
    yield
    print("[capture-insights] Shutting down...")


app = FastAPI(
    title="capture-insights API",
    description="Local privacy-first federal contract intelligence workstation API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for local frontend dev (tighten in prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    version: str
    env: str
    duckdb_ready: bool = False
    chroma_ready: bool = False
    ollama_ready: bool = False
    mcp_servers: list[str] = []


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> dict[str, Any]:
    """Basic health + readiness for local dev and monitoring."""
    # TODO: real checks
    return {
        "status": "ok",
        "version": settings.app_version,
        "env": settings.app_env,
        "duckdb_ready": os.path.exists(settings.duckdb_path) if settings.duckdb_path else False,
        "chroma_ready": os.path.isdir(settings.chroma_path) if settings.chroma_path else False,
        "ollama_ready": False,  # TODO: ping Ollama
        "mcp_servers": [],  # TODO: list connected federal-contracting MCPs etc.
    }


@app.get("/", tags=["system"])
async def root():
    return {
        "name": "capture-insights",
        "message": "Local federal contract capture intelligence workstation. See /docs for OpenAPI.",
        "docs": "/docs",
        "health": "/health",
    }


# TODO routers:
# from .routers import filters, awards, chat, profiles, mcp, stance
# app.include_router(...)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("capture_insights.backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
