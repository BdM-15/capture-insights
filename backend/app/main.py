"""
capture-insights FastAPI backend (local workstation API).

Serves typed endpoints for filters, data, summaries, chat, and profile generation.
Designed to be consumed by a local modern frontend (React/TS etc.) and/or CLI/MCP clients.
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, List

from fastapi import FastAPI, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Local import so the early dev layout works without full package install
# (we can clean this up when we do proper packaging)
try:
    from .config import settings
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent))
    from config import settings

# Shared LLM for agentic button flows + warmup (also used by profile + future chat unification)
from . import llm as llm_client

# Real warmup at app start so users don't need multiple manual terminals for MCP servers + Ollama model.
# Per recentering: single (or two) commands bring a "ready" workstation. MCP uses on-demand stdio spawns
# (via mcp.py) + pre-call here to pay cost early and populate cache. Ollama model is loaded via small call.
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[capture-insights] Starting backend v{settings.app_version} env={settings.app_env}")
    print(f"[capture-insights] Using single DuckDB at: {settings.duckdb_path}")

    # Pre-create knowledge/wiki foundation (README + brain/ dirs) so it's immediately visible/usable
    # even before first +brain. This is the solid Obsidian/Karpathy base (native .md + LLM synthesis).
    try:
        from .user_data import _ensure_parent
        _ensure_parent()
        print("[warmup] Knowledge/wiki foundation pre-created (data/knowledge/brain/ + README for Obsidian vault).")
    except Exception as e:
        print(f"[warmup] Knowledge pre-create note: {e}")

    # Warm MCP catalog (triggers uvx sam-gov-mcp once if needed; subsequent calls hit cache)
    if settings.enable_live_mcps:
        try:
            from .mcp import list_sam_mcp_tools
            print("[warmup] Pre-warming MCP tools catalog (sam-gov-mcp via uvx on-demand)...")
            tools = await list_sam_mcp_tools(force_refresh=False)
            print(f"[warmup] MCP catalog ready ({len(tools)} tools; first real call will be fast if server reachable).")
        except Exception as e:
            print(f"[warmup] MCP pre-warm skipped (will be on-demand): {e}")

    # Warm Ollama model (list + tiny generate to load weights into memory; uses shared llm_client)
    if settings.enable_ai_features:
        try:
            print(f"[warmup] Pre-warming Ollama model ({settings.ollama_model}) ...")
            w = await llm_client.warmup_ollama()
            print(f"[warmup] Ollama ready: {w.get('ok')} model={w.get('model')} (available: {len(w.get('available', []))})")
        except Exception as e:
            print(f"[warmup] Ollama pre-warm note (on-demand will still work): {e}")

    yield
    print("[capture-insights] Shutting down...")


app = FastAPI(
    title="capture-insights API",
    description="Local privacy-first federal contract intelligence workstation API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for local frontend dev (tighten in prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    version: str
    env: str
    duckdb_ready: bool = False
    ollama_ready: bool = False
    mcp_servers: list[str] = []


@app.get("/ready", tags=["system"])
async def ready() -> dict[str, Any]:
    """Structured workstation readiness for Future Opportunities strip + Settings."""
    from .readiness import get_readiness
    return await get_readiness()


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> dict[str, Any]:
    """Basic health + readiness for local dev and monitoring.
    MCP/Ollama are warmed at lifespan (pre-calls + cache) so first button or chat actions are fast.
    No separate manual `uvx sam-gov-mcp` or model loads required for normal use (on-demand still works).
    """
    from .mcp import MCP_AVAILABLE
    # Intentionally do not call list_sam_mcp_tools here (it can take seconds on first/uncached because of uvx stdio).
    # The catalog lives at /mcp/tools (and is shipped by frontend into every /chat). Health just reports capability.
    mcp_status = []
    if MCP_AVAILABLE and settings.enable_live_mcps:
        mcp_status.append("sam-gov-mcp (warmed at startup via lifespan pre-call + cache; on-demand stdio if needed. See /mcp/tools?refresh=1)")
    else:
        mcp_status.append("sam (direct REST fallback only; MCP disabled or mcp package not installed)")

    # Quick ollama ping (non-blocking, short)
    ollama_ready = False
    try:
        req = urllib.request.Request(f"{settings.ollama_host}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            ollama_ready = resp.status == 200
    except Exception:
        ollama_ready = False

    return {
        "status": "ok",
        "version": settings.app_version,
        "env": settings.app_env,
        "duckdb_ready": os.path.exists(str(settings.duckdb_path)),
        "ollama_ready": ollama_ready,
        "mcp_servers": mcp_status,
        "mcp_tools_available": None,  # see /mcp/tools for the live list that chat uses
    }


# Root serves the interactive visibility dashboard (see simple_dashboard below).
# API consumers use /docs, /health, /data/* etc.


# --- Simple data endpoints (Chunk 2) ---
# These call the plain-English query functions above.
# The frontend (or future skills/agents) will call these.

from .queries import (
    get_market_summary,
    get_top_agencies,
    get_expiring_contracts,
    get_quick_opportunity_snapshot,
    get_filter_options,
    get_market_potential_summary,
    get_fy_spend_trends,
    get_future_funding_trajectory,
    get_set_aside_breakdown,
    get_executive_kpis,
    get_agency_intensity,
    get_vehicle_breakdown,
    get_vehicle_analysis,
    get_ffp_shaping_radar,
    get_geo_breakdown,
    get_geographic_analysis,
    get_combo_insights,
    get_top_recipient_agency_flows,
    get_agency_recipient_relationships,
    get_teaming_candidates,
    get_top_recipients,
    get_chat_response,
)

# User accumulators (Pipeline + Brain/Wiki) - real on-disk persistence
from .user_data import (
    get_accumulators,
    add_to_pipeline,
    add_to_brain,
    remove_from_pipeline,
    remove_from_brain,
    update_brain_note,
    clear_pipeline,
    clear_brain,
)


class SummaryResponse(BaseModel):
    naics_codes: List[str]
    total_actions: int
    total_millions: float
    avg_thousands: float
    earliest_date: str | None = None
    latest_date: str | None = None
    message: str | None = None


@app.get("/data/summary", response_model=SummaryResponse, tags=["data"])
async def data_summary(
    naics: str = "561210",  # comma separated ok: 561210,541512
    start: str | None = None,
    end: str | None = None,
):
    """Get high-level market numbers for the selected NAICS codes.

    Example browser call:
    http://127.0.0.1:8000/data/summary?naics=561210

    This is the foundation for dashboard cards.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    start_date = date.fromisoformat(start) if start else None
    end_date = date.fromisoformat(end) if end else None

    return get_market_summary(naics_list, start_date, end_date)


@app.get("/data/top-agencies", tags=["data"])
async def data_top_agencies(naics: str = "561210", limit: int = 10):
    """Top spending agencies for the NAICS codes.

    Helps you see where the money is actually flowing.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_top_agencies(naics_list, limit=limit)


@app.get("/data/expiring", tags=["data"])
async def data_expiring(naics: str = "561210", months: int = 24, limit: int = 15):
    """Contracts whose current performance period ends soon.

    These are the recompete opportunities you want to track early.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_expiring_contracts(naics_list, months_ahead=months, limit=limit)


@app.get("/data/snapshot", tags=["data"])
async def data_snapshot(naics: str = "561210"):
    """One convenient call that returns summary + top agencies + expiring.

    Great for a quick "tell me about this market" view that an AI agent or
    a future skill can consume.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    # For snapshot we just take the first NAICS for simplicity in this early version
    primary = naics_list[0] if naics_list else "561210"
    return get_quick_opportunity_snapshot(primary)


@app.get("/data/filters", tags=["data"])
async def data_filters(naics: str = "561210"):
    """Distinct values for the main filter dimensions.

    This powers dynamic dropdowns and multi-selects in the future UI.
    Example: what set-asides, agencies, fiscal years actually exist for these NAICS?
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_filter_options(naics_list or None)


@app.get("/data/market_potential", tags=["data"])
async def data_market_potential(naics: str = "561210"):
    """High-level market potential summary for visibility into total opportunity.

    Total spend, # competitors, trends, top agencies/recipients for your NAICS
    across the loaded historical bulk data. This is the core "visibility into
    our companies total market potential" view.

    Load 5-10 years of relevant NAICS via the download + ingest tools first.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_market_potential_summary(naics_list or None)


@app.get("/data/fy-trends", tags=["data"])
async def data_fy_trends(naics: str = "561210"):
    """Fiscal year spend and action counts for trend visualization."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_fy_spend_trends(naics_list or None)


@app.get("/data/future-trajectory", tags=["data"])
async def data_future_trajectory(naics: str = "561210", months: int = 60):
    """Forward funding trajectory by year — recurring recompete assumption from expiring PoP dates."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_future_funding_trajectory(naics_list or None, horizon_months=months)


@app.get("/data/set-aside", tags=["data"])
async def data_set_aside(naics: str = "561210"):
    """Set-aside vs full-and-open breakdown (small business visibility)."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_set_aside_breakdown(naics_list or None)


