"""One-shot adapter: merge capture-insights frontmatter into vendored Theseus SKILL.md files."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "skills"

ADAPTER_NOTE = """## Capture-insights adapter

Vendored from Project Theseus (`govcon-capture-vibe/.github/skills`). Instructions reference Theseus KG tools (`kg_entities`, `kg_chunks`, `kg_query`) — PR2 maps these to pursuit workspace context, vault notes, and integrated MCPs. Write outputs under `data/knowledge/pursuits/<slug>/` (Studio), not Theseus `run_dir/artifacts/`. Status is **catalog** until runners are wired in PR2–PR3.

"""

CAPTURE_META: dict[str, dict] = {
    "subcontractor-sow-builder": {
        "title": "Subcontractor SOW Builder",
        "category": "acquisition-deliverables",
        "status": "catalog",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 12,
        "output": "pursuits/{slug}/04_proposal/sub_sow_pws.md",
        "upstream": "govcon-capture-vibe/.github/skills/subcontractor-sow-builder",
    },
    "rfp-reverse-engineer": {
        "title": "RFP Reverse Engineer",
        "category": "pursuit-workspace",
        "status": "active",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 10,
        "output": "pursuits/{slug}/02_intel/rfp_reverse_engineer.json",
        "upstream": "govcon-capture-vibe/.github/skills/rfp-reverse-engineer",
    },
    "oci-sweeper": {
        "title": "OCI Sweeper",
        "category": "acquisition-deliverables",
        "status": "active",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 8,
        "output": "pursuits/{slug}/02_intel/oci_sweep.json",
        "upstream": "govcon-capture-vibe/.github/skills/oci-sweeper",
    },
    "ot-prototype-strategist": {
        "title": "OT Prototype Strategist",
        "category": "acquisition-deliverables",
        "status": "active",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 12,
        "mcps": ["bls-oews-mcp", "gsa-calc-mcp", "gsa-perdiem-mcp"],
        "output": "pursuits/{slug}/03_capture/ot_bid.json",
        "upstream": "govcon-capture-vibe/.github/skills/ot-prototype-strategist",
    },
    "proposal-generator": {
        "title": "Proposal Generator",
        "category": "pursuit-workspace",
        "status": "catalog",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 15,
        "output": "pursuits/{slug}/04_proposal/",
        "upstream": "govcon-capture-vibe/.github/skills/proposal-generator",
    },
    "data-analyzer": {
        "title": "Data Analyzer",
        "category": "market-competitive",
        "status": "catalog",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 10,
        "output": "pursuits/{slug}/02_intel/data_analysis.md",
        "upstream": "govcon-capture-vibe/.github/skills/data-analyzer",
    },
    "compliance-auditor": {
        "title": "Compliance Auditor",
        "category": "acquisition-deliverables",
        "status": "catalog",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 10,
        "mcps": ["ecfr-mcp", "regulations-gov-mcp"],
        "output": "pursuits/{slug}/04_proposal/compliance_audit.json",
        "upstream": "govcon-capture-vibe/.github/skills/compliance-auditor",
    },
    "competitive-intel": {
        "title": "Competitive Intel",
        "category": "market-competitive",
        "status": "catalog",
        "origin": "theseus",
        "invoke": "agent",
        "runtime": "tools",
        "supports_llm": True,
        "max_turns": 20,
        "mcps": ["usaspending-gov-mcp", "sam-gov-mcp"],
        "output": "pursuits/{slug}/02_intel/competitive_intel.json",
        "upstream": "govcon-capture-vibe/.github/skills/competitive-intel",
    },
}


def yaml_quote(s: str) -> str:
    if any(c in s for c in ':"{}\n#'):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def render_frontmatter(name: str, description: str, meta: dict, license_val: str | None) -> str:
    lines = [
        "---",
        f"name: {name}",
        f"description: {yaml_quote(description)}",
    ]
    if license_val:
        lines.append(f"license: {license_val}")
    lines.append("metadata:")
    for key, val in meta.items():
        if key == "mcps":
            lines.append("  mcps:")
            for m in val:
                lines.append(f"    - {m}")
        elif key == "invoke":
            lines.append(f"  invoke: {val}")
        elif isinstance(val, bool):
            lines.append(f"  {key}: {'true' if val else 'false'}")
        else:
            lines.append(f"  {key}: {yaml_quote(str(val))}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def parse_skill(path: Path) -> tuple[dict, str, str]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not m:
        raise ValueError(f"No frontmatter in {path}")
    import yaml

    front = yaml.safe_load(m.group(1)) or {}
    body = m.group(2)
    return front, body, text


def adapt_skill(name: str) -> None:
    path = ROOT / name / "SKILL.md"
    front, body, _ = parse_skill(path)
    description = str(front.get("description") or "").strip()
    license_val = front.get("license")
    meta = CAPTURE_META[name]

    if ADAPTER_NOTE.strip() not in body:
        # Insert after first heading if present, else at top
        if body.startswith("# "):
            first_nl = body.find("\n")
            body = body[: first_nl + 1] + "\n" + ADAPTER_NOTE + body[first_nl + 1 :]
        else:
            body = ADAPTER_NOTE + body

    new_text = render_frontmatter(name, description, meta, license_val) + body.lstrip("\n")
    path.write_text(new_text, encoding="utf-8")
    print(f"adapted {name}")


def main() -> None:
    for name in CAPTURE_META:
        adapt_skill(name)


if __name__ == "__main__":
    main()