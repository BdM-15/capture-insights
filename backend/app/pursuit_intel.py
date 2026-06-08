"""Gather live MCP + DuckDB context for pursuit workspace enrichment."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .queries import get_agency_recipient_relationships, get_top_recipient_agency_flows


def _name_match(hay: str, needle: str) -> bool:
    h = (hay or "").lower()
    n = (needle or "").lower().strip()
    if not n or not h:
        return False
    short = n[:18]
    return short in h or h[:18] in short


async def gather_sam_intel(
    row: Dict[str, Any],
    naics: str,
    *,
    limit: int = 5,
) -> Dict[str, Any]:
    from .sam_search import search_sam_opportunities

    keywords = str(row.get("suggested_sam_keywords") or row.get("agency") or row.get("recipient") or "")
    notice_types = str(row.get("suggested_notice_types") or "")
    pack = await search_sam_opportunities(
        naics=naics,
        keywords=keywords,
        notice_types=notice_types,
        limit=limit,
        charge_budget=True,
    )
    return {
        "keywords": keywords,
        "notice_types": notice_types,
        "results": pack.get("results") or [],
        "source": pack.get("source") or "none",
        "cached": pack.get("cached", False),
    }


def gather_usaspending_intel(
    row: Dict[str, Any],
    naics: str,
    *,
    limit: int = 8,
) -> Dict[str, Any]:
    naics_list = [naics] if naics else None
    recipient = str(row.get("recipient") or "")
    agency = str(row.get("agency") or "")

    relationships = get_agency_recipient_relationships(naics_list, limit=240)
    flows = get_top_recipient_agency_flows(naics_list, limit=80)

    rel_hits = [
        r for r in relationships
        if _name_match(r.get("recipient") or "", recipient)
        or _name_match(r.get("agency") or "", agency)
    ][:limit]

    flow_hits = [
        f for f in flows
        if _name_match(f.get("recipient") or "", recipient)
        or _name_match(f.get("agency") or "", agency)
    ][:limit]

    return {
        "recipient": recipient,
        "agency": agency,
        "relationships": rel_hits,
        "flows": flow_hits,
        "source": "duckdb:usaspending",
    }


async def gather_pursuit_intel(row: Dict[str, Any], naics: str) -> Dict[str, Any]:
    sam = await gather_sam_intel(row, naics)
    usa = gather_usaspending_intel(row, naics)
    return {"sam": sam, "usaspending": usa}