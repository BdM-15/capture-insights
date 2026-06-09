"""Grounded competitor landscape — chat summary + Studio deliverable."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .queries import get_top_recipient_agency_flows, get_top_recipients
from .user_data import write_knowledge_file


def extract_naics_from_message(message: str, *, fallback: str) -> str:
    m = re.search(r"\bnaics\s*(\d{6})\b", (message or ""), re.I)
    if m:
        return m.group(1)
    m = re.search(r"\b(\d{6})\b", message or "")
    if m:
        return m.group(1)
    return fallback


def extract_anchor_company(message: str) -> Optional[str]:
    msg = message or ""
    patterns = (
        r"(?:competitors?\s+to|competitors?\s+for|competitors?\s+with|compete\s+with|versus|vs\.?)\s+([A-Za-z0-9][A-Za-z0-9 &.,'\-]{2,80})",
        r"(?:relative\s+to|against|near)\s+([A-Za-z0-9][A-Za-z0-9 &.,'\-]{2,80})",
    )
    for pat in patterns:
        m = re.search(pat, msg, re.I)
        if m:
            name = m.group(1).strip().rstrip(".,;")
            name = re.sub(r"\s+in\s+naics.*$", "", name, flags=re.I).strip()
            if len(name) >= 3:
                return name
    return None


def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def _artifact_rel_path(naics: str) -> str:
    return f"copilot/intel/competitor_landscape_naics_{naics}.md"


def wants_competitor_landscape(message: str) -> bool:
    msg = (message or "").lower()
    return any(
        k in msg
        for k in (
            "competitor",
            "competitors",
            "who competes",
            "who wins",
            "top primes",
            "market leaders",
            "competitive landscape",
            "top recipients",
        )
    )


def _build_full_report(
    *,
    target_naics: str,
    anchor: Optional[str],
    ranked: List[Dict[str, Any]],
    flow_lines: List[str],
) -> str:
    lines: List[str] = [
        "---",
        "type: copilot-deliverable",
        f"artifact: competitor_landscape",
        f"naics: {target_naics}",
        "---",
        "",
        f"# Competitor landscape — NAICS {target_naics}",
        "",
        f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
    ]
    if anchor:
        lines.append(f"Anchor company **{anchor}** excluded from ranking.")
        lines.append("")
    lines.extend([
        "| # | Competitor | $M | Actions |",
        "|---|------------|-----|---------|",
    ])
    for idx, r in enumerate(ranked, start=1):
        lines.append(
            f"| {idx} | {r.get('recipient', 'Unknown')} | {r.get('millions', 0)} | {r.get('actions', 0)} |"
        )
    if flow_lines:
        lines.extend(["", "## Where the money flows", ""])
        lines.extend(flow_lines)
    lines.extend([
        "",
        "## Notes",
        "",
        "- Source: USAspending bulk slice in DuckDB (loaded market data).",
        "- PIID-level burn rate, IDV child orders, and black-hat reads require **competitive-intel** with a contract number.",
        "- Company entity graphs (parent/sister, SAM.gov) are out of scope for this report — see PR7 orchestration.",
    ])
    return "\n".join(lines)


def _build_chat_summary(
    *,
    target_naics: str,
    anchor: Optional[str],
    ranked: List[Dict[str, Any]],
    flow_lines: List[str],
    artifact_path: str,
) -> str:
    total_m = sum(float(r.get("millions") or 0) for r in ranked[:10])
    top3 = ranked[:3]
    bullets = []
    for i, r in enumerate(top3, start=1):
        bullets.append(
            f"{i}. **{r.get('recipient', 'Unknown')}** — ${r.get('millions', 0)}M "
            f"({r.get('actions', 0)} actions)"
        )

    lines = [
        f"### Competitor landscape — NAICS {target_naics}",
        "",
    ]
    if anchor:
        lines.append(f"Compared relative to **{anchor}** (excluded from the ranking).")
        lines.append("")
    lines.append(f"**Top {min(3, len(ranked))} by obligated dollars** (of {len(ranked)} tracked):")
    lines.extend(bullets)
    lines.append("")
    lines.append(f"Combined top-10 slice in this NAICS: **~${total_m:,.0f}M** in the loaded bulk data.")
    if flow_lines:
        first = flow_lines[0].lstrip("- ")
        lines.append(f"Largest flow pattern: {first[:120]}{'…' if len(first) > 120 else ''}")
    lines.extend([
        "",
        f"Full ranked table and agency flows are in Studio: `{artifact_path}`",
        "",
        "_Chat shows the executive slice; open Studio for the complete deliverable._",
    ])
    return "\n".join(lines)


def build_competitor_landscape_response(
    *,
    message: str,
    naics: str,
    limit: int = 10,
) -> Optional[Dict[str, Any]]:
    """Return chat summary + persist full report for Studio preview."""
    if not wants_competitor_landscape(message):
        return None

    target_naics = extract_naics_from_message(message, fallback=naics)
    anchor = extract_anchor_company(message)
    anchor_norm = _norm_name(anchor) if anchor else ""

    try:
        recipients = get_top_recipients([target_naics], limit=20)
        flows = get_top_recipient_agency_flows([target_naics], limit=16)
    except Exception as exc:
        return {
            "response": (
                f"Could not load competitor landscape for NAICS **{target_naics}**: "
                f"{type(exc).__name__}. Ensure DuckDB ingest is complete and restart the backend."
            ),
            "source": "competitor-landscape-error",
            "suggested_actions": [
                {"label": "Open Competitive Analysis", "action": "navigate", "payload": {"tab": "competitive"}},
            ],
        }

    if not recipients:
        return {
            "response": f"No award recipients found for NAICS **{target_naics}** in the current database slice.",
            "source": "competitor-landscape-empty",
            "suggested_actions": [],
        }

    ranked: List[Dict[str, Any]] = []
    for r in recipients:
        name = str(r.get("recipient") or "Unknown")
        if anchor_norm and anchor_norm in _norm_name(name):
            continue
        ranked.append(r)
        if len(ranked) >= limit:
            break

    flow_lines: List[str] = []
    for f in flows:
        recip = str(f.get("recipient") or "")
        if anchor_norm and anchor_norm in _norm_name(recip):
            continue
        flow_lines.append(
            f"- **{recip}** → {f.get('agency', 'Agency')} / {f.get('office', 'Office')} "
            f"(${f.get('millions', 0)}M, {f.get('actions', 0)} actions)"
        )
        if len(flow_lines) >= 8:
            break

    artifact_path = _artifact_rel_path(target_naics)
    full_report = _build_full_report(
        target_naics=target_naics,
        anchor=anchor,
        ranked=ranked,
        flow_lines=flow_lines,
    )
    write_knowledge_file(artifact_path, full_report)

    chat_summary = _build_chat_summary(
        target_naics=target_naics,
        anchor=anchor,
        ranked=ranked,
        flow_lines=flow_lines,
        artifact_path=artifact_path,
    )

    actions: List[Dict[str, Any]] = [
        {
            "label": "Open full report in Studio",
            "action": "open_studio",
            "payload": {"path": artifact_path, "slug": f"NAICS {target_naics} competitors"},
        },
        {"label": "Open Competitive Analysis", "action": "navigate", "payload": {"tab": "competitive"}},
    ]
    for r in ranked[:3]:
        name = str(r.get("recipient") or "")
        if not name or name == "Unknown":
            continue
        actions.append({
            "label": f"Add {name[:36]} to Brain",
            "action": "add_to_brain",
            "payload": {"name": name, "type": "competitor"},
        })

    if anchor:
        actions.append({
            "label": f"Track {anchor[:32]} in Brain",
            "action": "add_to_brain",
            "payload": {"name": anchor, "type": "competitor"},
        })

    return {
        "response": chat_summary,
        "source": "competitor-landscape",
        "path": artifact_path,
        "suggested_actions": actions,
        "context_used": {
            "naics": target_naics,
            "anchor": anchor,
            "competitor_count": len(ranked),
            "artifact_path": artifact_path,
        },
    }