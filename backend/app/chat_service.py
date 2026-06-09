"""Co-pilot message processing — shared by /chat and /chat/conversations/{id}/messages."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterator, List, Optional

from .queries import build_llm_chat_messages, get_chat_response


def _use_llm_from_provider(provider: str) -> bool:
    return provider in ("ollama", "xai")


def _with_chat_meta(payload: Dict[str, Any], *, model_provider: str, naics: str, active_tab: str, brain: List[dict], pipeline: List[dict]) -> Dict[str, Any]:
    payload.setdefault("model_provider", model_provider)
    ctx = payload.setdefault("context_used", {})
    if isinstance(ctx, dict):
        ctx.setdefault("naics", naics)
        ctx.setdefault("active_tab", active_tab)
        ctx.setdefault("brain_count", len(brain))
        ctx.setdefault("pipeline_count", len(pipeline))
    return payload


def _apply_mcp_postprocess(
    result: Dict[str, Any],
    *,
    did_mcp_call: bool,
    mcp_results: list,
    mcp_source_note: str,
    tool_names: List[str],
    model_provider: str,
) -> Dict[str, Any]:
    if did_mcp_call:
        result["source"] = (result.get("source") or "deterministic") + "+mcp"
        actions = result.get("suggested_actions") or []
        has_monitor_action = any("monitor" in str(a).lower() for a in actions)
        if mcp_results and not has_monitor_action:
            for r in mcp_results[:3]:
                if not isinstance(r, dict):
                    continue
                t = (r.get("title") or "")
                if not t or "requires a real SAM_API_KEY" in t or "search error" in t.lower():
                    continue
                actions.append({
                    "label": f"Create monitor for: {t[:60]}",
                    "action": "add_to_pipeline",
                    "payload": {
                        "title": r.get("title"),
                        "agency": r.get("agency"),
                        "noticeType": r.get("noticeType"),
                        "link": r.get("link"),
                        "type": "sam-monitor",
                        "monitorUrl": r.get("link") or f"https://sam.gov/opp/{r.get('opportunityId', '')}/view",
                        "notes": f"From chat MCP search{mcp_source_note}",
                    },
                })
            result["suggested_actions"] = actions
    result.setdefault("mcp_tools_considered", tool_names[:6] if tool_names else [])
    result["model_provider"] = model_provider
    return result


async def prepare_chat_message(
    *,
    message: str,
    naics: str,
    active_tab: str,
    kpis: Optional[dict],
    brain: Optional[List[dict]],
    pipeline: Optional[List[dict]],
    mcp_tools: Optional[List[dict]],
    model_provider: str = "fast",
    model_name: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    continue_run_id: Optional[str] = None,
    vault_excerpt: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolve routing/MCP; return early result or params for LLM/deterministic chat."""
    user_msg_raw = (message or "").strip()
    user_msg = user_msg_raw.lower()
    brain = brain or []
    pipeline = pipeline or []
    use_llm = _use_llm_from_provider(model_provider)

    from .chat_competitor_landscape import build_competitor_landscape_response, wants_competitor_landscape
    from .skill_router import (
        extract_capability_gap,
        extract_contract_number,
        format_skill_route_suggestion,
        route_skill_from_message,
        score_skills_from_message,
    )
    from .skill_invoke_service import format_skill_for_chat, invoke_skill

    if continue_run_id:
        from .skill_run_store import get_run

        prior = get_run(continue_run_id)
        if prior and prior.get("skill_id"):
            skill_id = str(prior["skill_id"])
            prior_inquiry = str(prior.get("inquiry") or "")
            transcript = prior.get("transcript") or []
            trans_lines = []
            for t in transcript[-4:]:
                if isinstance(t, dict) and t.get("content"):
                    trans_lines.append(
                        f"{t.get('role', 'assistant').upper()}: {str(t['content'])[:400]}"
                    )
            combined = (
                f"Continue prior **{skill_id}** run `{continue_run_id}`.\n"
                f"Original inquiry: {prior_inquiry or '(none)'}\n"
            )
            if trans_lines:
                combined += "Recent transcript:\n" + "\n".join(trans_lines) + "\n"
            combined += f"\nFollow-up: {user_msg_raw}"

            skill_result = await invoke_skill(
                skill_id,
                naics=naics,
                brain=brain,
                pipeline=pipeline,
                contract_number=extract_contract_number(user_msg_raw) or extract_contract_number(prior_inquiry),
                capability_gap=extract_capability_gap(user_msg_raw) or extract_capability_gap(prior_inquiry),
                displacement_target=None,
                use_llm=use_llm,
                inquiry=combined,
                source="chat-continue",
            )
            formatted = format_skill_for_chat(skill_result)
            return {
                "kind": "complete",
                "result": {
                    **formatted,
                    "model_provider": model_provider,
                    "context_used": {
                        "naics": naics,
                        "active_tab": active_tab,
                        "brain_count": len(brain),
                        "pipeline_count": len(pipeline),
                        "skill_id": skill_id,
                        "run_id": skill_result.get("run_id"),
                        "continue_run_id": continue_run_id,
                        "route_method": "continue-run",
                    },
                },
            }

    if wants_competitor_landscape(user_msg_raw):
        landscape = build_competitor_landscape_response(message=user_msg_raw, naics=naics)
        if landscape:
            return {"kind": "complete", "result": _with_chat_meta(landscape, model_provider=model_provider, naics=naics, active_tab=active_tab, brain=brain, pipeline=pipeline)}

    route = route_skill_from_message(user_msg_raw, use_llm=use_llm)
    if route.auto_invoke and route.skill_id:
        if route.skill_id == "competitive-intel" and not extract_contract_number(user_msg_raw):
            landscape = build_competitor_landscape_response(message=user_msg_raw, naics=naics)
            if landscape:
                return {"kind": "complete", "result": _with_chat_meta(landscape, model_provider=model_provider, naics=naics, active_tab=active_tab, brain=brain, pipeline=pipeline)}
        skill_result = await invoke_skill(
            route.skill_id,
            naics=naics,
            brain=brain,
            pipeline=pipeline,
            contract_number=extract_contract_number(user_msg_raw),
            capability_gap=extract_capability_gap(user_msg_raw),
            displacement_target=None,
            use_llm=use_llm,
            inquiry=user_msg_raw,
            source="chat",
        )
        formatted = format_skill_for_chat(skill_result)
        return {
            "kind": "complete",
            "result": {
                **formatted,
                "model_provider": model_provider,
                "context_used": {
                    "naics": naics,
                    "active_tab": active_tab,
                    "brain_count": len(brain),
                    "pipeline_count": len(pipeline),
                    "skill_id": route.skill_id,
                    "run_id": skill_result.get("run_id"),
                    "route_method": route.method,
                },
                "skill_route": route.to_dict(),
            },
        }

    if route.candidates and route.confidence in ("medium", "low") and route.candidates[0].score >= 5:
        if wants_competitor_landscape(user_msg_raw):
            landscape = build_competitor_landscape_response(message=user_msg_raw, naics=naics)
            if landscape:
                return {"kind": "complete", "result": _with_chat_meta(landscape, model_provider=model_provider, naics=naics, active_tab=active_tab, brain=brain, pipeline=pipeline)}
        suggestion = format_skill_route_suggestion(route)
        return {
            "kind": "complete",
            "result": _with_chat_meta({
                **suggestion,
                "context_used": {
                    "naics": naics,
                    "active_tab": active_tab,
                    "brain_count": len(brain),
                    "pipeline_count": len(pipeline),
                    "route_method": route.method,
                },
            }, model_provider=model_provider, naics=naics, active_tab=active_tab, brain=brain, pipeline=pipeline),
        }

    scored = score_skills_from_message(user_msg_raw, runnable_only=True)
    if scored and scored[0].score >= 8:
        top = scored[0]
        skill_result = await invoke_skill(
            top.skill_id,
            naics=naics,
            brain=brain,
            pipeline=pipeline,
            contract_number=extract_contract_number(user_msg_raw),
            capability_gap=extract_capability_gap(user_msg_raw),
            displacement_target=None,
            use_llm=use_llm,
            inquiry=user_msg_raw,
            source="chat",
        )
        formatted = format_skill_for_chat(skill_result)
        return {
            "kind": "complete",
            "result": {
                **formatted,
                "model_provider": model_provider,
                "context_used": {
                    "naics": naics,
                    "active_tab": active_tab,
                    "brain_count": len(brain),
                    "pipeline_count": len(pipeline),
                    "skill_id": top.skill_id,
                    "run_id": skill_result.get("run_id"),
                    "route_method": "safety-net",
                },
                "skill_route": route.to_dict(),
            },
        }

    from .mcp import search_sam_opportunities_mcp, list_sam_mcp_tools

    mcp_tools = mcp_tools or []
    if not mcp_tools:
        try:
            mcp_tools = await list_sam_mcp_tools()
        except Exception:
            mcp_tools = []

    tool_names = [t.get("name") for t in mcp_tools if isinstance(t, dict) and t.get("name")]
    mcp_results: list = []
    mcp_source_note = ""
    did_mcp_call = False

    wants_sam_search = any(k in user_msg for k in [
        "search sam", "sam search", "find sam", "live sam", "opportunities on sam",
        "rfi", "sources sought", "special notice", "monitor", "create monitor",
        "check sam", "what is live", "new requirements", "emerging",
    ])

    if wants_sam_search or (use_llm and "sam" in user_msg):
        brain_keywords = " ".join([str(b.get("name", "")) for b in brain[:4] if b.get("name")])
        keywords = (message or brain_keywords or "").strip() or "facilities support"
        notice_types = "RFI,Sources Sought,Special Notice,Presolicitation"
        if any(x in user_msg for x in ["solicitation", "rfp", "full"]):
            notice_types = "Solicitation,Presolicitation,RFI"

        mcp_results = await search_sam_opportunities_mcp(
            naics=naics,
            keywords=keywords[:120],
            notice_types=notice_types,
            limit=6,
        )
        did_mcp_call = True
        mcp_source_note = " (via MCP tool)" if any(
            (isinstance(r, dict) and r.get("_source", "").startswith("mcp")) for r in mcp_results
        ) else " (direct/MCP-fallback)"

        if not mcp_results:
            try:
                q = (
                    f"http://127.0.0.1:8000/mcp/sam/opportunities?naics={naics}"
                    f"&keywords={urllib.parse.quote(keywords[:80])}"
                    f"&notice_types={urllib.parse.quote(notice_types)}&limit=5"
                )
                with urllib.request.urlopen(q, timeout=6) as rr:
                    alt = json.loads(rr.read())
                    if isinstance(alt, list) and alt:
                        mcp_results = alt
                        mcp_source_note = " (via /mcp/sam hybrid)"
            except Exception:
                pass

    extra_for_response = message or ""
    if vault_excerpt and vault_excerpt.strip():
        extra_for_response = (
            (extra_for_response or message)
            + f"\n\n[OPEN STUDIO/VAULT EXCERPT]:\n{vault_excerpt.strip()[:2500]}"
        )
    if did_mcp_call and mcp_results:
        compact = []
        for r in mcp_results[:5]:
            if not isinstance(r, dict):
                continue
            compact.append({
                "title": r.get("title") or r.get("name"),
                "agency": r.get("agency"),
                "noticeType": r.get("noticeType") or r.get("type"),
                "deadline": r.get("responseDeadLine") or r.get("endDate"),
                "link": r.get("link"),
            })
        extra_for_response = (
            (message or "Help with SAM opportunities for my current scope and brain.")
            + f"\n\n[LIVE MCP RESULTS{mcp_source_note}]:\n"
            + json.dumps(compact, ensure_ascii=False)[:1500]
        )

    if history:
        hist_lines = []
        for h in history[-8:]:
            hist_lines.append(f"{h.get('role', 'user').upper()}: {h.get('content', '')[:500]}")
        extra_for_response = (
            "CONVERSATION HISTORY (most recent last):\n"
            + "\n".join(hist_lines)
            + "\n\nCURRENT USER MESSAGE:\n"
            + (extra_for_response or message)
        )

    mcp_meta = {
        "did_mcp_call": did_mcp_call,
        "mcp_results": mcp_results,
        "mcp_source_note": mcp_source_note,
        "tool_names": tool_names,
    }

    llm_pack = build_llm_chat_messages(
        naics=naics,
        active_tab=active_tab,
        kpis=kpis,
        brain_items=brain,
        pipeline_items=pipeline,
        extra_context=extra_for_response,
        model_provider=model_provider,
        model_name=model_name,
        chat_history=history,
        mcp_tools=mcp_tools if mcp_tools else None,
    )
    if llm_pack:
        return {
            "kind": "stream",
            "llm": llm_pack,
            "mcp_meta": mcp_meta,
            "model_provider": model_provider,
        }

    return {
        "kind": "deterministic",
        "chat_kwargs": {
            "naics": naics,
            "active_tab": active_tab,
            "kpis": kpis,
            "brain_items": brain,
            "pipeline_items": pipeline,
            "extra_context": extra_for_response,
            "use_llm": False,
            "mcp_tools": mcp_tools if mcp_tools else None,
            "model_provider": model_provider,
            "model_name": model_name,
            "chat_history": history,
        },
        "mcp_meta": mcp_meta,
        "model_provider": model_provider,
    }


