"""Settings panel: connection inventory and live tests (Theseus-style)."""

from __future__ import annotations

import asyncio
import os
import time
import urllib.request
from typing import Any, Dict, List

import duckdb

from .api_keys import (
    is_bls_key_configured,
    is_data_gov_key_configured,
    is_sam_key_configured,
    is_xai_key_configured,
)
from .config import settings
from .federal_mcps import FEDERAL_MCP_SERVERS
from .mcp_client import (
    MCP_AVAILABLE,
    is_env_key_configured,
    missing_env_keys,
    test_mcp_server,
)


def _mask_key_status(env_key: str | None) -> Dict[str, Any]:
    if not env_key:
        return {"required": False, "configured": True}
    configured = is_env_key_configured(env_key)
    return {"required": True, "configured": configured, "env_var": env_key}


async def _test_duckdb() -> Dict[str, Any]:
    started = time.perf_counter()
    path = str(settings.duckdb_path)
    if not os.path.exists(path):
        return {"ok": False, "id": "duckdb", "name": "DuckDB", "error": f"File not found: {path}"}
    try:
        con = duckdb.connect(path, read_only=True)
        row = con.execute("SELECT COUNT(*) FROM information_schema.tables").fetchone()
        con.close()
        tables = int(row[0]) if row else 0
        return {
            "ok": True,
            "id": "duckdb",
            "name": "DuckDB",
            "detail": f"{tables} tables · {path}",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    except Exception as e:
        return {
            "ok": False,
            "id": "duckdb",
            "name": "DuckDB",
            "error": str(e)[:200],
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }


async def _test_ollama() -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        req = urllib.request.Request(f"{settings.ollama_host}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            import json
            data = json.loads(resp.read().decode()) if resp.status == 200 else {}
        models = [m.get("name") for m in data.get("models", []) if m.get("name")]
        target = settings.ollama_model
        has_target = any(target in (m or "") for m in models)
        return {
            "ok": True,
            "id": "ollama",
            "name": "Ollama",
            "detail": f"{len(models)} model(s) · target {target}{' ✓' if has_target else ' (pull with ollama run)'}",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    except Exception as e:
        return {
            "ok": False,
            "id": "ollama",
            "name": "Ollama",
            "error": f"{settings.ollama_host} unreachable — {e}",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }


async def _test_sam_api() -> Dict[str, Any]:
    started = time.perf_counter()
    if not is_sam_key_configured():
        return {
            "ok": False,
            "id": "sam_api",
            "name": "SAM.gov API key",
            "error": "SAM_API_KEY missing or placeholder in .env",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    from .deterministic.sam_budget import get_budget_status

    budget = get_budget_status()
    return {
        "ok": True,
        "id": "sam_api",
        "name": "SAM.gov API key",
        "detail": f"Key configured · daily budget {budget.get('remaining', '?')}/{budget.get('limit', '?')} remaining",
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }


async def _test_xai() -> Dict[str, Any]:
    started = time.perf_counter()
    if not is_xai_key_configured():
        return {
            "ok": False,
            "id": "xai",
            "name": "xAI Grok",
            "error": "XAI_API_KEY missing or placeholder in .env",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    try:
        req = urllib.request.Request(
            f"{settings.xai_base_url.rstrip('/')}/models",
            headers={"Authorization": f"Bearer {settings.xai_api_key}"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            ok = resp.status == 200
        return {
            "ok": ok,
            "id": "xai",
            "name": "xAI Grok",
            "detail": "API key accepted by x.ai",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    except Exception as e:
        return {
            "ok": False,
            "id": "xai",
            "name": "xAI Grok",
            "error": str(e)[:200],
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }


CORE_TESTERS = {
    "duckdb": _test_duckdb,
    "ollama": _test_ollama,
    "sam_api": _test_sam_api,
    "xai": _test_xai,
}


def build_connection_inventory() -> List[Dict[str, Any]]:
    """Static connection list for Settings UI (no live probe)."""
    items: List[Dict[str, Any]] = [
        {
            "id": "duckdb",
            "kind": "data",
            "name": "DuckDB",
            "description": "Local USASpending bulk store and capture analytics",
            "key": None,
            "testable": True,
        },
        {
            "id": "ollama",
            "kind": "llm",
            "name": "Ollama",
            "description": f"Local LLM at {settings.ollama_host} · model {settings.ollama_model}",
            "key": None,
            "testable": settings.enable_ai_features,
        },
        {
            "id": "sam_api",
            "kind": "api",
            "name": "SAM.gov API",
            "description": "Direct REST fallback when MCP is unavailable",
            "key": _mask_key_status("SAM_API_KEY"),
            "testable": True,
        },
    ]

    for spec in FEDERAL_MCP_SERVERS:
        env_key = spec.get("api_key")
        missing = missing_env_keys(env_key)
        items.append({
            "id": f"mcp:{spec['id']}",
            "kind": "mcp",
            "mcp_id": spec["id"],
            "name": spec["name"],
            "package": spec["package"],
            "category": spec["category"],
            "description": spec["use_when"],
            "integrated": bool(spec.get("integrated")),
            "key": _mask_key_status(env_key),
            "missing_keys": missing,
            "ready": len(missing) == 0,
            "testable": True,
        })

    items.append({
        "id": "xai",
        "kind": "llm",
        "name": "xAI Grok (optional)",
        "description": f"Cloud fallback via {settings.xai_base_url}",
        "key": {
            "required": False,
            "configured": is_xai_key_configured(),
            "env_var": "XAI_API_KEY",
        },
        "ready": is_xai_key_configured(),
        "testable": is_xai_key_configured(),
    })

    return items


async def test_connection(connection_id: str) -> Dict[str, Any]:
    if connection_id in CORE_TESTERS:
        return await CORE_TESTERS[connection_id]()

    if connection_id.startswith("mcp:"):
        server_id = connection_id[4:]
        return await test_mcp_server(server_id, force_refresh=True)

    return {"ok": False, "id": connection_id, "error": "Unknown connection"}


async def test_all_connections() -> Dict[str, Any]:
    inventory = build_connection_inventory()
    testable = [c["id"] for c in inventory if c.get("testable")]

    async def _run(cid: str) -> Dict[str, Any]:
        try:
            return await test_connection(cid)
        except Exception as e:
            return {"ok": False, "id": cid, "error": str(e)[:200]}

    results = await asyncio.gather(*[_run(cid) for cid in testable])
    ok_count = sum(1 for r in results if r.get("ok"))
    return {
        "ok": ok_count == len(results),
        "tested": len(results),
        "passed": ok_count,
        "failed": len(results) - ok_count,
        "results": results,
    }


async def get_settings_snapshot() -> Dict[str, Any]:
    from .readiness import get_readiness
    from .skill_runtime_settings import runtime_settings_dict

    readiness = await get_readiness()
    runtime = runtime_settings_dict()
    return {
        "version": settings.app_version,
        "env": settings.app_env,
        "enable_live_mcps": settings.enable_live_mcps,
        "enable_ai_features": settings.enable_ai_features,
        "mcp_sdk_available": MCP_AVAILABLE,
        "connections": build_connection_inventory(),
        "readiness": readiness,
        "skill_runtime": {
            "max_turns": runtime.get("max_turns"),
            "llm_timeout_seconds": runtime.get("llm_timeout_seconds"),
            "llm_max_tokens_per_turn": runtime.get("llm_max_tokens_per_turn"),
            "mcp_tool_call_timeout": runtime.get("mcp_tool_call_timeout"),
            "max_tool_result_chars": runtime.get("max_tool_result_chars"),
        },
        "keys": {
            "SAM_API_KEY": is_sam_key_configured(),
            "BLS_API_KEY": is_bls_key_configured(),
            "DATA_GOV_API_KEY": is_data_gov_key_configured(),
            "XAI_API_KEY": is_xai_key_configured(),
        },
        "note": "API key values are never returned. Set keys in .env and restart via scripts/start.ps1.",
    }