"""MCP *client* wrapper for https://github.com/1102tools/federal-contracting-mcps

IMPORTANT: We do **not** create custom MCP servers. We only consume the excellent battle-tested
ones from that repo (sam-gov-mcp for opportunities/solicitations/entities, usaspending-gov-mcp, etc.).

Run the desired server(s) in a separate terminal/window:
  uvx sam-gov-mcp
  # (or uvx --from git+https://github.com/1102tools/federal-contracting-mcps sam-gov-mcp if not on pypi yet)

This client connects to it via stdio (using the official `mcp` Python SDK).

When the server is not running we gracefully fall back to the direct SAM.gov REST API
(using SAM_API_KEY from your .env — see config.py).

See also the endpoint in main.py and usage in the Future Opportunities tab.
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


async def get_sam_mcp_client() -> Optional[ClientSession]:
    """Return (or create) a connected MCP client session for sam-gov-mcp.

    Connects via stdio to the external MCP server (run `uvx sam-gov-mcp` separately).
    Returns None if MCP not available or server not running (caller should fallback).
    """
    global _sam_mcp_session

    if not settings.enable_live_mcps or not MCP_AVAILABLE:
        return None

    async with _sam_mcp_lock:
        if _sam_mcp_session is not None:
            # Basic liveness check could be added here
            return _sam_mcp_session

        try:
            # Use the battle-tested servers from https://github.com/1102tools/federal-contracting-mcps
            # Run separately: uvx sam-gov-mcp   (or uvx --from git+https://github.com/1102tools/federal-contracting-mcps sam-gov-mcp)
            # The client here only *consumes* them via stdio — we do not implement MCP servers.
            server_env = os.environ.copy()
            # Ensure keys from our .env are visible to the child MCP process
            for key in ("SAM_API_KEY", "DATA_GOV_API_KEY"):
                if hasattr(settings, key.lower()) and getattr(settings, key.lower()):
                    server_env[key] = getattr(settings, key.lower())

            server_params = StdioServerParameters(
                command="uvx",
                args=["sam-gov-mcp"],
                env=server_env,
            )

            read, write = await stdio_client(server_params).__aenter__()
            session = ClientSession(read, write)
            await session.initialize()

            # Optionally list tools for debugging / validation
            # tools = await session.list_tools()
            # print("Connected to sam-gov-mcp, tools:", [t.name for t in tools.tools])

            _sam_mcp_session = session
            return _sam_mcp_session
        except Exception as e:
            # Server not running, wrong command, missing deps, etc. — graceful fallback
            # In production you might log at debug level.
            print(f"[mcp] Could not connect to sam-gov-mcp (will use direct API fallback): {e}")
            _sam_mcp_session = None
            return None


async def search_sam_opportunities_mcp(
    naics: str = "561210",
    keywords: str = "",
    notice_types: str = "",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Call the MCP tool if a sam-gov-mcp server is connected.

    Expected tool name in the 1102tools package is typically "search_opportunities"
    (or similar — adjust the name below after running the server and inspecting tools).
    Falls back to returning [] so the direct-API path in the endpoint is used.
    """
    session = await get_sam_mcp_client()
    if not session:
        return []

    try:
        # Build arguments matching what the MCP tool expects.
        # Common shape for these MCPs: pass filters as dict.
        arguments: Dict[str, Any] = {
            "naics": naics,
            "limit": limit,
        }
        if keywords:
            arguments["keywords"] = keywords  # or "q"
        if notice_types:
            arguments["notice_types"] = notice_types  # or "noticeType"

        # The actual tool name may be "search_opportunities" or "search".
        # You can discover it by temporarily uncommenting list_tools above and checking the name.
        result = await session.call_tool("search_opportunities", arguments=arguments)

        # MCP results are usually in result.content (text or structured).
        # The sam-gov-mcp typically returns list of opportunity dicts.
        # Adapt parsing as needed once you have a live connection.
        if hasattr(result, "content") and result.content:
            # Many MCPs return JSON text in the first content item
            import json
            text = result.content[0].text if hasattr(result.content[0], "text") else str(result.content[0])
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return parsed[:limit]
                if isinstance(parsed, dict) and "opportunities" in parsed:
                    return parsed["opportunities"][:limit]
            except Exception:
                pass

        # Fallback: return raw if we can't parse
        return [{"raw_mcp_result": str(result)[:500]}]
    except Exception as e:
        print(f"[mcp] search_opportunities_mcp error (falling back): {e}")
        return []