@app.get("/data/kpis", tags=["data"])
async def data_kpis(naics: str = "561210"):
    """Executive KPI cards: obligations, actions, avg value, expiring, active, suitability/synergy stubs.
    Directly inspired by the metric cards a capture manager glances at first in the old builds.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_executive_kpis(naics_list or None)


@app.get("/data/agency-intensity", tags=["data"])
async def data_agency_intensity(naics: str = "561210", limit: int = 15):
    """Per-agency actions + obligations for the Capture Intensity scatter + 'hot agencies' list.
    Powers the quadrant analysis (high-volume/high-$ agencies above the median line).
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_agency_intensity(naics_list or None, limit=limit)


@app.get("/data/vehicles", tags=["data"])
async def data_vehicles(naics: str = "561210"):
    """Contract vehicle / pricing type breakdown (how the work is actually bought)."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_vehicle_breakdown(naics_list or None)


@app.get("/data/vehicle-analysis", tags=["data"])
async def data_vehicle_analysis(naics: str = "561210"):
    """Rich contract vehicle analysis — IDV mix, holders, agency buying preferences."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_vehicle_analysis(naics_list or None)


@app.get("/data/ffp-shaping-radar", tags=["data"])
async def data_ffp_shaping_radar(naics: str = "561210", months: int = 36, limit: int = 15):
    """FFP transition shaping radar — non-fixed pricing pressure + expiring shape targets."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_ffp_shaping_radar(naics_list or None, months_ahead=months, target_limit=limit)


@app.get("/data/geo", tags=["data"])
async def data_geo(naics: str = "561210", limit: int = 10):
    """Top states by place of performance (geographic concentration)."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_geo_breakdown(naics_list or None, limit=limit)


@app.get("/data/combo-insights", tags=["data"])
async def data_combo_insights(
    naics: str = "561210",
    months: int = 36,
    limit: int = 40,
):
    """Cross-signal combo matches — scored expiring work with agency, geo, and market overlays."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_combo_insights(naics_list or None, months_ahead=months, limit=limit)


@app.get("/data/opportunities-intel", tags=["data", "opportunities"])
async def data_opportunities_intel(
    naics: str = "561210",
    months: int = 36,
    limit: int = 40,
    proactive_sam: int = 1,
    brain: str = "",
):
    """Future Opportunities intel — scored recompetes, SAM seeds, optional proactive live hits."""
    from .opportunities_intel import get_opportunities_intel
    from .sam_search import search_sam_opportunities
    from .user_data import get_accumulators

    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    brain_names: list[str] = []
    if brain:
        try:
            parsed = json.loads(brain)
            if isinstance(parsed, list):
                brain_names = [str(b.get("name", "")) for b in parsed if isinstance(b, dict) and b.get("name")]
        except Exception:
            pass

    acc = get_accumulators()
    pipeline = acc.get("pipeline") or []

    result = get_opportunities_intel(
        naics_list or None,
        months_ahead=months,
        limit=limit,
        brain_names=brain_names,
        pipeline=pipeline,
        include_proactive_sam=bool(proactive_sam),
    )

    if result.get("meta", {}).get("proactive_sam", {}).get("enabled"):
        primary = naics_list[0] if naics_list else "561210"
        for row in (result.get("rows") or [])[:3]:
            sam_pack = await search_sam_opportunities(
                naics=primary,
                keywords=row.get("suggested_sam_keywords") or "",
                notice_types=row.get("suggested_notice_types") or "",
                limit=3,
            )
            row["live_sam_hits"] = sam_pack.get("results") or []
            row["live_sam_source"] = sam_pack.get("source")

    from .deterministic.sam_budget import get_budget_status
    result["readiness"]["sam_budget"] = get_budget_status()
    return result


@app.get("/data/geographic-analysis", tags=["data"])
async def data_geographic_analysis(
    naics: str = "561210",
    state_limit: int = 15,
    agency_state_limit: int = 48,
    months: int = 36,
):
    """Regional capture intel — state concentration, agency/recipient strongholds, expiring by PoP."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_geographic_analysis(
        naics_list or None,
        state_limit=state_limit,
        agency_state_limit=agency_state_limit,
        months_ahead=months,
    )


@app.get("/data/flows", tags=["data"])
async def data_flows(naics: str = "561210", limit: int = 8):
    """Top recipient + agency + office obligated dollar flows for Sankey / 'Follow the Money' views.
    3-level drill (Competitor → Agency → specific Office) for much tighter focus than agency alone.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_top_recipient_agency_flows(naics_list or None, limit=limit)


@app.get("/data/agency-relationships", tags=["data"])
async def data_agency_relationships(naics: str = "561210", limit: int = 120):
    """Agency × competitor award counts for relationship heatmaps in Agency Intelligence."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_agency_recipient_relationships(naics_list or None, limit=limit)


@app.get("/data/teaming-candidates", tags=["data"])
async def data_teaming_candidates(
    naics: str = "561210",
    target: str = "",
    limit: int = 15,
    gap: str = "",
):
    """Adjacent vendors + subs for gap-fill teaming — excludes top competitors."""
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    result = get_teaming_candidates(target, naics_list or None, limit=limit)
    if gap.strip():
        result.setdefault("meta", {})["capability_gap"] = gap.strip()
    return result


@app.get("/skills/catalog", tags=["skills"])
async def skills_catalog():
    """1102 + Theseus + marketing skill stubs for the Skills sidebar."""
    from .federal_skills import build_skills_catalog
    return build_skills_catalog()


@app.get("/data/top-recipients", tags=["data"])
async def data_top_recipients(naics: str = "561210", limit: int = 8):
    """Top recipients/competitors by obligated $ — pulse for market concentration + biggest players.
    Used for treemap in overview.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]
    return get_top_recipients(naics_list or None, limit=limit)


@app.get("/mcp/sam/opportunities", tags=["mcp", "opportunities"])
async def sam_opportunities(
    naics: str = "561210",
    keywords: str = "",
    notice_types: str = "",
    limit: int = 10,
):
    """Live SAM.gov search with MCP-first hybrid, response cache, and 1000/day budget."""
    from .sam_search import search_sam_opportunities
    pack = await search_sam_opportunities(
        naics=naics,
        keywords=keywords,
        notice_types=notice_types,
        limit=limit,
    )
    return pack.get("results") or []


@app.get("/mcp/tools", tags=["mcp"])
async def mcp_tools_catalog(refresh: int = 0):
    """Return the eight 1102 federal MCP servers (primary) with nested tool endpoints.

    Users choose by MCP (SAM.gov, USASpending, …); the co-pilot picks endpoints under the hood.
    """
    from .federal_mcps import build_mcp_catalog
    from .mcp import list_sam_mcp_tools, MCP_AVAILABLE, settings as mcp_settings
    discovered: dict = {}
    try:
        sam_tools = await list_sam_mcp_tools(force_refresh=bool(refresh))
        if sam_tools:
            discovered["sam-gov-mcp"] = sam_tools
    except Exception:
        pass
    catalog = build_mcp_catalog(discovered)
    return {
        **catalog,
        "mcp_available": catalog.get("online_count", 0) > 0 or (MCP_AVAILABLE and mcp_settings.enable_live_mcps),
        "note": "Pick an MCP by data need — co-pilot and buttons invoke tools for you.",
        "how_to_enable": "SAM.gov MCP warms at startup. Other 1102 MCPs appear in catalog until integrated. Refresh after starting external servers.",
    }


# --- User accumulators (Pipeline + Brain) persistence ---
# These power the contextual +pipeline and +brain/wiki buttons so they survive sessions
# and actually compound knowledge. Stored in data/user_accumulators.json next to the DuckDB.

@app.get("/user/accumulators", tags=["user"])
async def user_accumulators():
    """Return the persisted pipeline and brain/wiki lists."""
    return get_accumulators()

@app.post("/user/pipeline", tags=["user"])
async def user_add_pipeline(entry: dict = Body(...)):
    """Add (or replace by id) an item to the user's pipeline."""
    return add_to_pipeline(entry)

@app.post("/user/brain", tags=["user"])
async def user_add_brain(entry: dict = Body(...)):
    """Add or compound (by name+type) an item in the brain/wiki accumulator.
    Compounding is how the wiki 'gets smarter' when you re-add the same competitor/agency.
    """
    return add_to_brain(entry)

@app.delete("/user/pipeline", tags=["user"])
async def user_remove_pipeline(payload: dict = Body(...)):
    eid = payload.get("id")
    if not eid:
        return {"error": "id is required"}
    return remove_from_pipeline(eid)

@app.delete("/user/brain", tags=["user"])
async def user_remove_brain(payload: dict = Body(...)):
    eid = payload.get("id")
    if not eid:
        return {"error": "id is required"}
    return remove_from_brain(eid)

@app.patch("/user/brain/note", tags=["user"])
async def user_update_brain_note(payload: dict = Body(...)):
    eid = payload.get("id")
    notes = payload.get("notes", "")
    if not eid:
        return {"error": "id is required"}
    return update_brain_note(eid, notes)

@app.delete("/user/pipeline/clear", tags=["user"])
async def user_clear_pipeline():
    return clear_pipeline()

