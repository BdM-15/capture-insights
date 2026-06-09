"""Vault admin skills — lint + index (filesystem + schema, no KG)."""

from __future__ import annotations

import json
from typing import Any, Dict

from ..user_data import lint_brain_wiki, rebuild_vault_index, write_knowledge_file


async def run_vault_lint(*, use_llm: bool = False) -> Dict[str, Any]:
    report = lint_brain_wiki()
    rel = "global/global_wiki/capture/vault_lint_report.json"
    write_knowledge_file(rel, json.dumps(report, indent=2))

    md_rel = "global/global_wiki/capture/vault_lint_report.md"
    lines = [
        "# Vault lint report",
        "",
        report.get("summary") or "",
        "",
        f"**Issues:** {report.get('issues', 0)} across {len(report.get('entries') or [])} entries",
        "",
    ]
    for e in (report.get("entries") or [])[:30]:
        if e.get("ok"):
            continue
        lines.append(f"- `{e.get('path')}`: " + "; ".join(e.get("issues") or []))
    write_knowledge_file(md_rel, "\n".join(lines) + "\n")

    return {
        "ok": True,
        "skill_id": "vault-lint",
        "path": md_rel,
        "json_path": rel,
        "issues": report.get("issues", 0),
        "entry_count": len(report.get("entries") or []),
        "legacy_dirs": report.get("legacy_dirs") or [],
        "summary": report.get("summary"),
        "used_llm": False,
    }


async def run_vault_index_rebuild() -> Dict[str, Any]:
    index_md = rebuild_vault_index()
    rel = "index.md"
    write_knowledge_file(rel, index_md)
    return {
        "ok": True,
        "skill_id": "vault-index-rebuild",
        "path": rel,
        "bytes": len(index_md.encode("utf-8")),
        "summary": "Rebuilt data/knowledge/index.md from disk",
    }