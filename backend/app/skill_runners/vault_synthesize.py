"""Vault synthesize — compound pursuit + dashboard signals into wiki (no KG)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..pursuit_intel import gather_usaspending_intel
from ..skill_tools.pursuit_context import list_pursuit_markdown_files, pursuit_context_bundle
from ..user_data import write_knowledge_file


def _synthesis_rel(slug: str) -> str:
    return f"global/global_wiki/capture/synthesis_{slug}.md"


def _build_deterministic_md(
    *,
    slug: str,
    row: Dict[str, Any],
    naics: str,
    spend: Dict[str, Any],
    files: List[Dict[str, Any]],
) -> str:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    agency = row.get("agency") or "unknown agency"
    recipient = row.get("recipient") or "unknown recipient"
    award = row.get("award_key") or ""

    lines = [
        "---",
        f'name: "Pursuit synthesis — {recipient}"',
        'type: "global"',
        f"added: {today}",
        f'citations: "NAICS {naics} · pursuit:{slug} · award_key:{award}"',
        "tags: [vault-synthesize, pursuit-signals]",
        "---",
        "",
        f"# Pursuit synthesis — {recipient}",
        "",
        f"**Agency:** {agency} · **NAICS:** {naics}",
        "",
        "## Key Signals from USASpending Data + Citations",
        "",
    ]

    rels = spend.get("relationships") or []
    flows = spend.get("flows") or []
    if rels:
        for r in rels[:5]:
            lines.append(
                f"- {r.get('recipient')} ↔ {r.get('agency')}: "
                f"${r.get('total_obligated_millions', r.get('millions', '?'))}M "
                f"(source: duckdb:usaspending)"
            )
    else:
        lines.append(f"- Pipeline row: {recipient} at {agency} (award_key: {award or 'n/a'})")

    if flows:
        lines.append("")
        lines.append("**Top flows:**")
        for f in flows[:3]:
            lines.append(f"- {f.get('recipient')} → {f.get('agency')}")

    lines.extend([
        "",
        "## Citations & Sources",
        "",
        f"_Source_: vault-synthesize skill · pursuit slug `{slug}` · NAICS {naics}",
        "",
        "## Synthesis / Analysis",
        "",
        "Auto-compiled from pursuit Studio artifacts + DuckDB context. Review before promoting to brain/.",
        "",
        "## Pursuit artifacts ingested",
        "",
    ])
    if files:
        for f in files[:12]:
            lines.append(f"- [[{f['path']}]] — {f.get('name', '')}")
    else:
        lines.append("_No pursuit markdown yet — run capture brief or competitive intel first._")

    lines.extend([
        "",
        "## Open Questions / Next Actions",
        "",
        "- Promote validated signals to brain/ competitor or agency pages",
        "- Run vault-lint after edits",
        "",
        f"## Added/Updated {today}",
        "",
    ])
    return "\n".join(lines)


async def run_vault_synthesize(
    row: Dict[str, Any],
    *,
    slug: str,
    naics: str,
    use_llm: bool = False,
) -> Dict[str, Any]:
    files = list_pursuit_markdown_files(slug)
    spend = gather_usaspending_intel(row, naics, limit=6)
    rel = _synthesis_rel(slug)
    content = _build_deterministic_md(
        slug=slug,
        row=row,
        naics=naics,
        spend=spend,
        files=files,
    )

    llm_used = False
    if use_llm and files:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        bundle = pursuit_context_bundle(slug, max_files=6)
        spec = get_skill("vault-synthesize")
        extra, _ = await run_multi_turn_llm(
            system_prompt=(
                "You append a concise Synthesis / Analysis section for a capture wiki page. "
                "Use only provided pursuit snippets and DuckDB signals. Cite file paths. No invention."
            ),
            user_prompt=f"Context: {bundle}\nDuckDB: {spend}",
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            content = content + f"\n\n## Agent synthesis\n\n{extra}\n"
            llm_used = True

    if not write_knowledge_file(rel, content):
        return {"ok": False, "skill_id": "vault-synthesize", "error": "failed to write synthesis page"}

    return {
        "ok": True,
        "skill_id": "vault-synthesize",
        "slug": slug,
        "path": rel,
        "bytes": len(content.encode("utf-8")),
        "artifact_count": len(files),
        "used_llm": llm_used,
        "summary": f"Synthesized {len(files)} pursuit artifacts into Knowledge Vault",
    }