@app.delete("/user/brain/clear", tags=["user"])
async def user_clear_brain():
    return clear_brain()


@app.get("/user/brain/wiki", tags=["user"])
async def user_brain_wiki():
    """Return the native wiki .md files for Brain (Obsidian/Karpathy LLM wiki foundation).
    Surfaces the .md content (LLM-synthesized, wikilinks, citations) so the wiki is visible
    in the app UI while the files remain the source for Obsidian.
    """
    from .user_data import list_brain_wiki_files
    return {"wiki_files": list_brain_wiki_files()}


# Phase 3: lint + index helpers (structural, fast). These make the vault maintainable by you + external agents
# following the exact workflows in schema/capture-llm-wiki.md (ingest/query/lint section).
# The real heavy synthesis/lint still lives in Obsidian + obsidian-skills equipped agents (or the app's light local LLM on +brain).

@app.get("/user/brain/lint", tags=["user", "vault"])
async def user_brain_lint():
    """Structural lint of the native Knowledge Vault .md files (frontmatter + required schema sections).
    Fast, no LLM. Returns actionable issues per entry + legacy dir warnings.
    Use this (or the standalone script) before/after big ingests or when handing off to an external agent.
    """
    from .user_data import lint_brain_wiki
    return lint_brain_wiki()


@app.post("/user/brain/rebuild-index", tags=["user", "vault"])
async def user_brain_rebuild_index():
    """Rebuild data/knowledge/index.md from current native wiki entries.
    Produces a clean, wikilink-rich catalog the LLM (local or external) is expected to maintain.
    Also ensures log.md and index.md exist. Idempotent.
    """
    from .user_data import rebuild_vault_index
    content = rebuild_vault_index()
    return {"ok": True, "path": "data/knowledge/index.md", "bytes": len(content)}


@app.post("/user/brain/fix", tags=["user", "vault"])
async def user_fix_brain(payload: dict = Body(...)):
    """LLM handles the admin: given a lint report, auto-append the missing schema sections
    to the affected native .md files. Grounded in the capture-llm-wiki schema + entry context.
    This is the button-activated agent pattern you want — you click, LLM does the maintenance.
    """
    from .user_data import auto_fix_vault_issues
    report = payload.get("lint_report") or {}
    result = await auto_fix_vault_issues(report)
    return result


# Global wiki endpoints for post-phase3 global + data integration
@app.get("/user/global/list", tags=["user", "vault"])
async def user_global_list():
    """List global wiki .md files for display in vault UI. Now includes content preview so the app can show the actual wiki text in-viewer."""
    from .user_data import list_global_files
    return {"global_files": list_global_files()}


@app.get("/user/knowledge/read", tags=["user", "vault"])
async def user_knowledge_read(path: str = Query(..., description="relative path e.g. global/global_wiki/capture/xxx.md or brain/agencies/foo.md")):
    """Read the full content of any vault .md for the in-app wiki viewer.
    Safe (only under data/knowledge). Returns the complete markdown so you can read Key Signals, Citations, Personal Observations etc. directly in the UI.
    Obsidian remains the place for heavy editing + graph navigation.
    """
    from .user_data import read_knowledge_file
    res = read_knowledge_file(path)
    if not res:
        return {"ok": False, "error": "not found or path outside vault"}
    return {"ok": True, **res}

@app.post("/user/global/cross-seed", tags=["user", "vault"])
async def user_global_cross_seed(payload: dict = Body(...)):
    """Button-driven: LLM synthesizes cross-cutting global page(s) from current data views (intensity, flows etc.)
    + ariadne/global knowledge. Writes native .md per schema with citations. You click, LLM integrates data + knowledge.
    """
    from .user_data import cross_seed_global_from_data
    result = await cross_seed_global_from_data(payload)
    return result


# --- Button-activated agentic actions (LLM + MCP behind explicit user clicks) ---
# Per recentering: primary interface for "agent does the admin task" is contextual buttons
# (e.g. on an expiring contract: "Create SAM.gov monitor" runs LLM to pick smart keywords/notice_types
# from the item + brain + scope, optionally validates via MCP search, then persists a rich sam-monitor
# entry with citations/rationale). Chat remains for open-ended use (way down the road for deep agentic).
# This is small, reuses existing add_to_pipeline + MCP + LLM patterns, keeps per-tab sensibility.

class CreateSamMonitorRequest(BaseModel):
    item: dict  # expiring row or sam result (award_key/recipient/agency/naics etc.)
    naics: str = "561210"
    brain: list[dict] | None = None  # current brain for context
    use_llm: bool = True


@app.post("/user/actions/create-sam-monitor", tags=["user", "actions"])
async def create_sam_monitor(req: CreateSamMonitorRequest):
    """
    Agentic 'Create SAM.gov monitor' activated by button click (or embedded UI).
    Uses LLM (via shared llm_client) + optional MCP search to produce a *smart* persisted monitor:
    - good keywords/notice_types derived from context (not just raw agency name)
    - rationale + citation back to the source expiring award_key or SAM result
    - falls back to deterministic URL builder if LLM unavailable
    Returns the updated accumulators so FE can sync 'My SAM Monitors'.
    """
    from .mcp import search_sam_opportunities_mcp

    item = req.item or {}
    brain = req.brain or []
    naics = req.naics or "561210"

    # 1. Base fields from the triggering item (expiring or SAM result)
    recipient = item.get("recipient") or item.get("title") or ""
    agency = item.get("agency") or ""
    award_key = item.get("award_key") or item.get("contract_award_unique_key") or ""
    end_date = item.get("end_date") or item.get("responseDeadLine") or ""

    # 2. LLM (or det) to suggest smart search params
    suggested_keywords = (recipient or agency or "support services").strip()
    suggested_notice = "RFI,Sources Sought,Special Notice,Presolicitation"
    rationale = f"Derived from {'expiring ' + award_key if award_key else 'SAM result'} for {recipient or agency}."

    from .deterministic.sam_monitor import build_monitor_entry, seed_sam_search

    if not req.use_llm:
        entry = build_monitor_entry(item, naics, source="deterministic-button")
        saved = add_to_pipeline(entry)
        return {
            "ok": True,
            "entry": entry,
            "accumulators": saved,
            "rationale": entry.get("notes", ""),
            "used_llm": False,
        }

    seed = seed_sam_search(item, naics)
    suggested_keywords = seed["keywords"]
    suggested_notice = seed["notice_types"]
    brain_names = ", ".join([b.get("name", "") for b in brain[:3] if b.get("name")])
    prompt = (
        "You are helping a capture professional create a recurring SAM.gov search monitor.\n"
        f"Context: NAICS {naics}. Trigger item: recipient={recipient}, agency={agency}, end={end_date}, key={award_key}.\n"
        f"User's Brain (tracked competitors/agencies): {brain_names or 'none'}.\n"
        f"Deterministic seed keywords: {suggested_keywords}. Notice types: {suggested_notice}.\n"
        "Refine keywords if needed (3-8 words) and notice types (comma sep). One-sentence rationale.\n"
        "Return exactly: KEYWORDS: ...\nNOTICE_TYPES: ...\nRATIONALE: ..."
    )
    text = llm_client.call_llm(prompt, temperature=0.2, max_tokens=120)
    for line in text.splitlines():
        l = line.strip()
        if l.upper().startswith("KEYWORDS:"):
            suggested_keywords = l.split(":", 1)[1].strip() or suggested_keywords
        elif l.upper().startswith("NOTICE_TYPES:") or l.upper().startswith("NOTICE:"):
            suggested_notice = l.split(":", 1)[1].strip() or suggested_notice
        elif l.upper().startswith("RATIONALE:"):
            rationale = l.split(":", 1)[1].strip() or rationale

    mcp_note = ""
    try:
        hits = await search_sam_opportunities_mcp(naics=naics, keywords=suggested_keywords[:80], notice_types=suggested_notice, limit=2)
        if hits:
            mcp_note = " (validated via MCP)"
    except Exception:
        pass

    entry = build_monitor_entry(
        {**item, "agency": agency, "recipient": recipient, "award_key": award_key, "end_date": end_date},
        naics,
        source="agent-button-llm",
    )
    entry["keywords"] = suggested_keywords
    entry["notice_types"] = suggested_notice
    entry["notes"] = f"{rationale}{mcp_note}. Created via smart monitor from {'expiring ' + award_key if award_key else 'SAM result'}."
    entry["monitorUrl"] = entry["monitorUrl"].replace(
        urllib.parse.quote(seed["keywords"]),
        urllib.parse.quote(suggested_keywords),
    ) if suggested_keywords != seed["keywords"] else entry["monitorUrl"]
    from .deterministic.sam_monitor import build_monitor_url
    entry["monitorUrl"] = build_monitor_url(suggested_keywords, naics, suggested_notice)

    saved = add_to_pipeline(entry)
    return {
        "ok": True,
        "entry": entry,
        "accumulators": saved,
        "rationale": rationale,
        "used_llm": True,
    }


class PursuitWorkspaceRequest(BaseModel):
    item: dict
    naics: str = "561210"
    brain: list[dict] | None = None


