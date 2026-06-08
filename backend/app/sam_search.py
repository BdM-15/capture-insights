"""Shared SAM.gov search with MCP-first hybrid, cache, and daily budget."""

from __future__ import annotations

from typing import Any, Dict, List

import httpx

from .config import settings
from .deterministic.sam_budget import (
    cache_get,
    cache_key,
    cache_set,
    get_budget_status,
    record_sam_call,
    reserve_sam_call,
)


def _sam_key_configured() -> bool:
    key = settings.sam_api_key or ""
    return bool(key) and not key.startswith("SAM-7fa8ffb7") and len(key) >= 20


async def search_sam_opportunities(
    naics: str = "561210",
    keywords: str = "",
    notice_types: str = "",
    limit: int = 10,
    *,
    use_mcp: bool = True,
    charge_budget: bool = True,
) -> Dict[str, Any]:
    """Search SAM with cache + budget. Returns {results, source, cached, budget}."""
    ck = cache_key(naics, keywords, notice_types, limit)
    cached = cache_get(ck)
    if cached is not None:
        return {
            "results": cached,
            "source": "cache",
            "cached": True,
            "budget": get_budget_status(),
        }

    if charge_budget and not reserve_sam_call(1):
        return {
            "results": [{
                "title": "SAM daily API budget reached (1000/day)",
                "agency": "Retry tomorrow or use deterministic monitor URLs",
                "noticeType": "info",
                "link": "",
            }],
            "source": "budget-blocked",
            "cached": False,
            "budget": get_budget_status(),
        }

    results: List[Dict[str, Any]] = []
    source = "none"

    if use_mcp and settings.enable_live_mcps:
        try:
            from .mcp import search_sam_opportunities_mcp
            mcp_results = await search_sam_opportunities_mcp(
                naics=naics,
                keywords=keywords,
                notice_types=notice_types,
                limit=limit,
            )
            if mcp_results:
                for item in mcp_results:
                    if isinstance(item, dict):
                        item.setdefault("_source", "mcp:sam-gov-mcp")
                results = mcp_results
                source = "mcp"
        except Exception:
            pass

    if not results and _sam_key_configured():
        params: dict = {
            "api_key": settings.sam_api_key,
            "limit": limit,
            "index": "opp",
        }
        if naics:
            params["naicsCode"] = naics
        if keywords:
            params["q"] = keywords
        if notice_types:
            params["noticeType"] = notice_types
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(settings.sam_api_base_url, params=params)
                r.raise_for_status()
                data = r.json()
            opps = data.get("opportunitiesData") or data.get("_embedded", {}).get("opportunities", []) or []
            for o in opps[:limit]:
                opp_id = o.get("opportunityId") or o.get("id")
                link = o.get("link") or (f"https://sam.gov/opp/{opp_id}/view" if opp_id else "https://sam.gov")
                results.append({
                    "title": o.get("title") or o.get("opportunityTitle") or "Untitled",
                    "noticeType": o.get("noticeType") or o.get("type") or "",
                    "responseDeadLine": o.get("responseDeadLine") or o.get("endDate") or "",
                    "agency": o.get("agency") or o.get("organizationName") or o.get("department") or "",
                    "link": link,
                    "description": (o.get("description") or o.get("synopsis") or "")[:300],
                    "_source": "direct:sam-gov-api",
                })
            source = "rest"
            if charge_budget:
                record_sam_call(1)
        except Exception as e:
            results = [{"title": f"SAM search error: {e}", "agency": "Check key / network", "link": ""}]
            source = "error"

    elif not results:
        results = [{
            "title": "SAM.gov search requires SAM_API_KEY in .env",
            "agency": "Get free key at https://api.data.gov/signup/",
            "link": "https://api.data.gov/signup/",
            "noticeType": "info",
        }]
        source = "placeholder"

    if results and source in ("mcp", "rest"):
        cache_set(ck, results)

    return {
        "results": results,
        "source": source,
        "cached": False,
        "budget": get_budget_status(),
    }