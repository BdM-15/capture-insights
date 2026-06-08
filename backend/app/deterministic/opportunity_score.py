"""Enrich scored expiring rows for Future Opportunities (deterministic overlays)."""

from __future__ import annotations

from typing import Any, Dict, List, Set

from .pursuit_paths import pursuit_brief_path, pursuit_slug
from .sam_monitor import seed_sam_search

TIER_ORDER = {"prime": 0, "advance": 1, "monitor": 2, "track": 3}


def tier_label(tier: str) -> str:
    return {
        "prime": "Prime target",
        "advance": "Advance",
        "monitor": "Monitor",
        "track": "Track",
    }.get(tier, tier)


def _brain_match(name: str, brain_names: Set[str]) -> bool:
    n = (name or "").lower()[:18]
    if not n:
        return False
    return any(
        bn and (bn in n or n in bn)
        for bn in brain_names
    )


def enrich_opportunity_row(
    row: Dict[str, Any],
    *,
    naics: str,
    brain_names: List[str] | None = None,
    existing_monitor_keys: Set[str] | None = None,
) -> Dict[str, Any]:
    brain_set = {b.lower()[:18] for b in (brain_names or []) if b}
    seed = seed_sam_search(row, naics)
    slug = pursuit_slug(row)
    award_key = str(row.get("award_key") or "")

    in_brain = _brain_match(row.get("recipient") or "", brain_set) or _brain_match(
        row.get("agency") or "", brain_set
    )
    has_monitor = bool(
        existing_monitor_keys
        and (
            award_key in existing_monitor_keys
            or seed["keywords"].lower() in existing_monitor_keys
        )
    )

    signals: List[str] = list(row.get("signals") or [])
    if in_brain and "vault_tracked" not in signals:
        signals.append("vault_tracked")

    display_score = int(row.get("combo_score") or 0) + (10 if in_brain else 0)

    return {
        **row,
        "signals": signals,
        "signal_count": len(signals),
        "display_score": display_score,
        "in_brain": in_brain,
        "has_monitor": has_monitor,
        "pursuit_slug": slug,
        "pursuit_brief_path": pursuit_brief_path(slug),
        "suggested_sam_keywords": seed["keywords"],
        "suggested_notice_types": seed["notice_types"],
        "tier_label": tier_label(str(row.get("combo_tier") or "track")),
    }