async def process_chat_message(
    *,
    message: str,
    naics: str,
    active_tab: str,
    kpis: Optional[dict],
    brain: Optional[List[dict]],
    pipeline: Optional[List[dict]],
    mcp_tools: Optional[List[dict]],
    model_provider: str = "fast",
    model_name: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    continue_run_id: Optional[str] = None,
    vault_excerpt: Optional[str] = None,
) -> Dict[str, Any]:
    """Route skills, MCP, or grounded chat — same logic as legacy /chat."""
    prep = await prepare_chat_message(
        message=message,
        naics=naics,
        active_tab=active_tab,
        kpis=kpis,
        brain=brain,
        pipeline=pipeline,
        mcp_tools=mcp_tools,
        model_provider=model_provider,
        model_name=model_name,
        history=history,
        continue_run_id=continue_run_id,
        vault_excerpt=vault_excerpt,
    )
    if prep["kind"] == "complete":
        return prep["result"]

    mcp_meta = prep.get("mcp_meta") or {}
    model_provider = prep.get("model_provider") or model_provider

    if prep["kind"] == "stream":
        from .llm import chat_messages_multi_provider

        llm = prep["llm"]
        text, model_label = chat_messages_multi_provider(
            llm["messages"],
            provider=llm["provider"],
            model=llm["model"],
            temperature=llm.get("temperature", 0.25),
            max_tokens=llm.get("max_tokens", 1200),
        )
        result = _finalize_llm_text(text, model_label, llm, brain=brain or [], pipeline=pipeline or [])
        return _apply_mcp_postprocess(
            result,
            did_mcp_call=mcp_meta.get("did_mcp_call", False),
            mcp_results=mcp_meta.get("mcp_results") or [],
            mcp_source_note=mcp_meta.get("mcp_source_note", ""),
            tool_names=mcp_meta.get("tool_names") or [],
            model_provider=model_provider,
        )

    result = get_chat_response(**prep["chat_kwargs"])
    return _apply_mcp_postprocess(
        result,
        did_mcp_call=mcp_meta.get("did_mcp_call", False),
        mcp_results=mcp_meta.get("mcp_results") or [],
        mcp_source_note=mcp_meta.get("mcp_source_note", ""),
        tool_names=mcp_meta.get("tool_names") or [],
        model_provider=model_provider,
    )


