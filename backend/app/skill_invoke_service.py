"""Unified skill invocation for Skills page + co-pilot (no Theseus KG)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from .deterministic.pursuit_paths import pursuit_slug
from .skill_constants import PURSUIT_SKILLS, RUNNABLE_SKILL_IDS
from .skill_registry import get_skill
from .skill_run_store import clear_tracker, start_run
from .skill_constants import MARKETING_SKILL_IDS
from .skill_router import extract_capability_gap, extract_contract_number, extract_partner_name


def _brain_names(brain: Optional[List[dict]]) -> List[str]:
    return [str(b.get("name", "")) for b in (brain or []) if b.get("name")]


def _pick_pursuit_item(
    pursuit_item: Optional[dict],
    pipeline: Optional[List[dict]],
) -> dict:
    if pursuit_item and isinstance(pursuit_item, dict) and pursuit_item:
        return dict(pursuit_item)
    for entry in pipeline or []:
        if not isinstance(entry, dict):
            continue
        raw = entry.get("raw") if isinstance(entry.get("raw"), dict) else entry
        if isinstance(raw, dict) and (raw.get("agency") or raw.get("recipient") or raw.get("award_key")):
            return dict(raw)
    return {}


def _standalone_pursuit_item(
    skill_id: str,
    *,
    inquiry: str,
    contract_number: Optional[str],
    capability_gap: Optional[str],
    brain: Optional[List[dict]],
) -> dict:
    """Allow chat-driven skills without a Pipeline row when inquiry carries enough context."""
    if skill_id == "competitive-intel":
        contract = (contract_number or extract_contract_number(inquiry) or "").strip()
        if contract:
            return {"award_key": contract, "agency": "standalone", "recipient": contract}

    if skill_id == "teaming-finder":
        gap = (capability_gap or extract_capability_gap(inquiry) or "").strip()
        target = ""
        for b in brain or []:
            if b.get("type") == "competitor" and b.get("name"):
                target = str(b["name"])
                break
        if gap or target:
            return {
                "agency": "general",
                "recipient": target or "incumbent",
                "award_key": "",
                "capability_gap": gap,
            }

    return {}


def _pick_displacement_target(
    *,
    explicit: Optional[str],
    pursuit_item: dict,
    brain: Optional[List[dict]],
) -> str:
    if explicit and explicit.strip():
        return explicit.strip()
    if pursuit_item.get("recipient"):
        return str(pursuit_item["recipient"])
    for b in brain or []:
        if b.get("type") == "competitor" and b.get("name"):
            return str(b["name"])
    return ""


def _merge_inquiry_params(
    inquiry: str,
    *,
    contract_number: Optional[str],
    capability_gap: Optional[str],
    displacement_target: Optional[str],
) -> Dict[str, Optional[str]]:
    text = inquiry or ""
    return {
        "contract_number": contract_number or extract_contract_number(text),
        "capability_gap": capability_gap or extract_capability_gap(text),
        "displacement_target": displacement_target or None,
    }


async def invoke_skill(
    skill_id: str,
    *,
    naics: str = "561210",
    brain: Optional[List[dict]] = None,
    pipeline: Optional[List[dict]] = None,
    pursuit_item: Optional[dict] = None,
    contract_number: Optional[str] = None,
    displacement_target: Optional[str] = None,
    capability_gap: Optional[str] = None,
    scope: str = "auto",
    use_llm: bool = False,
    source: str = "ui",
    inquiry: str = "",
) -> Dict[str, Any]:
    """Run a skill with dashboard context (DuckDB + MCP + vault files — no KG)."""
    skill_id = (skill_id or "").strip()
    inquiry = (inquiry or "").strip()
    merged = _merge_inquiry_params(
        inquiry,
        contract_number=contract_number,
        capability_gap=capability_gap,
        displacement_target=displacement_target,
    )
    contract_number = merged["contract_number"]
    capability_gap = merged["capability_gap"]
    if merged["displacement_target"]:
        displacement_target = merged["displacement_target"]

    item = _pick_pursuit_item(pursuit_item, pipeline)
    if not item and skill_id == "renderers":
        from .skill_runners.renderers_runner import extract_input_path

        rel = extract_input_path(inquiry)
        if rel and rel.startswith("pursuits/"):
            slug_part = rel.split("/")[1]
            item = {"award_key": "", "agency": "render", "recipient": slug_part}
    if not item:
        item = _standalone_pursuit_item(
            skill_id,
            inquiry=inquiry,
            contract_number=contract_number,
            capability_gap=capability_gap,
            brain=brain,
        )
    slug = pursuit_slug(item) if item else None

    tracker = start_run(
        skill_id=skill_id,
        source=source,
        inquiry=inquiry,
        inputs={
            "naics": naics,
            "scope": scope,
            "use_llm": use_llm,
            "contract_number": contract_number,
            "displacement_target": displacement_target,
            "capability_gap": capability_gap,
        },
        context={
            "naics": naics,
            "slug": slug,
            "pursuit_agency": item.get("agency"),
            "pursuit_recipient": item.get("recipient"),
            "award_key": item.get("award_key"),
            "brain_count": len(brain or []),
            "pipeline_count": len(pipeline or []),
        },
    )

    try:
        tracker.step_begin("Validate skill", kind="context", input_summary=skill_id)

        if skill_id not in RUNNABLE_SKILL_IDS:
            spec = get_skill(skill_id)
            status = spec.status if spec else "unknown"
            result = {
                "ok": False,
                "skill_id": skill_id,
                "error": f"Skill '{skill_id}' is not runnable yet (status: {status}). Catalog skills land in a later PR.",
                "runnable": False,
            }
            tracker.step_end(status="error", output_summary=result["error"])
            envelope = tracker.finalize(result)
            return {**result, "run_id": envelope["run_id"], "run": envelope}

        tracker.step_end(status="ok", output_summary=f"Runnable · status from catalog")

        if skill_id in PURSUIT_SKILLS and not item:
            result = {
                "ok": False,
                "skill_id": skill_id,
                "error": "No pursuit context — add a row to Pipeline or open Pursuit Workspace on a recompete first.",
                "hint": "pipeline",
            }
            tracker.step("Resolve pursuit context", kind="context", status="error", output_summary=result["error"])
            envelope = tracker.finalize(result)
            return {**_enrich_result(result, source=source), "run_id": envelope["run_id"], "run": envelope}

        tracker.step(
            "Resolve pursuit context",
            kind="context",
            status="ok",
            output_summary=f"slug={slug} · {item.get('recipient') or 'n/a'} @ {item.get('agency') or 'n/a'}",
            detail={"award_key": item.get("award_key")},
        )

        if inquiry:
            tracker.step(
                "User inquiry",
                kind="reasoning",
                status="ok",
                input_summary=inquiry[:500],
            )

        tracker.step_begin(f"Execute {skill_id}", kind="process", input_summary=inquiry[:200] or "(default context)")

        result = await _dispatch_skill(
            skill_id,
            item=item,
            naics=naics,
            brain=brain,
            slug=slug or "",
            contract_number=contract_number,
            displacement_target=displacement_target,
            capability_gap=capability_gap or "",
            scope=scope,
            use_llm=use_llm,
            inquiry=inquiry,
        )

        if result.get("chain_results"):
            for cr in result.get("chain_results") or []:
                tracker.step(
                    f"Orchestrator → {cr.get('skill')}",
                    kind="process",
                    status="ok" if cr.get("ok") else "error",
                    output_summary=cr.get("summary") or cr.get("path") or cr.get("error") or "",
                )

        for rr in result.get("render_results") or []:
            tracker.step(
                f"Render: {rr.get('tool', 'render')}",
                kind="tool",
                status="ok" if rr.get("ok") else "error",
                output_summary=rr.get("path") or rr.get("error") or "",
            )

        if result.get("collector_tools"):
            for tool in result.get("collector_tools") or []:
                tracker.step(f"Collector: {tool}", kind="tool", status="ok", output_summary="deterministic")

        if result.get("warnings"):
            for w in result.get("warnings") or []:
                tracker.add_warning(str(w))

        if result.get("used_llm"):
            tracker.add_transcript_turn(
                turn=len(tracker.transcript) + 1,
                role="assistant",
                content=result.get("summary") or "LLM enrichment applied",
            )

        status = "ok" if result.get("ok") else "error"
        tracker.step_end(
            status=status,
            output_summary=result.get("summary") or result.get("error") or "",
        )

        enriched = _enrich_result(result, source=source)
        envelope = tracker.finalize(enriched)
        return {**enriched, "run_id": envelope["run_id"], "run": envelope}
    finally:
        clear_tracker()


async def _dispatch_skill(
    skill_id: str,
    *,
    item: dict,
    naics: str,
    brain: Optional[List[dict]],
    slug: str,
    contract_number: Optional[str],
    displacement_target: Optional[str],
    capability_gap: str,
    scope: str,
    use_llm: bool,
    inquiry: str = "",
) -> Dict[str, Any]:
    if skill_id == "competitive-intel":
        from .skill_runners.competitive_intel import run_competitive_intel

        contract = (contract_number or item.get("award_key") or "").strip()
        if not contract:
            return {
                "ok": False,
                "skill_id": skill_id,
                "error": "Need a contract number — set award_key on the pursuit row or mention the PIID in chat.",
            }
        return await run_competitive_intel(
            item,
            slug=slug,
            contract_number=contract,
            scope=scope or "auto",
            use_llm=use_llm,
        )

    if skill_id == "teaming-finder":
        from .skill_runners.teaming_finder import run_teaming_finder

        target = _pick_displacement_target(
            explicit=displacement_target,
            pursuit_item=item,
            brain=brain,
        )
        teaming_slug = slug or f"teaming-{naics}-{datetime.utcnow().strftime('%Y%m%d')}"
        return await run_teaming_finder(
            item or {"agency": "general", "recipient": target or "incumbent"},
            slug=teaming_slug,
            naics=naics,
            displacement_target=target,
            capability_gap=capability_gap,
            use_llm=use_llm,
        )

    if skill_id == "vault-lint":
        from .skill_runners.vault_admin import run_vault_lint

        return await run_vault_lint(use_llm=use_llm)

    if skill_id == "vault-index-rebuild":
        from .skill_runners.vault_admin import run_vault_index_rebuild

        return await run_vault_index_rebuild()

    if skill_id == "vault-synthesize":
        from .skill_runners.vault_synthesize import run_vault_synthesize

        return await run_vault_synthesize(
            item,
            slug=slug,
            naics=naics,
            use_llm=use_llm,
        )

    if skill_id == "compliance-auditor":
        from .skill_runners.compliance_auditor import run_compliance_auditor

        return await run_compliance_auditor(
            item,
            slug=slug,
            use_llm=use_llm,
        )

    if skill_id == "ptw-analysis":
        from .skill_runners.ptw_analysis import run_ptw_analysis

        return await run_ptw_analysis(
            item,
            slug=slug,
            naics=naics,
            use_llm=use_llm,
        )

    if skill_id == "proposal-generator":
        from .skill_runners.proposal_generator import run_proposal_generator

        return await run_proposal_generator(
            item,
            slug=slug,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "subcontractor-sow-builder":
        from .skill_runners.subcontractor_sow_builder import run_subcontractor_sow_builder

        return await run_subcontractor_sow_builder(
            item,
            slug=slug,
            partner_name=extract_partner_name(inquiry) or "",
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "huashu-design":
        from .skill_runners.huashu_design import run_huashu_design

        return await run_huashu_design(
            item,
            slug=slug,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "renderers":
        from .skill_runners.renderers_runner import run_renderers

        return await run_renderers(item, slug=slug, inquiry=inquiry)

    if skill_id in MARKETING_SKILL_IDS:
        from .skill_runners.marketing_runner import run_marketing_skill

        return await run_marketing_skill(
            skill_id,
            item,
            slug=slug,
            naics=naics,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "rfp-reverse-engineer":
        from .skill_runners.rfp_reverse_engineer import run_rfp_reverse_engineer

        return await run_rfp_reverse_engineer(
            item,
            slug=slug,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "oci-sweeper":
        from .skill_runners.oci_sweeper import run_oci_sweeper

        return await run_oci_sweeper(
            item,
            slug=slug,
            brain=brain,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "ot-prototype-strategist":
        from .skill_runners.ot_prototype_strategist import run_ot_prototype_strategist

        return await run_ot_prototype_strategist(
            item,
            slug=slug,
            naics=naics,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id in ("igce-builder-ffp", "igce-builder-lh-tm", "igce-builder-cr"):
        from .skill_runners.igce_builder import run_igce_builder

        variant_map = {
            "igce-builder-ffp": "ffp",
            "igce-builder-lh-tm": "lh_tm",
            "igce-builder-cr": "cr",
        }
        return await run_igce_builder(
            item,
            slug=slug,
            variant=variant_map[skill_id],
            naics=naics,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    if skill_id == "data-analyzer":
        from .skill_runners.data_analyzer import run_data_analyzer

        return await run_data_analyzer(
            item,
            slug=slug,
            naics=naics,
            inquiry=inquiry,
            use_llm=use_llm,
        )

    from .pursuit_workspace import run_pursuit_skill

    return await run_pursuit_skill(
        skill_id,
        item,
        naics,
        brain_names=_brain_names(brain),
        use_llm=use_llm,
    )


def _enrich_result(result: Dict[str, Any], *, source: str) -> Dict[str, Any]:
    out = dict(result)
    out["runnable"] = True
    out["source"] = source
    if out.get("ok") and not out.get("summary"):
        parts = []
        if out.get("path"):
            parts.append(f"Saved to Studio: {out['path']}")
        if out.get("child_order_count") is not None:
            parts.append(f"{out['child_order_count']} child orders")
        if out.get("transaction_count") is not None:
            parts.append(f"{out['transaction_count']} transactions in JSON")
        if out.get("candidate_count") is not None:
            parts.append(f"{out['candidate_count']} teaming candidates")
        if out.get("issues") is not None:
            parts.append(f"{out['issues']} lint issues")
        if out.get("finding_count") is not None:
            parts.append(f"{out['finding_count']} compliance findings")
        if out.get("artifact_count") is not None:
            parts.append(f"{out['artifact_count']} pursuit files synthesized")
        if out.get("ptw_baseline_usd") is not None:
            try:
                parts.append(f"PTW baseline ${float(out['ptw_baseline_usd']):,.0f}")
            except (TypeError, ValueError):
                pass
        if out.get("orchestrated") and out.get("chain_results"):
            parts.append(f"{len(out['chain_results'])}-step kickoff chain")
        if out.get("docx_path"):
            parts.append("DOCX exported")
        if out.get("pptx_path"):
            parts.append("PPTX deck exported")
        if out.get("pdf_path"):
            parts.append("PDF deck exported")
        if out.get("xlsx_path"):
            parts.append("XLSX workbook exported")
        if out.get("milestone_count") is not None:
            parts.append(f"{out['milestone_count']} OT milestones")
        out["summary"] = " · ".join(parts) if parts else "Complete."
    return out


def format_skill_for_chat(result: Dict[str, Any]) -> Dict[str, Any]:
    """Turn invoke result into co-pilot response + suggested_actions."""
    skill_id = result.get("skill_id") or "skill"
    run_id = result.get("run_id")
    if not result.get("ok"):
        actions: List[Dict[str, Any]] = []
        if run_id:
            actions.append({
                "label": "View failed run",
                "action": "view_skill_run",
                "payload": {"run_id": run_id, "skill_id": skill_id},
            })
        return {
            "response": f"I tried to run **{skill_id}** but hit a blocker: {result.get('error')}",
            "suggested_actions": actions,
            "skill_run": result,
            "run_id": run_id,
            "source": "skill-invoke-failed",
        }

    primary_path = result.get("path") or result.get("json_path")
    lines = [f"### {skill_id} complete", ""]
    if result.get("insights_headline"):
        lines.append(f"**{result['insights_headline']}**")
        lines.append("")
    if result.get("summary"):
        lines.append(result["summary"])
        lines.append("")
    warnings = result.get("warnings") or []
    if warnings:
        lines.append("**Warnings:** " + "; ".join(str(w) for w in warnings[:3]))
        lines.append("")
    if primary_path:
        lines.append(f"Full deliverable in Studio: `{primary_path}`")
        lines.append("")
        lines.append("_Chat shows executive slice; open Studio for complete deliverable._")

    actions: List[Dict[str, Any]] = []
    if run_id:
        actions.append({
            "label": "View process chain",
            "action": "view_skill_run",
            "payload": {"run_id": run_id, "skill_id": skill_id},
        })
    if result.get("path"):
        actions.append({
            "label": "Open full report in Studio",
            "action": "open_studio",
            "payload": {"path": result["path"], "slug": result.get("slug")},
        })
    if result.get("json_path"):
        actions.append({
            "label": "View full data (JSON)",
            "action": "open_studio",
            "payload": {"path": result["json_path"], "slug": result.get("slug")},
        })
    if result.get("docx_path"):
        actions.append({
            "label": "Open Word (DOCX)",
            "action": "open_studio",
            "payload": {"path": result["docx_path"], "slug": result.get("slug")},
        })
    if result.get("pdf_path"):
        actions.append({
            "label": "Open PDF deck",
            "action": "open_studio",
            "payload": {"path": result["pdf_path"], "slug": result.get("slug")},
        })
    if result.get("pptx_path"):
        actions.append({
            "label": "Open PPTX deck",
            "action": "open_studio",
            "payload": {"path": result["pptx_path"], "slug": result.get("slug")},
        })
    if result.get("xlsx_path"):
        actions.append({
            "label": "Open Excel workbook",
            "action": "open_studio",
            "payload": {"path": result["xlsx_path"], "slug": result.get("slug")},
        })
    if result.get("project_description_path"):
        actions.append({
            "label": "Open OT project description",
            "action": "open_studio",
            "payload": {"path": result["project_description_path"], "slug": result.get("slug")},
        })
    if skill_id in ("vault-lint", "vault-synthesize") or (
        skill_id == "compliance-auditor" and result.get("critical_count", 0) > 0
    ):
        actions.append({
            "label": "Open Knowledge Vault" if skill_id != "compliance-auditor" else "Open Studio audit",
            "action": "navigate",
            "payload": {"view": "vault" if skill_id != "compliance-auditor" else "artifacts"},
        })

    if run_id:
        actions.append({
            "label": "Continue this run",
            "action": "continue_skill_run",
            "payload": {"run_id": run_id, "skill_id": skill_id},
        })

    return {
        "response": "\n".join(x for x in lines if x),
        "suggested_actions": actions,
        "skill_run": result,
        "run_id": run_id,
        "source": "skill-invoke",
    }


def mirror_invoke_to_conversation(
    conversation_id: str,
    *,
    skill_id: str,
    inquiry: str,
    result: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Append drawer/page skill run to active co-pilot thread (PR6 6e)."""
    from .chat_store import append_message, load_conversation

    if not load_conversation(conversation_id):
        return None

    user_line = f"Run **{skill_id}**"
    if (inquiry or "").strip():
        user_line = f"Run **{skill_id}**: {inquiry.strip()}"

    append_message(
        conversation_id,
        role="user",
        content=user_line,
        source="skill-invoke-user",
        skill_id=skill_id,
    )

    formatted = format_skill_for_chat({**result, "skill_id": skill_id})
    append_message(
        conversation_id,
        role="assistant",
        content=formatted.get("response") or "",
        source=formatted.get("source"),
        run_id=formatted.get("run_id"),
        skill_id=skill_id,
        suggested_actions=formatted.get("suggested_actions"),
    )
    return load_conversation(conversation_id)