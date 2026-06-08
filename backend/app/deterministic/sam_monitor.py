"""Deterministic SAM monitor URL + keyword seeds from USASpending rows."""

from __future__ import annotations

import re
import urllib.parse
from typing import Any, Dict, List


def _clean_token(s: str, max_len: int = 48) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    return s[:max_len]


def notice_types_for_months(months_to_end: int) -> str:
    if months_to_end <= 12:
        return "Presolicitation,Solicitation,RFI,Sources Sought"
    if months_to_end <= 24:
        return "RFI,Sources Sought,Special Notice,Presolicitation"
    return "RFI,Sources Sought,Special Notice"


def seed_sam_search(row: Dict[str, Any], naics: str = "561210") -> Dict[str, str]:
    """Build keyword + notice-type seeds without LLM or SAM API."""
    agency = _clean_token(str(row.get("agency") or ""))
    recipient = _clean_token(str(row.get("recipient") or ""))
    months = int(row.get("months_to_end") or 24)

    parts: List[str] = []
    if agency:
        parts.append(agency)
    if recipient:
        # Incumbent name helps match follow-on cycles
        short_rec = recipient.split(",")[0].strip()
        if short_rec and short_rec.lower() not in (agency or "").lower():
            parts.append(short_rec[:32])

    keywords = " ".join(parts) or f"NAICS {naics}"
    notice_types = notice_types_for_months(months)
    return {"keywords": keywords, "notice_types": notice_types, "naics": naics}


def build_monitor_url(keywords: str, naics: str, notice_types: str) -> str:
    q = f"q={urllib.parse.quote(keywords)}&naics={naics}"
    if notice_types:
        q += f"&noticeType={urllib.parse.quote(notice_types)}"
    return f"https://sam.gov/search/?index=opp&{q}"


def build_monitor_entry(
    row: Dict[str, Any],
    naics: str = "561210",
    *,
    source: str = "deterministic",
) -> Dict[str, Any]:
    seed = seed_sam_search(row, naics)
    award_key = row.get("award_key") or ""
    recipient = row.get("recipient") or ""
    agency = row.get("agency") or ""
    end_date = row.get("end_date") or ""

    monitor_url = build_monitor_url(seed["keywords"], naics, seed["notice_types"])
    title_bits = recipient or agency or seed["keywords"][:40]

    return {
        "title": f"SAM Monitor: {title_bits}",
        "agency": agency or "Multiple",
        "recipient": recipient,
        "naics": naics,
        "keywords": seed["keywords"],
        "notice_types": seed["notice_types"],
        "monitorUrl": monitor_url,
        "notes": (
            f"Deterministic monitor from expiring award {award_key or 'n/a'} "
            f"(ends {end_date}). Keywords seeded from agency + incumbent; "
            f"notice types tuned to {int(row.get('months_to_end') or 0)}mo horizon."
        ),
        "citation": f"trigger:{award_key or 'expiring-row'} • naics:{naics} • {end_date}",
        "type": "sam-monitor",
        "source": source,
    }