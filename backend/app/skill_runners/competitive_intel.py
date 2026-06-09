"""Run competitive-intel: deterministic USAspending collector + markdown brief."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

from ..deterministic.pursuit_paths import (
    pursuit_competitive_intel_json_path,
    pursuit_competitive_intel_md_path,
)
from ..skill_tools.competitive_intel_collector import (
    build_competitive_intel_brief_markdown,
    build_competitive_intel_product_title,
    tool_collect_competitive_obligation_intel,
)
from ..skill_tools.mcp_run_session import MCPError, open_mcp_session
from ..skill_tools.types import ToolContext, ToolError
from ..user_data import write_knowledge_file

_USASPENDING_MCP = "usaspending-gov-mcp"
_KNOWLEDGE_ROOT = Path("data") / "knowledge"


def _contract_from_row(row: Dict[str, Any]) -> Optional[str]:
    for key in ("award_key", "piid", "contract_number", "award_id"):
        val = row.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return None


async def run_competitive_intel(
    row: Dict[str, Any],
    *,
    slug: str,
    contract_number: Optional[str] = None,
    scope: str = "auto",
    use_llm: bool = False,
) -> Dict[str, Any]:
    """Workflow B/C collector — full JSON artifact + human brief (no LLM truncation of data)."""
    contract = (contract_number or _contract_from_row(row) or "").strip()
    if not contract:
        return {
            "ok": False,
            "skill_id": "competitive-intel",
            "error": "No contract number — set award_key on the pursuit row or pass contract_number",
        }

    artifact_dir = (_KNOWLEDGE_ROOT / "pursuits" / slug / "02_intel").resolve()
    json_name = "competitive_intel_obligation.json"
    md_rel = pursuit_competitive_intel_md_path(slug)

    try:
        async with open_mcp_session(_USASPENDING_MCP) as mcp:
            ctx = ToolContext(
                skill_name="competitive-intel",
                artifact_dir=artifact_dir,
                mcp_sessions={_USASPENDING_MCP: mcp},
                artifact_rel_path=json_name,
            )
            result = await tool_collect_competitive_obligation_intel(
                ctx,
                contract,
                scope=scope,
            )
    except (MCPError, ToolError) as exc:
        return {
            "ok": False,
            "skill_id": "competitive-intel",
            "error": str(exc)[:500],
            "contract_number": contract,
        }
    except Exception as exc:
        return {
            "ok": False,
            "skill_id": "competitive-intel",
            "error": f"{type(exc).__name__}: {exc}"[:500],
            "contract_number": contract,
        }

    summary = result.payload
    json_path = pursuit_competitive_intel_json_path(slug)
    envelope: Dict[str, Any] = {}
    try:
        full_json = (artifact_dir / json_name).read_text(encoding="utf-8")
        envelope = json.loads(full_json)
    except Exception:
        envelope = summary

    title = build_competitive_intel_product_title(envelope if envelope else summary)
    brief_md = build_competitive_intel_brief_markdown(envelope if envelope else summary, title)

    llm_note = ""
    used_llm = False
    if use_llm:
        from ..skill_runtime import run_multi_turn_llm
        from ..skill_registry import get_skill

        spec = get_skill("competitive-intel")
        system = (
            "You are a capture analyst. The deterministic collector already wrote the full JSON artifact. "
            "Add ONLY a short executive cover (≤12 bullets) — do not repeat transaction ledgers. "
            "Cite insight blocks from the summary; flag warnings verbatim."
        )
        user = (
            f"Contract {contract}. Scope {summary.get('scope')}. "
            f"Child orders: {summary.get('obligations_summary', {}).get('child_order_count')}. "
            f"Warnings: {summary.get('warnings')}. "
            f"Insights headline: {(summary.get('insights') or {}).get('headline')}"
        )
        llm_note, turns = await run_multi_turn_llm(
            system_prompt=system,
            user_prompt=user,
            skill=spec,
        )
        used_llm = bool(llm_note and "LLM call failed" not in llm_note)
        if used_llm:
            brief_md = brief_md + "\n\n## Agent cover note\n\n" + llm_note.strip() + "\n"

    if not write_knowledge_file(md_rel, brief_md):
        return {"ok": False, "skill_id": "competitive-intel", "error": "failed to write brief markdown"}

    child_count = (summary.get("obligations_summary") or {}).get("child_order_count", 0)
    tx_count = len((envelope.get("obligations") or {}).get("by_transaction") or [])

    return {
        "ok": True,
        "skill_id": "competitive-intel",
        "slug": slug,
        "contract_number": contract,
        "scope": summary.get("scope"),
        "scenario": (summary.get("resolved") or {}).get("scenario"),
        "path": md_rel,
        "json_path": json_path,
        "bytes": len(brief_md.encode("utf-8")),
        "json_bytes": (artifact_dir / json_name).stat().st_size,
        "child_order_count": child_count,
        "transaction_count": tx_count,
        "warnings": summary.get("warnings") or [],
        "used_llm": used_llm,
        "collector_tools": summary.get("tools_invoked") or [],
        "insights_headline": (summary.get("insights") or {}).get("headline"),
    }