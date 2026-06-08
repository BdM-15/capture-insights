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


def pursuit_sam_scan_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/sam_scan.md"


def pursuit_competitive_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/competitive_snapshot.md"


def pursuit_readme_path(slug: str) -> str:
    return f"pursuits/{slug}/README.md"


def pursuit_artifact_paths(slug: str) -> Dict[str, str]:
    return {
        "brief": pursuit_brief_path(slug),
        "sam_scan": pursuit_sam_scan_path(slug),
        "competitive": pursuit_competitive_path(slug),
        "readme": pursuit_readme_path(slug),
    }