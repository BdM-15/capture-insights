"""Discover Agent Skills from skills/*/SKILL.md (agentskills.io open standard)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

_SKILLS_ROOT = Path(__file__).resolve().parents[2] / "skills"

_CATEGORY_LABELS: Dict[str, str] = {
    "pursuit-workspace": "Pursuit workspace",
    "market-competitive": "Market & competitive intel",
    "acquisition-deliverables": "Acquisition deliverables",
    "vault-admin": "Knowledge vault (LLM wiki)",
    "visuals-decks": "Visuals & decks",
    "marketing-growth": "Marketing & positioning",
    "orchestrators": "Orchestrators",
}


@dataclass
class SkillRecord:
    name: str
    description: str
    skill_dir: Path
    body_md: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    license: Optional[str] = None
    compatibility: Optional[str] = None

    @property
    def category(self) -> str:
        return str(self.metadata.get("category") or "uncategorized")

    @property
    def category_label(self) -> str:
        return _CATEGORY_LABELS.get(self.category, self.category.replace("-", " ").title())

    @property
    def status(self) -> str:
        return str(self.metadata.get("status") or "catalog")

    @property
    def origin(self) -> str:
        return str(self.metadata.get("origin") or "capture-insights")

    @property
    def mcps(self) -> List[str]:
        raw = self.metadata.get("mcps") or self.metadata.get("mcp_deps") or []
        if isinstance(raw, str):
            return [raw]
        return [str(x) for x in raw]

    @property
    def invoke(self) -> List[str]:
        raw = self.metadata.get("invoke") or []
        if isinstance(raw, str):
            return [x.strip() for x in raw.split(",") if x.strip()]
        return [str(x) for x in raw]

    @property
    def runtime(self) -> str:
        return str(self.metadata.get("runtime") or "legacy")

    @property
    def supports_llm(self) -> bool:
        return bool(self.metadata.get("supports_llm", False))

    @property
    def max_turns(self) -> int:
        try:
            return int(self.metadata.get("max_turns") or 12)
        except (TypeError, ValueError):
            return 12

    @property
    def orchestrates(self) -> List[str]:
        raw = self.metadata.get("orchestrates") or []
        if isinstance(raw, str):
            return [raw]
        return [str(x) for x in raw]

    def to_catalog_entry(self) -> Dict[str, Any]:
        from .skill_constants import RUNNABLE_SKILL_IDS

        title = str(self.metadata.get("title") or self.name.replace("-", " ").title())
        return {
            "id": self.name,
            "name": title,
            "description": self.description,
            "category": self.category,
            "category_label": self.category_label,
            "status": self.status,
            "use_when": self.description,
            "mcp_deps": self.mcps,
            "origin": self.origin,
            "runtime": self.runtime,
            "invoke": self.invoke,
            "supports_llm": self.supports_llm,
            "max_turns": self.max_turns,
            "orchestrates": self.orchestrates,
            "runnable": self.name in RUNNABLE_SKILL_IDS,
            "skill_path": str(self.skill_dir.relative_to(_SKILLS_ROOT.parent)).replace("\\", "/"),
            "repo_path": f"skills/{self.name}",
        }

    def to_workspace_entry(self) -> Dict[str, Any]:
        return {
            "id": self.name,
            "name": self.to_catalog_entry()["name"],
            "status": self.status,
            "use_when": self.description[:280],
            "supports_llm": self.supports_llm,
            "runtime": self.runtime,
            "max_turns": self.max_turns,
        }


def skills_root() -> Path:
    return _SKILLS_ROOT


def parse_skill_md(path: Path) -> tuple[Dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    if not text.lstrip().startswith("---"):
        return {}, text
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        return {}, text
    front = yaml.safe_load(match.group(1)) or {}
    body = match.group(2).strip()
    return front, body


def discover_skills(*, refresh: bool = False) -> List[SkillRecord]:
    del refresh  # reserved for future cache
    root = skills_root()
    if not root.is_dir():
        return []

    records: List[SkillRecord] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        skill_md = child / "SKILL.md"
        if not skill_md.is_file():
            continue
        front, body = parse_skill_md(skill_md)
        name = str(front.get("name") or child.name)
        desc = str(front.get("description") or "").strip()
        if not desc:
            continue
        meta = front.get("metadata") if isinstance(front.get("metadata"), dict) else {}
        records.append(
            SkillRecord(
                name=name,
                description=desc,
                skill_dir=child,
                body_md=body,
                metadata=meta,
                license=front.get("license"),
                compatibility=front.get("compatibility"),
            )
        )
    return records


def get_skill(name: str) -> Optional[SkillRecord]:
    for s in discover_skills():
        if s.name == name:
            return s
    return None


def workspace_skills() -> List[Dict[str, Any]]:
    return [
        s.to_workspace_entry()
        for s in discover_skills()
        if "workspace" in s.invoke and s.status == "active"
    ]


def build_skills_catalog() -> Dict[str, Any]:
    skills = discover_skills()
    by_category: Dict[str, List[Dict[str, Any]]] = {}
    for s in skills:
        by_category.setdefault(s.category, []).append(s.to_catalog_entry())

    categories = []
    for cat_id in sorted(by_category.keys(), key=lambda c: list(_CATEGORY_LABELS.keys()).index(c) if c in _CATEGORY_LABELS else 99):
        entries = by_category[cat_id]
        categories.append({
            "id": cat_id,
            "label": _CATEGORY_LABELS.get(cat_id, cat_id.replace("-", " ").title()),
            "skills": entries,
            "count": len(entries),
        })

    status_counts: Dict[str, int] = {}
    for s in skills:
        status_counts[s.status] = status_counts.get(s.status, 0) + 1

    multi_turn = [s.name for s in skills if s.runtime in ("tools", "multi-turn")]

    return {
        "skills": [s.to_catalog_entry() for s in skills],
        "skill_count": len(skills),
        "categories": categories,
        "category_count": len(categories),
        "status_counts": status_counts,
        "active_count": status_counts.get("active", 0),
        "draft_count": status_counts.get("draft", 0),
        "catalog_count": status_counts.get("catalog", 0),
        "orchestrator_count": status_counts.get("orchestrator", 0),
        "multi_turn_skills": multi_turn,
        "skills_root": str(_SKILLS_ROOT),
        "standard": "https://agentskills.io/specification",
        "note": "Configure & Run opens inquiry + auditable process chain per run (data/runs/). Co-pilot uses same path.",
        "runtime_caps_note": "Effective turns = min(skill max_turns, global cap). Tune in Settings → Skill runtime caps.",
    }