def _finalize_llm_text(
    text: str,
    model_label: str,
    llm: Dict[str, Any],
    *,
    brain: List[dict],
    pipeline: List[dict],
) -> Dict[str, Any]:
    provider = llm.get("provider", "ollama")
    naics = llm.get("naics", "")
    active_tab = llm.get("active_tab", "")
    brain_count = len(brain)
    pipeline_count = len(pipeline)

    if not text or "LLM call failed" in text or "not configured" in text:
        return get_chat_response(
            naics=naics,
            active_tab=active_tab,
            brain_items=brain,
            pipeline_items=pipeline,
            extra_context=llm.get("extra_context"),
            use_llm=False,
            model_provider="fast",
            chat_history=llm.get("chat_history"),
        )

    llm_actions = []
    if brain:
        top = brain[0].get("name")
        llm_actions.append({
            "label": f"Add more to Brain for {top}",
            "action": "add_to_brain",
            "payload": {"name": top, "type": brain[0].get("type", "competitor")},
        })
    if pipeline:
        llm_actions.append({"label": "Review my Pipeline", "action": "navigate", "payload": {"view": "pipeline"}})

    return {
        "response": text,
        "context_used": {
            "naics": naics,
            "active_tab": active_tab,
            "brain_count": brain_count,
            "pipeline_count": pipeline_count,
            "model": model_label,
            "provider": provider,
        },
        "source": f"{provider}+agentic",
        "model": model_label,
        "suggested_actions": llm_actions,
    }


