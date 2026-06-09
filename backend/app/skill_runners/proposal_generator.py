"""Proposal generator — vault-context outline + optional DOCX (no KG)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.render_toolchain import extract_bullet_signals, render_markdown_docx, skills_asset_path
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"


def _outline_md(row: Dict[str, Any], pack: Dict[str, Any], inquiry: str) -> str:
    agency = row.get("agency") or "Agency"
    recipient = row.get("recipient") or "Incumbent"
    artifacts = pack.get("artifact_keys") or []
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: proposal_outline",
        "---",
        "",
        f"# Proposal volume outline — {agency}",
        "",
        f"**Incumbent / context:** {recipient}",
        f"**Inquiry:** {inquiry or '(standard Shipley outline)'}",
        "",
        "## Ingested pursuit artifacts",
        "",
    ]
    if artifacts:
        for k in artifacts:
            lines.append(f"- {k}")
    else:
        lines.append("_Run capture-brief + competitive-intel first for richer traceability._")

    lines.extend([
        "",
        "## Volume 1 — Technical",
        "",
        "Section 1.1 Understanding of requirements `[vault: capture_brief]`",
        "Section 1.2 Technical approach `[vault: competitive_snapshot]`",
        "Section 1.3 Management approach",
        "Section 1.4 Staffing plan (chat handoff — not in SOW body)",
        "",
        "## Volume 2 — Past performance",
        "",
        "Section 2.1 Relevant contracts",
        "Section 2.2 CPARS / performance narrative",
        "",
        "## Volume 3 — Price",
        "",
        "Section 3.1 Basis of estimate `[vault: ptw_analysis]`",
        "",
        "## Compliance matrix",
        "",
        "See `compliance_matrix.md` — trace proposal instructions ↔ evaluation factors from vault files.",
        "",
        "_Evidence cites vault paths only — no KG entity_ids._",
    ])
    return "\n".join(lines)


def _executive_summary_md(row: Dict[str, Any], pack: Dict[str, Any]) -> str:
    agency = row.get("agency") or "the customer"
    recipient = row.get("recipient") or "the incumbent"
    brief = (pack.get("artifacts") or {}).get("brief", "")
    intel = (pack.get("artifacts") or {}).get("competitive_intel", "")
    bullets = extract_bullet_signals(brief or intel, limit=5)

    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: executive_summary",
        "---",
        "",
        "# Executive summary (draft)",
        "",
        f"## Customer mission frame",
        "",
        f"{agency} is recompeting work currently performed by {recipient}. "
        "This draft pulls signals from pursuit Studio artifacts — refine with smart model on.",
        "",
        "## Understanding of pain points",
        "",
    ]
    if bullets:
        for b in bullets[:3]:
            lines.append(f"- {b}")
    else:
        lines.append("- _(Add capture brief for grounded pain points)_")

    lines.extend([
        "",
        "## Top discriminators (FAB stubs)",
        "",
        "1. **Transition risk reduction** — cite past performance at this agency.",
        "2. **Cost realism** — align to PTW baseline from competitive-intel.",
        "3. **Teaming depth** — reference teaming_candidates.md if applicable.",
        "",
        "## Call to action",
        "",
        f"We request award based on demonstrated fit for {agency}'s mission outcomes.",
    ])
    return "\n".join(lines)


def _compliance_matrix_md(pack: Dict[str, Any]) -> str:
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: compliance_matrix",
        "---",
        "",
        "# Compliance matrix (draft)",
        "",
        "| Instruction (vault source) | Evaluation factor | Response section | Status |",
        "| --- | --- | --- | --- |",
    ]
    arts = pack.get("artifacts") or {}
    if arts.get("brief"):
        lines.append("| capture_brief.md | Technical understanding | Vol 1 §1.1 | draft |")
    if arts.get("compliance"):
        lines.append("| compliance_audit.md | Compliance | Vol 1 / attachments | review |")
    if len(lines) == 8:
        lines.append("| _(no vault sources yet)_ | — | — | gap |")
    return "\n".join(lines) + "\n"


async def run_proposal_generator(
    row: Dict[str, Any],
    *,
    slug: str,
    inquiry: str = "",
    export_docx: bool = True,
    use_llm: bool = False,
) -> Dict[str, Any]:
    pack = deliverable_context_pack(slug, row)
    base = f"pursuits/{slug}/04_proposal"
    outline_rel = f"{base}/proposal_outline.md"
    exec_rel = f"{base}/executive_summary.md"
    matrix_rel = f"{base}/compliance_matrix.md"
    json_rel = f"{base}/proposal_generator.json"

    outline = _outline_md(row, pack, inquiry)
    executive = _executive_summary_md(row, pack)
    matrix = _compliance_matrix_md(pack)

    llm_used = False
    if use_llm:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill("proposal-generator")
        extra, _ = await run_multi_turn_llm(
            system_prompt=(
                "Draft executive summary sections only. Use vault artifact excerpts. "
                "Cite file names. No KG. Prefix final with FINAL:"
            ),
            user_prompt=f"Pack: {json.dumps(pack, default=str)[:4000]}",
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            executive = executive + f"\n\n## Agent draft\n\n{extra}\n"
            llm_used = True

    for rel, content in (
        (outline_rel, outline),
        (exec_rel, executive),
        (matrix_rel, matrix),
    ):
        if not write_knowledge_file(rel, content):
            return {"ok": False, "skill_id": "proposal-generator", "error": f"failed to write {rel}"}

    envelope = {"skill_id": "proposal-generator", "slug": slug, "pack": pack, "inquiry": inquiry}
    json_path = (_KNOWLEDGE / json_rel).resolve()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")

    render_results: List[Dict[str, Any]] = []
    docx_rel = None
    if export_docx:
        md_abs = (_KNOWLEDGE / exec_rel).resolve()
        docx_abs = (_KNOWLEDGE / f"{base}/executive_summary.docx").resolve()
        render_results.append(render_markdown_docx(
            md_abs,
            docx_abs,
            title=f"Executive Summary — {row.get('agency') or slug}",
        ))
        if render_results[-1].get("ok"):
            docx_rel = f"{base}/executive_summary.docx"

    html_template = skills_asset_path("proposal-generator", "assets/compliance_matrix.html")
    if html_template.is_file():
        html_rel = f"{base}/compliance_matrix.html"
        html = html_template.read_text(encoding="utf-8")
        html = html.replace("{{title}}", f"Compliance — {row.get('agency') or slug}")
        html_path = (_KNOWLEDGE / html_rel).resolve()
        if str(html_path).startswith(str(_KNOWLEDGE.resolve())):
            html_path.parent.mkdir(parents=True, exist_ok=True)
            html_path.write_text(html, encoding="utf-8")

    warnings = [r["error"] for r in render_results if not r.get("ok")]
    return {
        "ok": True,
        "skill_id": "proposal-generator",
        "slug": slug,
        "path": exec_rel,
        "json_path": json_rel,
        "docx_path": docx_rel,
        "artifact_count": len(pack.get("artifact_keys") or []),
        "used_llm": llm_used,
        "warnings": warnings,
        "render_results": render_results,
        "summary": (
            f"Proposal pack saved · {len(pack.get('artifact_keys') or [])} vault artifacts ingested"
            + (" · DOCX ready" if docx_rel else " · DOCX deferred")
        ),
    }