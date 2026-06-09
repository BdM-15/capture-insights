"""Marketing catalog skills — value props, positioning, competitor profiling."""

from __future__ import annotations

from typing import Any, Dict

from ..pursuit_intel import gather_usaspending_intel
from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.render_toolchain import extract_bullet_signals
from ..user_data import write_knowledge_file

_OUTPUT = {
    "value-propositions": ("03_capture/value_propositions.md", "value_propositions"),
    "positioning": ("03_capture/positioning.md", "positioning"),
    "competitor-profiling": ("03_capture/competitor_profile.md", "competitor_profile"),
}


def _marketing_md(
    skill_id: str,
    row: Dict[str, Any],
    pack: Dict[str, Any],
    spend: Dict[str, Any],
    inquiry: str,
) -> str:
    agency = row.get("agency") or "Agency"
    recipient = row.get("recipient") or "Incumbent"
    artifact = _OUTPUT[skill_id][1]
    brief = (pack.get("artifacts") or {}).get("brief", "")
    signals = extract_bullet_signals(brief, limit=4)

    if skill_id == "value-propositions":
        title = f"Value propositions — {agency}"
        body = [
            "## Outcome-led hooks",
            "",
        ]
        if signals:
            for s in signals:
                body.append(f"- **Outcome:** {s}")
        else:
            body.append(f"- Reduce transition risk for {agency} mission continuity")
            body.append(f"- Price realism vs {recipient} historical burn rate")
        body.append("")
        body.append("## Proof points (vault)")
        for k in pack.get("artifact_keys") or []:
            body.append(f"- [[pursuits/{pack['slug']}/…]] — {k}")

    elif skill_id == "positioning":
        title = f"Positioning — vs {recipient}"
        body = [
            "## For",
            f"{agency} buyers evaluating recompete of {recipient}-held work.",
            "",
            "## Unlike",
            f"{recipient} (incumbent continuity, potential complacency).",
            "",
            "## We",
            "Deliver lower transition risk + mission-aligned staffing (refine in chat).",
            "",
            "## Because",
        ]
        for s in signals[:3]:
            body.append(f"- {s}")

    else:  # competitor-profiling
        title = f"Competitor profile — {recipient}"
        body = [
            f"## {recipient}",
            "",
            "### Award patterns (DuckDB)",
            "",
        ]
        for r in (spend.get("relationships") or [])[:5]:
            body.append(f"- {r.get('agency')}: ${r.get('shared_millions', r.get('millions', '?'))}M overlap")
        if not spend.get("relationships"):
            body.append("_Thin bulk slice — run competitive-intel or SAM MCP for live profile._")
        body.extend(["", "### Teaming posture", "", "_Promote to brain/competitors/ when curated._"])

    lines = [
        "---",
        f"type: pursuit-artifact",
        f"artifact: {artifact}",
        "---",
        "",
        f"# {title}",
        "",
        f"**Inquiry:** {inquiry or '(catalog marketing skill)'}",
        "",
        *body,
        "",
        "_Marketing skill · vault + DuckDB only · no KG_",
    ]
    return "\n".join(lines)


async def run_marketing_skill(
    skill_id: str,
    row: Dict[str, Any],
    *,
    slug: str,
    naics: str,
    inquiry: str = "",
    use_llm: bool = False,
) -> Dict[str, Any]:
    if skill_id not in _OUTPUT:
        return {"ok": False, "skill_id": skill_id, "error": "unknown marketing skill"}

    pack = deliverable_context_pack(slug, row)
    pack["slug"] = slug
    spend = gather_usaspending_intel(row, naics, limit=8)
    rel_suffix, _ = _OUTPUT[skill_id]
    rel = f"pursuits/{slug}/{rel_suffix}"
    content = _marketing_md(skill_id, row, pack, spend, inquiry)

    llm_used = False
    if use_llm:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill(skill_id)
        extra, _ = await run_multi_turn_llm(
            system_prompt="Marketing copy for federal capture. Ground in pack only. Concise bullets.",
            user_prompt=f"{content[:2000]}\nPack: {pack}",
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            content += f"\n\n## Agent refinement\n\n{extra}\n"
            llm_used = True

    if not write_knowledge_file(rel, content):
        return {"ok": False, "skill_id": skill_id, "error": "write failed"}

    return {
        "ok": True,
        "skill_id": skill_id,
        "slug": slug,
        "path": rel,
        "used_llm": llm_used,
        "summary": f"{skill_id} draft saved to Studio",
    }