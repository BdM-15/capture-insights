"""Generic tools-mode skill dispatch (PR2) — delegates to skill_invoke_service."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, List, Optional

from .skill_constants import RUNNABLE_SKILL_IDS
from .skill_invoke_service import invoke_skill
from .skill_registry import get_skill

SkillHandler = Callable[..., Awaitable[Dict[str, Any]]]


async def run_tools_skill(
    skill_id: str,
    item: Dict[str, Any],
    naics: str,
    *,
    brain_names: Optional[List[str]] = None,
    use_llm: bool = False,
    legacy_handler: SkillHandler,
) -> Dict[str, Any]:
    """Route tools-mode skills to unified invoke; fall back to legacy handler."""
    spec = get_skill(skill_id)
    if spec and spec.runtime in ("tools", "multi-turn") and skill_id in RUNNABLE_SKILL_IDS:
        return await invoke_skill(
            skill_id,
            naics=naics,
            pursuit_item=item,
            use_llm=use_llm,
            source="pursuit-workspace",
        )
    return await legacy_handler(skill_id, item, naics, brain_names=brain_names, use_llm=use_llm)