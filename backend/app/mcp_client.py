"""Generic stdio MCP client for 1102tools federal-contracting-mcps packages."""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any, Dict, List, Optional

from .api_keys import is_env_key_configured as _is_env_key_configured
from .config import settings
from .federal_mcps import FEDERAL_MCP_SERVERS, get_mcp_server

try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False

ENV_TO_SETTING: Dict[str, str] = {
    "SAM_API_KEY": "sam_api_key",
    "DATA_GOV_API_KEY": "data_gov_api_key",
    "BLS_API_KEY": "bls_api_key",
    "REGULATIONS_GOV_API_KEY": "data_gov_api_key",
}

_MCP_TOOLS_CACHE: Dict[str, tuple[List[Dict[str, Any]], float]] = {}
_MCP_CACHE_TTL = 45.0


def is_env_key_configured(env_key: str | None) -> bool:
    return _is_env_key_configured(env_key)


def missing_env_keys(env_key: str | None) -> List[str]:
    if not env_key:
        return []
    return [] if is_env_key_configured(env_key) else [env_key]


def build_mcp_server_env(env_key: str | None) -> dict[str, str]:
    server_env = os.environ.copy()
    if not env_key:
        return server_env
    attr = ENV_TO_SETTING.get(env_key)
    if attr:
        val = getattr(settings, attr, None)
        if val:
            server_env[env_key] = val
    if env_key == "DATA_GOV_API_KEY":
        val = settings.data_gov_api_key
        if val:
            server_env["DATA_GOV_API_KEY"] = val
            server_env["REGULATIONS_GOV_API_KEY"] = val
    if env_key == "SAM_API_KEY":
        val = settings.sam_api_key
        if val:
            server_env["SAM_API_KEY"] = val
        dg = settings.data_gov_api_key
        if dg:
            server_env["DATA_GOV_API_KEY"] = dg
    return server_env


def _uvx_args(spec: Dict[str, Any]) -> List[str]:
    package = spec["package"]
    executable = spec.get("executable") or package
    if executable != package:
        return ["--from", package, executable]
    return [package]


def _tool_dict(tool: Any, server_id: str, server_name: str) -> Dict[str, Any]:
    return {
        "name": getattr(tool, "name", str(tool)),
        "description": getattr(tool, "description", ""),
        "input_schema": getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None),
        "server_id": server_id,
        "server_name": server_name,
    }


async def list_mcp_tools_for_server(
    server_id: str,
    *,
    force_refresh: bool = False,
    cache_ttl: float = _MCP_CACHE_TTL,
) -> List[Dict[str, Any]]:
    """Discover tools for a catalogued 1102 MCP via on-demand uvx stdio."""
    spec = get_mcp_server(server_id)
    if not spec:
        return []
    if not settings.enable_live_mcps or not MCP_AVAILABLE:
        return []

    now = time.time()
    cached = _MCP_TOOLS_CACHE.get(server_id)
    if not force_refresh and cached and (now - cached[1]) < cache_ttl:
        return cached[0]

    server_name = spec["name"]
    server_env = build_mcp_server_env(spec.get("api_key"))

    tools: List[Dict[str, Any]] = []
    try:
        server_params = StdioServerParameters(command="uvx", args=_uvx_args(spec), env=server_env)
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools_result = await session.list_tools()
                for t in getattr(tools_result, "tools", []) or []:
                    tools.append(_tool_dict(t, server_id, server_name))
        _MCP_TOOLS_CACHE[server_id] = (tools, now)
        return tools
    except Exception as e:
        print(f"[mcp] list_mcp_tools_for_server({server_id}): {e}")
        _MCP_TOOLS_CACHE[server_id] = ([], now)
        return []


async def test_mcp_server(
    server_id: str,
    *,
    force_refresh: bool = True,
    timeout: float | None = None,
) -> Dict[str, Any]:
    """Spawn MCP, handshake, list tools — for Settings connection tests."""
    if timeout is None:
        try:
            from .skill_runtime_settings import skill_tools_runtime_limits
            timeout = skill_tools_runtime_limits().mcp_tool_call_timeout
        except Exception:
            timeout = 90.0

    spec = get_mcp_server(server_id)
    if not spec:
        return {"ok": False, "id": server_id, "error": "Unknown MCP server"}

    missing = missing_env_keys(spec.get("api_key"))
    if missing:
        return {
            "ok": False,
            "id": server_id,
            "name": spec["name"],
            "error": f"Missing API key: {', '.join(missing)}",
            "missing_keys": missing,
        }

    if not settings.enable_live_mcps:
        return {"ok": False, "id": server_id, "name": spec["name"], "error": "Live MCPs disabled (ENABLE_LIVE_MCPS=false)"}
    if not MCP_AVAILABLE:
        return {"ok": False, "id": server_id, "name": spec["name"], "error": "Python mcp package not installed"}

    started = time.perf_counter()
    try:
        tools = await asyncio.wait_for(
            list_mcp_tools_for_server(server_id, force_refresh=force_refresh, cache_ttl=0),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        return {
            "ok": False,
            "id": server_id,
            "name": spec["name"],
            "error": f"Timed out after {int(timeout)}s (first uvx download can be slow)",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    except Exception as e:
        return {
            "ok": False,
            "id": server_id,
            "name": spec["name"],
            "error": str(e)[:300],
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }

    latency_ms = int((time.perf_counter() - started) * 1000)
    if not tools:
        return {
            "ok": False,
            "id": server_id,
            "name": spec["name"],
            "error": "Handshake failed or server returned zero tools",
            "latency_ms": latency_ms,
        }

    sample = [t.get("name", "") for t in tools[:8] if t.get("name")]
    return {
        "ok": True,
        "id": server_id,
        "name": spec["name"],
        "tool_count": len(tools),
        "sample_tools": sample,
        "latency_ms": latency_ms,
    }


async def discover_integrated_mcp_tools(
    *,
    force_refresh: bool = False,
) -> Dict[str, List[Dict[str, Any]]]:
    """List tools for all integrated MCP servers (parallel)."""
    integrated = [s for s in FEDERAL_MCP_SERVERS if s.get("integrated")]
    if not integrated:
        return {}

    async def _one(spec: dict) -> tuple[str, List[Dict[str, Any]]]:
        sid = spec["id"]
        tools = await list_mcp_tools_for_server(sid, force_refresh=force_refresh)
        return sid, tools

    pairs = await asyncio.gather(*[_one(s) for s in integrated], return_exceptions=True)
    out: Dict[str, List[Dict[str, Any]]] = {}
    for item in pairs:
        if isinstance(item, Exception):
            continue
        sid, tools = item
        if tools:
            out[sid] = tools
    return out