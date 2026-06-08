"""Pursuit skill workspace — vault artifacts, MCP intel, optional LLM enrichment."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .deterministic.opportunity_score import enrich_opportunity_row
from .deterministic.pursuit_paths import (
    pursuit_artifact_paths,
    pursuit_brief_path,
    pursuit_competitive_path,
    pursuit_readme_path,
    pursuit_sam_scan_path,
    pursuit_slug,
)
from .pursuit_intel import gather_pursuit_intel
from .user_data import read_knowledge_file, write_knowledge_file

try:
    from . import llm as llm_client
except Exception:
    llm_client = None

WORKSPACE_SKILLS = [
    {
        "id": "capture-brief",
        "name": "Capture Brief",
        "status": "active",
        "use_when": "Snapshot from USASpending; use Enrich for SAM + LLM narrative",
        "supports_llm": True,
    },
    {
        "id": "sam-scan",
        "name": "SAM Scan",
        "status": "active",
        "use_when": "Live SAM.gov notices — saves sam_scan.md in vault",
        "supports_llm": False,
    },
    {
        "id": "competitive-snapshot",
        "name": "Competitive Snapshot",
        "status": "active",
        "use_when": "Incumbent/agency award relationships from USASpending bulk data",
        "supports_llm": False,
    },
    {
        "id": "sam-monitor-builder",
        "name": "SAM Monitor Builder",
        "status": "partial",
        "use_when": "Save a SAM.gov keyword search to Pipeline for this cycle",
        "supports_llm": False,
    },
]

ARTIFACT_LABELS = {
    "brief": "Capture brief",
    "sam_scan": "SAM scan",
    "competitive": "Competitive snapshot",
    "readme": "Pursuit index",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _enriched_row(item: Dict[str, Any], naics: str, brain_names: Optional[List[str]] = None) -> Dict[str, Any]:
    return enrich_opportunity_row(
        item,
        naics=naics,
        brain_names=brain_names or [],
        existing_monitor_keys=set(),
    )


def _artifact_status(slug: str) -> List[Dict[str, Any]]:
    paths = pursuit_artifact_paths(slug)
    out: List[Dict[str, Any]] = []
    for key, rel in paths.items():
        doc = read_knowledge_file(rel)
        out.append({
            "id": key,
            "label": ARTIFACT_LABELS.get(key, key),
            "path": rel,
            "exists": bool(doc),
            "bytes": doc.get("size", 0) if doc else 0,
        })
    return out


def get_workspace_meta(
    item: Dict[str, Any],
    naics: str = "561210",
    *,
    brain_names: Optional[List[str]] = None,
) -> Dict[str, Any]:
    row = _enriched_row(item, naics, brain_names)
    slug = row.get("pursuit_slug") or pursuit_slug(item)
    artifacts = _artifact_status(slug)
    brief = next((a for a in artifacts if a["id"] == "brief"), None)
    return {
        "slug": slug,
        "brief_path": brief["path"] if brief else pursuit_brief_path(slug),
        "brief_exists": bool(brief and brief["exists"]),
        "brief_bytes": brief["bytes"] if brief else 0,
        "artifacts": artifacts,
        "row": row,
        "skills": WORKSPACE_SKILLS,
        "vault_root": f"pursuits/{slug}",
    }


def _signal_lines(signals: List[str]) -> str:
    if not signals:
        return "- (none in current slice)"
    return "\n".join(f"- {s}" for s in signals)


def build_sam_scan_markdown(row: Dict[str, Any], intel: Dict[str, Any], naics: str) -> str:
    slug = row.get("pursuit_slug") or pursuit_slug(row)
    sam = intel.get("sam") or {}
    results = sam.get("results") or []
    lines = [
        "---",
        f"id: pursuit-{slug}-sam-scan",
        "type: pursuit-intel",
        "artifact: sam_scan",
        f"naics: {naics}",
        f"updated: {_utc_now()}",
        "tags: [sam, pursuit, intel]",
        "---",
        "",
        f"# SAM.gov scan — {row.get('recipient') or 'incumbent'}",
        "",
        f"**Keywords:** `{sam.get('keywords') or ''}`",
        f"**Source:** {sam.get('source') or 'none'} · cached={sam.get('cached')}",
        "",
    ]
    if not results:
        lines.append("_No notices returned (check SAM API key or budget)._")
    else:
        for i, hit in enumerate(results[:8], 1):
            if not isinstance(hit, dict):
                continue
            lines.append(f"### {i}. {hit.get('title') or 'Untitled'}")
            lines.append(f"- **Type:** {hit.get('noticeType') or '—'}")
            lines.append(f"- **Agency:** {hit.get('agency') or '—'}")
            lines.append(f"- **Due:** {hit.get('responseDeadLine') or '—'}")
            if hit.get("link"):
                lines.append(f"- **Link:** {hit.get('link')}")
            lines.append("")
    lines.append(f"\n_Citations: SAM.gov via {sam.get('source')}; seeded from expiring award {row.get('award_key') or 'n/a'}._")
    return "\n".join(lines)


def build_competitive_markdown(row: Dict[str, Any], intel: Dict[str, Any], naics: str) -> str:
    slug = row.get("pursuit_slug") or pursuit_slug(row)
    usa = intel.get("usaspending") or {}
    rels = usa.get("relationships") or []
    flows = usa.get("flows") or []
    lines = [
        "---",
        f"id: pursuit-{slug}-competitive",
        "type: pursuit-intel",
        "artifact: competitive_snapshot",
        f"naics: {naics}",
        f"updated: {_utc_now()}",
        "tags: [competitive, pursuit, usaspending]",
        "---",
        "",
        f"# Competitive snapshot — {row.get('recipient') or 'incumbent'}",
        "",
        f"Filtered USASpending relationships for **{usa.get('recipient')}** at **{usa.get('agency')}** (NAICS {naics}).",
        "",
        "## Agency × incumbent relationships",
    ]
    if rels:
        for r in rels:
            lines.append(
                f"- **{r.get('recipient', '—')}** @ {r.get('agency', '—')}: "
                f"{r.get('actions', '?')} awards, ${r.get('millions', '?')}M"
            )
    else:
        lines.append("_No close name matches in loaded relationship slice._")
    lines.append("")
    lines.append("## Top flows (recipient → agency → office)")
    if flows:
        for f in flows:
            lines.append(
                f"- {f.get('recipient', '—')} → {f.get('agency', '—')} / {f.get('office', '—')}: "
                f"${f.get('millions', '?')}M ({f.get('actions', '?')} actions)"
            )
    else:
        lines.append("_No matching flows in current slice._")
    lines.append("")
    lines.append("_Source: capture.duckdb USASpending bulk ingest._")
    return "\n".join(lines)


def build_capture_brief_markdown(
    row: Dict[str, Any],
    naics: str,
    *,
    brain_names: Optional[List[str]] = None,
    intel: Optional[Dict[str, Any]] = None,
    llm_section: Optional[str] = None,
) -> str:
    slug = row.get("pursuit_slug") or pursuit_slug(row)
    recipient = row.get("recipient") or "Unknown incumbent"
    agency = row.get("agency") or "Unknown agency"
    end = row.get("end_date") or "—"
    months = row.get("months_to_end")
    oblig_m = row.get("obligation_millions")
    if oblig_m is None:
        oblig_m = round((row.get("obligation") or 0) / 1e6, 2)
    tier = row.get("tier_label") or row.get("combo_tier") or "track"
    score = row.get("display_score") or row.get("combo_score") or 0
    award_key = row.get("award_key") or ""
    signals = row.get("signals") or []
    sam_kw = row.get("suggested_sam_keywords") or ""
    brain_note = ", ".join(brain_names[:5]) if brain_names else "none"

    parts = [
        "---",
        f"id: pursuit-{slug}",
        "type: pursuit-brief",
        f"slug: {slug}",
        f"naics: {naics}",
        f'award_key: "{award_key}"',
        f"updated: {_utc_now()}",
        "tags: [capture, recompete, pursuit]",
        "---",
        "",
        f"# Capture Brief — {recipient}",
        "",
        "## Contract snapshot",
        "| Field | Value |",
        "|-------|-------|",
        f"| **Incumbent (holder)** | {recipient} |",
        f"| **Customer agency** | {agency} |",
        f"| **Contract ends** | {end} ({months if months is not None else '?'} months left) |",
        f"| **Obligated value** | ${oblig_m}M |",
        f"| **Priority** | {tier} (score {score}) |",
        "",
        "## Why flagged",
        _signal_lines(signals),
        "",
        "## Suggested SAM.gov search",
        f"`{sam_kw}`",
        "",
        "## Vault / brain context",
        f"Tracked names in brain: {brain_note}",
    ]

    if intel:
        sam = intel.get("sam") or {}
        hits = sam.get("results") or []
        usa = intel.get("usaspending") or {}
        parts.extend([
            "",
            "## Live intel",
            f"- SAM scan: {len(hits)} notice(s) via **{sam.get('source') or 'none'}**",
            f"- USASpending: {len(usa.get('relationships') or [])} relationship row(s), "
            f"{len(usa.get('flows') or [])} flow row(s)",
            "- Artifacts: `02_intel/sam_scan.md`, `02_intel/competitive_snapshot.md`",
        ])
        if hits:
            parts.append("")
            parts.append("### SAM highlights")
            for hit in hits[:3]:
                if isinstance(hit, dict) and hit.get("title"):
                    parts.append(f"- {hit.get('title')} ({hit.get('noticeType') or 'notice'})")

    parts.extend([
        "",
        "## Next moves",
        "1. **Track** — add to Pipeline if not already watching.",
        "2. **Save SAM search** — bookmark keywords for RFIs / Sources Sought.",
        "3. **Customer** — confirm recompete timing with contracting office.",
        "4. **Competitor** — review competitive snapshot artifact; update vault.",
    ])

    if llm_section:
        parts.extend(["", "## Capture manager read (LLM)", llm_section.strip()])

    parts.extend([
        "",
        "## Citations",
        f"- USASpending expiring award `{award_key or 'n/a'}` · NAICS {naics}",
        f"- Generated capture-brief · {_utc_now()}",
    ])
    return "\n".join(parts)


def _llm_capture_read(row: Dict[str, Any], intel: Dict[str, Any], naics: str) -> tuple[str, bool]:
    if not llm_client:
        return "", False
    sam = intel.get("sam") or {}
    usa = intel.get("usaspending") or {}
    sam_titles = [h.get("title") for h in (sam.get("results") or [])[:3] if isinstance(h, dict)]
    rel_summary = [
        f"{r.get('recipient')}@{r.get('agency')}"
        for r in (usa.get("relationships") or [])[:4]
    ]
    prompt = (
        "You are a federal capture manager. Write 4-6 bullet points ONLY (plain English, no fluff).\n"
        "Ground every point in the data below. End with one recommended next action.\n\n"
        f"NAICS: {naics}\n"
        f"Incumbent: {row.get('recipient')}\n"
        f"Agency: {row.get('agency')}\n"
        f"Ends: {row.get('end_date')} ({row.get('months_to_end')}mo)\n"
        f"Obligation: ${row.get('obligation_millions')}M\n"
        f"Priority: {row.get('tier_label')} score {row.get('display_score')}\n"
        f"Signals: {', '.join(row.get('signals') or [])}\n"
        f"SAM hits: {sam_titles or 'none'}\n"
        f"USASpending rels: {rel_summary or 'none'}\n"
    )
    text = llm_client.call_llm(
        prompt,
        system="Be concise. No markdown headers. Bullet points only.",
        temperature=0.25,
        max_tokens=450,
    )
    if text.startswith("[LLM call failed"):
        return "", False
    return text, True


def _write_readme_index(slug: str, row: Dict[str, Any]) -> None:
    paths = pursuit_artifact_paths(slug)
    content = f"""---
