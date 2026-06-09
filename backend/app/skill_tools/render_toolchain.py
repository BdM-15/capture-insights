"""PR3 deliverable render toolchain — DOCX + HTML deck export."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

_REPO_ROOT = Path(__file__).resolve().parents[3]
_RENDER_DOCX = _REPO_ROOT / "skills" / "renderers" / "scripts" / "render_docx.py"
_RENDER_XLSX = _REPO_ROOT / "skills" / "renderers" / "scripts" / "render_xlsx.py"
_HUASHU_PDF = _REPO_ROOT / "skills" / "huashu-design" / "scripts" / "export_deck_pdf.mjs"
_HUASHU_PPTX = _REPO_ROOT / "skills" / "huashu-design" / "scripts" / "export_deck_pptx.mjs"


def skills_asset_path(skill_id: str, rel: str) -> Path:
    return (_REPO_ROOT / "skills" / skill_id / rel).resolve()


def fill_template(text: str, variables: Dict[str, str]) -> str:
    out = text
    for key, val in variables.items():
        out = out.replace(f"{{{{{key}}}}}", val or "")
    return out


def render_markdown_docx(
    md_path: Path,
    docx_path: Path,
    *,
    title: str = "",
    reference_docx: Optional[Path] = None,
    toc: bool = False,
) -> Dict[str, Any]:
    """Run vendored render_docx.py (Pandoc or OpenXML fallback)."""
    if not _RENDER_DOCX.is_file():
        return {"ok": False, "error": "render_docx.py not vendored", "tool": "renderers"}
    if not md_path.is_file():
        return {"ok": False, "error": f"markdown missing: {md_path}", "tool": "renderers"}

    docx_path.parent.mkdir(parents=True, exist_ok=True)
    args = [
        sys.executable,
        str(_RENDER_DOCX),
        "--input",
        str(md_path),
        "--output",
        str(docx_path),
    ]
    if reference_docx and reference_docx.is_file():
        args.extend(["--reference", str(reference_docx)])
    if toc:
        args.append("--toc")
    if title:
        args.extend(["--metadata", f"title={title}"])

    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=120, check=False)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "docx render timed out", "tool": "render_docx"}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "tool": "render_docx"}

    if proc.returncode != 0:
        return {
            "ok": False,
            "error": (proc.stderr or proc.stdout or "render failed")[:500],
            "tool": "render_docx",
        }
    if not docx_path.is_file():
        return {"ok": False, "error": "docx not created", "tool": "render_docx"}
    return {
        "ok": True,
        "path": str(docx_path),
        "tool": "render_docx",
        "stderr_hint": (proc.stderr or "")[:200],
    }


def render_json_xlsx(
    json_path: Path,
    xlsx_path: Path,
    *,
    title: str = "",
    sheet: str = "Sheet1",
) -> Dict[str, Any]:
    """Run vendored render_xlsx.py (openpyxl)."""
    if not _RENDER_XLSX.is_file():
        return {"ok": False, "error": "render_xlsx.py not vendored", "tool": "renderers"}
    if not json_path.is_file():
        return {"ok": False, "error": f"json missing: {json_path}", "tool": "renderers"}

    xlsx_path.parent.mkdir(parents=True, exist_ok=True)
    args = [
        sys.executable,
        str(_RENDER_XLSX),
        "--input",
        str(json_path),
        "--output",
        str(xlsx_path),
        "--sheet",
        sheet,
    ]
    if title:
        args.extend(["--title", title])

    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=120, check=False)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "xlsx render timed out", "tool": "render_xlsx"}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "tool": "render_xlsx"}

    if proc.returncode != 0:
        return {
            "ok": False,
            "error": (proc.stderr or proc.stdout or "xlsx render failed")[:500],
            "tool": "render_xlsx",
        }
    if not xlsx_path.is_file():
        return {"ok": False, "error": "xlsx not created", "tool": "render_xlsx"}
    return {"ok": True, "path": str(xlsx_path), "tool": "render_xlsx"}


def render_slides_pptx(slides_dir: Path, pptx_path: Path) -> Dict[str, Any]:
    """Best-effort PPTX via huashu export_deck_pptx.mjs (needs node + npm deps in huashu-design)."""
    if not _HUASHU_PPTX.is_file():
        return {"ok": False, "error": "export_deck_pptx.mjs not vendored", "tool": "huashu-design"}
    html_files = list(slides_dir.glob("*.html"))
    if not html_files:
        return {"ok": False, "error": "no HTML slides in directory", "tool": "huashu-design"}

    pptx_path.parent.mkdir(parents=True, exist_ok=True)
    args = ["node", str(_HUASHU_PPTX), "--slides", str(slides_dir), "--out", str(pptx_path)]
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=240, check=False)
    except FileNotFoundError:
        return {"ok": False, "error": "node not on PATH", "tool": "huashu-design"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "pptx export timed out", "tool": "huashu-design"}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "tool": "huashu-design"}

    if proc.returncode != 0 or not pptx_path.is_file():
        return {
            "ok": False,
            "error": (proc.stderr or proc.stdout or "pptx export failed")[:500],
            "tool": "huashu-design",
        }
    return {"ok": True, "path": str(pptx_path), "tool": "huashu-design"}


def render_slides_pdf(slides_dir: Path, pdf_path: Path) -> Dict[str, Any]:
    """Best-effort PDF via huashu export_deck_pdf.mjs (needs node + playwright)."""
    if not _HUASHU_PDF.is_file():
        return {"ok": False, "error": "export_deck_pdf.mjs not vendored", "tool": "huashu-design"}
    html_files = list(slides_dir.glob("*.html"))
    if not html_files:
        return {"ok": False, "error": "no HTML slides in directory", "tool": "huashu-design"}

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    args = [
        "node",
        str(_HUASHU_PDF),
        "--slides",
        str(slides_dir),
        "--out",
        str(pdf_path),
    ]
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=180, check=False)
    except FileNotFoundError:
        return {"ok": False, "error": "node not on PATH", "tool": "huashu-design"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "pdf export timed out", "tool": "huashu-design"}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "tool": "huashu-design"}

    if proc.returncode != 0 or not pdf_path.is_file():
        return {
            "ok": False,
            "error": (proc.stderr or proc.stdout or "pdf export failed")[:500],
            "tool": "huashu-design",
        }
    return {"ok": True, "path": str(pdf_path), "tool": "huashu-design"}


def extract_bullet_signals(text: str, *, limit: int = 8) -> List[str]:
    bullets: List[str] = []
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith(("- ", "* ", "• ")):
            bullets.append(s.lstrip("-*• ").strip())
        elif re.match(r"^\d+\.\s+", s):
            bullets.append(re.sub(r"^\d+\.\s+", "", s).strip())
        if len(bullets) >= limit:
            break
    return bullets