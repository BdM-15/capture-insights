"""Pursuit folder naming stubs for Studio finalize (PR3+)."""

from __future__ import annotations

import re
from typing import Any, Dict


def pursuit_slug(row: Dict[str, Any]) -> str:
    agency = (row.get("agency") or "agency").strip()
    recipient = (row.get("recipient") or "recipient").strip()
    key = (row.get("award_key") or "")[:12]
    base = agency or recipient
    slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    if key:
        slug = f"{slug}-{key.lower()}"
    return slug[:64] or "pursuit-unknown"


def pursuit_brief_path(slug: str) -> str:
    return f"pursuits/{slug}/01_capture/strategy/capture_brief.md"