class PursuitSkillRequest(BaseModel):
    skill_id: str
    item: dict
    naics: str = "561210"
    brain: list[dict] | None = None
    use_llm: bool = False


@app.post("/user/pursuit/workspace", tags=["user", "pursuit", "skills"])
async def pursuit_workspace(req: PursuitWorkspaceRequest):
    """Skill workspace metadata for a recompete row — slug, vault paths, available skills."""
    from .pursuit_workspace import get_workspace_meta

    brain_names = [str(b.get("name", "")) for b in (req.brain or []) if b.get("name")]
    return get_workspace_meta(req.item or {}, req.naics, brain_names=brain_names)


@app.post("/user/pursuit/scaffold-brief", tags=["user", "pursuit", "skills"])
async def pursuit_scaffold_brief(req: PursuitWorkspaceRequest):
    """Create pursuits/<slug>/capture_brief.md if missing (deterministic template)."""
    from .pursuit_workspace import scaffold_capture_brief

    brain_names = [str(b.get("name", "")) for b in (req.brain or []) if b.get("name")]
    return scaffold_capture_brief(req.item or {}, req.naics, brain_names=brain_names, overwrite=False)


@app.post("/user/pursuit/run-skill", tags=["user", "pursuit", "skills"])
async def pursuit_run_skill(req: PursuitSkillRequest):
    """Run a pursuit skill from the row workspace (capture-brief, sam-monitor-builder)."""
    from .pursuit_workspace import run_pursuit_skill

    brain_names = [str(b.get("name", "")) for b in (req.brain or []) if b.get("name")]
    return run_pursuit_skill(
        req.skill_id,
        req.item or {},
        req.naics,
        brain_names=brain_names,
        use_llm=req.use_llm,
    )


# --- Floating AI Co-pilot (context-aware chat) ---
# The chat pane is always available. To make the *responses* useful, the frontend
# now sends the live app state (NAICS, current tab, kpis, brain items, pipeline items).
# The backend builds a grounded reply that references the user's actual saved
# accumulators and data. This is the direct follow-up to "make it more useful for
# the chat and responses."

class ChatRequest(BaseModel):
    naics: str = "561210"
    active_tab: str = "market"
    kpis: dict | None = None
    brain: list[dict] | None = None
    pipeline: list[dict] | None = None
    message: str | None = None   # the user's typed question (we can use it later for routing)
    use_llm: bool = False        # opt into local LLM (qwen3.5:9b etc.) for more natural responses; default is fast deterministic path using your exact persisted Brain + Pipeline data
    mcp_tools: list[dict] | None = None  # catalog of available MCP tools (from /mcp/tools or frontend cache). Passed so LLM knows what admin actions it can drive for the user.

@app.post("/chat", tags=["chat"])
async def chat_endpoint(req: ChatRequest):
    """
    The central (optional) co-pilot endpoint.

    - Grounds on live scope + brain + pipeline.
    - MCP catalog is available for suggestions.
    - Chat is excellent for open questions and exploration. For defined admin tasks
      (e.g. create monitor from an expiring contract) the primary path is the contextual
      button in the UI, which activates the agent (LLM + MCP) directly.
    - Results/suggestions from either path feed the same accumulators.
    """
    from .mcp import search_sam_opportunities_mcp, list_sam_mcp_tools

    brain = req.brain or []
    pipeline = req.pipeline or []
    user_msg = (req.message or "").strip().lower()

    # 1. Discover MCP tool catalog (prefer what FE sent, else ask mcp.py)
    mcp_tools = req.mcp_tools or []
    if not mcp_tools:
        try:
            mcp_tools = await list_sam_mcp_tools()
        except Exception:
            mcp_tools = []

    tool_names = [t.get("name") for t in mcp_tools if isinstance(t, dict) and t.get("name")]

    # 2. Optional chat-driven routing for admin (kept for power users / natural language).
    #    Primary "agent does the task" is via UI buttons (see /user/actions/create-sam-monitor).
    mcp_results: list = []
    mcp_source_note = ""
    did_mcp_call = False

    # Simple but effective intent detection for first small agentic slice (grounded in current brain/expiring).
    # Later we can feed this decision to the LLM for full ReAct/tool-calling.
    wants_sam_search = any(k in user_msg for k in [
        "search sam", "sam search", "find sam", "live sam", "opportunities on sam",
        "rfi", "sources sought", "special notice", "monitor", "create monitor",
        "check sam", "what is live", "new requirements", "emerging"
    ])

    if wants_sam_search or (req.use_llm and "sam" in user_msg):
        # Build a smart query from current context (brain agencies + top expiring agencies + naics + user words)
        brain_keywords = " ".join([str(b.get("name", "")) for b in brain[:4] if b.get("name")])
        # Also pull a couple expiring agencies from the passed kpis? or just use message. For now use brain + naics scope.
        keywords = (req.message or brain_keywords or "").strip() or "facilities support"
        # Limit notice types to the common capture early signals if user didn't specify
        notice_types = "RFI,Sources Sought,Special Notice,Presolicitation"
        if any(x in user_msg for x in ["solicitation", "rfp", "full"]):
            notice_types = "Solicitation,Presolicitation,RFI"

        mcp_results = await search_sam_opportunities_mcp(
            naics=req.naics,
            keywords=keywords[:120],
            notice_types=notice_types,
            limit=6,
        )
        did_mcp_call = True
        mcp_source_note = " (via MCP tool)" if any((isinstance(r,dict) and r.get("_source","").startswith("mcp")) for r in mcp_results) else " (direct/MCP-fallback)"

        # Hybrid fallback for agentic path: if MCP gave nothing (server not up or tool name mismatch or key), still give the /mcp/sam/opportunities path a chance
        # so the LLM always has *some* live-ish signal + the UI shows source. This keeps the "LLM drives the search" experience even before user starts the mcp server.
        if not mcp_results:
            try:
                # Re-use the existing endpoint logic by doing an internal http (simple, no extra imports beyond stdlib)
                q = f"http://127.0.0.1:8000/mcp/sam/opportunities?naics={req.naics}&keywords={urllib.parse.quote(keywords[:80])}&notice_types={urllib.parse.quote(notice_types)}&limit=5"
                with urllib.request.urlopen(q, timeout=6) as rr:
                    alt = json.loads(rr.read())
                    if isinstance(alt, list) and alt:
                        mcp_results = alt
                        mcp_source_note = " (via /mcp/sam hybrid)"
            except Exception:
                pass

    # 3. Enrich the extra_context that goes to the response builder (LLM or det)
    extra_for_response = req.message or ""
    if did_mcp_call and mcp_results:
        # Inject structured live results so the final answer + suggested_actions are grounded in real MCP data.
        # We keep it compact.
        compact = []
        for r in mcp_results[:5]:
            if not isinstance(r, dict): continue
            compact.append({
                "title": r.get("title") or r.get("name"),
                "agency": r.get("agency"),
                "noticeType": r.get("noticeType") or r.get("type"),
                "deadline": r.get("responseDeadLine") or r.get("endDate"),
                "link": r.get("link"),
            })
        extra_for_response = (
            (req.message or "Help with SAM opportunities for my current scope and brain.") +
            f"\n\n[LIVE MCP RESULTS{mcp_source_note} — use these exact items for suggestions and actions]:\n" +
            json.dumps(compact, ensure_ascii=False)[:1500]
        )

    # 4. Call the grounded response builder (it will see the enriched extra + mcp_tools catalog + brain/pipeline)
    result = get_chat_response(
        naics=req.naics,
        active_tab=req.active_tab,
        kpis=req.kpis,
        brain_items=req.brain,
        pipeline_items=req.pipeline,
        extra_context=extra_for_response,
        use_llm=req.use_llm,
        mcp_tools=mcp_tools if mcp_tools else None,
    )

    # 5. Post-process: tag source, and if we did MCP work make sure suggested_actions include "add these to pipeline as monitors"
    if did_mcp_call:
        result["source"] = (result.get("source") or "deterministic") + "+mcp"
        # If the underlying builder didn't produce monitor actions, inject some based on the live results we have.
        actions = result.get("suggested_actions") or []
        has_monitor_action = any("monitor" in str(a).lower() for a in actions)
        if mcp_results and not has_monitor_action:
            for i, r in enumerate(mcp_results[:3]):
                t = (r.get("title") or "") if isinstance(r, dict) else ""
                # Skip placeholder / error messages from direct fallback when key missing
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
                        "monitorUrl": r.get("link") or f"https://sam.gov/opp/{r.get('opportunityId','')}/view",
                        "notes": f"From chat MCP search{mcp_source_note} • {r.get('responseDeadLine','')}"
                    }
                })
            result["suggested_actions"] = actions

    # Also surface the tools we considered (for transparency in UI source area if wanted)
    result.setdefault("mcp_tools_considered", tool_names[:6] if tool_names else [])

    return result


