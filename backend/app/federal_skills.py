"""Catalog of 1102tools + Theseus capture skills vendored into capture-insights.

Skills orchestrate MCPs into deliverables; MCPs handle API data (see federal_mcps.py).
"""

from __future__ import annotations

from typing import Any, Dict, List

# Official 1102 orchestration skills (federal-contracting-skills)
FEDERAL_1102_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "sow-pws-builder",
        "name": "SOW / PWS Builder",
        "source": "1102",
        "category": "acquisition",
        "use_when": "Structured scope decision tree → contract-file-ready SOW or PWS",
        "mcp_deps": [],
        "status": "catalog",
        "repo_path": "skills/sow-pws-builder",
    },
    {
        "id": "igce-builder-ffp",
        "name": "IGCE Builder — FFP",
        "source": "1102",
        "category": "acquisition",
        "use_when": "Firm-fixed-price IGCE with layered wrap rate buildup",
        "mcp_deps": ["bls-oews-mcp", "gsa-calc-mcp", "gsa-perdiem-mcp"],
        "status": "catalog",
        "repo_path": "skills/igce-builder-ffp",
    },
    {
        "id": "igce-builder-lh-tm",
        "name": "IGCE Builder — LH / T&M",
        "source": "1102",
        "category": "acquisition",
        "use_when": "Labor hour and time-and-materials IGCE with burden multipliers",
        "mcp_deps": ["bls-oews-mcp", "gsa-calc-mcp", "gsa-perdiem-mcp"],
        "status": "catalog",
        "repo_path": "skills/igce-builder-lh-tm",
    },
    {
        "id": "igce-builder-cr",
        "name": "IGCE Builder — Cost-Reimbursement",
        "source": "1102",
        "category": "acquisition",
        "use_when": "CPFF, CPAF, CPIF IGCEs with fee caps and structure analysis",
        "mcp_deps": ["bls-oews-mcp", "gsa-calc-mcp", "gsa-perdiem-mcp"],
        "status": "catalog",
        "repo_path": "skills/igce-builder-cr",
    },
    {
        "id": "ot-project-description-builder",
        "name": "OT Project Description Builder",
        "source": "1102",
        "category": "acquisition",
        "use_when": "Milestone-based OT project descriptions (10 USC 4021/4022)",
        "mcp_deps": [],
        "status": "catalog",
        "repo_path": "skills/ot-project-description-builder",
    },
    {
        "id": "ot-cost-analysis",
        "name": "OT Cost Analysis",
        "source": "1102",
        "category": "acquisition",
        "use_when": "Should-cost and price reasonableness for OT agreements",
        "mcp_deps": ["bls-oews-mcp", "gsa-calc-mcp", "gsa-perdiem-mcp"],
        "status": "catalog",
        "repo_path": "skills/ot-cost-analysis",
    },
]

# Theseus / capture-insights extensions (vendored + modified for BD/capture manager)
THESEUS_CAPTURE_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "rfp-reverse-engineer",
        "name": "RFP Reverse Engineer",
        "source": "theseus",
        "category": "capture",
        "use_when": "Decompose RFP/SOW into evaluation criteria, discriminators, and compliance matrix seeds",
        "mcp_deps": ["sam-gov-mcp", "ecfr-mcp"],
        "status": "planned",
    },
    {
        "id": "price-to-win",
        "name": "Price to Win (PTW)",
        "source": "theseus",
        "category": "capture",
        "use_when": "Competitive pricing lens using CALC+, incumbent flows, and vault intel",
        "mcp_deps": ["usaspending-gov-mcp", "gsa-calc-mcp", "bls-oews-mcp"],
        "status": "planned",
    },
    {
        "id": "teaming-finder",
        "name": "Teaming / Gap-Fill Finder",
        "source": "theseus",
        "category": "capture",
        "use_when": "Adjacent vendors + subs (not top competitors) matched to capability gaps via USASpending, SAM, and web/marketing research",
        "mcp_deps": ["usaspending-gov-mcp", "sam-gov-mcp"],
        "status": "partial",
    },
    {
        "id": "capture-brief",
        "name": "Capture Brief",
        "source": "theseus",
        "category": "capture",
        "use_when": "Agency + competitor angles from vault, pipeline, and NAICS slice",
        "mcp_deps": ["usaspending-gov-mcp"],
        "status": "partial",
    },
    {
        "id": "sam-monitor-builder",
        "name": "SAM Monitor Builder",
        "source": "theseus",
        "category": "capture",
        "use_when": "Smart monitors from expiring contracts and brain entries",
        "mcp_deps": ["sam-gov-mcp"],
        "status": "partial",
    },
    {
        "id": "vault-synthesizer",
        "name": "Vault Synthesizer",
        "source": "theseus",
        "category": "capture",
        "use_when": "Lint, index rebuild, and schema-aware wiki synthesis",
        "mcp_deps": [],
        "status": "partial",
    },
    {
        "id": "pipeline-packet",
        "name": "Pipeline Packet (Ariadne)",
        "source": "theseus",
        "category": "capture",
        "use_when": "Milestone living packets per pursuit in pipeline",
        "mcp_deps": [],
        "status": "planned",
    },
    {
        "id": "competitive-battlecard",
        "name": "Competitive Battlecard",
        "source": "theseus",
        "category": "capture",
        "use_when": "Ghost / team / displace talk tracks from competitive intel tab",
        "mcp_deps": ["usaspending-gov-mcp"],
        "status": "partial",
    },
]

MARKETING_SKILL_STUBS: List[Dict[str, Any]] = [
    {
        "id": "value-propositions",
        "name": "Value Propositions",
        "source": "marketingskills",
        "category": "marketing",
        "use_when": "Outcome-led hooks per agency mission",
        "mcp_deps": [],
        "status": "stub",
    },
    {
        "id": "positioning",
        "name": "Positioning",
        "source": "marketingskills",
        "category": "marketing",
        "use_when": "Differentiation vs incumbents at a buyer",
        "mcp_deps": [],
        "status": "stub",
    },
    {
        "id": "competitor-analysis",
        "name": "Competitor Profiling",
        "source": "marketingskills",
        "category": "marketing",
        "use_when": "Strengths, vehicles, teaming posture for vault",
        "mcp_deps": [],
        "status": "stub",
    },
]


def build_skills_catalog() -> Dict[str, Any]:
    all_skills = FEDERAL_1102_SKILLS + THESEUS_CAPTURE_SKILLS + MARKETING_SKILL_STUBS
    partial = sum(1 for s in all_skills if s.get("status") == "partial")
    return {
        "skills": all_skills,
        "skill_count": len(all_skills),
        "federal_1102": FEDERAL_1102_SKILLS,
        "theseus_capture": THESEUS_CAPTURE_SKILLS,
        "marketing": MARKETING_SKILL_STUBS,
        "partial_count": partial,
        "active_count": 0,
    }