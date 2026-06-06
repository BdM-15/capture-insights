"""MCP *client* wrapper for https://github.com/1102tools/federal-contracting-mcps

IMPORTANT: We do **not** create custom MCP servers. We only consume the excellent battle-tested
ones from that repo (sam-gov-mcp for opportunities/solicitations/entities, usaspending-gov-mcp, etc.).

The app warms the catalog at startup (backend lifespan pre-calls list_sam_mcp_tools + cache).
First real button/chat action that needs live data will spawn on-demand via stdio (uvx).
No separate manual `uvx sam-gov-mcp` window is required for normal use (graceful fallback to direct REST).

(If you want a long-running external instance for perf: run it yourself and use ?refresh=1 on /mcp/tools.)

This client connects via stdio (official `mcp` Python SDK). See main.py lifespan, /mcp/tools, and the
button agentic action (/user/actions/create-sam-monitor) for integration.

When the server is not reachable we gracefully fall back to the direct SAM.gov REST API
(using SAM_API_KEY from your .env — see config.py).
"""

from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Optional

from .config import settings

try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False


_sam_mcp_session: Optional[ClientSession] = None
_sam_mcp_lock = asyncio.Lock()

# Simple process cache for tool list (the stdio connect + list_tools is expensive: spawns uvx + server init).
# Avoids making /health and every chat slow when the MCP server is not running (the common case until user wants live agentic).
_mcp_tools_cache: list[dict] | None = None
_mcp_tools_cache_ts: float = 0.0
_MCP_CACHE_TTL = 45.0  # seconds; fresh enough for dev, cheap to F5 /mcp/tools for update


async def get_sam_mcp_client() -> Optional[ClientSession]:
    """Return (or create) a connected MCP client session for sam-gov-mcp.

    NOTE: For reliability with stdio MCP servers we prefer on-demand connections
    inside context managers for each list_tools / call_tool (see helpers below).
    This legacy global is kept for backward compat but new code uses the _call / list funcs.
    """
    global _sam_mcp_session

    if not settings.enable_live_mcps or not MCP_AVAILABLE:
        return None

    async with _sam_mcp_lock:
        if _sam_mcp_session is not None:
            return _sam_mcp_session

        try:
            server_env = os.environ.copy()
            for key in ("SAM_API_KEY", "DATA_GOV_API_KEY"):
                if hasattr(settings, key.lower()) and getattr(settings, key.lower()):
                    server_env[key] = getattr(settings, key.lower())

            server_params = StdioServerParameters(
                command="uvx",
                args=["sam-gov-mcp"],
                env=server_env,
            )

            # Note: we intentionally do not keep a long-lived one here to avoid leaks;
            # the list_ and search_ helpers below use fresh proper async with per invocation.
            read, write = await stdio_client(server_params).__aenter__()
            session = ClientSession(read, write)
            await session.initialize()
            _sam_mcp_session = session
            return _sam_mcp_session
        except Exception as e:
            print(f"[mcp] Could not connect to sam-gov-mcp (will use direct API fallback): {e}")
            _sam_mcp_session = None
            return None


async def list_sam_mcp_tools(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Discover the tools exposed by sam-gov-mcp (from https://github.com/1102tools/federal-contracting-mcps).

    Returns list of {name, description, ...} or [] if MCP server not running / unavailable.
    This catalog is injected into the chat LLM context so the agentic co-pilot knows what admin
    actions it can perform on the user's behalf (user never calls MCP manually).

    Uses a short TTL cache so /health and chat sends are not blocked by repeated expensive
    uvx stdio spawns when the external MCP server is not running (the normal case).
    Call /mcp/tools? or pass force_refresh in dev when you just started the server.
    """
    import time
    global _mcp_tools_cache, _mcp_tools_cache_ts

    if not settings.enable_live_mcps or not MCP_AVAILABLE:
        return []

    now = time.time()
    if not force_refresh and _mcp_tools_cache is not None and (now - _mcp_tools_cache_ts) < _MCP_CACHE_TTL:
        return _mcp_tools_cache

    server_env = os.environ.copy()
    for key in ("SAM_API_KEY", "DATA_GOV_API_KEY"):
        if hasattr(settings, key.lower()) and getattr(settings, key.lower()):
            server_env[key] = getattr(settings, key.lower())

    server_params = StdioServerParameters(
        command="uvx",
        args=["sam-gov-mcp"],
        env=server_env,
    )

    tools: List[Dict[str, Any]] = []
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools_result = await session.list_tools()
                for t in getattr(tools_result, "tools", []) or []:
                    tools.append({
                        "name": getattr(t, "name", str(t)),
                        "description": getattr(t, "description", ""),
                        "input_schema": getattr(t, "inputSchema", None) or getattr(t, "input_schema", None),
                    })
        _mcp_tools_cache = tools
        _mcp_tools_cache_ts = now
        return tools
    except Exception as e:
        print(f"[mcp] list_sam_mcp_tools: server not reachable or error (cached empty for TTL): {e}")
        # Cache the empty to avoid hammering on every health/chat until TTL expires
        _mcp_tools_cache = []
        _mcp_tools_cache_ts = now
        return []


async def search_sam_opportunities_mcp(
    naics: str = "561210",
    keywords: str = "",
    notice_types: str = "",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Call the MCP 'search_opportunities' tool (preferred) via fresh on-demand stdio session.

    Falls back to [] (so main.py sam_opportunities can use direct REST).
    The LLM co-pilot (in /chat) is the one that decides to invoke this — user never uses MCP or uvx directly.
    """
    if not settings.enable_live_mcps or not MCP_AVAILABLE:
        return []

    server_env = os.environ.copy()
    for key in ("SAM_API_KEY", "DATA_GOV_API_KEY"):
        if hasattr(settings, key.lower()) and getattr(settings, key.lower()):
            server_env[key] = getattr(settings, key.lower())

    server_params = StdioServerParameters(
        command="uvx",
        args=["sam-gov-mcp"],
        env=server_env,
    )

    arguments: Dict[str, Any] = {"naics": naics, "limit": limit}
    if keywords:
        arguments["keywords"] = keywords
    if notice_types:
        arguments["notice_types"] = notice_types

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                # Try common / likely tool names from the 1102tools sam-gov-mcp (we only consume; inspect list_tools for exact)
                candidates = ["search_opportunities", "search", "get_opportunities", "search_sam_opportunities", "opportunities"]
                result = None
                used_name = None
                for tn in candidates:
                    try:
                        result = await session.call_tool(tn, arguments=arguments)
                        used_name = tn
                        break
                    except Exception:
                        continue
                if result is None:
                    # fall through to raw note
                    return [{"raw_mcp_result": "no matching search tool found in server; available via list_tools", "_source": "mcp:tool-mismatch"}]

                if hasattr(result, "content") and result.content:
                    import json
                    text = result.content[0].text if hasattr(result.content[0], "text") else str(result.content[0])
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, list):
                            for item in parsed:
                                if isinstance(item, dict):
                                    item.setdefault("_source", "mcp:sam-gov-mcp")
                            return parsed[:limit]
                        if isinstance(parsed, dict) and "opportunities" in parsed:
                            opps = parsed["opportunities"][:limit]
                            for o in opps:
                                if isinstance(o, dict): o.setdefault("_source", "mcp:sam-gov-mcp")
                            return opps
                    except Exception:
                        pass
                return [{"raw_mcp_result": str(result)[:400], "_source": "mcp:sam-gov-mcp"}]
    except Exception as e:
        print(f"[mcp] search_sam_opportunities_mcp error (will fallback to direct): {e}")
        return []
