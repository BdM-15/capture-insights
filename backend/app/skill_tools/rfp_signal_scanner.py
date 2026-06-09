"""Deterministic RFP signal scan — pursuit vault files (no KG). Inspired by 1102/Theseus patterns."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from .pursuit_context import collect_pursuit_clause_inventory, list_pursuit_markdown_files

# Ghost language — see skills/rfp-reverse-engineer/references/rfp_signal_patterns.md
_GHOST_PHRASES: Tuple[Tuple[str, str], ...] = (
    ("as appropriate", "unbounded discretion"),
    ("as required", "unbounded discretion"),
    ("as needed", "unbounded discretion"),
    ("where applicable", "unpriceable scope"),
    ("when directed", "surge / out-of-scope risk"),
    ("best practices", "unmeasurable standard"),
    ("industry standard", "unmeasurable standard"),
    ("high quality", "subjective acceptance"),
    ("in a timely manner", "subjective acceptance"),
    ("will be evaluated", "undefined evaluation method"),
)

_CONTRACT_CUES: Tuple[Tuple[str, str, str], ...] = (
    ("52.232-7", "T&M / labor-hour", "locked"),
    ("16.601", "T&M / IDIQ order", "locked"),
    ("16.306(d)(1)", "CPFF completion", "locked"),
    ("16.306(d)(2)", "CPFF term", "locked"),
    ("16.306", "cost-reimbursement (form ambiguous)", "implied"),
    ("16.305", "CPAF", "locked"),
    ("16.404", "CPIF", "locked"),
    ("52.212-4", "commercial", "locked"),
    ("part 12", "commercial", "implied"),
    ("fully burdened labor rates", "T&M / LH pricing", "implied"),
    ("fixed monthly price", "FFP", "implied"),
    ("estimated cost", "cost-reimbursement", "implied"),
)

_MISSING_SECTION_CHECKS: Tuple[Tuple[str, Tuple[str, ...], str], ...] = (
    ("transition", ("transition", "transition-in", "transition out"), "Recompetes usually need transition — silence may mean amendment coming"),
    ("period of performance", ("period of performance", "base period", "option period"), "Cannot price without PoP — file Q&A"),
    ("place of performance", ("place of performance", "performance location", "remote work"), "Confirm sites vs remote authorization"),
    ("qasp", ("qasp", "quality assurance surveillance", "performance work statement"), "No quality framework — CPFF risk or amendment"),
    ("security", ("security clearance", "fedramp", "cmmc", "itar"), "Classified-adjacent work without security section — DD254 may be separate"),
    ("government-furnished", ("government-furnished", "gfi", "gfe", "gfep"), "Section 3 may reference systems without GFI list"),
)

_DISCRIMINATOR_CUES: Tuple[Tuple[str, str], ...] = (
    ("transition", "Transition plan and risk reduction — incumbent weakness if they fumbled prior transition"),
    ("key personnel", "Named roles = CO anxiety about staffing — bring résumés and backups"),
    ("surge", "Surge capacity = staffing discriminator — show bench depth"),
    ("oral presentation", "Oral pres = relationship and clarity win — not just paper"),
    ("demonstration", "Demo factor = show don't tell"),
    ("past performance", "PP weighting — cite same agency / NAICS"),
    ("small business", "Socioeconomic plan may be pass/fail"),
)


def _combined_text(files: List[Dict[str, Any]]) -> str:
    return "\n\n".join(f.get("content") or "" for f in files)


def scan_ghost_language(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    hits: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for f in files:
        content = (f.get("content") or "").lower()
        path = f.get("path") or ""
        for phrase, risk in _GHOST_PHRASES:
            if phrase not in content:
                continue
            key = f"{phrase}:{path}"
            if key in seen:
                continue
            seen.add(key)
            hits.append({
                "phrase": phrase,
                "risk": risk,
                "source_path": path,
                "recommended_action": f"Q&A: ask CO to define '{phrase}' with measurable criteria",
            })
    return hits


def infer_contract_type(clauses: Dict[str, Any], text: str) -> Dict[str, Any]:
    blob = text.lower()
    signals: List[Dict[str, str]] = []
    for needle, label, status in _CONTRACT_CUES:
        if needle.lower() in blob:
            signals.append({"cue": needle, "inference": label, "status": status})

    for c in (clauses.get("clauses") or []):
        sid = str(c.get("section_id") or "")
        for needle, label, status in _CONTRACT_CUES:
            if needle.replace(".", "") in sid.replace(".", ""):
                signals.append({"cue": sid, "inference": label, "status": status})

    primary = signals[0]["inference"] if signals else "unknown"
    return {
        "primary_type": primary,
        "signals": signals[:8],
        "cpff_form_signal": next(
            (s for s in signals if "CPFF" in s.get("inference", "")),
            {"status": "open", "note": "No CPFF form cue detected"},
        ),
    }


def infer_sow_vs_pws(text: str) -> Dict[str, Any]:
    lower = text.lower()
    pws_hits = sum(1 for k in ("qasp", "performance work statement", "performance standard", "aql") if k in lower)
    sow_hits = sum(1 for k in ("statement of work", "the contractor shall perform", "inspection and acceptance") if k in lower)
    if pws_hits > sow_hits and pws_hits >= 2:
        return {"format": "PWS", "confidence": "medium", "status": "locked"}
    if sow_hits > pws_hits and sow_hits >= 2:
        return {"format": "SOW", "confidence": "medium", "status": "locked"}
    if pws_hits and sow_hits:
        return {"format": "hybrid", "confidence": "low", "status": "ambiguous"}
    return {"format": "unknown", "confidence": "low", "status": "open"}


def scan_missing_sections(text: str) -> List[Dict[str, Any]]:
    lower = text.lower()
    missing: List[Dict[str, Any]] = []
    for name, keywords, implication in _MISSING_SECTION_CHECKS:
        if not any(k in lower for k in keywords):
            missing.append({
                "section_name": name,
                "inference_rule": f"No '{keywords[0]}' language detected in pursuit corpus",
                "risk": implication,
                "recommended_action": "Add to clarification questions for capture call",
            })
    return missing


def scan_discriminator_hooks(text: str) -> List[Dict[str, Any]]:
    lower = text.lower()
    hooks: List[Dict[str, Any]] = []
    for keyword, opportunity in _DISCRIMINATOR_CUES:
        if keyword in lower:
            hooks.append({
                "signal": keyword,
                "opportunity": opportunity,
                "source_hint": f"Matched '{keyword}' in pursuit markdown corpus",
            })
    return hooks


def infer_decision_blocks(text: str, row: Dict[str, Any]) -> Dict[str, Any]:
    lower = text.lower()
    return {
        "block_1_mission": {
            "co_choice": row.get("agency") or "see Section 1 / background in solicitation",
            "status": "implied" if row.get("agency") else "open",
            "derivation_signal": "Pipeline row agency + background keywords",
        },
        "block_2_technical_scope": {
            "co_choice": "Task/objective titles in Section 3 — scan uploaded solicitation",
            "status": "locked" if "section 3" in lower or "scope of work" in lower else "open",
        },
        "block_3_staffing_model": {
            "co_choice": "Key personnel / labor categories if present",
            "status": "locked" if "key personnel" in lower or "labor categor" in lower else "open",
        },
        "block_4_performance": {
            "co_choice": "QASP / SLA / AQL thresholds",
            "status": "locked" if "qasp" in lower or "acceptance" in lower else "open",
        },
        "block_5_deliverables": {
            "co_choice": "CDRL / deliverable table",
            "status": "locked" if "deliverable" in lower else "open",
        },
        "block_6_constraints": {
            "co_choice": "Section 14 / assumptions — read first for CO intent leaks",
            "status": "locked" if "assumption" in lower or "constraint" in lower else "open",
        },
    }


def scan_rfp_signals(slug: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Full deterministic envelope for rfp-reverse-engineer."""
    files = list_pursuit_markdown_files(slug)
    text = _combined_text(files)
    clauses = collect_pursuit_clause_inventory(slug)

    return {
        "slug": slug,
        "source_file_count": len(files),
        "source_paths": [f["path"] for f in files],
        "inferred_intake": {
            "sow_vs_pws": infer_sow_vs_pws(text),
            "contract_type": infer_contract_type(clauses, text),
            "commercial_signal": {
                "status": "locked" if "52.212" in text.lower() or "part 12" in text.lower() else "open",
            },
        },
        "decision_tree": infer_decision_blocks(text, row),
        "ghost_language": scan_ghost_language(files),
        "missing_sections": scan_missing_sections(text) if text else [],
        "discriminator_hooks": scan_discriminator_hooks(text),
        "hot_buttons": [
            {
                "topic": h["signal"],
                "why_it_matters": h["opportunity"],
                "source_hint": h["source_hint"],
            }
            for h in scan_discriminator_hooks(text)[:6]
        ],
        "clause_inventory_summary": {
            "clause_count": clauses.get("clause_count", 0),
            "top_clauses": [c.get("section_id") for c in (clauses.get("clauses") or [])[:12]],
        },
        "capture_lens": (
            "Contractor-side stance inversion: read the CO's published document backwards into "
            "the same decision tree a 1102 SOW/PWS Builder walks forward — without pretending you are the CO."
        ),
    }