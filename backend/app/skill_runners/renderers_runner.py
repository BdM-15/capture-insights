"""Direct renderers skill — MD→DOCX, JSON→XLSX on pursuit or explicit paths."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..skill_tools.render_toolchain import render_json_xlsx, render_markdown_docx

_KNOWLEDGE = Path("data") / "knowledge"


def _norm_rel(path: str) -> str:
    return path.replace("\\", "/").strip().lstrip("/")


def extract_input_path(inquiry: str) -> Optional[str]:
    """Public helper — pull pursuits/... path from inquiry text."""
    return _extract_path(inquiry)


def _extract_path(inquiry: str) -> Optional[str]:
    if not inquiry:
        return None
    m = re.search(r"(pursuits/[a-z0-9_./-]+\.(?:md|json))", inquiry, re.I)
    if m:
        return _norm_rel(m.group(1))
    m = re.search(r"([a-z0-9_./-]+\.(?:md|json))", inquiry, re.I)
    if m:
        rel = _norm_rel(m.group(1))
        if rel.startswith("pursuits/"):
            return rel
    return None


def _wants_xlsx(inquiry: str) -> bool:
    msg = (inquiry or "").lower()
    return any(k in msg for k in ("xlsx", "excel", "spreadsheet", "workbook", ".json"))


def _wants_docx(inquiry: str) -> bool:
    msg = (inquiry or "").lower()
    return any(k in msg for k in ("docx", "word", ".md", "markdown"))


def _latest_in_pursuit(slug: str, pattern: str) -> Optional[Path]:
    root = (_KNOWLEDGE / "pursuits" / slug).resolve()
    if not root.is_dir():
        return None
    hits = sorted(root.rglob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
    return hits[0] if hits else None


async def run_renderers(
    row: Dict[str, Any],
    *,
    slug: str,
    inquiry: str = "",
) -> Dict[str, Any]:
    explicit = _extract_path(inquiry)
    render_results: List[Dict[str, Any]] = []
    warnings: List[str] = []

    input_abs: Optional[Path] = None
    if explicit:
        candidate = (_KNOWLEDGE / explicit).resolve()
        if candidate.is_file() and str(candidate).startswith(str(_KNOWLEDGE.resolve())):
            input_abs = candidate

    if not input_abs and slug:
        if _wants_xlsx(inquiry) or (explicit and explicit.endswith(".json")):
            input_abs = _latest_in_pursuit(slug, "*.json")
        else:
            input_abs = _latest_in_pursuit(slug, "*.md")

    if not input_abs:
        return {
            "ok": False,
            "skill_id": "renderers",
            "error": "No input file — mention a pursuits/... path in your request or run a content skill first.",
            "hint": "Example: export pursuits/my-slug/04_proposal/executive_summary.md to Word",
        }

    rel_in = str(input_abs.relative_to(_KNOWLEDGE.resolve())).replace("\\", "/")
    use_xlsx = input_abs.suffix.lower() == ".json" or (_wants_xlsx(inquiry) and not _wants_docx(inquiry))

    if use_xlsx:
        out_abs = input_abs.with_suffix(".xlsx")
        render_results.append(render_json_xlsx(input_abs, out_abs, title=slug or "export"))
        out_rel = str(out_abs.relative_to(_KNOWLEDGE.resolve())).replace("\\", "/") if render_results[-1].get("ok") else None
        primary = out_rel
    else:
        out_abs = input_abs.with_suffix(".docx")
        title = str(row.get("agency") or slug or "Deliverable")
        render_results.append(render_markdown_docx(input_abs, out_abs, title=title, toc=True))
        out_rel = str(out_abs.relative_to(_KNOWLEDGE.resolve())).replace("\\", "/") if render_results[-1].get("ok") else None
        primary = out_rel

    warnings.extend(r.get("error") for r in render_results if not r.get("ok"))
    ok = any(r.get("ok") for r in render_results)

    return {
        "ok": ok,
        "skill_id": "renderers",
        "slug": slug,
        "path": primary if ok else rel_in,
        "docx_path": primary if ok and not use_xlsx else None,
        "json_path": rel_in if use_xlsx else None,
        "warnings": warnings,
        "render_results": render_results,
        "summary": (
            f"Rendered {rel_in} → {primary}"
            if ok and primary
            else f"Render failed for {rel_in}"
        ),
    }