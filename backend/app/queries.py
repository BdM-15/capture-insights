"""
queries.py - Reusable data questions for capture-insights

This file contains the "brain" functions that ask useful questions of your DuckDB file.

Everything is written in plain English comments so a non-expert can understand what each query does and why it matters for federal contracting work.

We use only DuckDB (one single file: data/capture.duckdb). No other databases.

All functions accept a list of NAICS codes (your main one is 561210, but you can pass multiple).

All functions return simple Python dicts or lists that are easy to turn into JSON for the API or frontend.
"""

from __future__ import annotations

from datetime import date
from typing import List, Dict, Any, Optional

import duckdb
from pathlib import Path
import json
import urllib.request

# Default location of your single database file.
DEFAULT_DB_PATH = Path("data/capture.duckdb")
TABLE = "usaspending_prime_awards"


def get_db_connection(db_path: Path | None = None) -> duckdb.DuckDBPyConnection:
    """Open a connection to the DuckDB file.

    DuckDB is like a super-fast Excel that lives in one file and understands SQL.
    We open it, run a question (query), get the answer, and close it.
    """
    path = db_path or DEFAULT_DB_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"Database not found at {path}. Run the ingest script first:\n"
            "  uv run python scripts/ingest_sample.py"
        )
    return duckdb.connect(str(path))