@app.get("/", response_class=HTMLResponse, tags=["ui"])
async def simple_dashboard():
    """Interactive visibility dashboard — dark theme, vibrant accents, useful for BD & capture managers.

    Draws inspiration from the conceptual structure and specific visualizations in the original
    Data_Insights (Market Overview, Future Opportunities / recompete radar, Agency Intelligence,
    Competitive Analysis with intensity scatter + "above the line", Contract Vehicle, Geographic,
    plus the 7 executive metric cards: Total Obligations, Total Actions, Avg Award Value, Active,
    Expiring, Suitability, Synergy; quarterly trends, 5yr projection ideas, Sankey "follow the money",
    capture intensity scatter for hot agencies).

    NOT a copy-paste: completely new lean implementation (FastAPI + DuckDB + zero-dependency thin
    HTML/JS for now). We kept the *usefulness* for a working capture/BD professional:
    - At-a-glance KPIs a manager actually uses for pipeline sizing and bid decisions.
    - "Hot" agencies via intensity (high actions + high $ = focus areas).
    - Flow / competitive landscape to see who wins where.
    - Vehicle & geo to inform strategy (which vehicles carry volume, where the work happens).
    - Expiring as live recompete radar.
    - All backed by the exact same 50+ field bulk data, filterable by NAICS.

    Later (when /frontend React is built): full cross-filtering, real interactive Plotly/Recharts
    versions of the scatter + proper Sankey (D3 or library), maps, saved views, "add to pipeline",
    one-click brief from current filter state, grounded LLM insights on the visuals, your actual
    past performance loaded for real "your share / suitability / synergy".

    Current thin version is already very usable while the 10-year bulk download + incremental
    ingests continue in your other window.
    """
    if os.path.exists("frontend/dist/index.html"):
        return FileResponse("frontend/dist/index.html")
    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>capture-insights • Neural Capture Command</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap');
  
  :root {
    --bg: #0a0a12;
    --card: #16161f;
    --glass: rgba(22, 22, 31, 0.88);
    --border: #1f1f2e;
    --edge-strong: #2c3a5e;
    --text: #e0e0ff;
    --muted: #a0a0c0;
    --neon-cyan: #00f0ff;
    --neon-magenta: #ff2bd6;
    --neon-lime: #00ff9c;
    --neon-amber: #ffb020;
    --neon-red: #ff3b6b;
    --accent: #00f0ff;
  }
  
  body { 
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
    background: var(--bg); 
    color: var(--text); 
  }
  .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  
  .glass {
    background: var(--glass);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 240, 255, 0.1);
  }
  
  .card { 
    background: var(--card); 
    border: 1px solid var(--border); 
    border-radius: 12px; 
    padding: 14px; 
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .card:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 0 20px rgba(0, 240, 255, 0.12);
  }
  
  .neon-cyan { color: var(--neon-cyan); text-shadow: 0 0 6px rgba(0, 240, 255, 0.5); }
  .neon-magenta { color: var(--neon-magenta); text-shadow: 0 0 6px rgba(255, 43, 214, 0.5); }
  .neon-lime { color: var(--neon-lime); }
  .neon-amber { color: var(--neon-amber); }
  
  .neon-border { border: 1px solid var(--neon-cyan); box-shadow: 0 0 12px rgba(0, 240, 255, 0.25); }
  .neon-border-magenta { border: 1px solid var(--neon-magenta); box-shadow: 0 0 12px rgba(255, 43, 214, 0.25); }
  
  .metric { font-size: 1.75rem; font-weight: 700; line-height: 1.05; font-variant-numeric: tabular-nums; }
  .metric-label { font-size: 0.68rem; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); font-weight: 500; }
  
  .section-title { 
    font-size: 0.95rem; 
    font-weight: 600; 
    letter-spacing: 0.5px; 
    color: #c0c0d8; 
    border-bottom: 1px solid var(--border); 
    padding-bottom: 6px; 
    margin-bottom: 8px; 
    display: flex; 
    align-items: center; 
    gap: 8px; 
  }
  
  .kpi-card { 
    border-left: 3px solid; 
    padding-left: 11px; 
    background: rgba(22,22,31,0.6);
  }
  .kpi-cyan { border-color: var(--neon-cyan); }
  .kpi-magenta { border-color: var(--neon-magenta); }
  .kpi-amber { border-color: var(--neon-amber); }
  .kpi-lime { border-color: var(--neon-lime); }
  
  .note { 
    background: rgba(31,31,46,0.6); 
    border: 1px solid var(--border); 
    color: #a8b4d0; 
    font-size: 0.78rem; 
    padding: 8px 10px; 
    border-radius: 8px; 
  }
  
  .small { font-size: 0.78rem; color: var(--muted); }
  
  table { width: 100%; font-size: 0.8rem; border-collapse: collapse; }
  th, td { padding: 5px 7px; border-bottom: 1px solid var(--border); text-align: left; }
  th { color: var(--muted); font-weight: 500; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; }
  
  .bar { height: 8px; background: linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta)); border-radius: 999px; display: inline-block; }
  
  .nav-pill { 
    background: #16161f; 
    padding: 3px 10px; 
    border-radius: 999px; 
    font-size: 0.7rem; 
    cursor: pointer; 
    border: 1px solid var(--border);
    transition: all 0.1s;
  }
  .nav-pill:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
  .nav-pill.active { 
    background: rgba(0,240,255,0.12); 
    color: var(--neon-cyan); 
    border-color: var(--neon-cyan); 
    font-weight: 600; 
  }
  
  .chart-container { position: relative; height: 210px; }
  
  .flow-row { display: flex; align-items: center; gap: 6px; margin: 2px 0; font-size: 0.76rem; }
  
  .status { font-size: .7rem; padding: 1px 7px; border-radius: 999px; background: rgba(0,255,156,0.1); color: var(--neon-lime); border: 1px solid rgba(0,255,156,0.3); }
  
  footer { margin-top: 18px; font-size: .7rem; color: #606080; text-align: center; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  
  .holographic { position: relative; overflow: hidden; }
  .holographic::after {
    content: ''; position: absolute; top: -50%; left: -50%; width: 40%; height: 200%;
    background: linear-gradient(120deg, transparent, rgba(255,255,255,0.08), transparent);
    animation: holographic-scan 3s infinite;
  }
  @keyframes holographic-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
  
  .cyber-grid {
    background-image: 
      linear-gradient(rgba(0,240,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,240,255,0.025) 1px, transparent 1px);
    background-size: 32px 32px;
  }
  
  .metric-card:hover { box-shadow: 0 0 22px rgba(0,240,255,0.15); }
  
  .icon-tile {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,240,255,0.08); border: 1px solid rgba(0,240,255,0.2);
  }
</style>
  .nav-pill.active { background: var(--accent); color: #051B30; font-weight: 600; }
  .chart-container { position: relative; height: 220px; }
  .flow-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; font-size: 0.78rem; }
  .flow-bar { height: 10px; background: linear-gradient(90deg, var(--accent), var(--magenta)); border-radius: 3px; }
  footer a { color: var(--accent2); }
