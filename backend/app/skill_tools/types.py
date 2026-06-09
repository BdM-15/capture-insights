"""Shared types for tools-mode skill runs."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict


class ToolError(Exception):
    """Raised when a skill tool cannot complete."""


@dataclass
class ToolResult:
    payload: Dict[str, Any]
    transcript_extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolContext:
    """Runtime context for deterministic skill tools (PR2)."""

    skill_name: str
    artifact_dir: Path
    mcp_sessions: Dict[str, Any] = field(default_factory=dict)
    artifact_rel_path: str = "competitive_intel_obligation.json"