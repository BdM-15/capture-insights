"""OT cost engine unit tests."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.skill_tools.ot_cost_engine import (  # noqa: E402
    apply_cost_share,
    build_milestone_costs,
    detect_vehicle_and_authority,
    extract_trl_range,
    infer_prototype_type,
    _trl_milestone_templates,
)


def test_detect_cso():
    info = detect_vehicle_and_authority(
        "Commercial Solutions Opening Phase II prototype demonstration",
        "build CSO bid",
    )
    assert info["vehicle_type"] == "CSO"
    assert info["non_far"] is True


def test_detect_ota_4022f():
    info = detect_vehicle_and_authority("10 USC 4022(f) production follow-on", "")
    assert info["authority"] == "10 USC 4022(f)"


def test_trl_milestones_span():
    ms = _trl_milestone_templates(4, 6, "hybrid")
    assert len(ms) >= 2
    assert ms[0]["trl_in"] <= 4
    assert ms[-1]["trl_out"] >= 6


def test_hybrid_prototype_inference():
    assert infer_prototype_type("software and hardware integration prototype") == "hybrid"


def test_cost_share_path_c():
    totals = apply_cost_share(3_000_000, 2_500_000, 3_500_000, "4022(d)(1)(C)", "10 USC 4022", None)
    assert totals["performer_share"]["mid"] == 999_000
    assert totals["government_obligation"]["mid"] == 2_001_000


def test_milestone_cost_buildup_positive():
    labor = [{
        "category": "Developer",
        "soc": "15-1252",
        "fte": 2.0,
        "hourly_loaded_low": 120.0,
        "hourly_loaded_mid": 140.0,
        "hourly_loaded_high": 160.0,
    }]
    milestones = [{
        "milestone_id": "M1",
        "est_duration_months": 6,
        "description": "Demo",
        "trl_in": 4,
        "trl_out": 5,
        "payment_type": "fixed",
    }]
    enriched, detail = build_milestone_costs(milestones, labor, "software")
    assert enriched[0]["should_cost_mid"] > 0
    assert detail["should_cost"]["mid"] > 0


def test_extract_trl_range():
    assert extract_trl_range("TRL 4 to 7 demonstration") == (4, 7)