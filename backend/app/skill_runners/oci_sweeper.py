"""OCI sweeper — FAR 9.5 pre-bid due diligence using pursuit + Brain (no KG)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..skill_tools.deliverable_context import deliverable_context_pack
from ..skill_tools.pursuit_context import list_pursuit_markdown_files
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"

_OCI_CLASSES = (
    ("biased_ground_rules", "FAR 9.505-1", "Unequal rules or specs favoring one offeror"),
    ("unequal_access", "FAR 9.505-2", "Non-public information from prior work"),
    ("impaired_objectivity", "FAR 9.505-3", "Cannot provide objective advice or assessment"),
)


def _brain_index(brain: Optional[List[dict]]) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {"competitor": [], "agency": [], "other": []}
    for b in brain or []:
        name = str(b.get("name") or "").strip()
        if not name:
            continue
        kind = str(b.get("type") or "other").lower()
        out.setdefault(kind, []).append(name)
        if kind not in out:
            out["other"].append(name)
    return out


async def run_oci_sweeper(
    row: Dict[str, Any],
    *,
    slug: str,
    brain: Optional[List[dict]] = None,
    inquiry: str = "",
    use_llm: bool = False,
) -> Dict[str, Any]:
    pack = deliverable_context_pack(slug, row)
    files = list_pursuit_markdown_files(slug)
    text = "\n".join(f.get("content") or "" for f in files).lower()

    incumbent = str(row.get("recipient") or "").strip()
    agency = str(row.get("agency") or "").strip()
    brain_idx = _brain_index(brain)

    findings: List[Dict[str, Any]] = []

    # Impaired objectivity: incumbent in brain as competitor + teaming language
    if incumbent and any(incumbent.lower() in c.lower() for c in brain_idx.get("competitor", [])):
        if "team" in text or "subcontract" in text or "teaming" in (inquiry or "").lower():
            findings.append({
                "class": "impaired_objectivity",
                "far": "9.505-3",
                "severity": "high",
                "summary": f"Incumbent {incumbent} is tracked as competitor but teaming/sub language present",
                "mitigation": "Firewall, separate PM, disclose to CO, consider not teaming with incumbent",
                "evidence": ["brain:competitor", "pursuit:teaming_language"],
            })

    # Unequal access: prior performance / incumbent language without firewall mention
    if any(k in text for k in ("incumbent", "prior contract", "existing contractor", "transition from")):
        if "firewall" not in text and "organizational conflict" not in text:
            findings.append({
                "class": "unequal_access",
                "far": "9.505-2",
                "severity": "medium",
                "summary": "Solicitation references prior/incumbent work — check if your firm had non-public access",
                "mitigation": "Document firewall, NDA scope, and what data was used in this proposal",
                "evidence": ["pursuit:incumbent_language"],
            })

    # Biased ground rules: proprietary spec / brand names
    if any(k in text for k in ("sole source", "only ", "must use", "brand name")):
        findings.append({
            "class": "biased_ground_rules",
            "far": "9.505-1",
            "severity": "medium",
            "summary": "Spec may bake in incumbent tools or brand — protest or Q&A opportunity",
            "mitigation": "File Q&A for equal specs; cite comparable standards",
            "evidence": ["pursuit:spec_language"],
        })

    if not findings and not files:
        findings.append({
            "class": "info",
            "far": "9.501",
            "severity": "info",
            "summary": "No OCI tripwires in vault text — add solicitation + teaming plan markdown for deeper sweep",
            "mitigation": "Re-run after Studio has RFP and teaming artifacts",
            "evidence": [],
        })

    envelope = {
        "slug": slug,
        "agency": agency,
        "incumbent": incumbent,
        "brain_competitors": brain_idx.get("competitor", [])[:8],
        "brain_agencies": brain_idx.get("agency", [])[:8],
        "finding_count": len([f for f in findings if f.get("severity") != "info"]),
        "findings": findings,
        "oci_classes_reference": [{"id": a, "far": b, "desc": c} for a, b, c in _OCI_CLASSES],
        "capture_lens": "Pre-bid contractor due diligence — not legal advice. Escalate high items to counsel.",
        "inquiry": inquiry,
        "vault_artifacts": pack.get("artifact_keys") or [],
    }

    base = f"pursuits/{slug}/02_intel"
    json_rel = f"{base}/oci_sweep.json"
    md_rel = f"{base}/oci_sweep.md"

    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: oci_sweep",
        "---",
        "",
        "# OCI sweep (FAR 9.5)",
        "",
        f"**Agency:** {agency or 'n/a'} · **Incumbent context:** {incumbent or 'n/a'}",
        "",
        envelope["capture_lens"],
        "",
        "## Findings",
        "",
    ]
    for f in findings:
        lines.append(
            f"- **{f.get('class')}** ({f.get('far')}) · {f.get('severity')}: {f.get('summary')}"
        )
        if f.get("mitigation"):
            lines.append(f"  - Mitigation: {f['mitigation']}")
    lines.append("")
    lines.append(f"JSON: `{json_rel}`")

    json_path = (_KNOWLEDGE / json_rel).resolve()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")
    write_knowledge_file(md_rel, "\n".join(lines))

    critical = sum(1 for f in findings if f.get("severity") == "high")
    return {
        "ok": True,
        "skill_id": "oci-sweeper",
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "finding_count": envelope["finding_count"],
        "critical_count": critical,
        "used_llm": False,
        "summary": f"OCI sweep · {envelope['finding_count']} findings ({critical} high)",
    }