def get_market_summary(
    naics_codes: List[str],
    start_date: date | None = None,
    end_date: date | None = None,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """Get the big picture numbers for one or more NAICS codes.

    Plain English: "Tell me the total money spent, how many contract actions happened,
    and the average size of those actions, for my NAICS codes in this date range."

    This is the kind of summary that goes on the top of a dashboard.
    It helps you quickly see if a market is growing or shrinking.

    Args:
        naics_codes: e.g. ["561210"] or ["561210", "541512"]
        start_date / end_date: Filter by action_date. If None, uses all data.

    Returns a dict you can send straight to the frontend.
    """
    con = get_db_connection(db_path)

    # Build the WHERE clause safely
    naics_filter = " AND naics_code IN ({})".format(
        ",".join([f"'{code}'" for code in naics_codes])
    ) if naics_codes else ""

    date_filter = ""
    if start_date:
        date_filter += f" AND action_date >= '{start_date}'"
    if end_date:
        date_filter += f" AND action_date <= '{end_date}'"

    sql = f"""
        SELECT
            COUNT(*) as total_actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) as total_millions,
            ROUND(AVG(federal_action_obligation) / 1000.0, 0) as avg_thousands,
            MIN(action_date) as earliest_date,
            MAX(action_date) as latest_date
        FROM usaspending_prime_awards
        WHERE 1=1
        {naics_filter}
        {date_filter}
    """

    row = con.execute(sql).fetchone()
    con.close()

    if not row or row[0] == 0:
        return {
            "naics_codes": naics_codes,
            "total_actions": 0,
            "total_millions": 0,
            "avg_thousands": 0,
            "message": "No data found for these filters. Try broadening the dates or NAICS codes.",
        }

    return {
        "naics_codes": naics_codes,
        "total_actions": row[0],
        "total_millions": row[1],
        "avg_thousands": row[2],
        "earliest_date": str(row[3]),
        "latest_date": str(row[4]),
        "note": "All numbers are from the local DuckDB file only. No internet calls for this summary.",
    }


def get_top_agencies(
    naics_codes: List[str],
    limit: int = 10,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Who are the biggest buyers in these NAICS codes?

    Plain English: "Show me the top agencies (by total dollars) that are spending
    in my target NAICS. This tells you where the money is flowing right now."

    Very useful for deciding which agencies to focus your business development on.
    """
    con = get_db_connection(db_path)

    naics_filter = " AND naics_code IN ({})".format(
        ",".join([f"'{code}'" for code in naics_codes])
    ) if naics_codes else ""

    sql = f"""
        SELECT
            parent_award_agency_name,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) as total_millions
        FROM usaspending_prime_awards
        WHERE 1=1
        {naics_filter}
        GROUP BY parent_award_agency_name
        ORDER BY total_millions DESC
        LIMIT {limit}
    """

    rows = con.execute(sql).fetchall()
    con.close()

    results = []
    for agency, actions, millions in rows:
        results.append({
            "agency": agency,
            "actions": actions,
            "total_millions": millions,
        })
    return results


def get_expiring_contracts(
    naics_codes: List[str],
    months_ahead: int = 24,
    limit: int = 20,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Find contracts that are likely to end soon (recompete opportunities).

    Plain English: "Show me awards in my NAICS whose current performance period
    ends in the next X months. These are potential recompetes where you can
    position early."

    This is the heart of "opportunity radar".
    """
    con = get_db_connection(db_path)

    naics_filter = " AND naics_code IN ({})".format(
        ",".join([f"'{code}'" for code in naics_codes])
    ) if naics_codes else ""

    # We look at period_of_performance_current_end_date
    sql = f"""
        SELECT
            contract_award_unique_key,
            recipient_name,
            federal_action_obligation,
            period_of_performance_current_end_date as end_date,
            parent_award_agency_name,
            naics_code
        FROM usaspending_prime_awards
        WHERE period_of_performance_current_end_date IS NOT NULL
          AND period_of_performance_current_end_date <= current_date + INTERVAL '{months_ahead}' MONTH
          AND period_of_performance_current_end_date >= current_date
          {naics_filter}
        ORDER BY period_of_performance_current_end_date ASC
        LIMIT {limit}
    """

    rows = con.execute(sql).fetchall()
    con.close()

    results = []
    for award_key, recipient, obligation, end_date, agency, naics in rows:
        results.append({
            "award_key": award_key,
            "recipient": recipient,
            "obligation": obligation,
            "end_date": str(end_date) if end_date else None,
            "agency": agency,
            "naics_code": naics,
        })
    return results


# Example of how you (or the future AI agent) can combine these
def get_quick_opportunity_snapshot(naics: str = "561210") -> Dict[str, Any]:
    """A convenience function that bundles several views together.

    This is the kind of thing a 'Skill' or an AI agent would call to get
    a rich starting point for writing a capture profile.
    """
    return {
        "summary": get_market_summary([naics]),
        "top_agencies": get_top_agencies([naics], limit=5),
        "expiring_soon": get_expiring_contracts([naics], months_ahead=18, limit=5),
    }


def get_filter_options(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> Dict[str, List[str]]:
    """Return distinct values for the main filter dimensions.

    This is gold for building a UI — you can populate dropdowns, multi-selects,
    etc. without hard-coding anything.

    Plain English: "What agencies, fiscal years, set-asides, etc. actually exist
    in the data for these NAICS codes?"
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    def distinct(col: str) -> List[str]:
        rows = con.execute(
            f"SELECT DISTINCT {col} FROM {TABLE} {naics_filter} ORDER BY {col} NULLS LAST LIMIT 500"
        ).fetchall()
        return [str(r[0]) for r in rows if r[0] is not None]

    options = {
        "naics_code": distinct("naics_code"),
        "parent_award_agency_name": distinct("parent_award_agency_name"),
        "funding_agency_name": distinct("funding_agency_name"),
        "type_of_set_aside": distinct("type_of_set_aside"),
        "extent_competed": distinct("extent_competed"),
        "award_type": distinct("award_type"),
        "fiscal_years": [str(y) for y in distinct("fy")],
        "place_of_performance_state": distinct("primary_place_of_performance_state_code"),
    }

    con.close()
    return options


def get_market_potential_summary(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """
    High-level market potential visibility for the loaded data.

    Plain English for non-experts:
    - Total addressable spend (sum of obligations) over the loaded years for your NAICS.
    - Breakdown by top agencies (where the money is).
    - Number of unique contractors (competitive landscape size).
    - Trend: simple year-over-year change if multiple years present.
    - Incumbent concentration: top recipient share.

    This directly supports "greater visibility into our companies total market potential".
    Load 5-10 years of your relevant NAICS via the bulk download + ingest, then run this (or the API).
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    # Total market
    total = con.execute(f"""
        SELECT 
            COUNT(*) as total_actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as total_millions,
            COUNT(DISTINCT recipient_uei) as unique_recipients
        FROM {TABLE}
        {naics_filter}
    """).fetchone()

    # Top agencies (use the actual column from TARGET_FIELDS: parent_award_agency_name)
    agencies = con.execute(f"""
        SELECT parent_award_agency_name, 
               ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions,
               COUNT(*) as actions
        FROM {TABLE}
        {naics_filter}
        GROUP BY parent_award_agency_name
        ORDER BY millions DESC
        LIMIT 10
    """).fetchall()

    # Simple YoY if possible
    yoy = con.execute(f"""
        SELECT fy, ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY fy
        ORDER BY fy
    """).fetchall()

    trend = "Insufficient years for trend"
    if len(yoy) >= 2:
        first_m = yoy[0][1] or 0
        last_m = yoy[-1][1] or 0
        if first_m > 0:
            pct = ((last_m - first_m) / first_m) * 100
            trend = f"{pct:+.1f}% from first to last year in data"

    # Top recipient concentration (for incumbent view)
    top_recip = con.execute(f"""
        SELECT recipient_name, 
               ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY recipient_name
        ORDER BY millions DESC
        LIMIT 5
    """).fetchall()

    con.close()

    return {
        "naics_codes": naics_codes or ["all loaded"],
        "total_actions": total[0],
        "total_millions": total[1],
        "unique_competitors": total[2],
        "trend": trend,
        "top_agencies": [{"agency": a[0], "millions": a[1], "actions": a[2]} for a in agencies],
        "top_recipients": [{"name": r[0], "millions": r[1]} for r in top_recip],
        "note": "Based on loaded historical bulk data only. Add your own UEI history for 'your share' calculations. Use MCP for live gaps."
    }


def get_fy_spend_trends(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Year-by-year (fy) obligated totals and action counts.

    Plain English: "How much money and how many actions per fiscal year for these NAICS?"
    Powers trend charts so you can see growth/decline over the loaded history.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            fy,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY fy
        ORDER BY fy
    """).fetchall()
    con.close()

    return [
        {"fy": r[0], "actions": r[1], "millions": r[2]}
        for r in rows if r[0] is not None
    ]


def get_set_aside_breakdown(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """How much of the spend is competed under set-asides vs full and open etc.

    Plain English: "Breakdown of obligations and actions by type_of_set_aside.
    Helps see small business opportunity share in your market."
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            COALESCE(type_of_set_aside, 'NO SET ASIDE / FULL OPEN') as set_aside,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY type_of_set_aside
        ORDER BY millions DESC
    """).fetchall()
    con.close()

    return [
        {"set_aside": r[0], "actions": r[1], "millions": r[2]}
        for r in rows
    ]


def get_executive_kpis(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """Key at-a-glance numbers for a capture manager.

    Inspired by old dashboard cards but computed fresh from our DuckDB.
    Includes stubs for suitability/synergy until user capability data is loaded.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    row = con.execute(f"""
        SELECT 
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as total_millions,
            COUNT(*) as total_actions,
            ROUND(AVG(federal_action_obligation)/1000.0, 0) as avg_thousands,
            COUNT(DISTINCT contract_award_unique_key) as unique_awards
        FROM {TABLE}
        {naics_filter}
    """).fetchone()

    # Expiring approx (next 24 months)
    exp = con.execute(f"""
        SELECT COUNT(*) FROM {TABLE}
        {naics_filter}
        AND period_of_performance_current_end_date IS NOT NULL
        AND period_of_performance_current_end_date >= CURRENT_DATE
        AND period_of_performance_current_end_date <= CURRENT_DATE + INTERVAL '24' MONTH
    """).fetchone()[0] if naics_filter else con.execute("""
        SELECT COUNT(*) FROM usaspending_prime_awards
        WHERE period_of_performance_current_end_date IS NOT NULL
          AND period_of_performance_current_end_date >= CURRENT_DATE
          AND period_of_performance_current_end_date <= CURRENT_DATE + INTERVAL '24' MONTH
    """).fetchone()[0]

    # Rough "active": awards with current PoP end in future or null (very loose)
    active = con.execute(f"""
        SELECT COUNT(DISTINCT contract_award_unique_key) FROM {TABLE}
        {naics_filter}
        AND (period_of_performance_current_end_date IS NULL OR period_of_performance_current_end_date >= CURRENT_DATE)
    """).fetchone()[0]

    con.close()

    total_m = row[0] or 0
    total_a = row[1] or 0
    avg_k = row[2] or 0
    uniq_aw = row[3] or 0

    return {
        "total_obligations_m": total_m,
        "total_actions": total_a,
        "avg_award_value_k": avg_k,
        "unique_awards": uniq_aw,
        "expiring_24m": exp,
        "active_contracts_approx": active,
        "suitability_pct": 9,   # stub - will be real once we load user capabilities + descriptions match
        "synergy_pct": 14,      # stub - cross-company fit
        "note": "Suitability & Synergy are placeholders until your past performance + capability profile is loaded for real matching."
    }


def get_agency_intensity(
    naics_codes: Optional[List[str]] = None,
    limit: int = 15,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Data for Capture Intensity scatter: per-agency actions + obligations.

    Client or UI normalizes (e.g. log or percentile) to plot "high volume + high value" agencies.
    This powers the "above the line" hot list that BD teams love for focus.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            COALESCE(
                NULLIF(parent_award_agency_name, ''),
                NULLIF(awarding_sub_agency_name, ''),
                NULLIF(funding_agency_name, ''),
                '(Unspecified)'
            ) as agency,
            COUNT(*) as award_count,
            ROUND(SUM(federal_action_obligation), 0) as total_oblig,
            ROUND(AVG(federal_action_obligation), 0) as avg_award
        FROM {TABLE}
        {naics_filter}
        GROUP BY COALESCE(NULLIF(parent_award_agency_name,''), NULLIF(awarding_sub_agency_name,''), NULLIF(funding_agency_name,''), '(Unspecified)')
        ORDER BY total_oblig DESC
        LIMIT {limit}
    """).fetchall()
    con.close()

    return [
        {
            "agency": r[0],
            "award_count": r[1],
            "total_oblig": r[2],
            "avg_award": r[3]
        } for r in rows
    ]


def get_vehicle_breakdown(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Contract vehicle / pricing type view.

    Groups by type_of_contract_pricing and idv_type (or award_type) to show
    how work is actually bought in your market (IDIQ, FFP, etc.).
    Useful for deciding which vehicles to chase or team on.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            COALESCE(type_of_contract_pricing, 'Unknown Pricing') as pricing,
            COALESCE(idv_type, 'Not IDV') as vehicle,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY type_of_contract_pricing, idv_type
        ORDER BY millions DESC
        LIMIT 12
    """).fetchall()
    con.close()

    return [
        {"pricing": r[0], "vehicle": r[1], "actions": r[2], "millions": r[3]}
        for r in rows
    ]


def get_geo_breakdown(
    naics_codes: Optional[List[str]] = None,
    limit: int = 10,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Top states for performance of work.

    Uses primary_place_of_performance_state_code.
    Helps with regional strategy, office location decisions, travel.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            COALESCE(primary_place_of_performance_state_code, '??') as state,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY primary_place_of_performance_state_code
        ORDER BY millions DESC
        LIMIT {limit}
    """).fetchall()
    con.close()

    return [
        {"state": r[0], "actions": r[1], "millions": r[2]}
        for r in rows
    ]


def get_top_recipient_agency_flows(
    naics_codes: Optional[List[str]] = None,
    limit: int = 8,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Recipient (competitor) + Agency + Office flows with obligated dollars.

    3-level "Follow the Money" data for Sankey: Competitor → Agency → Office (lowest level).
    This narrows focus better than agency alone (original Data_Insights style).
    Used for the overview pulse Sankey and Competitive deep dive.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            recipient_name,
            COALESCE(
                NULLIF(parent_award_agency_name, ''),
                NULLIF(awarding_sub_agency_name, ''),
                NULLIF(funding_agency_name, ''),
                '(Unspecified Agency)'
            ) as agency,
            COALESCE(
                NULLIF(awarding_office_name, ''),
                NULLIF(funding_office_name, ''),
                '(Unspecified Office)'
            ) as office,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY recipient_name, 
                 COALESCE(NULLIF(parent_award_agency_name,''), NULLIF(awarding_sub_agency_name,''), NULLIF(funding_agency_name,''), '(Unspecified Agency)'),
                 COALESCE(NULLIF(awarding_office_name,''), NULLIF(funding_office_name,''), '(Unspecified Office)')
        ORDER BY millions DESC
        LIMIT {limit}
    """).fetchall()
    con.close()

    return [
        {
            "recipient": r[0],
            "agency": r[1] or "(Unspecified Agency)",
            "office": r[2] or "(Unspecified Office)",
            "actions": r[3],
            "millions": r[4]
        }
        for r in rows
    ]


def get_top_recipients(
    naics_codes: Optional[List[str]] = None,
    limit: int = 8,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Top recipients (competitors / primes) by obligated dollars for the NAICS slice.

    Leading pulse indicator for overview: shows market concentration and the biggest players
    winning work. Perfect for a treemap "who owns the spend" view.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"WHERE naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT 
            recipient_name,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY recipient_name
        ORDER BY millions DESC
        LIMIT {limit}
    """).fetchall()
    con.close()

    return [
        {
            "recipient": r[0] or "Unknown",
            "actions": r[1],
            "millions": r[2]
        }
        for r in rows
    ]


# --- Simple chat / co-pilot support (grounded in current user context + data) ---

def get_chat_response(
    naics: str,
    active_tab: str,
    kpis: dict | None = None,
    brain_items: list[dict] | None = None,
    pipeline_items: list[dict] | None = None,
    extra_context: str | None = None,
    use_llm: bool = False,
    mcp_tools: list[dict] | None = None,
) -> dict:
    """
    Build a useful, context-aware response for the floating AI co-pilot.

    Receives live state from the frontend (current NAICS, active tab, KPIs,
    and the user's persisted Brain + Pipeline from data/user_accumulators.json).

    mcp_tools (if provided) is the catalog of available tools from sam-gov-mcp (and future others).
    The LLM is instructed that it is the agent that calls these to perform admin tasks for the user.
    The user will never use the MCP servers manually.

    By default uses the fast deterministic path (excellent because it has your exact saved data + actions).
    If the incoming request has use_llm=True, it will try the local Ollama model first (qwen preferred).
    """
    brain = brain_items or []
    pipeline = pipeline_items or []
    tools = mcp_tools or []

    brain_names = [b.get("name") for b in brain if b.get("name")][:5]
    pipeline_count = len(pipeline)
    brain_count = len(brain)

    obligations = (kpis or {}).get("total_obligations_m", 0)
    actions = (kpis or {}).get("total_actions", 0)

    # Build a compact context block for the LLM (or for the fallback text)
    context_lines = []
    context_lines.append(f"Current scope: NAICS {naics} | Viewing tab: {active_tab}")
    if obligations:
        context_lines.append(f"Loaded market slice: ${obligations}M total obligations, {actions:,} actions.")
    if brain_count:
        context_lines.append(f"User's Brain ({brain_count} entries): " + ", ".join(brain_names) + ".")
    else:
        context_lines.append("User's Brain is currently empty.")
    if pipeline_count:
        context_lines.append(f"User's Pipeline has {pipeline_count} saved opportunities.")
    else:
        context_lines.append("User's Pipeline is currently empty.")
    if tools:
        tool_names = [t.get("name") for t in tools if isinstance(t, dict) and t.get("name")][:8]
        context_lines.append("Available MCP tools the co-pilot can invoke for the user (agentic): " + ", ".join(tool_names) + ".")
    else:
        context_lines.append("MCP tools catalog not loaded this request (direct API fallbacks still available for SAM).")
    if extra_context:
        context_lines.append(f"User asked / tool results injected: {extra_context}")

    context_block = "\n".join(context_lines)

    # LLM path is opt-in for now (use_llm=True in the request) to keep the chat instant.
    # The fast deterministic path below is already very powerful because it has your exact saved Brain + Pipeline.
    llm_text = None
    if use_llm:
        ollama_models_to_try = ["qwen3.5:9b", "qwen2.5:7b-instruct", "qwen2.5:7b", "llama3.2:latest"]
        for model in ollama_models_to_try:
            try:
                prompt = (
                    "You are an agentic capture intelligence co-pilot. The user will NEVER call MCP tools or run uvx themselves.\n"
                    "You are the one who decides when to use available MCP tools (from the catalog in context) to perform admin tasks on their behalf: searching SAM.gov for live notices, creating monitors, enriching brain entries, etc.\n"
                    "You are grounded ONLY in the provided CONTEXT (scope + exact Brain + Pipeline + live tool results if any + available MCP tools).\n"
                    "Be direct, actionable, reference specific names/numbers from context. If you used or want to reference live MCP data, say so.\n"
                    "When you want to invoke a tool to help answer (e.g. because user asked to search SAM or create monitors), output on its own line in this exact format before your final prose:\n"
                    "TOOL_CALL: search_opportunities {\"naics\": \"561210\", \"keywords\": \"...\", \"notice_types\": \"RFI,Sources Sought\"}\n"
                    "The system will execute it and re-invoke you with the results injected. For this turn, just propose or use what is already injected.\n\n"
                    f"CONTEXT:\n{context_block}\n\n"
                    "Answer the user's request helpfully and concisely (4-8 sentences). At the end suggest 1-3 concrete next actions the user can click."
                )
                ollama_req = urllib.request.Request(
                    "http://localhost:11434/api/generate",
                    data=json.dumps({"model": model, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(ollama_req, timeout=12) as resp:
                    result = json.loads(resp.read())
                llm_text = result.get("response", "").strip()
                if llm_text:
                    llm_actions = []
                    if brain:
                        top = brain[0].get("name")
                        llm_actions.append({"label": f"Add more to Brain for {top}", "action": "add_to_brain", "payload": {"name": top, "type": brain[0].get("type", "competitor")}})
                    if pipeline:
                        llm_actions.append({"label": "Review my Pipeline", "action": "navigate", "payload": {"view": "pipeline"}})
                    # If LLM output contains a TOOL_CALL we surface it as a special suggested action (frontend can later drive full loop)
                    if "TOOL_CALL" in llm_text:
                        llm_actions.append({"label": "Execute the tool call the model proposed (search/create)", "action": "log_note", "payload": {"note": "LLM proposed TOOL_CALL — backend orchestration handled the MCP in this version"}})
                    return {
                        "response": llm_text,
                        "context_used": {
                            "naics": naics,
                            "active_tab": active_tab,
                            "brain_count": brain_count,
                            "pipeline_count": pipeline_count,
                            "model": model,
                            "mcp_tools": [t.get("name") for t in tools if isinstance(t, dict)][:5],
                        },
                        "source": "ollama+agentic",
                        "suggested_actions": llm_actions,
                    }
            except Exception:
                continue

    # Fallback: deterministic but still very useful response (what we had before)
    lines = [f"Current scope: NAICS {naics} | Viewing: {active_tab}"]
    if obligations:
        lines.append(f"Market slice: ${obligations}M obligations across {actions:,} actions.")

    if brain_count:
        lines.append(f"Your Brain has {brain_count} entries. Notable: {', '.join(brain_names)}.")
        lines.append("These are the competitors/agencies you have chosen to accumulate intel on. Re-adding them compounds notes and citations in data/user_accumulators.json.")
    else:
        lines.append("Your Brain is currently empty. Use the +brain / +wiki buttons on the Competitive Analysis or Agency Intelligence tabs to start building it.")

    if pipeline_count:
        lines.append(f"You have {pipeline_count} items in Pipeline (opportunities worth tracking).")
    else:
        lines.append("Pipeline is empty — add interesting expiring contracts from the Future Opportunities tab.")

    if extra_context:
        lines.append(extra_context)

    suggestions = []
    if brain and pipeline:
        suggestions.append("Look for overlap between your saved Pipeline items and the agencies/companies in your Brain.")
    if brain and tools:
        suggestions.append("Ask me (the co-pilot) to search SAM using the agencies in your Brain + current expiring cycles — I will call the MCP tools for you.")
    if brain:
        suggestions.append("Consider running deeper research on the top Brain entries (ask the chat to drive MCP search or enrichment).")
    if not brain:
        suggestions.append("Start by adding 2-3 interesting recipients or agencies to your Brain from the Competitive or Agency tabs.")

    response_text = "\n".join(lines)
    if suggestions:
        response_text += "\n\nSuggested next actions:\n- " + "\n- ".join(suggestions)

    # Build a few structured suggested actions the frontend can render as clickable chips.
    # These tie the chat responses directly to the contextual +pipeline / +brain actions.
    suggested_actions = []
    if brain and pipeline:
        suggested_actions.append({
            "label": "Check overlaps between my Brain and Pipeline",
            "action": "log_note",
            "payload": {"note": "User asked to review overlaps"}
        })
    if brain and tools:
        suggested_actions.append({
            "label": "Let AI search SAM for hot items in my Brain + expiring (drives MCP)",
            "action": "mcp_search_sam",
            "payload": {"reason": "brain+expiring", "keywords": ", ".join(brain_names[:3])}
        })
    if brain:
        top = brain[0].get("name")
        suggested_actions.append({
            "label": f"Add more to Brain for {top}",
            "action": "add_to_brain",
            "payload": {"name": top, "type": brain[0].get("type", "competitor")}
        })
    if not brain:
        suggested_actions.append({
            "label": "Go to Agency Intelligence tab and add a hot agency to Brain",
            "action": "navigate",
            "payload": {"tab": "agency"}
        })
    if pipeline:
        suggested_actions.append({
            "label": "Review my Pipeline",
            "action": "navigate",
            "payload": {"view": "pipeline"}
        })

    return {
        "response": response_text,
        "context_used": {
            "naics": naics,
            "active_tab": active_tab,
            "brain_count": brain_count,
            "pipeline_count": pipeline_count,
        },
        "source": "deterministic-fallback",
        "suggested_actions": suggested_actions,
    }
