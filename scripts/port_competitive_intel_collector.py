"""Port Theseus tool_competitive_intel.py into capture-insights skill_tools."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\benma\govcon-capture-vibe\src\skills\tool_competitive_intel.py")
DST = ROOT / "backend" / "app" / "skill_tools" / "competitive_intel_collector.py"

HEADER = '''"""Deterministic USAspending collector for competitive-intel (Workflow B/C).

Ported from Project Theseus tool_competitive_intel.py — paginates all IDV child
orders and transaction pages; full JSON artifact written to disk (no LLM truncation).
"""

from __future__ import annotations

'''

IMPORTS = """
from collections import defaultdict
from datetime import date, datetime
import json
from pathlib import Path
from typing import Any

from .mcp_run_session import MCPError
from .types import ToolContext, ToolError, ToolResult
from ..skill_runtime_settings import collector_pagination_limits
"""


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    # Drop original module docstring + imports block
    text = re.sub(r"^\"\"\".*?\"\"\"\r?\n\r?\n", "", text, count=1, flags=re.DOTALL)
    text = re.sub(
        r"from __future__ import annotations\r?\n\r?\n.*?from src\.skills\.tool_types import ToolContext, ToolError, ToolResult\r?\n\r?\n",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )

    text = text.replace(
        "_LOOKUP_LIMIT = 10\n_IDV_PAGE_LIMIT = 25\n_TRANSACTION_PAGE_LIMIT = 5000\n_MAX_TRANSACTION_PAGES = 50\n_MAX_RECIPIENT_PROFILES = 50",
        "_LOOKUP_LIMIT = 10\n_MAX_RECIPIENT_PROFILES = 50\n\n\ndef _pagination():\n    return collector_pagination_limits()\n",
    )
    text = text.replace("_IDV_PAGE_LIMIT", "_pagination().idv_page_limit")
    text = text.replace("_TRANSACTION_PAGE_LIMIT", "_pagination().transaction_page_limit")
    text = text.replace("_MAX_TRANSACTION_PAGES", "_pagination().max_transaction_pages")

    # Inline artifact write (no Theseus tool_write_file)
    old_write = """    artifact_json = json.dumps(envelope, ensure_ascii=False, indent=2)
    artifact_result = await tool_write_file(
        ctx,
        _ARTIFACT_PATH,
        artifact_json,
        label=_artifact_display_name(resolved_piid, scenario),
    )"""
    new_write = """    artifact_json = json.dumps(envelope, ensure_ascii=False, indent=2)
    rel_path = ctx.artifact_rel_path or _ARTIFACT_PATH
    out_path = Path(ctx.artifact_dir) / rel_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(artifact_json, encoding="utf-8")
    artifact_result_payload = {
        "path": rel_path.replace("\\\\", "/"),
        "bytes": len(artifact_json.encode("utf-8")),
        "label": _artifact_display_name(resolved_piid, scenario),
    }"""
    text = text.replace(old_write, new_write)
    text = text.replace('artifact_result.payload["path"]', 'artifact_result_payload["path"]')
    text = text.replace("artifact_result.payload", "artifact_result_payload")

    # Session key: usaspending-gov-mcp id in our catalog
    text = text.replace('_USASPENDING_SERVER = "usaspending"', '_USASPENDING_SERVER = "usaspending-gov-mcp"')

    DST.write_text(HEADER + IMPORTS + text, encoding="utf-8")
    print(f"wrote {DST} ({DST.stat().st_size} bytes)")


if __name__ == "__main__":
    main()