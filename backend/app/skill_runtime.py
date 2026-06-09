"""Skill execution runtime — legacy, multi-turn tools mode, orchestrators."""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .config import settings
from .skill_registry import SkillRecord, get_skill
from .skill_runtime_settings import effective_max_turns, skill_tools_runtime_limits

SkillHandler = Callable[..., Awaitable[Dict[str, Any]]]


def max_turns_for(skill: SkillRecord | None) -> int:
    """Global ceiling ∩ per-skill budget (see Settings → Skill Runtime)."""
    return effective_max_turns(skill)


async def run_multi_turn_llm(
    *,
    system_prompt: str,
    user_prompt: str,
    max_turns: int | None = None,
    skill: SkillRecord | None = None,
    provider: str = "ollama",
    model: str | None = None,
) -> tuple[str, int]:
    """Lightweight multi-turn loop for skills that refine output across turns.

    Turn 1: draft. Later turns: self-critique + revise until max_turns or stop phrase.
    Full MCP tool loop lands in PR2; caps come from Settings → Global Skill Runtime.
    """
    from . import llm as llm_client

    if not settings.enable_ai_features:
        return "", 0

    limits = skill_tools_runtime_limits()
    budget = max_turns if max_turns is not None else effective_max_turns(skill)
    budget = max(1, budget)

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    turns = 0
    last = ""
    for turn in range(budget):
        turns = turn + 1
        last, _ = await asyncio.to_thread(
            llm_client.chat_messages_multi_provider,
            messages,
            provider=provider,
            model=model,
            temperature=0.35,
            max_tokens=limits.llm_max_tokens_per_turn,
            timeout_seconds=limits.llm_timeout_seconds,
        )
        if not last:
            break
        messages.append({"role": "assistant", "content": last})
        if "FINAL:" in last.upper():
            break
        if turn >= budget - 1:
            messages.append({
                "role": "user",
                "content": (
                    "Turn budget exhausted. Stop calling tools. Summarize your best draft now — "
                    "prefix with FINAL: and flag any incomplete sections explicitly."
                ),
            })
            last, _ = await asyncio.to_thread(
                llm_client.chat_messages_multi_provider,
                messages,
                provider=provider,
                model=model,
                temperature=0.25,
                max_tokens=limits.llm_max_tokens_per_turn,
                timeout_seconds=limits.llm_timeout_seconds,
            )
            turns += 1
            break
        messages.append({
            "role": "user",
            "content": (
                "Review your draft for citations, gaps, and admin completeness. "
                "If ready, prefix the final answer with FINAL: and deliver the polished version. "
                "Otherwise revise once more."
            ),
        })
    return last, turns


async def run_orchestrator(
    skill: SkillRecord,
    *,
    run_skill_fn: SkillHandler,
    item: Dict[str, Any],
    naics: str,
    brain_names: Optional[List[str]] = None,
    use_llm: bool = False,
) -> Dict[str, Any]:
    """Thin orchestrator — chains atomic skills in metadata.orchestrates order."""
    chain = skill.orchestrates
    if not chain:
        return {"ok": False, "error": "Orchestrator has no orchestrates list in metadata"}

    results: List[Dict[str, Any]] = []
    for step_id in chain:
        step = await run_skill_fn(
            step_id,
            item,
            naics,
            brain_names=brain_names,
            use_llm=use_llm,
        )
        results.append({"skill": step_id, **step})
        if not step.get("ok"):
            return {
                "ok": False,
                "skill_id": skill.name,
                "error": f"Chain stopped at {step_id}",
                "chain_results": results,
            }

    return {
        "ok": True,
        "skill_id": skill.name,
        "orchestrated": True,
        "chain_results": results,
    }


async def dispatch_skill(
    skill_id: str,
    handler: SkillHandler,
    item: Dict[str, Any],
    naics: str,
    *,
    brain_names: Optional[List[str]] = None,
    use_llm: bool = False,
) -> Dict[str, Any]:
    """Route by skill metadata.runtime before falling back to legacy handler."""
    spec = get_skill(skill_id)
    if spec and spec.status == "orchestrator":
        return await run_orchestrator(
            spec,
            run_skill_fn=handler,
            item=item,
            naics=naics,
            brain_names=brain_names,
            use_llm=use_llm,
        )
    if spec and spec.runtime in ("tools", "multi-turn"):
        from .skill_tool_loop import run_tools_skill

        return await run_tools_skill(
            skill_id,
            item,
            naics,
            brain_names=brain_names,
            use_llm=use_llm,
            legacy_handler=handler,
        )
    return await handler(skill_id, item, naics, brain_names=brain_names, use_llm=use_llm)