id: pursuit-{slug}-index
type: pursuit-index
slug: {slug}
updated: {_utc_now()}
---

# Pursuit — {row.get('recipient') or slug}

| Artifact | Path |
|----------|------|
| Capture brief | [[{paths['brief']}]] |
| SAM scan | [[{paths['sam_scan']}]] |
| Competitive snapshot | [[{paths['competitive']}]] |

_Auto-maintained by pursuit workspace skills._
"""
    write_knowledge_file(pursuit_readme_path(slug), content)


def scaffold_capture_brief(
    item: Dict[str, Any],
    naics: str = "561210",
    *,
    brain_names: Optional[List[str]] = None,
    overwrite: bool = False,
) -> Dict[str, Any]:
    row = _enriched_row(item, naics, brain_names)
    slug = row.get("pursuit_slug") or pursuit_slug(item)
    brief_rel = pursuit_brief_path(slug)

    existing = read_knowledge_file(brief_rel)
    if existing and not overwrite:
        return {
            "ok": True,
            "created": False,
            "path": brief_rel,
            "slug": slug,
            "bytes": existing.get("size", 0),
            "message": "Brief already exists",
        }

    content = build_capture_brief_markdown(row, naics, brain_names=brain_names)
    if not write_knowledge_file(brief_rel, content):
        return {"ok": False, "error": "failed to write brief", "path": brief_rel}

    _write_readme_index(slug, row)
    return {
        "ok": True,
        "created": True,
        "path": brief_rel,
        "slug": slug,
        "bytes": len(content),
        "used_llm": False,
        "artifacts": _artifact_status(slug),
    }


async def enrich_capture_brief(
    item: Dict[str, Any],
    naics: str = "561210",
    *,
    brain_names: Optional[List[str]] = None,
    use_llm: bool = True,
) -> Dict[str, Any]:
    row = _enriched_row(item, naics, brain_names)
    slug = row.get("pursuit_slug") or pursuit_slug(item)
    intel = await gather_pursuit_intel(row, naics)

    sam_md = build_sam_scan_markdown(row, intel, naics)
    comp_md = build_competitive_markdown(row, intel, naics)
    write_knowledge_file(pursuit_sam_scan_path(slug), sam_md)
    write_knowledge_file(pursuit_competitive_path(slug), comp_md)

    llm_text, used_llm = ("", False)
    if use_llm:
        llm_text, used_llm = _llm_capture_read(row, intel, naics)

    content = build_capture_brief_markdown(
        row, naics, brain_names=brain_names, intel=intel, llm_section=llm_text or None
    )
    brief_rel = pursuit_brief_path(slug)
    if not write_knowledge_file(brief_rel, content):
        return {"ok": False, "error": "failed to write enriched brief"}

    _write_readme_index(slug, row)
    sam = intel.get("sam") or {}
    return {
        "ok": True,
        "skill_id": "capture-brief",
        "path": brief_rel,
        "slug": slug,
        "bytes": len(content),
        "used_llm": used_llm,
        "intel_sources": {
            "sam": sam.get("source"),
            "sam_hits": len(sam.get("results") or []),
            "usaspending_rels": len((intel.get("usaspending") or {}).get("relationships") or []),
        },
        "artifacts": _artifact_status(slug),
    }


async def run_pursuit_skill(
    skill_id: str,
    item: Dict[str, Any],
    naics: str = "561210",
    *,
    brain_names: Optional[List[str]] = None,
    use_llm: bool = False,
) -> Dict[str, Any]:
    row = _enriched_row(item, naics, brain_names)
    slug = row.get("pursuit_slug") or pursuit_slug(item)

    if skill_id == "capture-brief":
        if use_llm:
            return await enrich_capture_brief(item, naics, brain_names=brain_names, use_llm=True)
        result = scaffold_capture_brief(item, naics, brain_names=brain_names, overwrite=True)
        result["skill_id"] = skill_id
        result["intel_sources"] = {}
        return result

    if skill_id == "sam-scan":
        intel = await gather_pursuit_intel(row, naics)
        path = pursuit_sam_scan_path(slug)
        content = build_sam_scan_markdown(row, intel, naics)
        write_knowledge_file(path, content)
        _write_readme_index(slug, row)
        sam = intel.get("sam") or {}
        return {
            "ok": True,
            "skill_id": skill_id,
            "path": path,
            "slug": slug,
            "bytes": len(content),
            "intel_sources": {"sam": sam.get("source"), "sam_hits": len(sam.get("results") or [])},
            "artifacts": _artifact_status(slug),
        }

    if skill_id == "competitive-snapshot":
        intel = await gather_pursuit_intel(row, naics)
        path = pursuit_competitive_path(slug)
        content = build_competitive_markdown(row, intel, naics)
        write_knowledge_file(path, content)
        _write_readme_index(slug, row)
        usa = intel.get("usaspending") or {}
        return {
            "ok": True,
            "skill_id": skill_id,
            "path": path,
            "slug": slug,
            "bytes": len(content),
            "intel_sources": {
                "usaspending_rels": len(usa.get("relationships") or []),
                "usaspending_flows": len(usa.get("flows") or []),
            },
            "artifacts": _artifact_status(slug),
        }

    if skill_id == "sam-monitor-builder":
        from .deterministic.sam_monitor import build_monitor_entry
        from .user_data import add_to_pipeline

        entry = build_monitor_entry(item, naics, source="workspace-skill")
        saved = add_to_pipeline(entry)
        return {
            "ok": True,
            "skill_id": skill_id,
            "pipeline_entry": entry,
            "accumulators": saved,
            "used_llm": False,
            "artifacts": _artifact_status(slug),
        }

    return {"ok": False, "error": f"unknown skill: {skill_id}"}