</style>
</head>
<body class="bg-[#0a0a12] text-[#e0e0ff] cyber-grid">
<div class="max-w-[1360px] mx-auto p-4">
  <!-- Top Command Bar (Ariadne/Theseus inspired) -->
  <div class="h-14 border-b border-[#1f1f2e] bg-[#0a0a12]/95 backdrop-blur-xl fixed w-full z-50 left-0 px-4" style="max-width:1360px; margin:0 auto;">
    <div class="max-w-[1360px] mx-auto h-full flex items-center justify-between">
      <div class="flex items-center gap-x-3">
        <div class="flex items-center gap-x-2">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#ff2bd6] flex items-center justify-center">
            <i class="fa-solid fa-infinity text-black text-xl"></i>
          </div>
          <div>
            <span class="text-2xl font-bold tracking-tighter neon-cyan">CAPTURE</span>
            <span class="text-2xl font-bold tracking-tighter text-white/70">INSIGHTS</span>
          </div>
        </div>
        <div class="px-2.5 py-0.5 text-[10px] font-mono border border-[#00f0ff]/30 text-[#00f0ff] rounded-full">v0.3 • NEURAL</div>
      </div>

      <div class="flex-1 max-w-md mx-6">
        <div class="relative">
          <input id="naics" value="561210" class="w-full bg-[#16161f] border border-[#1f1f2e] focus:border-[#00f0ff] text-sm placeholder-[#606080] pl-9 py-2 rounded-2xl focus:outline-none transition-all font-mono" placeholder="NAICS (e.g. 561210,541512)">
          <i class="fa-solid fa-search absolute left-3.5 top-2.5 text-[#606080]"></i>
        </div>
      </div>

      <div class="flex items-center gap-x-3">
        <button onclick="refreshAll()" class="px-4 py-1.5 rounded-2xl bg-white text-black font-semibold text-sm flex items-center gap-x-2 hover:bg-[#e0e0ff] transition-colors">
          <i class="fa-solid fa-sync mr-1"></i> <span>REFRESH</span>
        </button>
        <button onclick="window.location.reload()" class="px-3 py-1.5 text-xs border border-[#1f1f2e] rounded-xl hover:bg-[#16161f]">Hard Reload</button>

        <div class="flex items-center gap-x-2 pl-3 border-l border-[#1f1f2e]">
          <div class="text-right">
            <div class="text-xs font-medium">Local Analyst</div>
            <div class="text-[10px] text-[#a0a0c0]">8GB VRAM • DuckDB</div>
          </div>
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#ff2bd6] to-[#00f0ff] flex items-center justify-center ring-2 ring-offset-2 ring-offset-[#0a0a12] ring-[#1f1f2e]">
            <span class="font-bold text-xs">CI</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="pt-16">

  <!-- Status / Data note (subtle, under fixed header) -->
  <div class="flex items-center justify-between mb-2 px-1">
    <div>
      <span id="status" class="px-3 py-1 text-xs rounded-full bg-[#16161f] text-[#00f0ff] border border-[#00f0ff]/30">REAL BULK DATA • 2015 SLICE (INGEST MORE FOR DEPTH)</span>
    </div>
    <div class="text-xs text-[#a0a0c0]">Your external 2-day bulk download is the source of truth. Re-ingest zips → Refresh. <span class="font-mono text-[#00f0ff]">data/raw/10year_bulk/</span></div>
  </div>

  <!-- Executive KPI Cards — Ariadne/Theseus glass + neon inspired -->
  <div class="mb-3">
    <div class="flex items-center gap-x-2 mb-1.5 px-1">
      <span class="uppercase tracking-[1.5px] text-xs text-[#a0a0c0] font-medium">EXECUTIVE SUMMARY — GLANCEABLE FOR CAPTURE MANAGERS</span>
      <i class="fa-solid fa-info-circle text-[#00f0ff] text-xs cursor-help" title="These 7 numbers (inspired by the original Data_Insights metric row) give you instant TAM sizing, pipeline health, and recompete radar. Suitability/Synergy become live once you load your capability profile + past performance for matching against expiring work descriptions."></i>
    </div>
    <div id="kpi-row" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2"></div>
  </div>

  <!-- Section Navigation (Theseus-style pills) -->
  <div class="flex flex-wrap gap-1 mb-2 px-1" id="section-nav">
    <div onclick="document.getElementById('sec-overview').scrollIntoView({behavior:'smooth'})" class="nav-pill active">Market Overview</div>
    <div onclick="document.getElementById('sec-intensity').scrollIntoView({behavior:'smooth'})" class="nav-pill">Capture Intensity</div>
    <div onclick="document.getElementById('sec-competitive').scrollIntoView({behavior:'smooth'})" class="nav-pill">Competitive</div>
    <div onclick="document.getElementById('sec-vehicles').scrollIntoView({behavior:'smooth'})" class="nav-pill">Vehicles</div>
    <div onclick="document.getElementById('sec-geo').scrollIntoView({behavior:'smooth'})" class="nav-pill">Geographic</div>
    <div onclick="document.getElementById('sec-opportunities').scrollIntoView({behavior:'smooth'})" class="nav-pill">Future Opportunities</div>
    <div onclick="document.getElementById('sec-flow').scrollIntoView({behavior:'smooth'})" class="nav-pill">Follow the Money</div>
  </div>

  <!-- Main content grid with glass cards, neon accents, icons, educational tooltips -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2">
    <!-- Market Overview / Trends -->
    <div id="sec-overview" class="lg:col-span-7 card glass holographic">
      <div class="section-title"><i class="fa-solid fa-chart-line text-[#00f0ff]"></i> MARKET OVERVIEW — TRENDS &amp; SCALE</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div class="flex items-center gap-1.5 text-xs text-[#a0a0c0] mb-1">
            FY Spend &amp; Actions (derived fiscal year)
            <i class="fa-solid fa-info-circle text-[#00f0ff] text-[10px] cursor-help" title="For BD/Capture: See year-over-year growth or contraction in obligations and action volume. Use to size your TAM/SAM and spot emerging or declining markets. More years = powerful CAGR views."></i>
          </div>
          <div class="chart-container"><canvas id="fyChart"></canvas></div>
        </div>
        <div>
          <div class="flex items-center gap-1.5 text-xs text-[#a0a0c0] mb-1">
            Set-Aside / Competition Mix
            <i class="fa-solid fa-info-circle text-[#00f0ff] text-[10px] cursor-help" title="Small business visibility. High small biz set-aside share = different capture strategy (teaming vs prime). 'NO SET ASIDE' dominance means full &amp; open — prepare for heavy competition or niche differentiators."></i>
          </div>
          <div class="chart-container"><canvas id="setAsideChart"></canvas></div>
        </div>
      </div>
      <div class="note mt-2">Trends &amp; projections become decisive once you ingest 3–5+ years of bulk data. Current view is early 2015 slice only.</div>
    </div>

    <!-- Capture Intensity -->
    <div id="sec-intensity" class="lg:col-span-5 card glass">
      <div class="section-title"><i class="fa-solid fa-crosshairs text-[#ff2bd6]"></i> CAPTURE INTENSITY — HOT AGENCIES</div>
      <div class="flex items-center gap-1.5 text-xs text-[#a0a0c0] mb-1">
        Agencies by volume vs. value (normalized). “Above the line” = high actions + high $ — prime focused capture targets.
        <i class="fa-solid fa-info-circle text-[#ff2bd6] text-[10px] cursor-help" title="Classic from the original Data_Insights. Plot normalized award count (x) vs obligations (y). Median lines create quadrants. High-high quadrant = agencies worth dedicated BD resources and early positioning. Use the table below to prioritize."></i>
      </div>
      <div class="chart-container mb-2"><canvas id="intensityChart"></canvas></div>
      <div id="intensity-table" class="max-h-[130px] overflow-auto text-xs"></div>
    </div>

    <!-- Competitive -->
    <div id="sec-competitive" class="lg:col-span-5 card glass">
      <div class="section-title"><i class="fa-solid fa-trophy text-[#00ff9c]"></i> COMPETITIVE LANDSCAPE</div>
      <div class="flex items-center gap-1.5 text-xs text-[#a0a0c0] mb-1">Who is winning the dollars? Top recipients by total obligations in your NAICS.</div>
      <div id="recipients-body" class="max-h-[190px] overflow-auto"></div>
      <div class="note mt-1.5">Future: load your UEI history for “your share”, win-rate signals, and true competitor intensity scatter.</div>
    </div>

    <!-- Vehicles -->
    <div id="sec-vehicles" class="lg:col-span-4 card glass">
      <div class="section-title"><i class="fa-solid fa-truck text-[#ffb020]"></i> CONTRACT VEHICLE &amp; PRICING</div>
      <div class="flex items-center gap-1.5 text-xs text-[#a0a0c0] mb-1">How the work is actually bought (pricing + IDV/vehicle type). Informs which vehicles, schedules, or IDIQs to chase or team on.</div>
      <div class="chart-container"><canvas id="vehicleChart"></canvas></div>
      <div id="vehicle-table" class="text-xs mt-1 max-h-[90px] overflow-auto"></div>
    </div>

    <!-- Geo -->
    <div id="sec-geo" class="lg:col-span-3 card glass">
      <div class="section-title"><i class="fa-solid fa-globe text-[#00ff9c]"></i> GEOGRAPHIC</div>
      <div class="text-xs text-[#a0a0c0] mb-1">Place of performance states. Regional strongholds, office strategy, travel implications for capture.</div>
      <div id="geo-body"></div>
    </div>

    <!-- Future Opportunities -->
    <div id="sec-opportunities" class="lg:col-span-12 card glass">
      <div class="section-title"><i class="fa-solid fa-clock text-[#ff2bd6]"></i> FUTURE OPPORTUNITIES &amp; RECOMPETE RADAR</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-1">
          <div class="text-xs text-[#a0a0c0]">Expiring in next 24–36 mo (current PoP end)</div>
          <div id="expiring-count" class="text-5xl font-semibold neon-magenta mt-1"></div>
          <div class="small mt-1">Contracts whose performance is ending soon. Early positioning wins recompetes.</div>
          <div class="mt-2 text-[10px] text-[#a0a0c0]">Suitability/Synergy stubs will light up with your capability data + description matching.</div>
        </div>
        <div class="md:col-span-2">
          <div id="expiring-table" class="max-h-[130px] overflow-auto text-xs"></div>
        </div>
      </div>
    </div>

    <!-- Follow the Money -->
    <div id="sec-flow" class="lg:col-span-12 card glass">
      <div class="section-title"><i class="fa-solid fa-money-bill-wave text-[#00f0ff]"></i> FOLLOW THE MONEY — FLOW VIEW</div>
      <div class="text-xs text-[#a0a0c0] mb-1">Inspired by the original Sankey “Companies → Agencies → Contracts”. Shows concentration at recipient and agency level.</div>
      <div id="flow-body"></div>
      <div class="note mt-1">Full hierarchical Sankey (with live filtering and citations) arrives in the modern React frontend.</div>
    </div>
  </div>

  <div class="note mt-3 text-xs">
    <strong>Workflow while bulk runs:</strong> Keep your 2-day chunk download going in the other window. When new dated zips appear, run the ingest (it is incremental):<br>
    <span class="font-mono text-[#00C3FF]">uv run python scripts/ingest_historical.py --csv 'data/raw/10year_bulk/prime/*.zip'</span> (omit --naics to ingest the entire raw CSVs with no NAICS limit; add --naics 561210 if desired. Repeat with --sub for teaming). Then hit Refresh All here. History compounds fast.
  </div>

  <footer class="mt-4 text-center text-[10px] text-[#6b8fb8]">
    USASpending bulk (exact original TARGET_FIELDS) • Single DuckDB • FastAPI • No Streamlit • 
    <a href="/docs" target="_blank">/docs</a> • 
    <a href="/health" target="_blank">/health</a> • 
    <a href="https://github.com/BdM-15/capture-insights" target="_blank">GitHub</a>
    <span class="mx-2">•</span> Dark vibrant theme + the conceptual power of the original tabs/cards/visuals, rebuilt cleanly for real capture work.
  </footer>
