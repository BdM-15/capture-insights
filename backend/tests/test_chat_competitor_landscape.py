"""Competitor landscape co-pilot deliverable."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.chat_competitor_landscape import (  # noqa: E402
    build_competitor_landscape_response,
    extract_anchor_company,
    extract_naics_from_message,
    wants_competitor_landscape,
)
from app.skill_router import route_skill_from_message  # noqa: E402


def test_wants_competitor_landscape():
    assert wants_competitor_landscape("Find top competitors to KBR in NAICS 561210")


def test_extract_anchor_and_naics():
    msg = "Find top competitors to KBR Services, LLC in NAICS 561210"
    assert extract_naics_from_message(msg, fallback="561210") == "561210"
    assert "KBR" in (extract_anchor_company(msg) or "")


def test_route_auto_for_competitor_query():
    route = route_skill_from_message("Find top competitors to KBR Services, LLC in NAICS 561210")
    assert route.skill_id == "competitive-intel"
    assert route.auto_invoke


def test_landscape_returns_summary_and_studio_path():
    msg = "Find top competitors to KBR Services, LLC in NAICS 561210"
    result = build_competitor_landscape_response(message=msg, naics="561210")
    assert result is not None
    assert result["source"] == "competitor-landscape"
    assert result.get("path", "").startswith("copilot/intel/")
    assert "Top" in result["response"]
    assert "Studio" in result["response"]
    actions = result.get("suggested_actions") or []
    assert any(a.get("action") == "open_studio" for a in actions)
    assert not any(
        a.get("payload", {}).get("skill_id") == "competitive-intel"
        for a in actions
        if a.get("action") == "invoke_skill"
    )