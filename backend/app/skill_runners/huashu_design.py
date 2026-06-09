"""Huashu design — HTML deck/one-pager from pursuit intel + PDF/PPTX export."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.render_toolchain import (
    extract_bullet_signals,
    fill_template,
    render_slides_pdf,
    render_slides_pptx,
    skills_asset_path,
)

_KNOWLEDGE = Path("data") / "knowledge"


def _write_pursuit_file(rel: str, content: str) -> bool:
    base = _KNOWLEDGE.resolve()
    path = (base / rel).resolve()
    if not str(path).startswith(str(base)):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return True


def _evidence_html(pack: Dict[str, Any], *, limit: int = 6) -> str:
    parts: List[str] = []
    for key, text in (pack.get("artifacts") or {}).items():
        for b in extract_bullet_signals(text, limit=2):
            parts.append(f"<p><span class='accent'>{key}</span> — {b}</p>")
        if len(parts) >= limit:
            break
    if not parts:
        parts.append("<p>Add capture brief or competitive intel for evidence bullets.</p>")
    return "\n".join(parts)


def _slide_from_master(
    template_path: Path,
    *,
    slide_title: str,
    slide_subtitle: str,
    body: str,
    program_name: str,
    volume_name: str,
    page_no: int,
    page_total: int,
) -> str:
    return fill_template(
        template_path.read_text(encoding="utf-8"),
        {
            "slide_title": slide_title,
            "slide_subtitle": slide_subtitle,
            "body": body,
            "program_name": program_name,
            "volume_name": volume_name,
            "page_no": str(page_no),
            "page_total": str(page_total),
        },
    )


async def run_huashu_design(
    row: Dict[str, Any],
    *,
    slug: str,
    inquiry: str = "",
    export_pdf: bool = True,
    export_pptx: bool = True,
    use_llm: bool = False,
) -> Dict[str, Any]:
    pack = deliverable_context_pack(slug, row)
    agency = str(row.get("agency") or "Agency")
    recipient = str(row.get("recipient") or "Incumbent")
    program = f"{agency} capture"
    title = program
    subtitle = f"Recompete vs {recipient}"
    cta = inquiry or "Schedule industry day follow-up and refine win themes in proposal-generator."

    one_pager_tpl = skills_asset_path("proposal-generator", "assets/one_pager.html")
    slide_master = skills_asset_path("proposal-generator", "assets/slide_master.html")
    if not one_pager_tpl.is_file():
        return {"ok": False, "skill_id": "huashu-design", "error": "one_pager.html template missing"}

    visuals_base = f"pursuits/{slug}/05_visuals"
    slides_written: List[str] = []

    # Letter one-pager (vertical)
    html = fill_template(
        one_pager_tpl.read_text(encoding="utf-8"),
        {
            "title": title,
            "subtitle": subtitle,
            "evidence_html": _evidence_html(pack),
            "cta": cta,
        },
    )
    html_rel = f"{visuals_base}/one_pager.html"
    if not _write_pursuit_file(html_rel, html):
        return {"ok": False, "skill_id": "huashu-design", "error": "failed to write HTML"}

    slides_written.append(html_rel)

    # 16:9 deck slides (numbered for export scripts)
    page_total = 3
    if slide_master.is_file():
        deck_specs = [
            ("01_title.html", title, subtitle, f"<p>{cta}</p>", "Opening"),
            (
                "02_evidence.html",
                "Evidence from Studio",
                "Vault-backed signals",
                _evidence_html(pack, limit=8),
                "Intel",
            ),
            (
                "03_next.html",
                "Next steps",
                "Capture actions",
                "<p>Run proposal-generator for volumes · compliance-auditor for clause gaps · "
                "competitive-intel for obligation posture.</p>",
                "Actions",
            ),
        ]
        for idx, (fname, stitle, ssub, body, vol) in enumerate(deck_specs, start=1):
            sm = _slide_from_master(
                slide_master,
                slide_title=stitle,
                slide_subtitle=ssub,
                body=body,
                program_name=program,
                volume_name=vol,
                page_no=idx,
                page_total=page_total,
            )
            rel = f"{visuals_base}/{fname}"
            if _write_pursuit_file(rel, sm):
                slides_written.append(rel)

    slides_dir = (_KNOWLEDGE / visuals_base).resolve()
    render_results: List[Dict[str, Any]] = []
    warnings: List[str] = []

    pdf_rel = None
    if export_pdf:
        pdf_abs = slides_dir / "capture_deck.pdf"
        res = render_slides_pdf(slides_dir, pdf_abs)
        render_results.append(res)
        if res.get("ok"):
            pdf_rel = f"{visuals_base}/capture_deck.pdf"
        else:
            warnings.append(res.get("error") or "PDF export deferred (npm install in skills/huashu-design)")

    pptx_rel = None
    if export_pptx:
        pptx_abs = slides_dir / "capture_deck.pptx"
        res = render_slides_pptx(slides_dir, pptx_abs)
        render_results.append(res)
        if res.get("ok"):
            pptx_rel = f"{visuals_base}/capture_deck.pptx"
        else:
            warnings.append(res.get("error") or "PPTX export deferred (run npm install in skills/huashu-design)")

    if use_llm:
        warnings.append("LLM polish for HTML — edit slides in Studio or iterate in future multi-turn huashu runs")

    parts = [f"{len(slides_written)} HTML artifacts"]
    if pdf_rel:
        parts.append("PDF deck")
    if pptx_rel:
        parts.append("PPTX deck")

    return {
        "ok": True,
        "skill_id": "huashu-design",
        "slug": slug,
        "path": html_rel,
        "pdf_path": pdf_rel,
        "pptx_path": pptx_rel,
        "artifact_count": len(pack.get("artifact_keys") or []),
        "warnings": warnings,
        "render_results": render_results,
        "summary": " · ".join(parts),
    }