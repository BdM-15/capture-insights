"""MCP client wrapper for federal-contracting-mcps (sam-gov-mcp, usaspending-gov-mcp, etc.).

This allows the app to call live SAM.gov tools when the MCP servers are running locally
(via uvx or python -m from the 1102tools/federal-contracting-mcps repo).

For now, the /mcp/sam/opportunities uses direct API fallback (configured via SAM_API_KEY in .env).
When MCP is enabled and servers are connected, we can switch to rich MCP tools for better search,
saved searches, entity profiles, etc.

Usage (when ready):
- Run the MCP server: e.g. uvx sam-gov-mcp  (or follow package instructions)
- This client connects via stdio.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from .config import settings

# Placeholder for real MCP client.
# In a full impl:
# from mcp import ClientSession, StdioServerParameters
# from mcp.client.stdio import stdio_client

async def get_sam_mcp_client():
    """Return a connected MCP client for sam-gov if available.
    For now, returns None (direct API used in endpoint).
    """
    if not settings.enable_live_mcps:
        return None
    # TODO: implement stdio connection to sam-gov-mcp server
    # Example skeleton:
    # server_params = StdioServerParameters(
    #     command="uvx", args=["sam-gov-mcp"], env=None
    # )
    # async with stdio_client(server_params) as (read, write):
    #     async with ClientSession(read, write) as session:
    #         await session.initialize()
    #         return session
    return None


async def search_sam_opportunities_mcp(
    naics: str = "561210",
    keywords: str = "",
    notice_types: str = "",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Use MCP tool if connected, else return empty (caller falls back to direct)."""
    client = await get_sam_mcp_client()
    if not client:
        return []
    # Example: call tool "search_opportunities" with args
    # result = await client.call_tool("search_opportunities", {"naics": naics, "q": keywords, ...})
    # return result
    return []
