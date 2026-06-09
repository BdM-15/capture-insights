"""Co-pilot skill routing tests."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.skill_router import (  # noqa: E402
    match_skill_from_message,
    route_skill_from_message,
    score_skills_from_message,
)


def test_explicit_trigger_competitive_intel():
    sid = match_skill_from_message("What's the burn rate on contract 47QRAA-20-D-0001?")
    assert sid == "competitive-intel"


def test_description_route_proposal():
    route = route_skill_from_message("Help me draft win themes and a compliance matrix for this RFP")
    assert route.auto_invoke
    assert route.skill_id == "proposal-generator"


def test_description_suggest_vault_lint():
    route = route_skill_from_message("Can you health check our wiki files?")
    assert route.skill_id in ("vault-lint", None) or route.candidates[0].skill_id == "vault-lint"


def test_run_skill_explicit():
    route = route_skill_from_message("run vault-lint")
    assert route.auto_invoke
    assert route.skill_id == "vault-lint"


def test_scoring_returns_ordered():
    scored = score_skills_from_message("audit FAR clause coverage on our pursuit")
    assert scored
    assert scored[0].skill_id == "compliance-auditor"


def test_trigger_rfp_reverse_engineer():
    route = route_skill_from_message("Reverse engineer this RFP — what ghost language is hiding?")
    assert route.auto_invoke
    assert route.skill_id == "rfp-reverse-engineer"


def test_trigger_oci_sweeper():
    sid = match_skill_from_message("Run an OCI sweep before we team with the incumbent")
    assert sid == "oci-sweeper"


def test_trigger_ot_prototype():
    route = route_skill_from_message("Build an OT bid with TRL milestones for this prototype")
    assert route.skill_id == "ot-prototype-strategist"
    assert route.auto_invoke


def test_trigger_igce_ffp():
    route = route_skill_from_message("Build an FFP IGCE with wrap rate buildup")
    assert route.skill_id == "igce-builder-ffp"
    assert route.auto_invoke


def test_competitor_query_auto_invokes():
    route = route_skill_from_message("Find top competitors to KBR Services, LLC in NAICS 561210")
    assert route.skill_id == "competitive-intel"
    assert route.auto_invoke


def test_trigger_data_analyzer():
    route = route_skill_from_message("Run statistical analysis on this CSV dataset — find patterns")
    assert route.skill_id == "data-analyzer"
    assert route.auto_invoke