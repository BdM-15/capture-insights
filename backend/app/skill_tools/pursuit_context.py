"""Pursuit + vault filesystem context for skills (replaces Theseus KG in capture-insights)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_KNOWLEDGE_ROOT = Path("data") / "knowledge"

# FAR/DFARS section identifiers resolvable via eCFR lookup_far_clause
_CLAUSE_RE = re.compile(
    r"\b(?:FAR|DFARS)?\s*(\d{1,3}\.\d{3,4}(?:-\d+)?)\b",
    re.IGNORECASE,
)
_SHALL_RE = re.compile(r"\bshall\b", re.IGNORECASE)
_DELIVERABLE_HINTS = ("deliverable", "submission", "volume", "attachment", "exhibit", "due date")


def _safe_rel(path: Path) -> str:
    return str(path.relative_to(_KNOWLEDGE_ROOT.resolve())).replace("\\", "/")


def list_pursuit_markdown_files(slug: str) -> List[Dict[str, Any]]:
    """All .md under pursuits/<slug>/ with path + excerpt."""
    base = (_KNOWLEDGE_ROOT / "pursuits" / slug).resolve()
    if not base.is_dir():
        return []

    out: List[Dict[str, Any]] = []
    for md in sorted(base.rglob("*.md")):
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        out.append({
            "path": _safe_rel(md),
            "name": md.stem.replace("-", " ").title(),
            "bytes": len(text.encode("utf-8")),
            "excerpt": " ".join(text.split())[:280],
            "content": text[:8000],
        })
    return out


def normalize_clause_id(raw: str) -> Optional[str]:
    """Reduce messy clause strings to eCFR section_id shape."""
    text = (raw or "").strip()
    if not text:
        return None
    text = re.sub(r"^(?:FAR|DFARS)\s*", "", text, flags=re.I)
    text = text.split("(")[0].strip().rstrip(".,;")
    if re.fullmatch(r"\d{1,3}\.\d{3,4}(?:-\d+)?", text):
        return text
    return None


def extract_clause_refs(text: str) -> List[Tuple[str, str]]:
    """Return (normalized_id, original_match) pairs from markdown prose."""
    seen: set[str] = set()
    hits: List[Tuple[str, str]] = []
    for m in _CLAUSE_RE.finditer(text or ""):
        original = m.group(0).strip()
        norm = normalize_clause_id(m.group(1))
        if not norm or norm in seen:
            continue
        seen.add(norm)
        hits.append((norm, original))
    return hits


def collect_pursuit_clause_inventory(slug: str) -> Dict[str, Any]:
    """Scan pursuit markdown for FAR/DFARS citations with file provenance."""
    files = list_pursuit_markdown_files(slug)
    by_clause: Dict[str, Dict[str, Any]] = {}
    skipped = 0

    for f in files:
        for norm, original in extract_clause_refs(f.get("content") or ""):
            entry = by_clause.setdefault(norm, {
                "section_id": norm,
                "mentions": [],
            })
            entry["mentions"].append({
                "path": f["path"],
                "text": original,
            })

    return {
        "slug": slug,
        "file_count": len(files),
        "clause_count": len(by_clause),
        "clauses": list(by_clause.values()),
        "files": [{"path": f["path"], "name": f["name"]} for f in files],
        "skipped_non_section": skipped,
    }


def scan_requirement_deliverable_gaps(slug: str) -> List[Dict[str, Any]]:
    """Light heuristic: files with 'shall' but no deliverable/submission language."""
    findings: List[Dict[str, Any]] = []
    for f in list_pursuit_markdown_files(slug):
        content = f.get("content") or ""
        lower = content.lower()
        if not _SHALL_RE.search(content):
            continue
        if any(h in lower for h in _DELIVERABLE_HINTS):
            continue
        shall_count = len(_SHALL_RE.findall(content))
        if shall_count < 2:
            continue
        findings.append({
            "check": "C4_shall_without_deliverable_hint",
            "severity": "medium",
            "path": f["path"],
            "summary": f"{shall_count} 'shall' statements but no deliverable/submission language detected",
            "evidence_paths": [f["path"]],
        })
    return findings


def pursuit_context_bundle(
    slug: str,
    *,
    max_files: int = 12,
    max_chars_per_file: int = 4000,
) -> Dict[str, Any]:
    """Compact context pack for LLM skills — vault files only."""
    files = list_pursuit_markdown_files(slug)[:max_files]
    snippets = []
    for f in files:
        snippets.append({
            "path": f["path"],
            "excerpt": (f.get("content") or "")[:max_chars_per_file],
        })
    clauses = collect_pursuit_clause_inventory(slug)
    return {
        "slug": slug,
        "files_scanned": len(files),
        "snippets": snippets,
        "clause_inventory": clauses,
    }