def iter_stream_chat_result(prep: Dict[str, Any]) -> Iterator[str]:
    """Yield LLM tokens when prep.kind == stream; else yield full response text."""
    if prep["kind"] == "complete":
        yield prep["result"].get("response") or ""
        return

    mcp_meta = prep.get("mcp_meta") or {}
    model_provider = prep.get("model_provider") or "fast"

    if prep["kind"] == "stream":
        from .llm import iter_stream_chat_messages_multi_provider

        llm = prep["llm"]
        collected: List[str] = []
        for chunk in iter_stream_chat_messages_multi_provider(
            llm["messages"],
            provider=llm["provider"],
            model=llm["model"],
            temperature=llm.get("temperature", 0.25),
            max_tokens=llm.get("max_tokens", 1200),
        ):
            collected.append(chunk)
            yield chunk
        return

    result = get_chat_response(**prep["chat_kwargs"])
    result = _apply_mcp_postprocess(
        result,
        did_mcp_call=mcp_meta.get("did_mcp_call", False),
        mcp_results=mcp_meta.get("mcp_results") or [],
        mcp_source_note=mcp_meta.get("mcp_source_note", ""),
        tool_names=mcp_meta.get("tool_names") or [],
        model_provider=model_provider,
    )
    text = result.get("response") or ""
    step = 32
    for i in range(0, len(text), step):
        yield text[i : i + step]


