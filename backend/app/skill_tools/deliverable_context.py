"""Pursuit deliverable context for PR3 skills (vault files — no KG)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from ..user_data import read_knowledge_file
from .pursuit_context import list_pursuit_markdown_files, pursuit_context_bundle

_KNOWLEDGE = Path("data") / "knowledge"

_ARTIFACT_KEYS = (
    ("brief", "01_capture/strategy/capture_brief.md"),
    ("competitive_intel", "02_intel/competitive_intel.md"),
    ("competitive_snapshot", "02_intel/competitive_snapshot.md"),
    ("battlecard", "03_capture/competitive_battlecard.md"),
    ("ptw", "02_intel/ptw_analysis.md"),
    ("teaming", "03_capture/teaming_candidates.md"),
    ("compliance", "04_proposal/compliance_audit.md"),
)


def load_pursuit_artifact_texts(slug: str) -> Dict[str, str]:
    """Map logical keys to markdown bodies that exist on disk."""
    out: Dict[str, str] = {}
    for key, suffix in _ARTIFACT_KEYS:
        rel = f"pursuits/{slug}/{suffix}"
        doc = read_knowledge_file(rel)
        if doc and doc.get("content"):
            out[key] = doc["content"]
    return out


def deliverable_context_pack(slug: str, row: Dict[str, Any]) -> Dict[str, Any]:
    artifacts = load_pursuit_artifact_texts(slug)
    bundle = pursuit_context_bundle(slug, max_files=16)
    return {
        "slug": slug,
        "row": {
            "agency": row.get("agency"),
            "recipient": row.get("recipient"),
            "award_key": row.get("award_key"),
            "naics": row.get("naics"),
        },
        "artifacts": {k: v[:6000] for k, v in artifacts.items()},
        "artifact_keys": list(artifacts.keys()),
        "file_count": bundle.get("files_scanned", 0),
        "clause_count": (bundle.get("clause_inventory") or {}).get("clause_count", 0),
    }