</div>

<script>
// Tailwind script config (dark vibrant)
function initTailwind() {
  document.documentElement.style.setProperty('--accent', '#00C3FF');
}
initTailwind();

let charts = {};

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}
function fmt(n) { if (!n && n !== 0) return '—'; return Number(n).toLocaleString(); }
function money(m) { return '$' + fmt(m) + 'M'; }

async function loadKPIs(naics) {
  const k = await fetchJson('/data/kpis?naics=' + encodeURIComponent(naics));
  const row = document.getElementById('kpi-row');
  row.innerHTML = `
    <div class="kpi-card kpi-amber card glass"><div class="metric-label flex items-center gap-1">TOTAL OBLIGATIONS <i class="fa-solid fa-info-circle text-xs cursor-help" title="Total addressable market (TAM) in your NAICS slice. Use for pipeline sizing and executive briefs."></i></div><div class="metric neon-amber">${money(k.total_obligations_m)}</div></div>
    <div class="kpi-card kpi-cyan card glass"><div class="metric-label flex items-center gap-1">TOTAL ACTIONS <i class="fa-solid fa-info-circle text-xs cursor-help" title="Number of contract actions. High volume = many small opportunities or high churn market."></i></div><div class="metric neon-cyan">${fmt(k.total_actions)}</div></div>
    <div class="kpi-card kpi-lime card glass"><div class="metric-label flex items-center gap-1">AVG AWARD VALUE <i class="fa-solid fa-info-circle text-xs cursor-help" title="Average size of awards. Large avg = fewer but bigger pursuits; small avg = volume game or set-aside heavy."></i></div><div class="metric neon-lime">$${fmt(k.avg_award_value_k)}k</div></div>
    <div class="kpi-card kpi-cyan card glass"><div class="metric-label flex items-center gap-1">ACTIVE (APPROX) <i class="fa-solid fa-info-circle text-xs cursor-help" title="Rough count of awards with current performance still open. Indicates ongoing incumbency landscape."></i></div><div class="metric neon-cyan">${fmt(k.active_contracts_approx)}</div></div>
    <div class="kpi-card kpi-magenta card glass"><div class="metric-label flex items-center gap-1">EXPIRING (24M) <i class="fa-solid fa-info-circle text-xs cursor-help" title="Recompete radar. These are the contracts you can start positioning for now. Prioritize by $ and fit."></i></div><div class="metric neon-magenta">${fmt(k.expiring_24m)}</div></div>
    <div class="kpi-card card glass" style="border-color:#ffb020"><div class="metric-label flex items-center gap-1">SUITABILITY <i class="fa-solid fa-info-circle text-xs cursor-help" title="Placeholder (was 9% in old builds). Will be % of expiring work that matches your capabilities once you load your profile data."></i></div><div class="metric neon-amber">${k.suitability_pct}% <span class="text-[9px] align-super text-[#a0a0c0]">stub</span></div></div>
    <div class="kpi-card card glass" style="border-color:#ff2bd6"><div class="metric-label flex items-center gap-1">SYNERGY <i class="fa-solid fa-info-circle text-xs cursor-help" title="Placeholder (was 14%). Cross-team or multi-NAICS fit score against expiring opportunities. Live when your data is loaded."></i></div><div class="metric neon-magenta">${k.synergy_pct}% <span class="text-[9px] align-super text-[#a0a0c0]">stub</span></div></div>
  `;
  return k;
}

async function loadTrends(naics) {
  const fy = await fetchJson('/data/fy-trends?naics=' + encodeURIComponent(naics));
  const ctx = document.getElementById('fyChart');
  if (charts.fy) charts.fy.destroy();
  if (!fy || !fy.length) { ctx.parentElement.innerHTML = '<div class="small p-3">No trend data yet — ingest more chunks.</div>'; return; }
  charts.fy = new Chart(ctx, {
    type: 'line',
    data: {
      labels: fy.map(r => 'FY' + r.fy),
      datasets: [{
        label: '$ Millions',
        data: fy.map(r => r.millions),
        borderColor: '#00C3FF',
        backgroundColor: 'rgba(0,195,255,0.15)',
        tension: 0.3,
        yAxisID: 'y'
      }, {
        label: 'Actions',
        data: fy.map(r => r.actions),
        borderColor: '#FF2EDF',
        backgroundColor: 'rgba(255,46,223,0.1)',
        tension: 0.3,
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { position: 'left', grid: { color: '#1e3a5f' } }, y1: { position: 'right', grid: { drawOnChartArea: false } } },
      plugins: { legend: { labels: { color: '#8fb4d9', boxWidth: 12 } } }
    }
  });

  // also set-aside pie/bar
  const sa = await fetchJson('/data/set-aside?naics=' + encodeURIComponent(naics));
  const ctx2 = document.getElementById('setAsideChart');
  if (charts.sa) charts.sa.destroy();
  if (!sa || !sa.length) return;
  charts.sa = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: sa.slice(0,6).map(r => (r.set_aside||'').slice(0,22)),
      datasets: [{ label: '$M', data: sa.slice(0,6).map(r => r.millions), backgroundColor: '#5271FF' }]
    },
    options: { responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}} }
  });
}

