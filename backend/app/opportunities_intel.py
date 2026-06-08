"""Future Opportunities intel — scored recompetes + deterministic SAM seeds."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from .deterministic.opportunity_score import enrich_opportunity_row
from .deterministic.sam_budget import get_budget_status, reserve_sam_call
from .queries import get_combo_insights, get_executive_kpis


def _monitor_keys_from_pipeline(pipeline: List[Dict[str, Any]] | None) -> Set[str]:
    keys: Set[str] = set()
    for item in pipeline or []:
        if item.get("type") != "sam-monitor":
            continue
        citation = str(item.get("citation") or "")
        if "trigger:" in citation:
            part = citation.split("trigger:", 1)[1].split("•", 1)[0].strip()
            if part:
                keys.add(part)
        kw = str(item.get("keywords") or "").lower()
        if kw:
            keys.add(kw)
    return keys


def get_opportunities_intel(
    naics_codes: Optional[List[str]],
    *,
    months_ahead: int = 36,
    limit: int = 40,
    brain_names: Optional[List[str]] = None,
    pipeline: Optional[List[Dict[str, Any]]] = None,
    include_proactive_sam: bool = True,
) -> Dict[str, Any]:
    primary_naics = (naics_codes or ["561210"])[0]
    combo = get_combo_insights(
        naics_codes,
        months_ahead=months_ahead,
        limit=limit,
    )
    monitor_keys = _monitor_keys_from_pipeline(pipeline)

    rows = [
        enrich_opportunity_row(
            m,
            naics=primary_naics,
            brain_names=brain_names,
            existing_monitor_keys=monitor_keys,
        )
        for m in combo.get("matches") or []
    ]

    # Re-sort by display_score then timing
    rows.sort(
        key=lambda r: (
            r.get("display_score", 0) * -1,
            r.get("months_to_end", 99),
            (r.get("obligation") or 0) * -1,
        )
    )

    hot_count = sum(1 for r in rows if "hot_agency" in (r.get("signals") or []))
    brain_overlap = sum(1 for r in rows if r.get("in_brain"))
    no_monitor_hot = sum(
        1 for r in rows
        if "hot_agency" in (r.get("signals") or []) and not r.get("has_monitor")
    )
    prime_m = round(
        sum(r.get("obligation_millions", 0) for r in rows if r.get("combo_tier") == "prime"),
        2,
    )

    kpis = get_executive_kpis(naics_codes)
    budget = get_budget_status()

    proactive_meta = {
        "enabled": False,
        "reason": "",
        "rows_targeted": 0,
    }
    if include_proactive_sam:
        if budget["remaining"] < 50:
            proactive_meta["reason"] = "SAM daily budget below reserve threshold"
        elif not reserve_sam_call(3):
            proactive_meta["reason"] = "SAM daily budget exhausted"
        else:
            proactive_meta["enabled"] = True
            proactive_meta["rows_targeted"] = min(3, len(rows))

    return {
        "meta": {
            "months_ahead": months_ahead,
            "naics": primary_naics,
            "scoring_note": combo.get("meta", {}).get("scoring_note", ""),
            "proactive_sam": proactive_meta,
        },
        "readiness": {
            "sam_budget": budget,
        },
        "summary": {
            "row_count": len(rows),
            "hot_agency_count": hot_count,
            "brain_overlap": brain_overlap,
            "no_monitor_hot": no_monitor_hot,
            "prime_millions": prime_m,
            "expiring_24m": kpis.get("expiring_24m"),
            "future_funding_24m_m": kpis.get("future_funding_potential_24m_m"),
            "sam_monitors_in_pipeline": sum(
                1 for p in (pipeline or []) if p.get("type") == "sam-monitor"
            ),
        },
        "tier_counts": combo.get("tier_counts") or {},
        "rows": rows,
    }