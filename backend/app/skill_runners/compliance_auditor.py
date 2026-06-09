"""Compliance auditor — pursuit vault scan + eCFR validation (no KG)."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..skill_tools.mcp_run_session import MCPError, open_mcp_session
from ..skill_tools.pursuit_context import (
    collect_pursuit_clause_inventory,
    scan_requirement_deliverable_gaps,
)
from ..skill_runtime_settings import skill_tools_runtime_limits
from ..user_data import write_knowledge_file

_ECFR_MCP = "ecfr-mcp"
_ISSUANCE_RE = re.compile(
    r"(?:issued|issuance|solicitation\s+date|effective)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})",
    re.I,
)


def _audit_paths(slug: str) -> tuple[str, str]:
    json_rel = f"pursuits/{slug}/04_proposal/compliance_audit.json"
    md_rel = f"pursuits/{slug}/04_proposal/compliance_audit.md"
    return json_rel, md_rel


def _extract_issuance_date(slug: str) -> Optional[str]:
    from ..skill_tools.pursuit_context import list_pursuit_markdown_files

    for f in list_pursuit_markdown_files(slug):
        m = _ISSUANCE_RE.search(f.get("content") or "")
        if m:
            return m.group(1)
    return None


async def _lookup_clause(session: Any, section_id: str) -> Dict[str, Any]:
    for tool in ("lookup_far_clause", "mcp__ecfr__lookup_far_clause"):
        try:
            raw = await session.call_tool(tool, {"section_id": section_id})
            if raw and "not found" not in raw.lower() and "404" not in raw:
                return {"ok": True, "tool": tool, "raw": raw[:2000]}
        except MCPError:
            continue
    return {"ok": False, "tool": None, "raw": ""}


async def _version_history(session: Any, section_id: str) -> Dict[str, Any]:
    for tool, args in (
        ("get_version_history", {"title": 48, "section_id": section_id}),
        ("mcp__ecfr__get_version_history", {"title": 48, "section_id": section_id}),
    ):
        try:
            raw = await session.call_tool(tool, args)
            if raw:
                return {"ok": True, "tool": tool, "raw": raw[:3000]}
        except MCPError:
            continue
    return {"ok": False, "tool": None, "raw": ""}


def _parse_latest_amendment(raw: str) -> Optional[str]:
    for pat in (r'"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"', r"\b(\d{4}-\d{2}-\d{2})\b"):
        dates = re.findall(pat, raw)
        if dates:
            return sorted(dates, reverse=True)[0]
    return None


def _severity_rank(sev: str) -> int:
    return {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}.get(sev, 5)


async def run_compliance_auditor(
    row: Dict[str, Any],
    *,
    slug: str,
    use_llm: bool = False,
) -> Dict[str, Any]:
    """Deterministic compliance pass over pursuit vault files + live eCFR."""
    del row, use_llm  # reserved for multi-turn PR3

    inventory = collect_pursuit_clause_inventory(slug)
    if inventory["file_count"] == 0:
        return {
            "ok": False,
            "skill_id": "compliance-auditor",
            "error": "No pursuit artifacts yet — run capture brief or add pipeline row first.",
            "hint": "pipeline",
        }

    limits = skill_tools_runtime_limits()
    clause_cap = min(20, max(5, limits.max_kg_entities_per_type // 4))
    issuance = _extract_issuance_date(slug)

    findings: List[Dict[str, Any]] = []
    findings.extend(scan_requirement_deliverable_gaps(slug))

    ecfr_deferred = False
    validated = 0
    missing = 0

    try:
        async with open_mcp_session(_ECFR_MCP) as mcp:
            for clause in inventory["clauses"][:clause_cap]:
                sid = clause["section_id"]
                lookup = await _lookup_clause(mcp, sid)
                paths = [m["path"] for m in clause.get("mentions") or []]
                if not lookup["ok"]:
                    missing += 1
                    findings.append({
                        "check": "C9_clause_existence",
                        "severity": "critical",
                        "section_id": sid,
                        "summary": f"Clause {sid} not found in live eCFR",
                        "evidence_paths": paths,
                    })
                    continue
                validated += 1

                if issuance:
                    hist = await _version_history(mcp, sid)
                    if hist["ok"]:
                        latest = _parse_latest_amendment(hist["raw"])
                        if latest and latest > issuance:
                            findings.append({
                                "check": "C10_clause_currency",
                                "severity": "medium",
                                "section_id": sid,
                                "summary": (
                                    f"Clause {sid} amended {latest} after solicitation issuance {issuance}"
                                ),
                                "evidence_paths": paths,
                                "issuance_date": issuance,
                                "latest_amendment": latest,
                            })
                else:
                    findings.append({
                        "check": "C10_clause_currency",
                        "severity": "info",
                        "section_id": sid,
                        "summary": "C10 deferred — no solicitation issuance date in pursuit files",
                        "evidence_paths": paths,
                    })
    except MCPError as exc:
        ecfr_deferred = True
        findings.append({
            "check": "C9_clause_existence",
            "severity": "info",
            "summary": f"eCFR MCP unavailable — clause validation deferred: {str(exc)[:200]}",
            "evidence_paths": [],
        })

    findings.sort(key=lambda f: _severity_rank(str(f.get("severity"))))

    critical = sum(1 for f in findings if f.get("severity") == "critical")
    medium = sum(1 for f in findings if f.get("severity") == "medium")
    top_three = [
        f.get("summary") or f.get("section_id") or "finding"
        for f in findings
        if f.get("severity") in ("critical", "high", "medium")
    ][:3]

    report = {
        "skill_id": "compliance-auditor",
        "slug": slug,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "pursuit_vault_files",
        "inventory": {
            "files": inventory["file_count"],
            "unique_clauses": inventory["clause_count"],
            "validated_via_ecfr": validated,
            "not_found": missing,
            "ecfr_deferred": ecfr_deferred,
            "issuance_date": issuance,
        },
        "finding_count": len(findings),
        "severity_counts": {
            "critical": critical,
            "medium": medium,
            "info": sum(1 for f in findings if f.get("severity") == "info"),
        },
        "executive_summary": {
            "top_three": top_three,
            "headline": (
                f"{critical} critical · {medium} medium · "
                f"{inventory['clause_count']} clauses across {inventory['file_count']} files"
            ),
        },
        "findings": findings,
    }

    json_rel, md_rel = _audit_paths(slug)
    base = (Path("data") / "knowledge").resolve()
    json_path = (base / json_rel).resolve()
    if str(json_path).startswith(str(base)):
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    md_lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: compliance_audit",
        "---",
        "",
        "# Compliance audit",
        "",
        report["executive_summary"]["headline"],
        "",
        "## Top findings",
        "",
    ]
    if top_three:
        for i, t in enumerate(top_three, 1):
            md_lines.append(f"{i}. {t}")
    else:
        md_lines.append("_No critical/medium gaps detected in this pass._")
    md_lines.extend([
        "",
        "## Scope",
        "",
        f"- Pursuit files scanned: {inventory['file_count']}",
        f"- Unique FAR/DFARS refs: {inventory['clause_count']}",
        f"- eCFR validated: {validated} (deferred={ecfr_deferred})",
        "",
        "_Full JSON: `compliance_audit.json` · Sources are vault file paths, not a knowledge graph._",
    ])
    write_knowledge_file(md_rel, "\n".join(md_lines) + "\n")

    return {
        "ok": True,
        "skill_id": "compliance-auditor",
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "finding_count": len(findings),
        "critical_count": critical,
        "clause_count": inventory["clause_count"],
        "validated_count": validated,
        "insights_headline": report["executive_summary"]["headline"],
        "summary": report["executive_summary"]["headline"],
        "warnings": [f["summary"] for f in findings if f.get("severity") == "critical"][:3],
    }