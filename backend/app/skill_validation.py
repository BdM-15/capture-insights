"""Validate skills/*/SKILL.md against agentskills.io (skills-ref when installed)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from .skill_registry import skills_root


def _fallback_validate(skill_dir: Path) -> List[str]:
    """Minimal checks when skills-ref is not installed."""
    problems: List[str] = []
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        return [f"{skill_dir.name}: missing SKILL.md"]

    text = skill_md.read_text(encoding="utf-8")
    if not text.lstrip().startswith("---"):
        problems.append(f"{skill_dir.name}: SKILL.md must start with YAML frontmatter")
        return problems

    import re
    import yaml

    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        problems.append(f"{skill_dir.name}: invalid frontmatter fence")
        return problems

    front = yaml.safe_load(match.group(1)) or {}
    name = str(front.get("name") or "")
    desc = str(front.get("description") or "")

    if not name:
        problems.append(f"{skill_dir.name}: missing required field 'name'")
    elif name != skill_dir.name:
        problems.append(f"{skill_dir.name}: name '{name}' must match directory name")
    elif not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        problems.append(f"{skill_dir.name}: invalid name format")

    if not desc.strip():
        problems.append(f"{skill_dir.name}: missing required field 'description'")
    elif len(desc) > 1024:
        problems.append(f"{skill_dir.name}: description exceeds 1024 characters ({len(desc)})")

    return problems


def validate_skill_dir(skill_dir: Path) -> List[str]:
    try:
        from skills_ref import validate as skills_ref_validate
    except ImportError:
        return _fallback_validate(skill_dir)

    try:
        problems = skills_ref_validate(skill_dir)
    except Exception as exc:
        return [f"{skill_dir.name}: validation error: {exc}"]

    if not problems:
        return []
    return [f"{skill_dir.name}: {p}" for p in problems]


def validate_all_skills() -> Dict[str, Any]:
    root = skills_root()
    results: List[Dict[str, Any]] = []
    error_count = 0

    if not root.is_dir():
        return {
            "ok": False,
            "skills_root": str(root),
            "skill_count": 0,
            "error_count": 1,
            "validator": "missing-root",
            "results": [{"skill_id": "(root)", "ok": False, "problems": [f"Skills root not found: {root}"]}],
        }

    validator = "skills-ref"
    try:
        import skills_ref  # noqa: F401
    except ImportError:
        validator = "fallback"

    for child in sorted(root.iterdir()):
        if not child.is_dir() or not (child / "SKILL.md").is_file():
            continue
        problems = validate_skill_dir(child)
        ok = not problems
        if not ok:
            error_count += 1
        results.append({
            "skill_id": child.name,
            "ok": ok,
            "problems": problems,
            "path": str(child.relative_to(root.parent)).replace("\\", "/"),
        })

    return {
        "ok": error_count == 0,
        "skills_root": str(root),
        "skill_count": len(results),
        "error_count": error_count,
        "validator": validator,
        "standard": "https://agentskills.io/specification",
        "results": results,
    }