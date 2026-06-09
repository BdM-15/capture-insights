"""PR5 — agentskills.io validation tests."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.skill_validation import validate_all_skills  # noqa: E402


def test_all_skills_validate():
    report = validate_all_skills()
    assert report["skill_count"] >= 25
    assert report["error_count"] == 0, report
    assert report["ok"] is True