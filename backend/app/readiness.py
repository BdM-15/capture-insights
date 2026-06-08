"""Workstation readiness for /ready endpoint."""

from __future__ import annotations

import os
import urllib.request
from typing import Any, Dict

from .config import settings
from .deterministic.sam_budget import get_budget_status


def _sam_key_ok() -> bool:
    key = settings.sam_api_key or ""
    return bool(key) and not key.startswith("SAM-7fa8ffb7") and len(key) >= 20


async def get_readiness() -> Dict[str, Any]:
    from .mcp import MCP_AVAILABLE, list_sam_mcp_tools

    ollama_ready = False
    ollama_models: list = []
    try:
        req = urllib.request.Request(f"{settings.ollama_host}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            if resp.status == 200:
                import json
                data = json.loads(resp.read().decode())
                ollama_models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                ollama_ready = True
    except Exception:
        pass

    mcp_tools = 0
    mcp_ok = False
    if MCP_AVAILABLE and settings.enable_live_mcps:
        try:
            tools = await list_sam_mcp_tools(force_refresh=False)
            mcp_tools = len(tools or [])
            mcp_ok = mcp_tools > 0
        except Exception:
            pass

    duckdb_ready = os.path.exists(str(settings.duckdb_path))
    sam_budget = get_budget_status()

    checks = {
        "duckdb": duckdb_ready,
        "ollama": ollama_ready,
        "sam_key": _sam_key_ok(),
        "mcp": mcp_ok or not settings.enable_live_mcps,
    }
    all_core = checks["duckdb"] and (checks["ollama"] or not settings.enable_ai_features)

    return {
        "status": "ready" if all_core else "degraded",
        "env": settings.app_env,
        "duckdb_ready": duckdb_ready,
        "duckdb_path": str(settings.duckdb_path),
        "ollama_ready": ollama_ready,
        "ollama_model": settings.ollama_model,
        "ollama_models": ollama_models[:8],
        "ai_enabled": settings.enable_ai_features,
        "mcp_enabled": settings.enable_live_mcps,
        "mcp_tools_count": mcp_tools,
        "sam_api_configured": _sam_key_ok(),
        "sam_budget": sam_budget,
        "frontier_available": bool(settings.xai_api_key),
        "checks": checks,
    }