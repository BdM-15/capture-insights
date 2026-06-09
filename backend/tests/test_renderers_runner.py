"""Renderers skill unit tests."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.skill_router import route_skill_from_message  # noqa: E402


def test_route_renderers_export():
    route = route_skill_from_message("render docx from pursuits/foo/04_proposal/executive_summary.md")
    assert route.skill_id == "renderers"
    assert route.auto_invoke