def finalize_stream_prep(prep: Dict[str, Any], full_text: str) -> Dict[str, Any]:
    """Build assistant message payload after streaming completes."""
    if prep["kind"] == "complete":
        return prep["result"]

    mcp_meta = prep.get("mcp_meta") or {}
    model_provider = prep.get("model_provider") or "fast"

    if prep["kind"] == "stream":
        llm = prep["llm"]
        result = _finalize_llm_text(
            full_text,
            llm.get("model", ""),
            llm,
            brain=llm.get("brain_items") or [],
            pipeline=llm.get("pipeline_items") or [],
        )
        if full_text and result.get("response") != full_text:
            result["response"] = full_text
        return _apply_mcp_postprocess(
            result,
            did_mcp_call=mcp_meta.get("did_mcp_call", False),
            mcp_results=mcp_meta.get("mcp_results") or [],
            mcp_source_note=mcp_meta.get("mcp_source_note", ""),
            tool_names=mcp_meta.get("tool_names") or [],
            model_provider=model_provider,
        )

    result = get_chat_response(**prep["chat_kwargs"])
    if full_text:
        result["response"] = full_text
    return _apply_mcp_postprocess(
        result,
        did_mcp_call=mcp_meta.get("did_mcp_call", False),
        mcp_results=mcp_meta.get("mcp_results") or [],
        mcp_source_note=mcp_meta.get("mcp_source_note", ""),
        tool_names=mcp_meta.get("tool_names") or [],
        model_provider=model_provider,
    )