"""PTW analysis — obligation run-rate seed + optional GSA CALC / BLS MCP (no KG)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..deterministic.pursuit_paths import pursuit_competitive_intel_json_path
from ..pursuit_intel import gather_usaspending_intel
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"
_GSA_MCP = "gsa-calc-mcp"
_BLS_MCP = "bls-oews-mcp"


def _load_intel_ptw_seed(slug: str) -> Dict[str, Any]:
    rel = pursuit_competitive_intel_json_path(slug)
    path = (_KNOWLEDGE / rel).resolve()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    seed = data.get("ptw_seed")
    if isinstance(seed, dict):
        return seed
    insights = data.get("insights") or {}
    burn = insights.get("burn_posture") or {}
    if isinstance(burn, dict) and burn.get("recommended_ptw_baseline_usd"):
        return {
            "recent_annual_run_rate_usd": burn.get("recent_annual_run_rate_usd"),
            "three_year_weighted_run_rate_usd": burn.get("three_year_weighted_run_rate_usd"),
            "recommended_baseline_usd": burn.get("recommended_ptw_baseline_usd"),
            "source": "competitive_intel_obligation.json",
        }
    return {}


def _row_baseline_usd(row: Dict[str, Any]) -> float:
    for key in ("obligation", "total_obligated", "amount"):
        val = row.get(key)
        if val is not None:
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    millions = row.get("obligation_millions")
    if millions is not None:
        try:
            return float(millions) * 1_000_000.0
        except (TypeError, ValueError):
            pass
    return 0.0


async def _try_mcp_benchmark(server_id: str, tool_candidates: List[str], arguments: Dict[str, Any]) -> Dict[str, Any]:
    from ..skill_tools.mcp_run_session import MCPError, open_mcp_session

    try:
        async with open_mcp_session(server_id) as mcp:
            tools = await mcp._session.list_tools()
            names = {t.name for t in tools.tools}
            for candidate in tool_candidates:
                if candidate not in names:
                    continue
                raw = await mcp.call_tool(candidate, arguments)
                return {"ok": True, "tool": candidate, "server_id": server_id, "raw": raw[:1500]}
    except MCPError as exc:
        return {"ok": False, "server_id": server_id, "error": str(exc)[:300]}
    except Exception as exc:
        return {"ok": False, "server_id": server_id, "error": f"{type(exc).__name__}: {exc}"[:300]}
    return {"ok": False, "server_id": server_id, "error": "no matching tool"}


def _ptw_md(
    *,
    row: Dict[str, Any],
    naics: str,
    slug: str,
    seed: Dict[str, Any],
    spend: Dict[str, Any],
    mcp_notes: List[Dict[str, Any]],
    warnings: List[str],
) -> str:
    recipient = row.get("recipient") or "incumbent"
    agency = row.get("agency") or "agency"
    baseline = seed.get("recommended_baseline_usd") or _row_baseline_usd(row)
    recent = seed.get("recent_annual_run_rate_usd")
    weighted = seed.get("three_year_weighted_run_rate_usd")

    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: ptw_analysis",
        f"naics: {naics}",
        "---",
        "",
        f"# Price-to-win lens — {recipient}",
        "",
        f"**Agency:** {agency} · **NAICS:** {naics}",
        "",
        "## Obligation run-rate baseline",
        "",
    ]
    if baseline:
        lines.append(f"- **Recommended PTW baseline:** ${_fmt(baseline)}")
    if recent:
        lines.append(f"- Recent annual run rate: ${_fmt(recent)}")
    if weighted:
        lines.append(f"- 3-year weighted run rate: ${_fmt(weighted)}")
    if not baseline and not recent:
        lines.append("_No competitive-intel JSON yet — run **competitive-intel** first for burn-rate seed._")
        row_usd = _row_baseline_usd(row)
        if row_usd:
            lines.append(f"- Pipeline row obligation proxy: ${_fmt(row_usd)}")

    lines.extend(["", "## DuckDB incumbent context", ""])
    rels = spend.get("relationships") or []
    if rels:
        for r in rels[:4]:
            lines.append(f"- {r.get('recipient')} @ {r.get('agency')}")
    else:
        lines.append("_Limited DuckDB overlap — widen NAICS or run competitive-intel._")

    lines.extend(["", "## External benchmarks (MCP)", ""])
    for note in mcp_notes:
        if note.get("ok"):
            lines.append(f"- {note['server_id']} · `{note.get('tool')}` — sample captured")
        else:
            lines.append(f"- {note['server_id']}: deferred ({note.get('error', 'unavailable')})")

    if warnings:
        lines.extend(["", "## Warnings", ""])
        for w in warnings:
            lines.append(f"- {w}")

    lines.extend([
        "",
        "## Next actions",
        "",
        "- Run competitive-intel on award_key for full obligation ledger",
        "- Refine labor/category assumptions in chat with smart model on",
        "",
        f"_Source: ptw-analysis · slug `{slug}` · no KG_",
    ])
    return "\n".join(lines)


def _fmt(val: Any) -> str:
    try:
        n = float(val)
    except (TypeError, ValueError):
        return str(val)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,.0f}"


async def run_ptw_analysis(
    row: Dict[str, Any],
    *,
    slug: str,
    naics: str,
    use_llm: bool = False,
) -> Dict[str, Any]:
    seed = _load_intel_ptw_seed(slug)
    spend = gather_usaspending_intel(row, naics, limit=6)
    warnings: List[str] = []

    if not seed:
        warnings.append("No competitive_intel_obligation.json — using pipeline/DuckDB proxy only")

    mcp_notes: List[Dict[str, Any]] = []
    # Best-effort MCP benchmarks (deferred gracefully when offline)
    mcp_notes.append(await _try_mcp_benchmark(
        _GSA_MCP,
        ["search_rates", "lookup_rate", "get_rates"],
        {"keywords": naics, "limit": 5},
    ))
    mcp_notes.append(await _try_mcp_benchmark(
        _BLS_MCP,
        ["get_occupation_wages", "search_occupations", "lookup_wage"],
        {"keywords": "management analyst", "limit": 3},
    ))

    md_rel = f"pursuits/{slug}/02_intel/ptw_analysis.md"
    json_rel = f"pursuits/{slug}/02_intel/ptw_analysis.json"
    payload = {
        "skill_id": "ptw-analysis",
        "slug": slug,
        "naics": naics,
        "ptw_seed": seed,
        "pipeline_obligation_usd": _row_baseline_usd(row),
        "mcp_benchmarks": mcp_notes,
        "warnings": warnings,
        "duckdb": {
            "relationships": (spend.get("relationships") or [])[:6],
            "flows": (spend.get("flows") or [])[:4],
        },
    }

    md = _ptw_md(
        row=row,
        naics=naics,
        slug=slug,
        seed=seed,
        spend=spend,
        mcp_notes=mcp_notes,
        warnings=warnings,
    )

    base = _KNOWLEDGE.resolve()
    json_path = (base / json_rel).resolve()
    if str(json_path).startswith(str(base)):
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if not write_knowledge_file(md_rel, md):
        return {"ok": False, "skill_id": "ptw-analysis", "error": "failed to write ptw_analysis.md"}

    llm_used = False
    if use_llm and seed:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill("ptw-analysis")
        note, _ = await run_multi_turn_llm(
            system_prompt="Summarize PTW posture in 5 bullets. Cite baseline USD only from provided seed. No invention.",
            user_prompt=str(payload),
            skill=spec,
        )
        if note and "LLM call failed" not in note:
            write_knowledge_file(md_rel, md + f"\n\n## Agent summary\n\n{note}\n")
            llm_used = True

    baseline = seed.get("recommended_baseline_usd") or _row_baseline_usd(row)
    mcp_ok = sum(1 for n in mcp_notes if n.get("ok"))

    return {
        "ok": True,
        "skill_id": "ptw-analysis",
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "ptw_baseline_usd": baseline,
        "mcp_benchmarks_ok": mcp_ok,
        "used_llm": llm_used,
        "warnings": warnings,
        "summary": f"PTW lens saved · baseline ${_fmt(baseline)} · {mcp_ok} MCP benchmark(s)",
    }