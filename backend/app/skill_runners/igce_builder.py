"""IGCE builder suite — contractor cost buildup mirroring 1102 IGCE math (no KG)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.pursuit_context import list_pursuit_markdown_files
from ..skill_tools.render_toolchain import render_json_xlsx
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"
_BLS_MCP = "bls-oews-mcp"
_GSA_MCP = "gsa-calc-mcp"
_PERDIEM_MCP = "gsa-perdiem-mcp"

IgceVariant = Literal["ffp", "lh_tm", "cr"]

_DEFAULT_LABOR: Tuple[Dict[str, Any], ...] = (
    {"category": "Program Manager", "soc": "11-1021", "fte": 0.25, "hours": 520},
    {"category": "Subject Matter Expert", "soc": "13-1111", "fte": 1.0, "hours": 2080},
    {"category": "Senior Analyst", "soc": "13-1111", "fte": 2.0, "hours": 4160},
    {"category": "Engineer", "soc": "15-1252", "fte": 1.5, "hours": 3120},
)

_FFP_WRAP = (
    ("Base labor", "direct", 1.0),
    ("Fringe", "fringe", 0.32),
    ("Overhead", "overhead", 0.75),
    ("G&A", "ga", 0.12),
    ("Fee / profit", "fee", 0.08),
)

_LH_BURDEN = (
    ("Base wage", "base", 1.0),
    ("Fringe + overhead", "burden", 1.45),
    ("G&A wrap", "ga", 1.12),
)

_CR_FEE_CAPS = {
    "CPFF": {"max_fee_pct": 10.0, "note": "FAR 16.306 — fee on estimated cost"},
    "CPAF": {"max_fee_pct": 6.0, "note": "Award fee pool — base fee typically lower"},
    "CPIF": {"max_fee_pct": 15.0, "note": "Incentive fee on cost underrun/overrun"},
}


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


def _parse_hourly_from_mcp(notes: List[Dict[str, Any]]) -> Optional[float]:
    for note in notes:
        if not note.get("ok"):
            continue
        raw = note.get("raw") or ""
        m = re.search(r"\$?(\d{2,3}(?:\.\d{1,2})?)", raw)
        if m:
            try:
                val = float(m.group(1))
                if 40 <= val <= 350:
                    return val
            except ValueError:
                pass
    return None


def _extract_labor_from_vault(text: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for line in text.splitlines():
        lower = line.lower()
        if "labor categor" in lower or "key personnel" in lower:
            m = re.search(r"([A-Za-z][A-Za-z /-]{4,40})\s+.*?(\d{1,2}(?:\.\d)?)\s*fte", line, re.I)
            if m:
                rows.append({
                    "category": m.group(1).strip(),
                    "fte": float(m.group(2)),
                    "hours": int(float(m.group(2)) * 2080),
                })
    return rows[:8]


def _infer_cr_type(text: str) -> str:
    lower = text.lower()
    if "cpaf" in lower or "award fee" in lower:
        return "CPAF"
    if "cpif" in lower or "incentive fee" in lower:
        return "CPIF"
    if "cpff" in lower or "cost plus fixed fee" in lower or "16.306" in lower:
        return "CPFF"
    if "cost-reimbursement" in lower or "cost reimburs" in lower:
        return "CPFF"
    return "CPFF"


def _build_labor_rows(
    vault_labor: List[Dict[str, Any]],
    hourly_base: float,
    mcp_notes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    source = vault_labor if vault_labor else list(_DEFAULT_LABOR)
    rows: List[Dict[str, Any]] = []
    for i, row in enumerate(source):
        hours = int(row.get("hours") or row.get("fte", 1) * 2080)
        base = hourly_base * (0.95 + 0.05 * i) if len(source) > 1 else hourly_base
        rows.append({
            "category": row.get("category") or f"Role {i + 1}",
            "soc": row.get("soc", ""),
            "hours": hours,
            "base_hourly": round(base, 2),
            "base_cost": round(base * hours, 2),
            "mcp_source": next((n["server_id"] for n in mcp_notes if n.get("ok")), "default_proxy"),
        })
    return rows


def _ffp_buildup(labor_rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    base_total = sum(r["base_cost"] for r in labor_rows)
    fringe = base_total * _FFP_WRAP[1][2]
    overhead = base_total * _FFP_WRAP[2][2]
    subtotal = base_total + fringe + overhead
    ga = subtotal * _FFP_WRAP[3][2]
    before_fee = subtotal + ga
    fee = before_fee * _FFP_WRAP[4][2]
    total = before_fee + fee
    running = 0.0
    buildup: List[Dict[str, Any]] = []
    for label, kind, rate, amount in (
        ("Base labor", "direct", 1.0, base_total),
        ("Fringe", "fringe", _FFP_WRAP[1][2], fringe),
        ("Overhead", "overhead", _FFP_WRAP[2][2], overhead),
        ("G&A", "ga", _FFP_WRAP[3][2], ga),
        ("Fee / profit", "fee", _FFP_WRAP[4][2], fee),
    ):
        running += amount
        buildup.append({
            "layer": label,
            "type": kind,
            "rate": rate,
            "amount": round(amount, 2),
            "cumulative": round(running, 2),
        })
    return buildup, {"base": round(base_total, 2), "total": round(total, 2)}


def _lh_tm_buildup(labor_rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    buildup: List[Dict[str, Any]] = []
    loaded_rates: List[Dict[str, Any]] = []
    total_hours = 0
    weighted_loaded = 0.0
    for row in labor_rows:
        base = row["base_hourly"]
        loaded = base
        for label, kind, mult in _LH_BURDEN:
            if kind == "base":
                continue
            loaded *= mult
        loaded = round(loaded, 2)
        hours = row["hours"]
        total_hours += hours
        weighted_loaded += loaded * hours
        loaded_rates.append({**row, "fully_burdened_hourly": loaded, "line_total": round(loaded * hours, 2)})
        buildup.append({
            "category": row["category"],
            "base_hourly": base,
            "fully_burdened_hourly": loaded,
            "hours": hours,
            "line_total": round(loaded * hours, 2),
        })
    avg_loaded = weighted_loaded / total_hours if total_hours else 0.0
    total = sum(b["line_total"] for b in buildup)
    return buildup, {"avg_loaded_hourly": round(avg_loaded, 2), "total": round(total, 2), "labor_detail": loaded_rates}


def _cr_buildup(labor_rows: List[Dict[str, Any]], cr_type: str) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    base_total = sum(r["base_cost"] for r in labor_rows)
    cap = _CR_FEE_CAPS.get(cr_type, _CR_FEE_CAPS["CPFF"])
    fee_pct = cap["max_fee_pct"] / 100.0
    fee_mid = base_total * (fee_pct * 0.6)
    estimated_cost = base_total * 1.35
    total = estimated_cost + fee_mid
    buildup = [
        {"element": "Direct labor (loaded proxy)", "amount": round(base_total * 1.35, 2)},
        {"element": "ODCs / travel (placeholder 8%)", "amount": round(base_total * 0.08, 2)},
        {"element": f"Estimated cost (pre-fee)", "amount": round(estimated_cost, 2)},
        {"element": f"Fee ({cr_type} cap {cap['max_fee_pct']}%)", "amount": round(fee_mid, 2)},
        {"element": "Total price ceiling", "amount": round(total, 2)},
    ]
    return buildup, {
        "cr_type": cr_type,
        "estimated_cost": round(estimated_cost, 2),
        "fee": round(fee_mid, 2),
        "total": round(total, 2),
        "fee_cap_note": cap["note"],
    }


def _skill_id_for_variant(variant: IgceVariant) -> str:
    return {
        "ffp": "igce-builder-ffp",
        "lh_tm": "igce-builder-lh-tm",
        "cr": "igce-builder-cr",
    }[variant]


def _brief_md(
    *,
    variant: IgceVariant,
    envelope: Dict[str, Any],
    row: Dict[str, Any],
    inquiry: str,
) -> str:
    totals = envelope.get("totals") or {}
    lines = [
        "---",
        "type: pursuit-artifact",
        f"artifact: igce_{variant}",
        "---",
        "",
        f"# IGCE-style cost buildup — {variant.upper().replace('_', '/')}",
        "",
        f"**Agency:** {row.get('agency') or 'n/a'} · **Recipient context:** {row.get('recipient') or 'n/a'}",
        f"**Inquiry:** {inquiry or '(standard buildup)'}",
        "",
        envelope.get("capture_lens") or "",
        "",
        "## Summary",
        "",
    ]
    if variant == "ffp":
        lines.append(f"- **FFP total:** ${totals.get('total', 0):,}")
        lines.append(f"- **Base labor:** ${totals.get('base', 0):,}")
    elif variant == "lh_tm":
        lines.append(f"- **T&M / LH total:** ${totals.get('total', 0):,}")
        lines.append(f"- **Avg loaded hourly:** ${totals.get('avg_loaded_hourly', 0):,.2f}")
    else:
        lines.append(f"- **CR type:** {totals.get('cr_type', 'CPFF')}")
        lines.append(f"- **Estimated cost:** ${totals.get('estimated_cost', 0):,}")
        lines.append(f"- **Fee:** ${totals.get('fee', 0):,}")
        lines.append(f"- **Ceiling:** ${totals.get('total', 0):,}")

    lines.extend(["", "## Labor categories", ""])
    for r in envelope.get("labor_categories") or []:
        lines.append(
            f"- {r.get('category')}: {r.get('hours')} hrs @ ${r.get('base_hourly')}/hr "
            f"(base ${r.get('base_cost', 0):,})"
        )

    lines.extend(["", "## MCP benchmarks", ""])
    for note in envelope.get("mcp_benchmarks") or []:
        if note.get("ok"):
            lines.append(f"- {note['server_id']} · `{note.get('tool')}`")
        else:
            lines.append(f"- {note['server_id']}: deferred")

    if envelope.get("xlsx_path"):
        lines.extend(["", f"Workbook: `{envelope['xlsx_path']}`", ""])

    lines.extend([
        "",
        "## Handoff",
        "",
        "- **ptw-analysis** — compare to incumbent obligation run-rate",
        "- **proposal-generator** — cost volume narrative",
        "- **renderers** — re-export if JSON updated",
        "",
    ])
    return "\n".join(lines)


async def run_igce_builder(
    row: Dict[str, Any],
    *,
    slug: str,
    variant: IgceVariant,
    naics: str = "561210",
    inquiry: str = "",
    use_llm: bool = False,
    export_xlsx: bool = True,
) -> Dict[str, Any]:
    skill_id = _skill_id_for_variant(variant)
    files = list_pursuit_markdown_files(slug)
    text = "\n\n".join(f.get("content") or "" for f in files)
    pack = deliverable_context_pack(slug, row)
    vault_labor = _extract_labor_from_vault(text)

    mcp_notes: List[Dict[str, Any]] = []
    mcp_notes.append(await _try_mcp_benchmark(
        _BLS_MCP,
        ["get_occupation_wages", "search_occupations", "lookup_wage"],
        {"keywords": "management analyst", "limit": 3},
    ))
    mcp_notes.append(await _try_mcp_benchmark(
        _GSA_MCP,
        ["search_rates", "lookup_rate", "get_rates"],
        {"keywords": "analyst", "sin": "54151", "limit": 8},
    ))
    mcp_notes.append(await _try_mcp_benchmark(
        _PERDIEM_MCP,
        ["lookup_per_diem", "get_per_diem", "search_locations"],
        {"city": "Washington", "state": "DC"},
    ))

    hourly = _parse_hourly_from_mcp(mcp_notes) or 95.0
    labor_rows = _build_labor_rows(vault_labor, hourly, mcp_notes)

    if variant == "ffp":
        buildup, totals = _ffp_buildup(labor_rows)
        envelope_buildup = buildup
    elif variant == "lh_tm":
        buildup, totals = _lh_tm_buildup(labor_rows)
        envelope_buildup = buildup
    else:
        cr_type = _infer_cr_type(text)
        buildup, totals = _cr_buildup(labor_rows, cr_type)
        envelope_buildup = buildup

    base = f"pursuits/{slug}/03_capture"
    stem = f"igce_{variant}"
    json_rel = f"{base}/{stem}.json"
    md_rel = f"{base}/{stem}.md"
    xlsx_rel = f"{base}/{stem}.xlsx"

    envelope: Dict[str, Any] = {
        "schema_version": "1.0-capture-insights",
        "skill_id": skill_id,
        "variant": variant,
        "slug": slug,
        "naics": naics,
        "contract_type": variant.upper().replace("_", "/"),
        "labor_categories": labor_rows,
        "buildup": envelope_buildup,
        "totals": totals,
        "mcp_benchmarks": mcp_notes,
        "vault_artifacts": pack.get("artifact_keys") or [],
        "source_file_count": len(files),
        "capture_lens": (
            "Contractor-side IGCE parity: mirror how a CO's 1102 IGCE Builder stacks "
            "BLS + CALC+ + per diem into a defendable cost — for **your** bid math, not "
            "submitting an official government estimate."
        ),
        "inquiry": inquiry,
        "sheets_for_xlsx": {
            "labor_categories": labor_rows,
            "buildup": envelope_buildup if isinstance(envelope_buildup, list) else [envelope_buildup],
            "summary": [{
                "variant": variant,
                "total_usd": totals.get("total"),
                "naics": naics,
                "hourly_proxy": hourly,
            }],
        },
    }

    render_results: List[Dict[str, Any]] = []

    if export_xlsx:
        sheets_path = (_KNOWLEDGE / base / f"{stem}_sheets.json").resolve()
        sheets_path.parent.mkdir(parents=True, exist_ok=True)
        sheets_path.write_text(json.dumps(envelope["sheets_for_xlsx"], indent=2), encoding="utf-8")
        xlsx_abs = (_KNOWLEDGE / xlsx_rel).resolve()
        rr = render_json_xlsx(sheets_path, xlsx_abs, title=f"IGCE {variant.upper()} — {slug}")
        render_results.append(rr)
        if rr.get("ok"):
            envelope["xlsx_path"] = xlsx_rel

    brief = _brief_md(variant=variant, envelope=envelope, row=row, inquiry=inquiry)

    json_path = (_KNOWLEDGE / json_rel).resolve()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")

    if not write_knowledge_file(md_rel, brief):
        return {"ok": False, "skill_id": skill_id, "error": f"failed to write {md_rel}"}

    llm_used = False
    if use_llm:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill(skill_id)
        extra, _ = await run_multi_turn_llm(
            system_prompt=(
                "Capture pricing analyst. Summarize IGCE-style buildup in 5 bullets. "
                "Use only numbers from JSON. Contractor bid lens — not CO advice."
            ),
            user_prompt=json.dumps({"totals": totals, "labor_count": len(labor_rows), "variant": variant}),
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            write_knowledge_file(md_rel, brief + f"\n\n## Agent summary\n\n{extra}\n")
            llm_used = True

    warnings: List[str] = []
    if not any(n.get("ok") for n in mcp_notes):
        warnings.append("Wage MCPs offline — using hourly proxy; configure BLS/CALC+ keys in Settings")
    if not vault_labor:
        warnings.append("No labor categories in vault — using default PM/SME/Analyst/Engineer mix")

    mcp_ok = sum(1 for n in mcp_notes if n.get("ok"))
    result: Dict[str, Any] = {
        "ok": True,
        "skill_id": skill_id,
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "ptw_baseline_usd": totals.get("total"),
        "mcp_benchmarks_ok": mcp_ok,
        "used_llm": llm_used,
        "warnings": warnings,
        "summary": (
            f"IGCE {variant.upper()} · ${totals.get('total', 0):,} · "
            f"{len(labor_rows)} labor rows · {mcp_ok} MCP benchmark(s)"
        ),
    }
    if envelope.get("xlsx_path"):
        result["xlsx_path"] = envelope["xlsx_path"]
    if render_results:
        result["render_results"] = render_results
    return result