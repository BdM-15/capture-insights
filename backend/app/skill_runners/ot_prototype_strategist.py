"""OT prototype strategist — deep OTA / CSO / non-FAR bid stack (1102 OT skills inverted)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.ot_cost_engine import (
    COST_SHARE_PATHS,
    apply_cost_share,
    build_labor_rates,
    build_milestone_costs,
    build_project_description_md,
    build_risk_flags,
    build_workbook_sheets,
    detect_vehicle_and_authority,
    extract_pop_months,
    extract_trl_range,
    infer_performer_and_path,
    infer_prototype_type,
    parse_hourly_from_mcp,
    select_labor_stack,
    _cso_milestones,
    _trl_milestone_templates,
)
from ..skill_tools.pursuit_context import list_pursuit_markdown_files
from ..skill_tools.render_toolchain import render_json_xlsx
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"
_BLS_MCP = "bls-oews-mcp"
_GSA_MCP = "gsa-calc-mcp"
_PERDIEM_MCP = "gsa-perdiem-mcp"


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
                return {"ok": True, "tool": candidate, "server_id": server_id, "raw": raw[:2000]}
    except MCPError as exc:
        return {"ok": False, "server_id": server_id, "error": str(exc)[:300]}
    except Exception as exc:
        return {"ok": False, "server_id": server_id, "error": f"{type(exc).__name__}: {exc}"[:300]}
    return {"ok": False, "server_id": server_id, "error": "no matching tool"}


def _brief_md(envelope: Dict[str, Any], row: Dict[str, Any], inquiry: str) -> str:
    totals = envelope.get("totals") or {}
    should = totals.get("should_cost") or {}
    gov = totals.get("government_obligation") or {}
    bid = envelope.get("bid_recommendation") or {}
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: ot_bid",
        "---",
        "",
        "# OT / OTA / CSO bid stack",
        "",
        f"**Agency:** {row.get('agency') or 'n/a'} · **Inquiry:** {inquiry or '(full bid build)'}",
        "",
        envelope.get("capture_lens") or "",
        "",
        f"- **Vehicle:** {envelope.get('vehicle_type')} · **Non-FAR:** {envelope.get('non_far')}",
        f"- **Authority:** {envelope.get('authority')}",
        f"- **Prototype type:** {envelope.get('prototype_type')}",
        f"- **Performer:** {envelope.get('performer_type')} · **4022(d) path:** {envelope.get('cost_share_path')}",
        f"- **TRL:** {envelope.get('trl_entry')} → {envelope.get('trl_exit')} · **PoP:** ~{envelope.get('pop_months')} mo",
        "",
        "## Milestones",
        "",
    ]
    for m in envelope.get("milestones") or []:
        stack = m.get("cost_stack") or {}
        sc = stack.get("should_cost") or {}
        lines.append(
            f"- **{m.get('milestone_id')}** — {m.get('description')} "
            f"(TRL {m.get('trl_in')}→{m.get('trl_out')}, {m.get('est_duration_months')} mo, "
            f"${sc.get('mid', m.get('should_cost_mid', 0)):,})"
        )
    lines.extend([
        "",
        "## Totals (mid scenario)",
        "",
        f"- Should-cost: **${should.get('mid', 0):,}** (low ${should.get('low', 0):,} / high ${should.get('high', 0):,})",
        f"- Government obligation: **${gov.get('mid', 0):,}**",
        f"- Performer share: **${(totals.get('performer_share') or {}).get('mid', 0):,}**",
        f"- Bid target: **${bid.get('target_price', 0):,}**",
        "",
        "## Risk flags",
        "",
    ])
    for f in envelope.get("bid_recommendation", {}).get("risk_flags") or []:
        lines.append(f"- {f}")

    lines.extend(["", "## Artifacts", ""])
    lines.append(f"- Cost JSON: `ot_bid.json`")
    lines.append(f"- Project description: `ot_project_description.md`")
    if envelope.get("xlsx_path"):
        lines.append(f"- Workbook: `{envelope['xlsx_path']}`")

    lines.extend([
        "",
        "## Handoff",
        "",
        "- **proposal-generator** — win themes + cost volume narrative",
        "- **renderers** — DOCX from project description; refresh XLSX after edits",
        "- **oci-sweeper** — teaming / NDC overlap checks",
        "- **igce-builder-ffp** — if follow-on production shifts to FAR FFP",
    ])
    return "\n".join(lines)


async def run_ot_prototype_strategist(
    row: Dict[str, Any],
    *,
    slug: str,
    naics: str = "541715",
    inquiry: str = "",
    use_llm: bool = False,
) -> Dict[str, Any]:
    files = list_pursuit_markdown_files(slug)
    text = "\n\n".join(f.get("content") or "" for f in files)
    pack = deliverable_context_pack(slug, row)

    vehicle_info = detect_vehicle_and_authority(text, inquiry)
    prototype_type = infer_prototype_type(text)
    trl_entry, trl_exit = extract_trl_range(text)
    pop_months = extract_pop_months(text)
    performer, cost_path, cost_share = infer_performer_and_path(
        text, inquiry, vehicle_info["authority"],
    )

    if vehicle_info.get("vehicle_type") == "CSO":
        milestones = _cso_milestones(vehicle_info.get("cso_phase"), prototype_type)
    else:
        milestones = _trl_milestone_templates(trl_entry, trl_exit, prototype_type)

    labor_stack = select_labor_stack(prototype_type, vehicle_info.get("vehicle_type") or "OTA")
    primary_soc = labor_stack[0].get("soc", "15-1252")

    mcp_notes: List[Dict[str, Any]] = []
    bls_result = await _try_mcp_benchmark(
        _BLS_MCP,
        ["get_wage_data", "get_occupation_wages", "search_occupations", "lookup_wage"],
        {"soc_code": primary_soc, "keywords": labor_stack[0]["category"], "limit": 3},
    )
    mcp_notes.append(bls_result)
    calc_result = await _try_mcp_benchmark(
        _GSA_MCP,
        ["igce_benchmark", "search_rates", "lookup_rate", "get_rates", "price_reasonableness_check"],
        {"keywords": labor_stack[0]["category"], "limit": 8},
    )
    mcp_notes.append(calc_result)
    per_diem_result = await _try_mcp_benchmark(
        _PERDIEM_MCP,
        ["estimate_travel_cost", "lookup_per_diem", "get_per_diem"],
        {"city": "Washington", "state": "DC", "num_nights": 5},
    )
    mcp_notes.append(per_diem_result)

    wage_raw = ""
    for note in mcp_notes:
        if note.get("ok"):
            wage_raw += note.get("raw") or ""
    wage_info = parse_hourly_from_mcp(wage_raw)
    academic = "university" in text.lower() or "ffrdc" in text.lower()
    labor = build_labor_rates(labor_stack, wage_info, academic=academic)

    travel_default = 8500.0
    if per_diem_result.get("ok"):
        m = re.search(r"\$?([\d,]+(?:\.\d{2})?)", per_diem_result.get("raw") or "")
        if m:
            try:
                travel_default = max(2500.0, float(m.group(1).replace(",", "")))
            except ValueError:
                pass

    milestones, cost_detail = build_milestone_costs(
        milestones,
        labor,
        prototype_type,
        travel_per_milestone=travel_default,
    )
    should = cost_detail["should_cost"]
    totals = apply_cost_share(
        should["mid"],
        should["low"],
        should["high"],
        cost_path,
        vehicle_info["authority"],
        vehicle_info.get("consortium"),
    )
    totals.update({
        "should_cost": should,
        "cost_detail": cost_detail,
    })

    mid_total = should["mid"]
    envelope: Dict[str, Any] = {
        "schema_version": "2.0-capture-insights",
        "slug": slug,
        "workflow": (
            "cso_response" if vehicle_info.get("vehicle_type") == "CSO"
            else "respond_to_ot_solicitation" if vehicle_info.get("ot_detected")
            else "pre_solicitation_strategist"
        ),
        "vehicle_type": vehicle_info.get("vehicle_type"),
        "non_far": vehicle_info.get("non_far"),
        "authority": vehicle_info.get("authority"),
        "cso_phase": vehicle_info.get("cso_phase"),
        "prototype_type": prototype_type,
        "performer_type": performer,
        "cost_share_path": cost_path,
        "cost_share_required": cost_share,
        "cost_share_paths_reference": [{"path": p, "performer": t, "note": n} for p, t, n in COST_SHARE_PATHS],
        "trl_entry": trl_entry,
        "trl_exit": trl_exit,
        "pop_months": pop_months,
        "naics": naics,
        "agency": row.get("agency"),
        "consortium": vehicle_info.get("consortium"),
        "ot_signals": vehicle_info.get("signals") or [],
        "source_file_count": len(files),
        "vault_artifacts": pack.get("artifact_keys") or [],
        "milestones": milestones,
        "labor": labor,
        "cost_detail": cost_detail,
        "totals": {
            "should_cost": totals["should_cost"],
            "government_obligation": totals["government_obligation"],
            "performer_share": totals["performer_share"],
            "consortium_fee": totals.get("consortium_fee"),
        },
        "mcp_benchmarks": mcp_notes,
        "wage_anchor": wage_info,
        "capture_lens": (
            "Bidder-side inversion of 1102 OT Project Description Builder + OT Cost Analysis: "
            "milestone structure, project-description draft, and 7-sheet should-cost workbook — "
            "for OTA, CSO, BAA, and other non-FAR prototype efforts."
        ),
        "inquiry": inquiry,
        "citations": {
            "statute": ["10 USC 4021", "10 USC 4022", "10 USC 4022(f)", cost_path, "10 USC 4003", "10 USC 3014"],
            "vault_paths": [f["path"] for f in files[:16]],
            "references": [
                "skills/ot-prototype-strategist/references/ot_authority_taxonomy.md",
                "skills/ot-prototype-strategist/references/trl_milestone_patterns.md",
                "skills/ot-prototype-strategist/references/cost_models/ot_milestone_buildup.md",
            ],
        },
    }

    mcp_ok = sum(1 for n in mcp_notes if n.get("ok"))
    envelope["bid_recommendation"] = {
        "target_price": mid_total,
        "government_ask_mid": totals["government_obligation"]["mid"],
        "rationale": (
            f"{vehicle_info.get('vehicle_type')} bid · {prototype_type} prototype · "
            f"{len(milestones)} milestones · wage anchor ${wage_info['hourly_mid']:.2f}/hr loaded mid "
            f"(burden {labor[0].get('burden_mid')}×)"
        ),
        "risk_flags": build_risk_flags(
            envelope,
            pop_months=pop_months,
            mcp_ok=mcp_ok,
            files_count=len(files),
        ),
    }

    base = f"pursuits/{slug}/03_capture"
    json_rel = f"{base}/ot_bid.json"
    md_rel = f"{base}/ot_bid.md"
    proj_rel = f"{base}/ot_project_description.md"
    xlsx_rel = f"{base}/ot_bid_workbook.xlsx"
    sheets_rel = f"{base}/ot_bid_sheets.json"

    proj_md = build_project_description_md(envelope, row)
    write_knowledge_file(proj_rel, proj_md)
    envelope["project_description_path"] = proj_rel

    sheets = build_workbook_sheets(envelope)
    envelope["sheets_for_xlsx"] = sheets
    sheets_path = (_KNOWLEDGE / sheets_rel).resolve()
    sheets_path.parent.mkdir(parents=True, exist_ok=True)
    sheets_path.write_text(json.dumps(sheets, indent=2, default=str), encoding="utf-8")

    render_results: List[Dict[str, Any]] = []
    xlsx_abs = (_KNOWLEDGE / xlsx_rel).resolve()
    rr = render_json_xlsx(
        sheets_path,
        xlsx_abs,
        title=f"OT Bid — {vehicle_info.get('vehicle_type')} — {slug}",
    )
    render_results.append(rr)
    if rr.get("ok"):
        envelope["xlsx_path"] = xlsx_rel

    brief = _brief_md(envelope, row, inquiry)
    llm_used = False

    if use_llm and (files or inquiry):
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill("ot-prototype-strategist")
        context_blob = json.dumps({
            "vehicle": envelope["vehicle_type"],
            "authority": envelope["authority"],
            "milestones": [m["milestone_id"] for m in milestones],
            "totals": envelope["totals"],
            "risk_flags": envelope["bid_recommendation"]["risk_flags"],
        }, default=str)[:10000]
        extra, _ = await run_multi_turn_llm(
            system_prompt=(
                "Senior OT/CSO capture strategist for a contractor bid team. "
                "Cite only provided JSON. Never invent solicitation requirements. Prefix FINAL:."
            ),
            user_prompt=(
                f"Inquiry: {inquiry or 'OT/CSO bid strategy'}\n\n{context_blob}\n\n"
                "6-10 sentences: vehicle, milestone story, cost-share path, bid target, top 3 risks."
            ),
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            narrative = extra.split("FINAL:", 1)[-1].strip() if "FINAL:" in extra.upper() else extra
            brief += f"\n\n## Strategist read (LLM)\n\n{narrative}\n"
            envelope["narrative_llm"] = narrative
            llm_used = True

    json_path = (_KNOWLEDGE / json_rel).resolve()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")

    if not write_knowledge_file(md_rel, brief):
        return {"ok": False, "skill_id": "ot-prototype-strategist", "error": f"failed to write {md_rel}"}

    warnings: List[str] = []
    if not vehicle_info.get("ot_detected") and vehicle_info.get("vehicle_type") not in ("CSO",):
        warnings.append(
            "No OTA/CSO keywords in vault — structure uses TRL heuristics; "
            "paste solicitation/BAA/CSO text into Studio for tighter alignment"
        )
    if not rr.get("ok"):
        warnings.append(f"XLSX export deferred: {rr.get('error', 'unknown')[:120]}")

    return {
        "ok": True,
        "skill_id": "ot-prototype-strategist",
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "project_description_path": proj_rel,
        "xlsx_path": xlsx_rel if rr.get("ok") else None,
        "ptw_baseline_usd": mid_total,
        "mcp_benchmarks_ok": mcp_ok,
        "milestone_count": len(milestones),
        "used_llm": llm_used,
        "warnings": warnings,
        "render_results": render_results,
        "summary": (
            f"{vehicle_info.get('vehicle_type')} bid · {len(milestones)} milestones · "
            f"${mid_total:,} should-cost · gov ${totals['government_obligation']['mid']:,} · "
            f"path {cost_path}"
        ),
    }