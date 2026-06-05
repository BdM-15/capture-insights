"""
capture-insights FastAPI backend (local workstation API).

Serves typed endpoints for filters, data, summaries, chat, and profile generation.
Designed to be consumed by a local modern frontend (React/TS etc.) and/or CLI/MCP clients.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Local import so the early dev layout works without full package install
# (we can clean this up when we do proper packaging)
try:
    from .config import settings
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent))
    from config import settings

# Placeholder: real lifespan will init DuckDB, Chroma, MCP clients, Ollama health etc.
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[capture-insights] Starting backend v{settings.app_version} env={settings.app_env}")
    print(f"[capture-insights] Using single DuckDB at: {settings.duckdb_path}")
    # TODO: mcp_client_manager.start(), ollama health check, etc.
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
    ollama_ready: bool = False
    mcp_servers: list[str] = []


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> dict[str, Any]:
    """Basic health + readiness for local dev and monitoring."""
    # TODO: real checks (ping Ollama, list loaded MCP servers, etc.)
    return {
        "status": "ok",
        "version": settings.app_version,
        "env": settings.app_env,
        "duckdb_ready": os.path.exists(str(settings.duckdb_path)),
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


# --- Simple data endpoints (Chunk 2) ---
# These call the plain-English query functions above.
# The frontend (or future skills/agents) will call these.

from .queries import (
    get_market_summary,
    get_top_agencies,
    get_expiring_contracts,
    get_quick_opportunity_snapshot,
)


class SummaryResponse(BaseModel):
    naics_codes: List[str]
    total_actions: int
    total_millions: float
    avg_thousands: float
    earliest_date: str | None = None
    latest_date: str | None = None
    message: str | None = None


@app.get("/data/summary", response_model=SummaryResponse, tags=["data"])
async def data_summary(
    naics: str = "561210",  # comma separated ok: 561210,541512
    start: str | None = None,
    end: str | None = None,
):
    """Get high-level market numbers for the selected NAICS codes.

    Example browser call:
    http://127.0.0.1:8000/data/summary?naics=561210

    This is the foundation for dashboard cards.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    start_date = date.fromisoformat(start) if start else None
    end_date = date.fromisoformat(end) if end else None

    return get_market_summary(naics_list, start_date, end_date)


@app.get("/data/top-agencies", tags=["data"])
async def data_top_agencies(naics: str = "561210", limit: int = 10):
    """Top spending agencies for the NAICS codes.

    Helps you see where the money is actually flowing.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_top_agencies(naics_list, limit=limit)


@app.get("/data/expiring", tags=["data"])
async def data_expiring(naics: str = "561210", months: int = 24, limit: int = 15):
    """Contracts whose current performance period ends soon.

    These are the recompete opportunities you want to track early.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_expiring_contracts(naics_list, months_ahead=months, limit=limit)


@app.get("/data/snapshot", tags=["data"])
async def data_snapshot(naics: str = "561210"):
    """One convenient call that returns summary + top agencies + expiring.

    Great for a quick "tell me about this market" view that an AI agent or
    a future skill can consume.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    # For snapshot we just take the first NAICS for simplicity in this early version
    primary = naics_list[0] if naics_list else "561210"
    return get_quick_opportunity_snapshot(primary)


# TODO: Add more routers as we grow (chat, profile generation, stance, MCP tools, etc.)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
