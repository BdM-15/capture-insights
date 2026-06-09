"""RFP reverse-engineer — bidder lens on pursuit vault files (1102/Theseus inspired, no KG)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.rfp_signal_scanner import scan_rfp_signals
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"


def _brief_md(envelope: Dict[str, Any], row: Dict[str, Any], inquiry: str) -> str:
    intake = envelope.get("inferred_intake") or {}
    sow_pws = intake.get("sow_vs_pws") or {}
    contract = intake.get("contract_type") or {}
    ghosts = envelope.get("ghost_language") or []
    missing = envelope.get("missing_sections") or []
    hooks = envelope.get("discriminator_hooks") or []

    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: rfp_reverse_engineer",
        "---",
        "",
        "# RFP reverse-engineer brief",
        "",
        f"**Agency / pursuit:** {row.get('agency') or 'n/a'} · **Incumbent context:** {row.get('recipient') or 'n/a'}",
        f"**Your question:** {inquiry or '(standard CO decision-tree read)'}",
        "",
        "## Stance (contractor lens)",
        "",
        envelope.get("capture_lens") or "",
        "",
        "This is capture intelligence — not government acquisition advice. Use it to see what the CO "
        "already decided, what they left open, and where your proposal can discriminate.",
        "",
        "## Inferred document shape",
        "",
        f"- **SOW vs PWS:** {sow_pws.get('format', 'unknown')} ({sow_pws.get('status', 'open')})",
        f"- **Contract type signal:** {contract.get('primary_type', 'unknown')}",
        f"- **Source files scanned:** {envelope.get('source_file_count', 0)}",
        "",
    ]

    if not envelope.get("source_file_count"):
        lines.extend([
            "## Next step",
            "",
            "No solicitation text in Studio yet. Paste or save the RFP/SOW/Section L&M as markdown under "
            f"`pursuits/{envelope.get('slug')}/` (e.g. `00_intake/solicitation.md`) and re-run.",
            "",
        ])
        return "\n".join(lines)

    if hooks:
        lines.extend(["## Discriminator hooks", ""])
        for h in hooks[:6]:
            lines.append(f"- **{h.get('signal')}** — {h.get('opportunity')} `{h.get('source_hint', '')}`")
        lines.append("")

    if ghosts:
        lines.extend(["## Ghost language (unpriceable risk)", ""])
        for g in ghosts[:8]:
            lines.append(
                f"- \"{g.get('phrase')}\" in `{g.get('source_path')}` — {g.get('risk')}. "
                f"{g.get('recommended_action')}"
            )
        lines.append("")

    if missing:
        lines.extend(["## Possibly missing sections", ""])
        for m in missing[:6]:
            lines.append(f"- **{m.get('section_name')}** — {m.get('risk')}")
        lines.append("")

    lines.extend([
        "## Handoff",
        "",
        "- Run **proposal-generator** for volume outline + compliance matrix seeds",
        "- Run **compliance-auditor** for clause/L↔M gaps",
        "- Run **ptw-analysis** once scope + contract type are confirmed",
        "",
        f"Full JSON: `rfp_reverse_engineer.json` · Sources are vault paths, not a knowledge graph.",
    ])
    return "\n".join(lines)


async def run_rfp_reverse_engineer(
    row: Dict[str, Any],
    *,
    slug: str,
    inquiry: str = "",
    use_llm: bool = False,
) -> Dict[str, Any]:
    envelope = scan_rfp_signals(slug, row)
    envelope["inquiry"] = inquiry
    envelope["row"] = {
        "agency": row.get("agency"),
        "recipient": row.get("recipient"),
        "award_key": row.get("award_key"),
    }

    pack = deliverable_context_pack(slug, row)
    envelope["vault_artifacts_present"] = pack.get("artifact_keys") or []

    base = f"pursuits/{slug}/02_intel"
    json_rel = f"{base}/rfp_reverse_engineer.json"
    md_rel = f"{base}/rfp_reverse_engineer.md"

    brief = _brief_md(envelope, row, inquiry)
    llm_used = False

    if use_llm and envelope.get("source_file_count", 0) > 0:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill("rfp-reverse-engineer")
        context_blob = json.dumps(
            {
                "signals": {
                    "ghost_count": len(envelope.get("ghost_language") or []),
                    "hooks": envelope.get("discriminator_hooks") or [],
                    "intake": envelope.get("inferred_intake"),
                },
                "excerpts": (pack.get("artifacts") or {}),
                "file_paths": envelope.get("source_paths") or [],
            },
            default=str,
        )[:12000]

        extra, _ = await run_multi_turn_llm(
            system_prompt=(
                "You are a senior capture strategist helping a **contractor** read a federal solicitation "
                "from the CO's hidden decision-tree lens. Cite vault file paths. Never invent RFP text. "
                "Prefix final narrative with FINAL:. This is not government acquisition advice."
            ),
            user_prompt=(
                f"Inquiry: {inquiry or 'Reverse-engineer CO intent'}\n\n"
                f"Deterministic scan:\n{context_blob}\n\n"
                "Write 6-10 sentences: what the CO likely already decided, what's open, top 3 discriminator plays."
            ),
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            narrative = extra.split("FINAL:", 1)[-1].strip() if "FINAL:" in extra.upper() else extra
            brief += f"\n\n## Strategist read (LLM)\n\n{narrative}\n"
            envelope["narrative_llm"] = narrative
            llm_used = True

    json_path = (_KNOWLEDGE / json_rel).resolve()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")

    if not write_knowledge_file(md_rel, brief):
        return {"ok": False, "skill_id": "rfp-reverse-engineer", "error": f"failed to write {md_rel}"}

    finding_count = (
        len(envelope.get("ghost_language") or [])
        + len(envelope.get("missing_sections") or [])
        + len(envelope.get("discriminator_hooks") or [])
    )

    if envelope.get("source_file_count", 0) == 0:
        return {
            "ok": True,
            "skill_id": "rfp-reverse-engineer",
            "slug": slug,
            "path": md_rel,
            "json_path": json_rel,
            "finding_count": 0,
            "warnings": [
                "No solicitation markdown in pursuit folder — add RFP/SOW text to Studio and re-run for full scan"
            ],
            "used_llm": False,
            "summary": "Scaffold saved — add solicitation markdown to Studio for CO decision-tree scan",
        }

    return {
        "ok": True,
        "skill_id": "rfp-reverse-engineer",
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "finding_count": finding_count,
        "ghost_count": len(envelope.get("ghost_language") or []),
        "hook_count": len(envelope.get("discriminator_hooks") or []),
        "used_llm": llm_used,
        "summary": (
            f"CO lens read · {finding_count} signals · "
            f"{envelope.get('source_file_count')} files · "
            f"type≈{envelope.get('inferred_intake', {}).get('contract_type', {}).get('primary_type', '?')}"
        ),
    }