async function loadIntensity(naics) {
  const data = await fetchJson('/data/agency-intensity?naics=' + encodeURIComponent(naics) + '&limit=12');
  const ctx = document.getElementById('intensityChart');
  if (charts.int) charts.int.destroy();

  if (!data || data.length < 2) {
    ctx.parentElement.innerHTML = '<div class="small">Need more agencies for intensity scatter.</div>';
    return;
  }

  // Simple normalization in browser (log scale-ish for visual)
  const maxA = Math.max(...data.map(d => d.award_count));
  const maxO = Math.max(...data.map(d => d.total_oblig));
  const points = data.map((d,i) => ({
    x: Math.log(d.award_count + 1) / Math.log(maxA + 1) * 100,
    y: Math.log(d.total_oblig + 1) / Math.log(maxO + 1) * 100,
    r: Math.max(4, Math.min(18, Math.sqrt(d.total_oblig) / 80000 * 18)),
    agency: d.agency,
    actions: d.award_count,
    oblig: d.total_oblig
  }));

  charts.int = new Chart(ctx, {
    type: 'bubble',
    data: { datasets: [{ label: 'Agencies', data: points, backgroundColor: 'rgba(0,195,255,0.7)' }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      scales: { x: { title:{text:'Actions (norm log)', color:'#8fb4d9'} }, y:{ title:{text:'Obligations (norm log)', color:'#8fb4d9'} } },
      plugins: { legend: { display:false }, tooltip: { callbacks: { label: (ctx) => ctx.raw.agency + ' • ' + ctx.raw.actions + ' actions, $' + (ctx.raw.oblig/1e6).toFixed(1) + 'M' } } }
    }
  });

  // "Above the line" table (simple median split)
  const medA = data.reduce((s,d)=>s+d.award_count,0)/data.length;
  const medO = data.reduce((s,d)=>s+d.total_oblig,0)/data.length;
  const hot = data.filter(d => d.award_count > medA && d.total_oblig > medO).sort((a,b)=>b.total_oblig-a.total_oblig);
  let html = '<div class="text-xs text-[#FF2EDF] mb-0.5">High-Intensity (above median on both axes) — prime capture targets</div><table><tr><th>Agency</th><th>Actions</th><th>$M</th></tr>';
  hot.slice(0,5).forEach(h => {
    html += `<tr><td>${h.agency||'—'}</td><td>${fmt(h.award_count)}</td><td>${(h.total_oblig/1e6).toFixed(1)}</td></tr>`;
  });
  html += '</table>';
  document.getElementById('intensity-table').innerHTML = html || '<div class="small">No agencies clearly above both medians in this slice.</div>';
}

async function loadCompetitive(naics) {
  const mp = await fetchJson('/data/market_potential?naics=' + encodeURIComponent(naics));
  const el = document.getElementById('recipients-body');
  let html = '<table><tr><th>Recipient</th><th>$M</th></tr>';
  (mp.top_recipients || []).forEach(r => {
    html += `<tr><td class="font-medium">${r.name || '—'}</td><td>${r.millions}</td></tr>`;
  });
  html += '</table>';
  el.innerHTML = html;
}

async function loadVehicles(naics) {
  const v = await fetchJson('/data/vehicles?naics=' + encodeURIComponent(naics));
  const ctx = document.getElementById('vehicleChart');
  if (charts.veh) charts.veh.destroy();
  if (!v || !v.length) { ctx.parentElement.innerHTML = '<div class="small">No vehicle data.</div>'; return; }
  const top = v.slice(0,7);
  charts.veh = new Chart(ctx, {
    type: 'bar',
    data: { labels: top.map(x => (x.pricing||'').slice(0,18)), datasets: [{data: top.map(x=>x.millions), backgroundColor: '#FF8C00'}] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
  });
  let t = '<table class="mt-1"><tr><th>Pricing / Vehicle</th><th>$M</th></tr>';
  top.forEach(x => { t += `<tr><td>${x.pricing} / ${x.vehicle}</td><td>${x.millions}</td></tr>`; });
  document.getElementById('vehicle-table').innerHTML = t + '</table>';
}

async function loadGeo(naics) {
  const g = await fetchJson('/data/geo?naics=' + encodeURIComponent(naics));
  const el = document.getElementById('geo-body');
  if (!g || !g.length) { el.innerHTML = '<div class="small">No geo data.</div>'; return; }
  let html = '<table><tr><th>State</th><th>$M</th><th>Actions</th></tr>';
  g.forEach(s => {
    const w = Math.round((s.millions / g[0].millions) * 100);
    html += `<tr><td>${s.state}</td><td>${s.millions}</td><td>${fmt(s.actions)}</td></tr>`;
  });
  html += '</table>';
  el.innerHTML = html;
}

async function loadExpiring(naics) {
  const rows = await fetchJson('/data/expiring?naics=' + encodeURIComponent(naics) + '&months=36&limit=6');
  const cntEl = document.getElementById('expiring-count');
  cntEl.textContent = rows ? rows.length : '0';
  const el = document.getElementById('expiring-table');
  if (!rows || !rows.length) { el.innerHTML = '<div class="small">No expiring contracts in the loaded slice (will light up with recent years).</div>'; return; }
  let html = '<table><tr><th>End</th><th>Recipient</th><th>$</th><th>Agency</th></tr>';
  rows.forEach(x => {
    html += `<tr><td>${x.end_date||''}</td><td>${(x.recipient||'').slice(0,24)}</td><td>${x.obligation ? (x.obligation/1e6).toFixed(1)+'M' : ''}</td><td>${(x.agency||'').slice(0,18)}</td></tr>`;
  });
  el.innerHTML = html + '</table>';
}

async function loadFlow(naics) {
  const mp = await fetchJson('/data/market_potential?naics=' + encodeURIComponent(naics));
  const flows = await fetchJson('/data/flows?naics=' + encodeURIComponent(naics) + '&limit=6').catch(() => []);
  const el = document.getElementById('flow-body');

  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">';
  html += '<div><div class="text-[#ff2bd6] mb-0.5 flex items-center gap-1">Top Recipients (who captured the $)<i class="fa-solid fa-info-circle text-[#ff2bd6] text-[10px] cursor-help" title="Concentration at the prime level. High share by few recipients = incumbent-heavy or consolidated market. Look for teaming opportunities or niches they miss."></i></div>';
  (mp.top_recipients || []).slice(0,5).forEach(r => {
    const w = Math.min(100, Math.round((r.millions / (mp.top_recipients[0].millions||1)) * 100));
    html += `<div class="flow-row"><span class="w-28 truncate">${r.name}</span> <span class="flex-1"><span class="flow-bar inline-block" style="width:${w}%"></span></span> <span>${r.millions}M</span></div>`;
  });
  html += '</div><div><div class="text-[#00f0ff] mb-0.5 flex items-center gap-1">Top Agencies (where the $ came from)<i class="fa-solid fa-info-circle text-[#00f0ff] text-[10px] cursor-help" title="Buyer concentration. Heavy DoD/GSA etc. tells you where to build relationships and which past performance examples matter most."></i></div>';
  (mp.top_agencies || []).slice(0,5).forEach(a => {
    const w = Math.min(100, Math.round((a.millions / (mp.top_agencies[0].millions||1)) * 100));
    html += `<div class="flow-row"><span class="w-28 truncate">${a.agency || '(unspec)'}</span> <span class="flex-1"><span class="flow-bar inline-block" style="width:${w}%"></span></span> <span>${a.millions}M</span></div>`;
  });
  html += '</div></div>';

  if (flows && flows.length) {
    html += `<div class="mt-2"><div class="text-[10px] text-[#a0a0c0] mb-1 flex items-center gap-1">Top Recipient → Agency Flows (real pairs)<i class="fa-solid fa-info-circle text-[#00f0ff] text-[10px] cursor-help" title="Direct recipient + buying agency pairs with $ obligated. This is the data that will power a real interactive Sankey in the React UI. Great for spotting which primes dominate specific agencies."></i></div><table class="text-xs"><tr><th>Recipient</th><th>Agency</th><th>$M</th></tr>`;
    flows.forEach(f => {
      html += `<tr><td>${f.recipient}</td><td>${f.agency}</td><td>${f.millions}</td></tr>`;
    });
    html += `</table></div>`;
  }

  // Mermaid flow approximation (Ariadne/Theseus inspired visual)
  html += `<div class="mt-2"><div class="text-[10px] text-[#a0a0c0] mb-1">MONEY FLOW (Mermaid proxy — full Sankey in React)</div><div id="mermaid-flow" class="bg-[#0f1422] p-2 rounded text-[10px] font-mono overflow-auto"></div></div>`;
  el.innerHTML = html;

  // Render simple mermaid flowchart using top data
  if (window.mermaid) {
    const topR = (mp.top_recipients || []).slice(0,3).map(r => r.name.replace(/[^a-zA-Z0-9 ]/g,' ').trim().slice(0,18) || 'Recipient');
    const topA = (mp.top_agencies || []).slice(0,3).map(a => (a.agency||'Agency').replace(/[^a-zA-Z0-9 ]/g,' ').trim().slice(0,16));
    const mermaidCode = `
flowchart LR
    R1["${topR[0] || 'Prime A'}"] -->|${(mp.top_recipients||[])[0]?.millions || 0}M| A1["${topA[0] || 'Agency 1'}"]
    R2["${topR[1] || 'Prime B'}"] --> A2["${topA[1] || 'Agency 2'}"]
    A1 --> W1["Work / Transactions"]
    A2 --> W2["Work / Transactions"]
    style R1 fill:#ff2bd6,color:#0a0a12
    style A1 fill:#00f0ff,color:#0a0a12
    `;
    try {
      const { svg } = await mermaid.render('mflow-' + Date.now(), mermaidCode);
      document.getElementById('mermaid-flow').innerHTML = svg;
    } catch(e) { document.getElementById('mermaid-flow').innerHTML = '<div class="text-[#a0a0c0] text-xs">Flow viz (simple proxy of top recipients → agencies).</div>'; }
  }
}

async function loadFiltersInfo(naics) {
  // lightweight — just show we have data
  const f = await fetchJson('/data/filters?naics=' + encodeURIComponent(naics)).catch(()=> ({}));
  // we don't render a big filters panel anymore; the note at bottom covers it
}

async function refreshAll() {
  const naics = (document.getElementById('naics').value || '561210').trim();
  const st = document.getElementById('status');
  st.textContent = 'LOADING REAL DATA...';
  st.style.borderColor = '#ffb020';

  try {
    await Promise.all([
      loadKPIs(naics),
      loadTrends(naics),
      loadIntensity(naics),
      loadCompetitive(naics),
      loadVehicles(naics),
      loadGeo(naics),
      loadExpiring(naics),
      loadFlow(naics),
    ]);
    st.textContent = 'UPDATED • REAL BULK • ' + new Date().toLocaleTimeString();
    st.style.borderColor = '#00f0ff';
  } catch (e) {
    console.error(e);
    st.textContent = 'ERROR — CHECK LOGS / INGEST FIRST';
    st.style.borderColor = '#ff3b6b';
    alert('Some data calls failed. Ingest recent zips first (prime + sub), then refresh. Server up?\\n' + e);
  }
}

document.getElementById('naics').addEventListener('keydown', e => { if (e.key === 'Enter') refreshAll(); });

// Boot + mermaid (dark cyber theme for flow diagrams)
if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
}
refreshAll();
</script>
</body>
</html>"""
    return html


# Serve the built React frontend (from `npm exec -- vite build` in frontend/).
# The full modern UI (Knowledge Vault with 155+ global entries, "View" buttons that read .md content in-app,
# cross-seed LLM button, training data section, etc.) is now available on the single reliable backend port.
# All API calls from the React bundle are relative and hit this same server (no proxy, no separate Vite dev server).
from fastapi.staticfiles import StaticFiles
app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    p = "frontend/dist/favicon.ico"
    if os.path.exists(p):
        return FileResponse(p)
    return HTMLResponse(status_code=204)

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    idx = "frontend/dist/index.html"
    if os.path.exists(idx):
        return FileResponse(idx)
    return await simple_dashboard()


# TODO: Add more routers as we grow (chat, profile generation, stance, MCP tools, etc.)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
