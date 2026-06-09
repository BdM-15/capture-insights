"""OT / OTA / CSO milestone + should-cost engine (1102 OT skills inverted, no KG)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

PRODUCTIVE_HOURS_YEAR = 1880
PAID_HOURS_YEAR = 2080
WAGE_ESCALATION = 0.025
BURDEN_COMMERCIAL = (1.80, 2.00, 2.20)
BURDEN_ACADEMIC = (1.65, 1.85, 2.05)
CONSORTIUM_FEES = {"DIU": 0.05, "AFWERX": 0.04, "NSTXL": 0.05, "MTEC": 0.06, "SOSSEC": 0.05}
COST_SHARE_STATUTORY = 0.333
MATERIALS_PCT = {
    "software": (0.10, 0.15, 0.20),
    "hybrid": (0.20, 0.30, 0.40),
    "hardware": (0.40, 0.50, 0.60),
    "process": (0.30, 0.40, 0.50),
}
DEFAULT_SOC = "15-1252"

SOC_ROLES: Tuple[Tuple[str, str, str], ...] = (
    ("Software Developer", "15-1252", "software"),
    ("Cybersecurity Engineer", "15-1212", "cyber"),
    ("Data Scientist", "15-2051", "software"),
    ("Electrical Engineer", "17-2071", "hardware"),
    ("Mechanical Engineer", "17-2141", "hardware"),
    ("Aerospace Engineer", "17-2011", "hardware"),
    ("Program Manager", "11-3021", "all"),
)

VEHICLE_CUES: Tuple[Tuple[str, str], ...] = (
    ("commercial solutions opening", "CSO"),
    ("cso ", "CSO"),
    ("phase i cso", "CSO"),
    ("phase ii cso", "CSO"),
    ("other transaction", "OTA"),
    ("other transaction agreement", "OTA"),
    ("ota ", "OTA"),
    ("prototype ota", "OTA"),
    ("10 usc 4021", "OTA_4021"),
    ("10 usc 4022", "OTA_4022"),
    ("4022(f)", "OTA_4022f"),
    ("production follow-on", "OTA_4022f"),
    ("broad agency announcement", "BAA"),
    ("baa", "BAA"),
    ("request for solutions", "RFS"),
    ("rfs", "RFS"),
    ("prize competition", "CSO"),
    ("innovation challenge", "CSO"),
    ("non-far", "NON_FAR"),
    ("not subject to the far", "NON_FAR"),
)

OT_CUES: Tuple[Tuple[str, str], ...] = (
    ("other transaction", "10 USC 4022"),
    ("prototype agreement", "10 USC 4022"),
    ("milestone", "milestone-based"),
    ("trl", "TRL phasing"),
    ("diu", "DIU"),
    ("afwerx", "AFWERX"),
    ("nstxl", "NSTXL"),
    ("consortium", "consortium"),
)

COST_SHARE_PATHS: Tuple[Tuple[str, str, str], ...] = (
    ("4022(d)(1)(A)", "ndc", "NDC significant participation — no statutory cost share"),
    ("4022(d)(1)(B)", "small_business", "Small business / non-profit significant participation"),
    ("4022(d)(1)(C)", "traditional_with_cost_share", "Performer pays ≥1/3 of total cost"),
    ("4022(d)(1)(D)", "competition_commitment", "Exceptional circumstances / senior determination"),
)


def detect_vehicle_and_authority(text: str, inquiry: str = "") -> Dict[str, Any]:
    blob = f"{text} {inquiry}".lower()
    hits: List[Dict[str, str]] = []
    vehicle = "OTA"
    authority = "10 USC 4022"
    non_far = False

    for needle, label in VEHICLE_CUES:
        if needle in blob:
            hits.append({"cue": needle, "label": label})
            if label.startswith("OTA"):
                vehicle = "OTA"
                if label == "OTA_4021":
                    authority = "10 USC 4021"
                elif label == "OTA_4022f":
                    authority = "10 USC 4022(f)"
                else:
                    authority = "10 USC 4022"
            elif label == "CSO":
                vehicle = "CSO"
                non_far = True
            elif label in ("BAA", "RFS"):
                vehicle = label
                authority = "10 USC 4021"
            elif label == "NON_FAR":
                non_far = True

    if "cso" in blob or "commercial solutions" in blob:
        vehicle = "CSO"
        non_far = True

    consortium = None
    for tag, fee_key in (("diu", "DIU"), ("afwerx", "AFWERX"), ("nstxl", "NSTXL"), ("mtec", "MTEC"), ("sossec", "SOSSEC")):
        if tag in blob:
            consortium = fee_key

    cso_phase = None
    if "phase ii" in blob or "phase 2" in blob:
        cso_phase = "II"
    elif "phase i" in blob or "phase 1" in blob:
        cso_phase = "I"

    ot_detected = bool(hits) or any(n in blob for n, _ in OT_CUES)

    return {
        "vehicle_type": vehicle,
        "authority": authority,
        "non_far": non_far or vehicle in ("CSO", "OTA", "BAA", "RFS"),
        "consortium": consortium,
        "cso_phase": cso_phase,
        "ot_detected": ot_detected,
        "signals": hits[:12],
    }


def infer_prototype_type(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ("manufacturing", "pilot line", "production process")):
        return "process"
    if any(k in lower for k in ("hardware", "brassboard", "breadboard", "uas", "rf ")):
        if any(k in lower for k in ("software", "algorithm", "cyber", "data")):
            return "hybrid"
        return "hardware"
    if any(k in lower for k in ("software", "algorithm", "cyber", "ai ", "machine learning")):
        return "software"
    return "hybrid"


def extract_trl_range(text: str) -> Tuple[int, int]:
    m = re.search(r"trl\s*(\d)\s*(?:to|-|–|through)\s*(\d)", text.lower())
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"technology readiness level\s*(\d)", text.lower())
    if m:
        entry = int(m.group(1))
        return entry, min(entry + 2, 9)
    return 4, 6


def extract_pop_months(text: str) -> int:
    m = re.search(r"(\d{1,2})\s*(?:month|mo)\s*(?:period|pop|performance)", text.lower())
    if m:
        return int(m.group(1))
    m = re.search(r"period of performance[:\s]+(\d{1,2})", text.lower())
    if m:
        return int(m.group(1))
    return 18


def infer_performer_and_path(text: str, inquiry: str, authority: str) -> Tuple[str, str, bool]:
    blob = f"{text} {inquiry}".lower()
    if authority == "10 USC 4021":
        return "research_performer", "none_4021", False
    if authority == "10 USC 4022(f)":
        return "production_follow_on", "none_4022f", False
    if "ndc" in blob or "nontraditional" in blob or "non-traditional" in blob:
        return "ndc_team", "4022(d)(1)(A)", False
    if any(k in blob for k in ("small business", "8(a)", "sdvosb", "wosb", "non-profit", "nonprofit")):
        return "small_business", "4022(d)(1)(B)", False
    if any(k in blob for k in ("cost share", "1/3", "one-third", "33%", "irad")):
        return "traditional_prime", "4022(d)(1)(C)", True
    if "teaming" in blob or "subcontract" in blob:
        return "traditional_with_ndc_sub", "4022(d)(1)(A)", False
    return "traditional_prime", "4022(d)(1)(D)", False


def _trl_milestone_templates(entry: int, exit_: int, prototype_type: str) -> List[Dict[str, Any]]:
    """Generate milestone gates spanning TRL entry→exit."""
    gates: List[Dict[str, Any]] = []
    span = exit_ - entry
    if span <= 0:
        span = 2

    if entry <= 4 and exit_ >= 5:
        gates.append({
            "milestone_id": "M1",
            "phase": 1,
            "description": "Preliminary Design Review (PDR)",
            "trl_in": max(entry, 3),
            "trl_out": max(entry, 4),
            "est_duration_months": 3,
            "payment_type": "fixed",
            "exit_criterion": "Government accepts design package per PDR checklist; key parameters validated",
            "gate": "PDR",
        })
    if entry <= 4 and exit_ >= 5:
        gates.append({
            "milestone_id": "M2",
            "phase": 2,
            "description": "Build complete + component / breadboard test",
            "trl_in": 4,
            "trl_out": 5,
            "est_duration_months": 5,
            "payment_type": "fixed",
            "exit_criterion": "Component tests pass acceptance thresholds in laboratory environment",
            "gate": "component_test",
        })
    if exit_ >= 6:
        gates.append({
            "milestone_id": "M3",
            "phase": 3,
            "description": "System integration + relevant-environment demonstration",
            "trl_in": 5,
            "trl_out": 6,
            "est_duration_months": 6,
            "payment_type": "fixed",
            "exit_criterion": "End-to-end prototype demonstrates mission-relevant scenario per test plan",
            "gate": "integration_demo",
        })
    if exit_ >= 7:
        gates.append({
            "milestone_id": "M4",
            "phase": 4,
            "description": "Operational-environment demonstration",
            "trl_in": 6,
            "trl_out": 7,
            "est_duration_months": 4,
            "payment_type": "fixed",
            "exit_criterion": "Field demo completes 3 of 3 trials per operational test plan",
            "gate": "operational_demo",
        })

    if not gates:
        gates.append({
            "milestone_id": "M1",
            "phase": 1,
            "description": "Prototype delivery milestone",
            "trl_in": entry,
            "trl_out": exit_,
            "est_duration_months": 6,
            "payment_type": "fixed",
            "exit_criterion": "Government accepts deliverables per solicitation attachment",
            "gate": "delivery",
        })

    for i, g in enumerate(gates):
        g["milestone_id"] = f"M{i + 1}"
        g["prototype_type"] = prototype_type
        if prototype_type == "software" and g.get("gate") == "integration_demo":
            g["description"] = "Software integration + representative-environment demo"
    return gates


def _cso_milestones(phase: Optional[str], prototype_type: str) -> List[Dict[str, Any]]:
    if phase == "I":
        return [{
            "milestone_id": "M1",
            "phase": 1,
            "description": "CSO Phase I — feasibility / solution brief",
            "trl_in": 3,
            "trl_out": 4,
            "est_duration_months": 4,
            "payment_type": "fixed",
            "exit_criterion": "Government selects solution for Phase II down-select",
            "gate": "cso_phase_i",
            "prototype_type": prototype_type,
        }]
    return [
        {
            "milestone_id": "M1",
            "phase": 1,
            "description": "CSO Phase II — prototype design + build",
            "trl_in": 4,
            "trl_out": 5,
            "est_duration_months": 6,
            "payment_type": "fixed",
            "exit_criterion": "Prototype build accepted; component-level tests pass",
            "gate": "cso_phase_ii_build",
            "prototype_type": prototype_type,
        },
        {
            "milestone_id": "M2",
            "phase": 2,
            "description": "CSO Phase II — demonstration + transition readiness",
            "trl_in": 5,
            "trl_out": 6,
            "est_duration_months": 6,
            "payment_type": "fixed",
            "exit_criterion": "Demonstration event complete; transition plan accepted",
            "gate": "cso_phase_ii_demo",
            "prototype_type": prototype_type,
        },
    ]


def select_labor_stack(prototype_type: str, vehicle: str) -> List[Dict[str, Any]]:
    roles: List[Dict[str, Any]] = []
    for title, soc, domain in SOC_ROLES:
        if domain == "all" or domain == prototype_type or (prototype_type == "hybrid" and domain in ("software", "hardware")):
            fte = 0.25 if "Manager" in title else (1.0 if "Developer" in title or "Engineer" in title else 0.5)
            if vehicle == "CSO" and "Phase I" not in title:
                fte *= 0.7 if title == "Program Manager" else 1.0
            roles.append({
                "category": title,
                "soc": soc,
                "fte": round(fte, 2),
                "tier": "senior" if "Senior" in title or "Manager" in title else "mid",
            })
    if not roles:
        roles.append({"category": "Software Developer", "soc": DEFAULT_SOC, "fte": 2.0, "tier": "mid"})
    return roles[:5]


def parse_hourly_from_mcp(raw: str, fallback_annual: float = 142000) -> Dict[str, Any]:
    hourly = None
    annual = None
    for pat in (r"annual[:\s]*\$?([\d,]+)", r"P50[:\s]*\$?([\d,]+)", r"\$?(\d{2,3}(?:\.\d{1,2})?)\s*/?\s*hr"):
        m = re.search(pat, raw, re.I)
        if m:
            val = float(m.group(1).replace(",", ""))
            if val > 500:
                annual = val
                hourly = val / PAID_HOURS_YEAR
            elif val >= 40:
                hourly = val
                annual = val * PAID_HOURS_YEAR
            break
    if hourly is None:
        annual = fallback_annual
        hourly = annual / PAID_HOURS_YEAR
    return {
        "hourly_mid": round(hourly, 2),
        "annual_mid": round(annual, 2),
        "source": "mcp_parsed" if hourly else "default_proxy",
    }


def build_labor_rates(
    stack: List[Dict[str, Any]],
    wage_info: Dict[str, Any],
    *,
    academic: bool = False,
) -> List[Dict[str, Any]]:
    burdens = BURDEN_ACADEMIC if academic else BURDEN_COMMERCIAL
    base_hourly = wage_info["hourly_mid"]
    out: List[Dict[str, Any]] = []
    for i, role in enumerate(stack):
        hourly = base_hourly * (0.92 + 0.04 * i)
        annual = hourly * PAID_HOURS_YEAR
        out.append({
            **role,
            "annual_wage": round(annual, 2),
            "hourly_base": round(hourly, 2),
            "burden_low": burdens[0],
            "burden_mid": burdens[1],
            "burden_high": burdens[2],
            "hourly_loaded_low": round(hourly * burdens[0], 2),
            "hourly_loaded_mid": round(hourly * burdens[1], 2),
            "hourly_loaded_high": round(hourly * burdens[2], 2),
        })
    return out


def _milestone_labor_cost(
    labor: List[Dict[str, Any]],
    duration_months: int,
    scenario: str,
) -> float:
    burden_key = f"hourly_loaded_{scenario}"
    total = 0.0
    for role in labor:
        hours = PRODUCTIVE_HOURS_YEAR * (duration_months / 12.0) * float(role.get("fte") or 1.0)
        rate = float(role.get(burden_key) or role.get("hourly_loaded_mid") or 0)
        total += hours * rate
    return total


def build_milestone_costs(
    milestones: List[Dict[str, Any]],
    labor: List[Dict[str, Any]],
    prototype_type: str,
    *,
    travel_per_milestone: float = 8500.0,
    odc_pct: float = 0.05,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    mat_low, mat_mid, mat_high = MATERIALS_PCT.get(prototype_type, MATERIALS_PCT["hybrid"])
    enriched: List[Dict[str, Any]] = []
    totals = {"low": 0.0, "mid": 0.0, "high": 0.0}
    labor_rows: List[Dict[str, Any]] = []
    materials_rows: List[Dict[str, Any]] = []
    travel_rows: List[Dict[str, Any]] = []
    odc_rows: List[Dict[str, Any]] = []

    for m in milestones:
        dur = int(m.get("est_duration_months") or 3)
        mid_labor = _milestone_labor_cost(labor, dur, "mid")
        low_labor = _milestone_labor_cost(labor, dur, "low")
        high_labor = _milestone_labor_cost(labor, dur, "high")

        mid_mat = mid_labor * mat_mid / max(1 - mat_mid, 0.5)
        low_mat = low_labor * mat_low / max(1 - mat_low, 0.5)
        high_mat = high_labor * mat_high / max(1 - mat_high, 0.5)

        mid_travel = travel_per_milestone
        mid_odc = (mid_labor + mid_mat) * odc_pct

        mid_total = mid_labor + mid_mat + mid_travel + mid_odc
        low_total = low_labor + low_mat + mid_travel * 0.8 + mid_odc * 0.85
        high_total = high_labor + high_mat + mid_travel * 1.2 + mid_odc * 1.15

        copy = dict(m)
        copy["cost_stack"] = {
            "labor": {"low": round(low_labor), "mid": round(mid_labor), "high": round(high_labor)},
            "materials": {"low": round(low_mat), "mid": round(mid_mat), "high": round(high_mat)},
            "travel": {"low": round(mid_travel * 0.8), "mid": round(mid_travel), "high": round(mid_travel * 1.2)},
            "odc": {"low": round(mid_odc * 0.85), "mid": round(mid_odc), "high": round(mid_odc * 1.15)},
            "should_cost": {"low": round(low_total), "mid": round(mid_total), "high": round(high_total)},
        }
        copy["should_cost_mid"] = round(mid_total)
        copy["payment_amount_mid"] = round(mid_total)
        if copy.get("payment_type") == "cost_type":
            copy["nte_ceiling_mid"] = round(mid_total * 1.15)
        enriched.append(copy)

        totals["low"] += low_total
        totals["mid"] += mid_total
        totals["high"] += high_total

        for role in labor:
            hrs = PRODUCTIVE_HOURS_YEAR * (dur / 12.0) * float(role.get("fte") or 1.0)
            labor_rows.append({
                "milestone_id": m["milestone_id"],
                "category": role["category"],
                "soc": role.get("soc"),
                "hours": round(hrs, 1),
                "hourly_loaded_mid": role.get("hourly_loaded_mid"),
                "line_total_mid": round(hrs * float(role.get("hourly_loaded_mid") or 0), 2),
            })
        materials_rows.append({
            "milestone_id": m["milestone_id"],
            "prototype_type": prototype_type,
            "amount_low": round(low_mat),
            "amount_mid": round(mid_mat),
            "amount_high": round(high_mat),
        })
        travel_rows.append({
            "milestone_id": m["milestone_id"],
            "destination": "CONUS integration site (default)",
            "nights": 5,
            "amount_mid": round(mid_travel),
        })
        odc_rows.append({
            "milestone_id": m["milestone_id"],
            "description": "Cloud, licenses, test infrastructure",
            "amount_mid": round(mid_odc),
        })

    return enriched, {
        "should_cost": {k: round(v) for k, v in totals.items()},
        "labor_detail": labor_rows,
        "materials": materials_rows,
        "travel": travel_rows,
        "odc": odc_rows,
    }


def apply_cost_share(
    should_mid: float,
    should_low: float,
    should_high: float,
    cost_path: str,
    authority: str,
    consortium: Optional[str],
) -> Dict[str, Any]:
    performer_share = 0.0
    if cost_path == "4022(d)(1)(C)":
        performer_share = should_mid * COST_SHARE_STATUTORY
    gov_low = should_low - (should_low * COST_SHARE_STATUTORY if cost_path == "4022(d)(1)(C)" else 0)
    gov_mid = should_mid - performer_share
    gov_high = should_high - (should_high * COST_SHARE_STATUTORY if cost_path == "4022(d)(1)(C)" else 0)

    fee_rate = CONSORTIUM_FEES.get(consortium or "", 0.0)
    consort_mid = round(should_mid * fee_rate) if fee_rate else 0
    gov_mid += consort_mid
    gov_low += round(should_low * fee_rate) if fee_rate else 0
    gov_high += round(should_high * fee_rate) if fee_rate else 0

    if authority == "10 USC 4022(f)":
        performer_share = 0.0
        gov_mid = should_mid + consort_mid

    return {
        "should_cost": {"low": round(should_low), "mid": round(should_mid), "high": round(should_high)},
        "government_obligation": {"low": round(gov_low), "mid": round(gov_mid), "high": round(gov_high)},
        "performer_share": {
            "low": round(performer_share * 0.85),
            "mid": round(performer_share),
            "high": round(performer_share * 1.15),
        },
        "consortium_fee": {
            "consortium": consortium,
            "rate": fee_rate,
            "amount_mid": consort_mid,
        } if consort_mid else None,
        "cost_share_required": cost_path == "4022(d)(1)(C)",
    }


def build_project_description_md(
    envelope: Dict[str, Any],
    row: Dict[str, Any],
) -> str:
    """OT/CSO project description narrative (bidder submission draft)."""
    vehicle = envelope.get("vehicle_type") or "OTA"
    agency = row.get("agency") or "Government sponsor"
    milestones = envelope.get("milestones") or []
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: ot_project_description",
        "---",
        "",
        f"# Project Description — {vehicle} Proposal",
        "",
        f"**Sponsor:** {agency} · **Authority:** {envelope.get('authority')}",
        f"**TRL:** {envelope.get('trl_entry')} → {envelope.get('trl_exit')} · **Prototype type:** {envelope.get('prototype_type')}",
        "",
        "## 1. Background and Objectives",
        "",
        "Summarize the mission problem and prototype objective as stated in the solicitation. "
        "Anchor every objective to a vault source path — do not invent requirements.",
        "",
        "## 2. Technical Approach",
        "",
        f"Approach spans TRL {envelope.get('trl_entry')} to {envelope.get('trl_exit')} using a "
        f"{envelope.get('prototype_type')} prototype pattern (see milestone table).",
        "",
        "## 3. Scope of Work",
        "",
    ]
    for m in milestones:
        lines.append(
            f"- **{m['milestone_id']}** ({m.get('est_duration_months')} mo): {m.get('description')} "
            f"[TRL {m.get('trl_in')}→{m.get('trl_out')}]"
        )
    lines.extend([
        "",
        "## 4. Deliverables",
        "",
    ])
    for m in milestones:
        lines.append(f"- {m['milestone_id']}: deliverables due on acceptance of exit criterion — {m.get('exit_criterion')}")
    lines.extend([
        "",
        "## 5. Milestone Payment Schedule",
        "",
        "| Milestone | Payment type | Amount (mid) | Exit criterion |",
        "|-----------|--------------|--------------|----------------|",
    ])
    for m in milestones:
        amt = m.get("payment_amount_mid") or m.get("should_cost_mid") or 0
        lines.append(
            f"| {m['milestone_id']} | {m.get('payment_type', 'fixed')} | ${amt:,} | "
            f"{(m.get('exit_criterion') or '')[:60]}… |"
        )
    lines.extend([
        "",
        "## 6. Period of Performance",
        "",
        f"Approximately {envelope.get('pop_months', 18)} months aligned to milestone durations.",
        "",
        "## 7. Government Furnished Information / Facilities",
        "",
        "_List GFI/GFE from solicitation; flag TBD items for Q&A._",
        "",
        "## 8. Constraints and Assumptions",
        "",
        f"- Cost-share path: {envelope.get('cost_share_path')} (performer share required: {envelope.get('cost_share_required')})",
        f"- Non-FAR vehicle: {envelope.get('non_far')}",
        "- CONUS travel only in cost model; OCONUS requires separate State Dept rates",
        "",
        "## 9. Transition Strategy",
        "",
        "Describe production / program-of-record transition if CSO Phase II or 4022(f) follow-on is contemplated.",
        "",
        "_Export to Word via **renderers** skill when narrative is final._",
    ])
    return "\n".join(lines)


def build_workbook_sheets(envelope: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    milestones = envelope.get("milestones") or []
    cost_detail = envelope.get("cost_detail") or {}
    totals = envelope.get("totals") or {}
    return {
        "Summary": [{
            "vehicle": envelope.get("vehicle_type"),
            "authority": envelope.get("authority"),
            "prototype_type": envelope.get("prototype_type"),
            "cost_share_path": envelope.get("cost_share_path"),
            "should_cost_mid": (totals.get("should_cost") or {}).get("mid"),
            "government_obligation_mid": (totals.get("government_obligation") or {}).get("mid"),
            "performer_share_mid": (totals.get("performer_share") or {}).get("mid"),
            "bid_target": (envelope.get("bid_recommendation") or {}).get("target_price"),
        }],
        "Milestones": [
            {
                "id": m["milestone_id"],
                "description": m.get("description"),
                "trl_in": m.get("trl_in"),
                "trl_out": m.get("trl_out"),
                "months": m.get("est_duration_months"),
                "payment_type": m.get("payment_type"),
                "should_cost_mid": m.get("should_cost_mid"),
                "exit_criterion": m.get("exit_criterion"),
            }
            for m in milestones
        ],
        "Labor": cost_detail.get("labor_detail") or [],
        "Materials": cost_detail.get("materials") or [],
        "Travel": cost_detail.get("travel") or [],
        "ODC": cost_detail.get("odc") or [],
        "Methodology": [
            {"topic": "Productive hours/year", "value": PRODUCTIVE_HOURS_YEAR},
            {"topic": "Burden commercial low/mid/high", "value": str(BURDEN_COMMERCIAL)},
            {"topic": "Materials heuristic", "value": envelope.get("prototype_type")},
            {"topic": "Statute", "value": envelope.get("authority")},
            {"topic": "MCP benchmarks", "value": len([m for m in envelope.get("mcp_benchmarks") or [] if m.get("ok")])},
        ],
    }


def build_risk_flags(
    envelope: Dict[str, Any],
    *,
    pop_months: int,
    mcp_ok: int,
    files_count: int,
) -> List[str]:
    flags: List[str] = []
    milestones = envelope.get("milestones") or []
    milestone_months = sum(int(m.get("est_duration_months") or 0) for m in milestones)
    if milestone_months < pop_months * 0.7:
        flags.append(f"Milestone months ({milestone_months}) < PoP ({pop_months}) — check parallel workstreams or scoping gap")
    if envelope.get("cost_share_path") == "4022(d)(1)(A)":
        flags.append("NDC work-share ≥33% typically required for path A — verify teaming agreement before submission")
    if envelope.get("vehicle_type") == "CSO":
        flags.append("CSO down-select risk — Phase I fee may be sunk if not selected for Phase II")
    if mcp_ok == 0:
        flags.append("Wage MCPs offline — refresh BLS OEWS + GSA CALC+ before final bid")
    if files_count == 0:
        flags.append("No solicitation text in Studio — milestone structure is heuristic only")
    if envelope.get("authority") == "10 USC 4022(f)":
        flags.append("4022(f) production follow-on — confirm predecessor prototype agreement number")
    flags.append("OCONUS travel not modeled — GSA Per Diem is CONUS-only")
    return flags[:8]