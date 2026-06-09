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


def pursuit_competitive_intel_json_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/competitive_intel_obligation.json"


def pursuit_competitive_intel_md_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/competitive_intel.md"


def pursuit_ptw_analysis_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/ptw_analysis.md"


def pursuit_ptw_analysis_json_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/ptw_analysis.json"


def pursuit_sam_monitor_path(slug: str) -> str:
    return f"pursuits/{slug}/02_intel/sam_monitor.md"


def pursuit_battlecard_path(slug: str) -> str:
    return f"pursuits/{slug}/03_capture/competitive_battlecard.md"


def pursuit_compliance_audit_path(slug: str) -> str:
    return f"pursuits/{slug}/04_proposal/compliance_audit.md"


def pursuit_compliance_audit_json_path(slug: str) -> str:
    return f"pursuits/{slug}/04_proposal/compliance_audit.json"


def pursuit_proposal_outline_path(slug: str) -> str:
    return f"pursuits/{slug}/04_proposal/proposal_outline.md"


def pursuit_executive_summary_path(slug: str) -> str:
    return f"pursuits/{slug}/04_proposal/executive_summary.md"


def pursuit_sub_sow_path(slug: str) -> str:
    return f"pursuits/{slug}/04_proposal/sub_sow_pws.md"


def pursuit_one_pager_html_path(slug: str) -> str:
    return f"pursuits/{slug}/05_visuals/one_pager.html"


def pursuit_readme_path(slug: str) -> str:
    return f"pursuits/{slug}/README.md"


def pursuit_artifact_paths(slug: str) -> Dict[str, str]:
    return {
        "brief": pursuit_brief_path(slug),
        "sam_scan": pursuit_sam_scan_path(slug),
        "competitive": pursuit_competitive_path(slug),
        "competitive_intel": pursuit_competitive_intel_md_path(slug),
        "competitive_intel_json": pursuit_competitive_intel_json_path(slug),
        "ptw_analysis": pursuit_ptw_analysis_path(slug),
        "ptw_analysis_json": pursuit_ptw_analysis_json_path(slug),
        "sam_monitor": pursuit_sam_monitor_path(slug),
        "battlecard": pursuit_battlecard_path(slug),
        "compliance_audit": pursuit_compliance_audit_path(slug),
        "compliance_audit_json": pursuit_compliance_audit_json_path(slug),
        "proposal_outline": pursuit_proposal_outline_path(slug),
        "executive_summary": pursuit_executive_summary_path(slug),
        "sub_sow": pursuit_sub_sow_path(slug),
        "one_pager": pursuit_one_pager_html_path(slug),
        "readme": pursuit_readme_path(slug),
    }