"""Global skill runtime caps — Theseus-style tools-mode ceilings for capture-insights.

Persisted to data/settings/skill_runtime.json (UI-editable, no restart).
Optional .env overrides take precedence when set (SKILL_TOOLS_* keys).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from pydantic import BaseModel, Field

from .config import settings as app_settings
from .skill_registry import SkillRecord

logger = logging.getLogger(__name__)

_SETTINGS_PATH = app_settings.duckdb_path.parent / "settings" / "skill_runtime.json"

# Recommended defaults — slightly more headroom than Theseus for local Ollama + MCP payloads.
DEFAULTS: Dict[str, int | float] = {
    "max_turns": 30,
    "llm_timeout_seconds": 300.0,
    "llm_max_tokens_per_turn": 8192,
    "mcp_handshake_timeout": 20.0,
    "mcp_tool_call_timeout": 120.0,
    "mcp_shutdown_timeout": 5.0,
    "max_tool_result_chars": 48_000,
    "max_read_bytes": 500_000,
    "max_write_bytes": 8_000_000,
    "max_script_seconds": 180,
    "max_kg_entities_per_type": 80,
    "max_kg_chunks": 50,
    "max_kg_chunks_per_entity": 8,
    "max_kg_relationships_per_entity": 30,
    # Deterministic collectors (competitive-intel IDIQ rollups)
    "idv_page_limit": 25,
    "max_idv_pages": 200,
    "transaction_page_limit": 5000,
    "max_transaction_pages": 80,
    "max_orders_per_vehicle": 250,
}

_BOUNDS: Dict[str, tuple[float, float]] = {
    "max_turns": (1, 500),
    "llm_timeout_seconds": (1.0, 3600.0),
    "llm_max_tokens_per_turn": (256, 32_768),
    "mcp_handshake_timeout": (0.1, 3600.0),
    "mcp_tool_call_timeout": (0.1, 3600.0),
    "mcp_shutdown_timeout": (0.1, 3600.0),
    "max_tool_result_chars": (500, 2_000_000),
    "max_read_bytes": (1_000, 5_000_000),
    "max_write_bytes": (1_000, 20_000_000),
    "max_script_seconds": (1, 86_400),
    "max_kg_entities_per_type": (1, 5_000),
    "max_kg_chunks": (1, 5_000),
    "max_kg_chunks_per_entity": (0, 500),
    "max_kg_relationships_per_entity": (0, 500),
    "idv_page_limit": (1, 500),
    "max_idv_pages": (1, 2000),
    "transaction_page_limit": (10, 5000),
    "max_transaction_pages": (1, 500),
    "max_orders_per_vehicle": (1, 2000),
}

_ENV_KEYS: Dict[str, str] = {
    "max_turns": "SKILL_TOOLS_MAX_TURNS",
    "llm_timeout_seconds": "SKILL_TOOLS_LLM_TIMEOUT",
    "llm_max_tokens_per_turn": "SKILL_TOOLS_LLM_MAX_TOKENS",
    "mcp_handshake_timeout": "MCP_HANDSHAKE_TIMEOUT",
    "mcp_tool_call_timeout": "MCP_TOOL_CALL_TIMEOUT",
    "mcp_shutdown_timeout": "MCP_SHUTDOWN_TIMEOUT",
    "max_tool_result_chars": "SKILL_TOOLS_MAX_TOOL_RESULT_CHARS",
    "max_read_bytes": "SKILL_TOOLS_MAX_READ_BYTES",
    "max_write_bytes": "SKILL_TOOLS_MAX_WRITE_BYTES",
    "max_script_seconds": "SKILL_TOOLS_MAX_SCRIPT_SECONDS",
    "max_kg_entities_per_type": "SKILL_TOOLS_MAX_KG_ENTITIES_PER_TYPE",
    "max_kg_chunks": "SKILL_TOOLS_MAX_KG_CHUNKS",
    "max_kg_chunks_per_entity": "SKILL_TOOLS_MAX_CHUNKS_PER_ENTITY",
    "max_kg_relationships_per_entity": "SKILL_TOOLS_MAX_RELATIONSHIPS_PER_ENTITY",
    "idv_page_limit": "SKILL_COLLECTOR_IDV_PAGE_LIMIT",
    "max_idv_pages": "SKILL_COLLECTOR_MAX_IDV_PAGES",
    "transaction_page_limit": "SKILL_COLLECTOR_TX_PAGE_LIMIT",
    "max_transaction_pages": "SKILL_COLLECTOR_MAX_TX_PAGES",
    "max_orders_per_vehicle": "SKILL_COLLECTOR_MAX_ORDERS",
}


@dataclass(frozen=True)
class CollectorPaginationLimits:
    """Pagination for deterministic USAspending vehicle collectors."""

    idv_page_limit: int
    max_idv_pages: int
    transaction_page_limit: int
    max_transaction_pages: int
    max_orders_per_vehicle: int


@dataclass(frozen=True)
class SkillToolsRuntimeLimits:
    """Process-wide hard caps for tools-mode skill runs."""

    max_turns: int
    llm_timeout_seconds: float
    llm_max_tokens_per_turn: int
    mcp_handshake_timeout: float
    mcp_tool_call_timeout: float
    mcp_shutdown_timeout: float
    max_tool_result_chars: int
    max_read_bytes: int
    max_write_bytes: int
    max_script_seconds: int
    max_kg_entities_per_type: int
    max_kg_chunks: int
    max_kg_chunks_per_entity: int
    max_kg_relationships_per_entity: int


class SkillRuntimeSettingsUpdate(BaseModel):
    max_turns: Optional[int] = Field(default=None, ge=1, le=500)
    llm_timeout_seconds: Optional[float] = Field(default=None, ge=1.0, le=3600.0)
    llm_max_tokens_per_turn: Optional[int] = Field(default=None, ge=256, le=32_768)
    mcp_handshake_timeout: Optional[float] = Field(default=None, ge=0.1, le=3600.0)
    mcp_tool_call_timeout: Optional[float] = Field(default=None, ge=0.1, le=3600.0)
    mcp_shutdown_timeout: Optional[float] = Field(default=None, ge=0.1, le=3600.0)
    max_tool_result_chars: Optional[int] = Field(default=None, ge=500, le=2_000_000)
    max_read_bytes: Optional[int] = Field(default=None, ge=1_000, le=5_000_000)
    max_write_bytes: Optional[int] = Field(default=None, ge=1_000, le=20_000_000)
    max_script_seconds: Optional[int] = Field(default=None, ge=1, le=86_400)
    max_kg_entities_per_type: Optional[int] = Field(default=None, ge=1, le=5_000)
    max_kg_chunks: Optional[int] = Field(default=None, ge=1, le=5_000)
    max_kg_chunks_per_entity: Optional[int] = Field(default=None, ge=0, le=500)
    max_kg_relationships_per_entity: Optional[int] = Field(default=None, ge=0, le=500)
    idv_page_limit: Optional[int] = Field(default=None, ge=1, le=500)
    max_idv_pages: Optional[int] = Field(default=None, ge=1, le=2000)
    transaction_page_limit: Optional[int] = Field(default=None, ge=10, le=5000)
    max_transaction_pages: Optional[int] = Field(default=None, ge=1, le=500)
    max_orders_per_vehicle: Optional[int] = Field(default=None, ge=1, le=2000)


def _clamp(key: str, value: int | float) -> int | float:
    lo, hi = _BOUNDS[key]
    if isinstance(DEFAULTS[key], int) and not isinstance(value, bool):
        return int(max(lo, min(hi, int(value))))
    return float(max(lo, min(hi, float(value))))


def _read_json_overrides() -> Dict[str, int | float]:
    path = _SETTINGS_PATH
    if not path.is_file():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            return {}
        out: Dict[str, int | float] = {}
        for key in DEFAULTS:
            if key in loaded and loaded[key] is not None:
                out[key] = _clamp(key, loaded[key])
        return out
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("Failed reading %s: %s", path, exc)
        return {}


def _read_env_override(key: str) -> int | float | None:
    env_key = _ENV_KEYS.get(key)
    if not env_key:
        return None
    raw = os.getenv(env_key, "").strip()
    if not raw:
        return None
    try:
        if isinstance(DEFAULTS[key], int):
            return _clamp(key, int(raw))
        return _clamp(key, float(raw))
    except ValueError:
        return None


def runtime_settings_dict() -> Dict[str, int | float]:
    """Effective settings: defaults ← JSON file ← .env overrides."""
    merged = dict(DEFAULTS)
    merged.update(_read_json_overrides())
    for key in DEFAULTS:
        env_val = _read_env_override(key)
        if env_val is not None:
            merged[key] = env_val
    return merged


def collector_pagination_limits() -> CollectorPaginationLimits:
    data = runtime_settings_dict()
    return CollectorPaginationLimits(
        idv_page_limit=int(data["idv_page_limit"]),
        max_idv_pages=int(data["max_idv_pages"]),
        transaction_page_limit=int(data["transaction_page_limit"]),
        max_transaction_pages=int(data["max_transaction_pages"]),
        max_orders_per_vehicle=int(data["max_orders_per_vehicle"]),
    )


def skill_tools_runtime_limits() -> SkillToolsRuntimeLimits:
    data = runtime_settings_dict()
    return SkillToolsRuntimeLimits(
        max_turns=int(data["max_turns"]),
        llm_timeout_seconds=float(data["llm_timeout_seconds"]),
        llm_max_tokens_per_turn=int(data["llm_max_tokens_per_turn"]),
        mcp_handshake_timeout=float(data["mcp_handshake_timeout"]),
        mcp_tool_call_timeout=float(data["mcp_tool_call_timeout"]),
        mcp_shutdown_timeout=float(data["mcp_shutdown_timeout"]),
        max_tool_result_chars=int(data["max_tool_result_chars"]),
        max_read_bytes=int(data["max_read_bytes"]),
        max_write_bytes=int(data["max_write_bytes"]),
        max_script_seconds=int(data["max_script_seconds"]),
        max_kg_entities_per_type=int(data["max_kg_entities_per_type"]),
        max_kg_chunks=int(data["max_kg_chunks"]),
        max_kg_chunks_per_entity=int(data["max_kg_chunks_per_entity"]),
        max_kg_relationships_per_entity=int(data["max_kg_relationships_per_entity"]),
    )


def runtime_settings_snapshot() -> Dict[str, Any]:
    """Payload for Settings UI."""
    data = runtime_settings_dict()
    env_locked = [key for key in DEFAULTS if _read_env_override(key) is not None]
    return {
        "settings": data,
        "defaults": dict(DEFAULTS),
        "env_locked": env_locked,
        "storage_path": str(_SETTINGS_PATH),
        "note": (
            "Global ceilings for tools-mode skills. Effective turns = min(skill max_turns, global max_turns). "
            "Raise caps here if runs truncate; smaller atomic skills need fewer turns. "
            ".env overrides lock fields until removed."
        ),
    }


def write_runtime_settings(updates: Mapping[str, int | float]) -> Dict[str, int | float]:
    current = runtime_settings_dict()
    # Start from JSON layer only (not env) for writable base
    base = dict(DEFAULTS)
    base.update(_read_json_overrides())
    for key, value in updates.items():
        if key in DEFAULTS and value is not None:
            base[key] = _clamp(key, value)
    path = _SETTINGS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(base, indent=2), encoding="utf-8")
    tmp.replace(path)
    return runtime_settings_dict()


def reset_runtime_settings() -> Dict[str, int | float]:
    path = _SETTINGS_PATH
    if path.is_file():
        try:
            path.unlink()
        except OSError as exc:
            logger.warning("Failed removing %s: %s", path, exc)
    return runtime_settings_dict()


def effective_max_turns(skill: SkillRecord | None) -> int:
    """Per-skill budget capped by global ceiling — prevents runaway and honors skill metadata."""
    global_cap = int(runtime_settings_dict()["max_turns"])
    if not skill:
        return global_cap
    skill_budget = skill.max_turns
    if skill_budget <= 0:
        return global_cap
    return min(skill_budget, global_cap)


def truncate_tool_result(text: str) -> tuple[str, bool]:
    """Truncate MCP/tool payloads to max_tool_result_chars with visible marker."""
    cap = skill_tools_runtime_limits().max_tool_result_chars
    if len(text) <= cap:
        return text, False
    marker = f"\n\n[… truncated to {cap} chars — raise Tool Result Chars in Settings → Skill Runtime]"
    keep = max(0, cap - len(marker))
    return text[:keep] + marker, True