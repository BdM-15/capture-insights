"""Keep one MCP stdio session open for multi-call skill runs."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict

from ..config import settings
from ..federal_mcps import get_mcp_server
from ..mcp_client import MCP_AVAILABLE, _uvx_args, build_mcp_server_env
from ..skill_runtime_settings import skill_tools_runtime_limits

try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
except ImportError:
    ClientSession = None  # type: ignore
    StdioServerParameters = None  # type: ignore
    stdio_client = None  # type: ignore


class MCPError(Exception):
    """MCP spawn, handshake, or tool-call failure."""


def _extract_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                text = block.get("text")
                if text:
                    parts.append(str(text))
            else:
                text = getattr(block, "text", None)
                if text:
                    parts.append(str(text))
    return "\n".join(parts)


class McpRunSession:
    """Adapter matching Theseus MCPSession.call_tool(text) contract."""

    def __init__(self, server_id: str, session: Any):
        self.server_id = server_id
        self._session = session

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        from ..skill_run_store import active_tracker

        limits = skill_tools_runtime_limits()
        tracker = active_tracker()
        if tracker:
            tracker.step_begin(
                f"MCP {self.server_id}:{tool_name}",
                kind="tool",
                input_summary=str(arguments or {})[:400],
            )
        try:
            result = await asyncio.wait_for(
                self._session.call_tool(tool_name, arguments or {}),
                timeout=limits.mcp_tool_call_timeout,
            )
        except asyncio.TimeoutError as exc:
            if tracker:
                tracker.step_end(status="error", output_summary="timeout")
            raise MCPError(
                f"MCP {self.server_id} tool {tool_name!r} timed out after {limits.mcp_tool_call_timeout}s"
            ) from exc

        is_error = bool(getattr(result, "isError", False))
        text = _extract_text(getattr(result, "content", None))
        if is_error:
            if tracker:
                tracker.step_end(status="error", output_summary=(text or "tool error")[:500])
            raise MCPError(f"MCP tool {tool_name} error: {text or '(no detail)'}")
        if not text:
            try:
                text = json.dumps(getattr(result, "structuredContent", None) or {})
            except Exception:
                text = ""
        if tracker:
            tracker.step_end(
                status="ok",
                output_summary=(text or "")[:500],
                detail={"server_id": self.server_id, "tool": tool_name},
            )
        return text


@asynccontextmanager
async def open_mcp_session(server_id: str) -> AsyncIterator[McpRunSession]:
    if not MCP_AVAILABLE or stdio_client is None or ClientSession is None:
        raise MCPError("Python mcp package not installed")
    if not settings.enable_live_mcps:
        raise MCPError("Live MCPs disabled (ENABLE_LIVE_MCPS=false)")

    spec = get_mcp_server(server_id)
    if not spec:
        raise MCPError(f"Unknown MCP server: {server_id}")

    limits = skill_tools_runtime_limits()
    server_env = build_mcp_server_env(spec.get("api_key"))
    server_params = StdioServerParameters(
        command="uvx",
        args=_uvx_args(spec),
        env=server_env,
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=limits.mcp_handshake_timeout)
            yield McpRunSession(server_id, session)