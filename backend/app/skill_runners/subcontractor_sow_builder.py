"""Subcontractor SOW builder — pursuit vault → markdown + optional DOCX."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.pursuit_context import list_pursuit_markdown_files
from ..skill_tools.render_toolchain import render_markdown_docx
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"
_SHALL_RE = re.compile(r"\bshall\b", re.I)


def _shall_lines(slug: str, *, limit: int = 12) -> List[str]:
    hits: List[str] = []
    for f in list_pursuit_markdown_files(slug):
        for line in (f.get("content") or "").splitlines():
            if _SHALL_RE.search(line) and len(line.strip()) > 20:
                hits.append(line.strip()[:240])
            if len(hits) >= limit:
                return hits
    return hits


def _sow_md(row: Dict[str, Any], slug: str, pack: Dict[str, Any], partner: str, inquiry: str) -> str:
    agency = row.get("agency") or "Agency"
    shall = _shall_lines(slug)
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: sub_sow_pws",
        "---",
        "",
        f"# Statement of Work — {partner or 'Teaming partner'}",
        "",
        f"**Prime pursuit:** {agency} · slug `{slug}`",
        f"**User request:** {inquiry or '(standard sub SOW scaffold)'}",
        "",
        "## 1. Background",
        "",
        f"Prime contractor scope derived from pursuit artifacts: {', '.join(pack.get('artifact_keys') or []) or 'none yet'}.",
        "",
        "## 2. Scope of work",
        "",
    ]
    if shall:
        for i, s in enumerate(shall[:8], 1):
            lines.append(f"{i}. {s} _(source: pursuit vault)_")
    else:
        lines.append("_No shall-statements found in pursuit files — paste RFP excerpt in inquiry._")

    lines.extend([
        "",
        "## 3. Deliverables",
        "",
        "| ID | Deliverable | Due |",
        "| --- | --- | --- |",
        "| D-1 | Monthly status report | Monthly |",
        "| D-2 | Transition plan | NTP + 30 days |",
        "",
        "## 4. Performance standards",
        "",
        "Performance measured against Section 2 requirements and agency QASP if applicable.",
        "",
        "## 5. Place of performance",
        "",
        "As defined in prime contract / pursuit brief.",
        "",
        "## Staffing handoff (chat only — not in this document)",
        "",
        "Labor categories and FTE estimates belong in price-to-win / IGCE — not in SOW body per FAR 37.102(d).",
        "",
        "_Rendered via subcontractor-sow-builder · vault paths only._",
    ])
    return "\n".join(lines)


async def run_subcontractor_sow_builder(
    row: Dict[str, Any],
    *,
    slug: str,
    partner_name: str = "",
    inquiry: str = "",
    export_docx: bool = True,
    use_llm: bool = False,
) -> Dict[str, Any]:
    pack = deliverable_context_pack(slug, row)
    partner = partner_name or inquiry.split("for")[-1].strip()[:80] if inquiry else "Teaming partner"
    rel = f"pursuits/{slug}/04_proposal/sub_sow_pws.md"
    content = _sow_md(row, slug, pack, partner, inquiry)

    if use_llm:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill("subcontractor-sow-builder")
        extra, _ = await run_multi_turn_llm(
            system_prompt="Expand SOW scope section only. FAR 37.102(d) — no FTE counts in body. Cite vault.",
            user_prompt=f"Partner: {partner}. Pack: {pack}",
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            content += f"\n\n## Agent expansion\n\n{extra}\n"

    if not write_knowledge_file(rel, content):
        return {"ok": False, "skill_id": "subcontractor-sow-builder", "error": "write failed"}

    docx_rel = None
    warnings: List[str] = []
    if export_docx:
        md_abs = (_KNOWLEDGE / rel).resolve()
        docx_abs = (_KNOWLEDGE / f"pursuits/{slug}/04_proposal/sub_sow_pws.docx").resolve()
        res = render_markdown_docx(md_abs, docx_abs, title=f"SOW — {partner}")
        if res.get("ok"):
            docx_rel = f"pursuits/{slug}/04_proposal/sub_sow_pws.docx"
        else:
            warnings.append(res.get("error") or "docx deferred")

    return {
        "ok": True,
        "skill_id": "subcontractor-sow-builder",
        "slug": slug,
        "path": rel,
        "docx_path": docx_rel,
        "partner": partner,
        "shall_count": len(_shall_lines(slug)),
        "warnings": warnings,
        "summary": f"Sub SOW saved for {partner}" + (" · DOCX ready" if docx_rel else ""),
    }