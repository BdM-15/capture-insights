"""Teaming finder — DuckDB bulk + optional MCP (no KG)."""

from __future__ import annotations

from typing import Any, Dict, List

from ..queries import get_teaming_candidates
from ..user_data import write_knowledge_file


def _teaming_md(
    *,
    naics: str,
    target: str,
    gap: str,
    candidates: List[dict],
    meta: dict,
) -> str:
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: teaming_candidates",
        f"naics: {naics}",
        "---",
        "",
        f"# Teaming candidates — gap-fill vs {target or 'incumbent'}",
        "",
        f"**Capability gap:** {gap or '(not specified — refine in chat)'}",
        "",
        "Source: DuckDB USASpending bulk (adjacent primes, not top market holders).",
        "",
        "## Shortlist",
        "",
    ]
    if not candidates:
        lines.append("_No strong bulk matches — run SAM/USASpending MCP pass or widen NAICS._")
    else:
        for i, c in enumerate(candidates[:15], 1):
            lines.append(
                f"{i}. **{c.get('recipient')}** — {c.get('fit')} · "
                f"{c.get('shared_agencies')} shared agencies · "
                f"${c.get('shared_millions')}M overlap · {c.get('fit_reason')}"
            )
    lines.extend([
        "",
        "## Meta",
        "",
        f"- Excluded top primes: {meta.get('excluded_top_primes', '?')}",
        f"- Subaward data loaded: {meta.get('subaward_data', False)}",
        "",
        "_Promote strong fits to brain/ manually when curated._",
    ])
    return "\n".join(lines)


async def run_teaming_finder(
    row: Dict[str, Any],
    *,
    slug: str,
    naics: str,
    displacement_target: str,
    capability_gap: str = "",
    use_llm: bool = False,
) -> Dict[str, Any]:
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    target = displacement_target or row.get("recipient") or ""
    data = get_teaming_candidates(target, naics_list or None, limit=15)
    candidates = data.get("candidates") or []
    meta = data.get("meta") or {}

    rel_path = f"pursuits/{slug}/03_capture/teaming_candidates.md"
    content = _teaming_md(
        naics=naics,
        target=target,
        gap=capability_gap,
        candidates=candidates,
        meta=meta,
    )
    if not write_knowledge_file(rel_path, content):
        return {"ok": False, "skill_id": "teaming-finder", "error": "failed to write teaming_candidates.md"}

    llm_note = ""
    if use_llm and candidates:
        from ..skill_runtime import run_multi_turn_llm
        from ..skill_registry import get_skill

        spec = get_skill("teaming-finder")
        llm_note, _ = await run_multi_turn_llm(
            system_prompt="Summarize teaming shortlist in 5 bullets for a capture manager. No invention.",
            user_prompt=f"Gap: {capability_gap}. Target: {target}. Candidates: {candidates[:8]}",
            skill=spec,
        )
        if llm_note and "LLM call failed" not in llm_note:
            write_knowledge_file(rel_path, content + f"\n\n## Agent summary\n\n{llm_note}\n")

    return {
        "ok": True,
        "skill_id": "teaming-finder",
        "slug": slug,
        "path": rel_path,
        "bytes": len(content.encode("utf-8")),
        "candidate_count": len(candidates),
        "displacement_target": target,
        "capability_gap": capability_gap,
        "used_llm": bool(llm_note),
        "summary": f"{len(candidates)} candidates written for gap-fill teaming vs {target or 'target'}",
    }