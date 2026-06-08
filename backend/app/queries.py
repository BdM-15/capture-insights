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
import time

import duckdb
from pathlib import Path
import json
import urllib.request

# Default location of your single database file.
DEFAULT_DB_PATH = Path("data/capture.duckdb")
TABLE = "usaspending_prime_awards"


def get_db_connection(
    db_path: Path | None = None,
    *,
    read_only: bool = True,
) -> duckdb.DuckDBPyConnection:
    """Open a connection to the DuckDB file.

    API queries use read-only mode so ingest jobs can run without locking out the server.
    """
    path = db_path or DEFAULT_DB_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"Database not found at {path}. Run the ingest script first:\n"
            "  uv run python scripts/ingest_sample.py"
        )
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            return duckdb.connect(str(path), read_only=read_only)
        except duckdb.IOException as exc:
            last_err = exc
            if attempt < 3:
                time.sleep(0.15 * (attempt + 1))
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError("Failed to open DuckDB connection")


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


def get_future_funding_trajectory(
    naics_codes: Optional[List[str]] = None,
    horizon_months: int = 60,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Future funding trajectory by year — recurring recompete assumption.

    Groups obligations on contracts whose PoP ends in each future year.
    Plain English: if requirements recur, this is where the money comes back
    up for competition (your forward-looking funding radar).
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"AND naics_code IN ({quoted})"

    rows = con.execute(f"""
        SELECT
            EXTRACT(YEAR FROM period_of_performance_current_end_date)::INTEGER AS end_year,
            COUNT(*) AS actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        WHERE period_of_performance_current_end_date IS NOT NULL
          AND period_of_performance_current_end_date >= CURRENT_DATE
          AND period_of_performance_current_end_date <= CURRENT_DATE + INTERVAL '{horizon_months}' MONTH
          {naics_filter}
        GROUP BY end_year
        ORDER BY end_year
    """).fetchall()
    con.close()

    return [
        {
            "year": r[0],
            "fy": f"FY{r[0]}",
            "actions": r[1],
            "millions": r[2],
        }
        for r in rows
        if r[0] is not None
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

    def _expiring_window(months: int) -> tuple[int, float]:
        """Count + obligated $M for awards ending in the next N months (recompete / future funding radar)."""
        if naics_filter:
            row = con.execute(f"""
                SELECT COUNT(*),
                       ROUND(COALESCE(SUM(federal_action_obligation), 0) / 1000000.0, 2)
                FROM {TABLE}
                {naics_filter}
                AND period_of_performance_current_end_date IS NOT NULL
                AND period_of_performance_current_end_date >= CURRENT_DATE
                AND period_of_performance_current_end_date <= CURRENT_DATE + INTERVAL '{months}' MONTH
            """).fetchone()
        else:
            row = con.execute(f"""
                SELECT COUNT(*),
                       ROUND(COALESCE(SUM(federal_action_obligation), 0) / 1000000.0, 2)
                FROM {TABLE}
                WHERE period_of_performance_current_end_date IS NOT NULL
                  AND period_of_performance_current_end_date >= CURRENT_DATE
                  AND period_of_performance_current_end_date <= CURRENT_DATE + INTERVAL '{months}' MONTH
            """).fetchone()
        return int(row[0] or 0), float(row[1] or 0)

    exp, future_funding_24m_m = _expiring_window(24)
    expiring_36m, future_funding_36m_m = _expiring_window(36)

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
        "expiring_36m": expiring_36m,
        "future_funding_potential_24m_m": future_funding_24m_m,
        "future_funding_potential_36m_m": future_funding_36m_m,
        "active_contracts_approx": active,
        "suitability_pct": 9,   # stub — future: match expiring reqs vs global wiki domain/company intel
        "synergy_pct": 14,      # stub — future: cross business-unit capabilities from global wiki
        "note": "Suitability & Synergy are vision stubs until global wiki domain intel + company capabilities are loaded and matched against opportunity/agency requirements."
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


_VEHICLE_EXPR = """COALESCE(
    NULLIF(TRIM(idv_type), ''),
    NULLIF(TRIM(type_of_idc), ''),
    'Standalone / Definitive'
)"""

_IDV_FLAG_EXPR = """CASE
    WHEN NULLIF(TRIM(idv_type), '') IS NOT NULL THEN 'IDV / Task Order'
    WHEN NULLIF(TRIM(type_of_idc), '') IS NOT NULL THEN 'IDV / Task Order'
    WHEN UPPER(COALESCE(award_type, '')) LIKE '%DELIVERY ORDER%' THEN 'IDV / Task Order'
    WHEN UPPER(COALESCE(award_type, '')) LIKE '%BPA%' THEN 'IDV / Task Order'
    ELSE 'Standalone / Definitive'
END"""

_PRICING_BUCKET_EXPR = """CASE
    WHEN UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%FIRM FIXED%'
      OR UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%FIXED PRICE%'
         AND UPPER(COALESCE(type_of_contract_pricing, '')) NOT LIKE '%INCENTIVE%'
      OR UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%FIXED PRICE REDETERMINATION%'
    THEN 'firm_fixed'
    WHEN UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%INCENTIVE%'
      OR UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%AWARD FEE%'
    THEN 'performance_based'
    WHEN UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%TIME AND MATERIAL%'
      OR UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%LABOR HOUR%'
    THEN 'time_materials'
    WHEN UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%COST PLUS%'
      OR UPPER(COALESCE(type_of_contract_pricing, '')) LIKE '%COST SHARING%'
      OR UPPER(TRIM(COALESCE(type_of_contract_pricing, ''))) = 'COST'
    THEN 'cost_reimbursement'
    ELSE 'other'
END"""

def get_vehicle_analysis(
    naics_codes: Optional[List[str]] = None,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """Rich contract vehicle analysis — buying mechanisms, access holders, agency preferences."""
    empty: Dict[str, Any] = {
        "summary": {
            "total_millions": 0,
            "total_actions": 0,
            "idv_pct": 0,
            "standalone_pct": 0,
            "top_vehicle": None,
            "top_pricing": None,
            "top3_vehicle_pct": 0,
            "posture": "mixed",
        },
        "by_idv": [],
        "by_pricing": [],
        "by_award_type": [],
        "combinations": [],
        "by_extent_competed": [],
        "by_agency": [],
        "vehicle_holders": [],
    }

    con = get_db_connection(db_path)
    naics_filter = ""
    naics_where = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"AND naics_code IN ({quoted})"
        naics_where = f"WHERE naics_code IN ({quoted})"

    totals = con.execute(f"""
        SELECT
            COUNT(*) AS actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        {naics_where}
    """).fetchone()
    total_actions = totals[0] or 0
    total_millions = totals[1] or 0
    if not total_millions:
        con.close()
        return empty

    def _rows_to_dicts(rows, keys):
        return [dict(zip(keys, r)) for r in rows]

    idv_split = con.execute(f"""
        SELECT
            {_IDV_FLAG_EXPR} AS channel,
            COUNT(*) AS actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        {naics_where}
        GROUP BY 1
        ORDER BY millions DESC
    """).fetchall()
    idv_map = {r[0]: r[2] or 0 for r in idv_split}
    idv_m = idv_map.get("IDV / Task Order", 0)
    standalone_m = idv_map.get("Standalone / Definitive", 0)
    idv_pct = round((idv_m / total_millions) * 100, 1)
    standalone_pct = round((standalone_m / total_millions) * 100, 1)

    by_idv = _rows_to_dicts(
        con.execute(f"""
            SELECT
                {_VEHICLE_EXPR} AS vehicle,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            {naics_where}
            GROUP BY 1
            ORDER BY millions DESC
            LIMIT 12
        """).fetchall(),
        ("vehicle", "actions", "millions"),
    )

    by_pricing = _rows_to_dicts(
        con.execute(f"""
            SELECT
                COALESCE(type_of_contract_pricing, 'Unknown Pricing') AS pricing,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            {naics_where}
            GROUP BY 1
            ORDER BY millions DESC
            LIMIT 10
        """).fetchall(),
        ("pricing", "actions", "millions"),
    )

    by_award_type = _rows_to_dicts(
        con.execute(f"""
            SELECT
                COALESCE(award_type, 'Unknown Award Type') AS award_type,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            {naics_where}
            GROUP BY 1
            ORDER BY millions DESC
            LIMIT 10
        """).fetchall(),
        ("award_type", "actions", "millions"),
    )

    combinations = _rows_to_dicts(
        con.execute(f"""
            SELECT
                COALESCE(type_of_contract_pricing, 'Unknown Pricing') AS pricing,
                {_VEHICLE_EXPR} AS vehicle,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            {naics_where}
            GROUP BY 1, 2
            ORDER BY millions DESC
            LIMIT 20
        """).fetchall(),
        ("pricing", "vehicle", "actions", "millions"),
    )

    by_extent = _rows_to_dicts(
        con.execute(f"""
            SELECT
                COALESCE(extent_competed, 'Not Reported') AS extent_competed,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            {naics_where}
            GROUP BY 1
            ORDER BY millions DESC
            LIMIT 8
        """).fetchall(),
        ("extent_competed", "actions", "millions"),
    )

    agency_rows = con.execute(f"""
        WITH agency_totals AS (
            SELECT
                {_AGENCY_EXPR} AS agency,
                {_VEHICLE_EXPR} AS vehicle,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            WHERE 1=1 {naics_filter}
            GROUP BY 1, 2
        ),
        agency_rank AS (
            SELECT agency, SUM(millions) AS agency_millions
            FROM agency_totals
            GROUP BY agency
            ORDER BY agency_millions DESC
            LIMIT 10
        )
        SELECT tot.agency, tot.vehicle, tot.actions, tot.millions, rk.agency_millions
        FROM agency_totals tot
        JOIN agency_rank rk ON rk.agency = tot.agency
        ORDER BY rk.agency_millions DESC, tot.millions DESC
    """).fetchall()

    by_agency: List[Dict[str, Any]] = []
    seen_agencies: set[str] = set()
    for r in agency_rows:
        agency = r[0]
        if agency not in seen_agencies:
            seen_agencies.add(agency)
            by_agency.append({
                "agency": agency,
                "agency_millions": r[4],
                "top_vehicle": r[1],
                "top_vehicle_millions": r[3],
                "vehicles": [],
            })
        entry = next(x for x in by_agency if x["agency"] == agency)
        if len(entry["vehicles"]) < 3:
            entry["vehicles"].append({
                "vehicle": r[1],
                "actions": r[2],
                "millions": r[3],
            })

    holder_rows = con.execute(f"""
        WITH vehicle_recipients AS (
            SELECT
                {_VEHICLE_EXPR} AS vehicle,
                recipient_name,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE}
            WHERE 1=1 {naics_filter}
            GROUP BY 1, 2
        ),
        vehicle_rank AS (
            SELECT vehicle, SUM(millions) AS vehicle_millions
            FROM vehicle_recipients
            GROUP BY vehicle
            ORDER BY vehicle_millions DESC
            LIMIT 6
        )
        SELECT vr.vehicle, vr.recipient_name, vr.actions, vr.millions, vrank.vehicle_millions
        FROM vehicle_recipients vr
        JOIN vehicle_rank vrank ON vrank.vehicle = vr.vehicle
        ORDER BY vrank.vehicle_millions DESC, vr.millions DESC
    """).fetchall()

    vehicle_holders: List[Dict[str, Any]] = []
    holder_seen: Dict[str, int] = {}
    for r in holder_rows:
        vehicle = r[0]
        count = holder_seen.get(vehicle, 0)
        if count >= 3:
            continue
        holder_seen[vehicle] = count + 1
        vehicle_holders.append({
            "vehicle": vehicle,
            "recipient": r[1],
            "actions": r[2],
            "millions": r[3],
            "vehicle_millions": r[4],
        })

    con.close()

    top3_vehicle_m = sum(r["millions"] for r in by_idv[:3])
    top3_vehicle_pct = round((top3_vehicle_m / total_millions) * 100, 1)
    top_vehicle = by_idv[0]["vehicle"] if by_idv else None
    top_pricing = by_pricing[0]["pricing"] if by_pricing else None

    if idv_pct >= 55:
        posture = "idiq_dominant"
    elif standalone_pct >= 55:
        posture = "standalone_dominant"
    else:
        posture = "mixed"

    return {
        "summary": {
            "total_millions": total_millions,
            "total_actions": total_actions,
            "idv_pct": idv_pct,
            "standalone_pct": standalone_pct,
            "top_vehicle": top_vehicle,
            "top_pricing": top_pricing,
            "top3_vehicle_pct": top3_vehicle_pct,
            "posture": posture,
        },
        "by_idv": by_idv,
        "by_pricing": by_pricing,
        "by_award_type": by_award_type,
        "combinations": combinations,
        "by_extent_competed": by_extent,
        "by_agency": by_agency,
        "vehicle_holders": vehicle_holders,
    }


def _pressure_tier(non_fixed_pct: float) -> str:
    if non_fixed_pct >= 45:
        return "high"
    if non_fixed_pct >= 25:
        return "moderate"
    return "low"


def _agency_shape_gate(non_fixed_pct: float, expiring_non_fixed: int) -> str:
    if non_fixed_pct >= 35 and expiring_non_fixed > 0:
        return "advance"
    if non_fixed_pct >= 25 or expiring_non_fixed > 0:
        return "monitor"
    return "defer"


def get_ffp_shaping_radar(
    naics_codes: Optional[List[str]] = None,
    months_ahead: int = 36,
    agency_limit: int = 12,
    target_limit: int = 15,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """FFP / performance-based shaping radar — agencies under non-fixed pricing pressure + expiring targets."""
    empty: Dict[str, Any] = {
        "meta": {
            "policy_note": (
                "EO signal: agencies pushed toward firm-fixed and performance-based buying. "
                "Use as a shaping qualification lens — not a prediction that specific contracts will convert."
            ),
            "eo_reference": (
                "https://www.whitehouse.gov/presidential-actions/2026/04/"
                "promoting-efficiency-accountability-and-performance-in-federal-contracting/"
            ),
        },
        "summary": {
            "market_non_fixed_pct": 0,
            "market_cost_reimbursement_pct": 0,
            "market_time_materials_pct": 0,
            "agencies_high_pressure": 0,
            "shape_now_count": 0,
        },
        "agency_pressure": [],
        "shape_targets": [],
    }

    con = get_db_connection(db_path)
    naics_filter = ""
    naics_where = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"AND naics_code IN ({quoted})"
        naics_where = f"WHERE naics_code IN ({quoted})"

    market_rows = con.execute(f"""
        WITH bucketed AS (
            SELECT
                {_PRICING_BUCKET_EXPR} AS pricing_bucket,
                federal_action_obligation AS oblig
            FROM {TABLE}
            {naics_where}
        )
        SELECT pricing_bucket, COUNT(*) AS actions, ROUND(SUM(oblig) / 1000000.0, 2) AS millions
        FROM bucketed
        GROUP BY 1
        ORDER BY millions DESC
    """).fetchall()

    total_m = sum(r[2] or 0 for r in market_rows) or 0
    if not total_m:
        con.close()
        return empty

    bucket_m = {r[0]: r[2] or 0 for r in market_rows}
    firm_fixed_m = bucket_m.get("firm_fixed", 0)
    cost_m = bucket_m.get("cost_reimbursement", 0)
    tm_m = bucket_m.get("time_materials", 0)
    perf_m = bucket_m.get("performance_based", 0)
    other_m = bucket_m.get("other", 0)
    non_fixed_m = cost_m + tm_m + perf_m + other_m

    agency_rows = con.execute(f"""
        WITH bucketed AS (
            SELECT
                {_AGENCY_EXPR} AS agency,
                {_PRICING_BUCKET_EXPR} AS pricing_bucket,
                COALESCE(type_of_contract_pricing, 'Unknown') AS pricing_label,
                federal_action_obligation AS oblig
            FROM {TABLE}
            WHERE 1=1 {naics_filter}
        ),
        agency_totals AS (
            SELECT agency, ROUND(SUM(oblig) / 1000000.0, 2) AS total_millions
            FROM bucketed
            GROUP BY agency
            HAVING total_millions > 0
        ),
        agency_buckets AS (
            SELECT
                agency,
                pricing_bucket,
                COUNT(*) AS actions,
                ROUND(SUM(oblig) / 1000000.0, 2) AS millions,
                MAX(pricing_label) AS sample_pricing
            FROM bucketed
            GROUP BY agency, pricing_bucket
        )
        SELECT
            bk.agency,
            tot.total_millions,
            bk.pricing_bucket,
            bk.millions,
            bk.actions,
            bk.sample_pricing
        FROM agency_buckets bk
        JOIN agency_totals tot ON tot.agency = bk.agency
        ORDER BY tot.total_millions DESC, bk.millions DESC
    """).fetchall()

    expiring_rows = con.execute(f"""
        SELECT
            contract_award_unique_key,
            recipient_name,
            {_AGENCY_EXPR} AS agency,
            COALESCE(type_of_contract_pricing, 'Unknown') AS pricing,
            {_PRICING_BUCKET_EXPR} AS pricing_bucket,
            ROUND(COALESCE(federal_action_obligation, 0) / 1000000.0, 2) AS obligation_millions,
            CAST(period_of_performance_current_end_date AS VARCHAR) AS end_date
        FROM {TABLE}
        WHERE period_of_performance_current_end_date IS NOT NULL
          AND period_of_performance_current_end_date <= current_date + INTERVAL '{months_ahead}' MONTH
          AND period_of_performance_current_end_date >= current_date
          {naics_filter}
        ORDER BY period_of_performance_current_end_date ASC
        LIMIT {max(target_limit * 4, 40)}
    """).fetchall()

    con.close()

    agency_map: Dict[str, Dict[str, Any]] = {}
    for r in agency_rows:
        agency = r[0]
        if agency not in agency_map:
            agency_map[agency] = {
                "agency": agency,
                "total_millions": r[1],
                "buckets": {},
                "dominant_non_fixed_pricing": None,
            }
        bucket = r[2]
        millions = r[3] or 0
        agency_map[agency]["buckets"][bucket] = {
            "millions": millions,
            "actions": r[4],
            "sample_pricing": r[5],
        }

    agency_pressure: List[Dict[str, Any]] = []
    for agency, entry in sorted(
        agency_map.items(),
        key=lambda x: x[1]["total_millions"],
        reverse=True,
    )[:agency_limit]:
        total = entry["total_millions"] or 1
        buckets = entry["buckets"]
        firm_m = buckets.get("firm_fixed", {}).get("millions", 0)
        cost_rm = buckets.get("cost_reimbursement", {}).get("millions", 0)
        tm_rm = buckets.get("time_materials", {}).get("millions", 0)
        perf_rm = buckets.get("performance_based", {}).get("millions", 0)
        other_rm = buckets.get("other", {}).get("millions", 0)
        non_fixed_m_ag = cost_rm + tm_rm + perf_rm + other_rm
        non_fixed_pct = round((non_fixed_m_ag / total) * 100, 1)

        dominant_non_fixed = None
        dominant_m = 0
        for bname in ("cost_reimbursement", "time_materials", "performance_based", "other"):
            bm = buckets.get(bname, {}).get("millions", 0)
            if bm > dominant_m:
                dominant_m = bm
                dominant_non_fixed = buckets.get(bname, {}).get("sample_pricing")

        expiring_non_fixed = sum(
            1 for er in expiring_rows
            if er[2] == agency and er[4] != "firm_fixed"
        )

        agency_pressure.append({
            "agency": agency,
            "total_millions": round(total, 2),
            "firm_fixed_pct": round((firm_m / total) * 100, 1),
            "non_fixed_pct": non_fixed_pct,
            "cost_reimbursement_pct": round((cost_rm / total) * 100, 1),
            "time_materials_pct": round((tm_rm / total) * 100, 1),
            "performance_based_pct": round((perf_rm / total) * 100, 1),
            "dominant_non_fixed_pricing": dominant_non_fixed,
            "pressure_tier": _pressure_tier(non_fixed_pct),
            "shape_gate": _agency_shape_gate(non_fixed_pct, expiring_non_fixed),
            "expiring_non_fixed_count": expiring_non_fixed,
        })

    agency_pressure.sort(
        key=lambda a: (a["non_fixed_pct"], a["total_millions"]),
        reverse=True,
    )

    agency_pct_lookup = {a["agency"]: a["non_fixed_pct"] for a in agency_pressure}
    agency_tier_lookup = {a["agency"]: a["pressure_tier"] for a in agency_pressure}

    shape_targets: List[Dict[str, Any]] = []
    for er in expiring_rows:
        award_key, recipient, agency, pricing, bucket, oblig_m, end_date = er
        if bucket == "firm_fixed":
            continue
        agency_non_fixed = agency_pct_lookup.get(agency, 0)
        pressure_tier = agency_tier_lookup.get(agency, "low")

        if agency_non_fixed >= 35 and oblig_m >= 0.5:
            shape_gate = "shape_now"
            shape_reason = (
                f"Non-fixed ({pricing}) expiring at agency with {agency_non_fixed}% flexible pricing — "
                "early shaping window for measurable outcomes / FFP structure"
            )
        elif agency_non_fixed >= 25 or pressure_tier in ("high", "moderate"):
            shape_gate = "monitor"
            shape_reason = (
                f"Flexible pricing recompete — watch for agency shift toward fixed-price or performance-based terms"
            )
        else:
            shape_gate = "watch"
            shape_reason = "Non-fixed expiring award — lower agency pressure signal in current slice"

        shape_targets.append({
            "award_key": award_key,
            "recipient": recipient,
            "agency": agency,
            "end_date": end_date,
            "pricing": pricing,
            "pricing_bucket": bucket,
            "obligation_millions": oblig_m,
            "agency_non_fixed_pct": agency_non_fixed,
            "pressure_tier": pressure_tier,
            "shape_gate": shape_gate,
            "shape_reason": shape_reason,
        })

    gate_order = {"shape_now": 0, "monitor": 1, "watch": 2}
    shape_targets.sort(
        key=lambda t: (
            gate_order.get(t["shape_gate"], 9),
            -(t["obligation_millions"] or 0),
            -(t["agency_non_fixed_pct"] or 0),
        )
    )
    shape_targets = shape_targets[:target_limit]

    return {
        "meta": empty["meta"],
        "summary": {
            "market_non_fixed_pct": round((non_fixed_m / total_m) * 100, 1),
            "market_cost_reimbursement_pct": round((cost_m / total_m) * 100, 1),
            "market_time_materials_pct": round((tm_m / total_m) * 100, 1),
            "market_firm_fixed_pct": round((firm_fixed_m / total_m) * 100, 1),
            "agencies_high_pressure": sum(1 for a in agency_pressure if a["pressure_tier"] == "high"),
            "shape_now_count": sum(1 for t in shape_targets if t["shape_gate"] == "shape_now"),
        },
        "agency_pressure": agency_pressure,
        "shape_targets": shape_targets,
    }


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


def get_agency_recipient_relationships(
    naics_codes: Optional[List[str]] = None,
    limit: int = 120,
    db_path: Path | None = None,
) -> List[Dict[str, Any]]:
    """Agency × recipient (competitor) award counts for relationship heatmaps.

    Each row is one agency–prime pair with action count and obligated $.
    Strong award volume at a buyer signals entrenched competitor relationships.
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
                '(Unspecified Agency)'
            ) as agency,
            recipient_name,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as millions
        FROM {TABLE}
        {naics_filter}
        GROUP BY
            COALESCE(
                NULLIF(parent_award_agency_name, ''),
                NULLIF(awarding_sub_agency_name, ''),
                NULLIF(funding_agency_name, ''),
                '(Unspecified Agency)'
            ),
            recipient_name
        HAVING COUNT(*) >= 1
        ORDER BY actions DESC, millions DESC
        LIMIT {limit}
    """).fetchall()
    con.close()

    return [
        {
            "agency": r[0] or "(Unspecified Agency)",
            "recipient": r[1] or "Unknown",
            "actions": r[2],
            "millions": r[3],
        }
        for r in rows
    ]


_AGENCY_EXPR = """COALESCE(
    NULLIF(parent_award_agency_name, ''),
    NULLIF(awarding_sub_agency_name, ''),
    NULLIF(funding_agency_name, ''),
    '(Unspecified Agency)'
)"""

_STATE_EXPR = "COALESCE(NULLIF(primary_place_of_performance_state_code, ''), '??')"


def _geo_concentration_posture(top3_pct: float) -> str:
    if top3_pct >= 55:
        return "concentrated"
    if top3_pct >= 30:
        return "moderate"
    return "distributed"


def _state_quadrant(actions: int, millions: float, med_actions: float, med_millions: float) -> str:
    high_actions = actions > med_actions
    high_millions = millions > med_millions
    if high_actions and high_millions:
        return "hot"
    if high_millions:
        return "high_value"
    if high_actions:
        return "high_volume"
    return "watch"


def _pursuit_lens(
    rank: int,
    share_pct: float,
    quadrant: str,
    expiring_count: int,
) -> str:
    if rank <= 2 and share_pct >= 8:
        return "anchor"
    if quadrant in ("hot", "high_value") and share_pct >= 5:
        return "target"
    if expiring_count >= 2 or (expiring_count >= 1 and share_pct >= 3):
        return "niche"
    return "monitor"


def get_geographic_analysis(
    naics_codes: Optional[List[str]] = None,
    state_limit: int = 15,
    agency_state_limit: int = 48,
    months_ahead: int = 36,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """Regional capture intel — where work is performed, who buys/wins there, expiring by state.

    Uses primary_place_of_performance_state_code (delivery geography). Recipient HQ is not in
    the current bulk ingest — PoP is the honest signal we have.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"AND naics_code IN ({quoted})"

    all_state_rows = con.execute(f"""
        SELECT
            {_STATE_EXPR} AS state,
            COUNT(*) AS actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        WHERE 1=1 {naics_filter}
        GROUP BY {_STATE_EXPR}
        ORDER BY millions DESC
    """).fetchall()

    state_rows = all_state_rows[:state_limit]

    agency_state_rows = con.execute(f"""
        WITH ranked AS (
            SELECT
                {_STATE_EXPR} AS state,
                {_AGENCY_EXPR} AS agency,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions,
                ROW_NUMBER() OVER (
                    PARTITION BY {_STATE_EXPR}
                    ORDER BY SUM(federal_action_obligation) DESC
                ) AS rn
            FROM {TABLE}
            WHERE 1=1 {naics_filter}
            GROUP BY {_STATE_EXPR}, {_AGENCY_EXPR}
        )
        SELECT state, agency, actions, millions
        FROM ranked
        WHERE rn = 1
        ORDER BY millions DESC
        LIMIT {state_limit}
    """).fetchall()

    recipient_state_rows = con.execute(f"""
        WITH ranked AS (
            SELECT
                {_STATE_EXPR} AS state,
                COALESCE(NULLIF(recipient_name, ''), 'Unknown') AS recipient,
                COUNT(*) AS actions,
                ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions,
                ROW_NUMBER() OVER (
                    PARTITION BY {_STATE_EXPR}
                    ORDER BY SUM(federal_action_obligation) DESC
                ) AS rn
            FROM {TABLE}
            WHERE 1=1 {naics_filter}
            GROUP BY {_STATE_EXPR}, recipient_name
        )
        SELECT state, recipient, actions, millions
        FROM ranked
        WHERE rn = 1
        ORDER BY millions DESC
        LIMIT {state_limit}
    """).fetchall()

    expiring_state_rows = con.execute(f"""
        SELECT
            {_STATE_EXPR} AS state,
            COUNT(*) AS expiring_count,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS expiring_millions,
            MIN(period_of_performance_current_end_date) AS nearest_end
        FROM {TABLE}
        WHERE period_of_performance_current_end_date IS NOT NULL
          AND period_of_performance_current_end_date <= current_date + INTERVAL '{months_ahead}' MONTH
          AND period_of_performance_current_end_date >= current_date
          {naics_filter}
        GROUP BY {_STATE_EXPR}
        ORDER BY expiring_millions DESC
        LIMIT {state_limit}
    """).fetchall()

    top_agency_state_pairs = con.execute(f"""
        SELECT
            {_AGENCY_EXPR} AS agency,
            {_STATE_EXPR} AS state,
            COUNT(*) AS actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        WHERE 1=1 {naics_filter}
        GROUP BY {_AGENCY_EXPR}, {_STATE_EXPR}
        ORDER BY millions DESC
        LIMIT {agency_state_limit}
    """).fetchall()

    con.close()

    total_millions = sum(r[2] for r in all_state_rows)
    total_actions = sum(r[1] for r in all_state_rows)
    top3_millions = sum(r[2] for r in all_state_rows[:3])
    top5_millions = sum(r[2] for r in all_state_rows[:5])
    top3_pct = round((top3_millions / total_millions) * 100, 1) if total_millions else 0
    top5_pct = round((top5_millions / total_millions) * 100, 1) if total_millions else 0

    med_actions = sorted(r[1] for r in all_state_rows)[len(all_state_rows) // 2] if all_state_rows else 0
    med_millions = sorted(r[2] for r in all_state_rows)[len(all_state_rows) // 2] if all_state_rows else 0

    agency_by_state = {r[0]: {"agency": r[1], "millions": r[3]} for r in agency_state_rows}
    recipient_by_state = {r[0]: {"recipient": r[1], "millions": r[3]} for r in recipient_state_rows}
    expiring_by_state = {
        r[0]: {
            "expiring_count": r[1],
            "expiring_millions": r[2],
            "nearest_end": str(r[3]) if r[3] else None,
        }
        for r in expiring_state_rows
    }

    by_state = []
    for idx, (state, actions, millions) in enumerate(state_rows):
        share_pct = round((millions / total_millions) * 100, 1) if total_millions else 0
        avg_award_k = round((millions * 1_000_000) / actions / 1000, 1) if actions else 0
        quadrant = _state_quadrant(actions, millions, med_actions, med_millions)
        exp = expiring_by_state.get(state, {})
        ag = agency_by_state.get(state, {})
        rec = recipient_by_state.get(state, {})
        by_state.append({
            "state": state,
            "actions": actions,
            "millions": millions,
            "share_pct": share_pct,
            "avg_award_k": avg_award_k,
            "quadrant": quadrant,
            "pursuit_lens": _pursuit_lens(idx + 1, share_pct, quadrant, exp.get("expiring_count", 0)),
            "top_agency": ag.get("agency"),
            "top_agency_millions": ag.get("millions"),
            "top_recipient": rec.get("recipient"),
            "top_recipient_millions": rec.get("millions"),
            "expiring_count": exp.get("expiring_count", 0),
            "expiring_millions": exp.get("expiring_millions", 0),
            "nearest_end": exp.get("nearest_end"),
        })

    expiring_by_state_list = [
        {
            "state": r[0],
            "expiring_count": r[1],
            "expiring_millions": r[2],
            "nearest_end": str(r[3]) if r[3] else None,
        }
        for r in expiring_state_rows
    ]

    return {
        "meta": {
            "data_note": (
                "Place of performance (where work is delivered) from USASpending. "
                "Recipient HQ state is not in the current bulk ingest — use PoP for footprint and teaming, not prime office location."
            ),
            "months_ahead": months_ahead,
        },
        "summary": {
            "total_millions": round(total_millions, 2),
            "total_actions": total_actions,
            "state_count": len(all_state_rows),
            "top_state": all_state_rows[0][0] if all_state_rows else None,
            "top3_state_pct": top3_pct,
            "top5_state_pct": top5_pct,
            "posture": _geo_concentration_posture(top3_pct),
            "expiring_state_count": len(expiring_state_rows),
            "expiring_millions": round(sum(r[2] for r in expiring_state_rows), 2),
        },
        "by_state": by_state,
        "map_states": [
            {
                "state": r[0],
                "actions": r[1],
                "millions": r[2],
                "share_pct": round((r[2] / total_millions) * 100, 1) if total_millions else 0,
            }
            for r in all_state_rows
            if r[0] and r[0] != "??"
        ],
        "agency_state_pairs": [
            {"agency": r[0], "state": r[1], "actions": r[2], "millions": r[3]}
            for r in top_agency_state_pairs
        ],
        "expiring_by_state": expiring_by_state_list,
    }


def _combo_tier(score: int) -> str:
    if score >= 55:
        return "prime"
    if score >= 35:
        return "advance"
    if score >= 20:
        return "monitor"
    return "track"


def get_combo_insights(
    naics_codes: Optional[List[str]] = None,
    months_ahead: int = 36,
    limit: int = 40,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """Cross-signal opportunity intersections — expiring work enriched with agency, market, and geo context.

    Scores stack realistic USASpending signals (hot buyer, top incumbent, anchor PoP, timing, pricing)
    for the Combo Insights tab. Brain / vault overlays are applied client-side.
    """
    con = get_db_connection(db_path)

    naics_filter = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"AND naics_code IN ({quoted})"

    agency_rows = con.execute(f"""
        SELECT
            {_AGENCY_EXPR} AS agency,
            COUNT(*) AS award_count,
            ROUND(SUM(federal_action_obligation), 0) AS total_oblig
        FROM {TABLE}
        WHERE 1=1 {naics_filter}
        GROUP BY {_AGENCY_EXPR}
    """).fetchall()

    top_recipient_rows = con.execute(f"""
        SELECT recipient_name, ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        WHERE 1=1 {naics_filter}
        GROUP BY recipient_name
        ORDER BY millions DESC
        LIMIT 10
    """).fetchall()

    anchor_state_rows = con.execute(f"""
        SELECT {_STATE_EXPR} AS state, ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        WHERE 1=1 {naics_filter}
        GROUP BY {_STATE_EXPR}
        ORDER BY millions DESC
        LIMIT 5
    """).fetchall()

    expiring_rows = con.execute(f"""
        SELECT
            contract_award_unique_key,
            COALESCE(NULLIF(recipient_name, ''), 'Unknown') AS recipient,
            federal_action_obligation,
            period_of_performance_current_end_date AS end_date,
            {_AGENCY_EXPR} AS agency,
            {_STATE_EXPR} AS pop_state,
            COALESCE(NULLIF(type_of_contract_pricing, ''), 'Unknown') AS pricing,
            {_PRICING_BUCKET_EXPR} AS pricing_bucket,
            DATE_DIFF('month', CURRENT_DATE, period_of_performance_current_end_date) AS months_to_end
        FROM {TABLE}
        WHERE period_of_performance_current_end_date IS NOT NULL
          AND period_of_performance_current_end_date <= CURRENT_DATE + INTERVAL '{months_ahead}' MONTH
          AND period_of_performance_current_end_date >= CURRENT_DATE
          {naics_filter}
        ORDER BY federal_action_obligation DESC
        LIMIT {limit * 2}
    """).fetchall()

    con.close()

    med_actions = 0
    med_oblig = 0
    if agency_rows:
        sorted_actions = sorted(r[1] for r in agency_rows)
        sorted_oblig = sorted(r[2] for r in agency_rows)
        mid = len(agency_rows) // 2
        med_actions = sorted_actions[mid]
        med_oblig = sorted_oblig[mid]

    hot_agencies = {
        r[0]
        for r in agency_rows
        if r[1] > med_actions and r[2] > med_oblig
    }
    top_recipients = {r[0] for r in top_recipient_rows if r[0]}
    anchor_states = {r[0] for r in anchor_state_rows if r[0] and r[0] != "??"}

    obligations = [float(r[2] or 0) for r in expiring_rows]
    med_oblig_expiring = sorted(obligations)[len(obligations) // 2] if obligations else 0

    scored: List[Dict[str, Any]] = []
    signal_counts: Dict[str, int] = {}

    for (
        award_key,
        recipient,
        obligation,
        end_date,
        agency,
        pop_state,
        pricing,
        pricing_bucket,
        months_to_end,
    ) in expiring_rows:
        oblig_f = float(obligation or 0)
        months = int(months_to_end or 0)
        signals: List[str] = []
        score = 0

        is_hot = agency in hot_agencies
        if is_hot:
            signals.append("hot_agency")
            score += 30
            signal_counts["hot_agency"] = signal_counts.get("hot_agency", 0) + 1

        if recipient in top_recipients:
            signals.append("top_incumbent")
            score += 25
            signal_counts["top_incumbent"] = signal_counts.get("top_incumbent", 0) + 1

        if pop_state in anchor_states:
            signals.append("anchor_pop")
            score += 15
            signal_counts["anchor_pop"] = signal_counts.get("anchor_pop", 0) + 1

        if months <= 12:
            signals.append("near_term")
            score += 20
            signal_counts["near_term"] = signal_counts.get("near_term", 0) + 1

        if pricing_bucket and pricing_bucket != "firm_fixed":
            signals.append("flex_pricing")
            score += 10
            signal_counts["flex_pricing"] = signal_counts.get("flex_pricing", 0) + 1

        if oblig_f >= med_oblig_expiring and med_oblig_expiring > 0:
            signals.append("high_value")
            score += 10
            signal_counts["high_value"] = signal_counts.get("high_value", 0) + 1

        agency_quadrant = _state_quadrant(
            next((r[1] for r in agency_rows if r[0] == agency), 0),
            next((r[2] for r in agency_rows if r[0] == agency), 0),
            med_actions,
            med_oblig,
        ) if is_hot else (
            "high_value" if next((r[2] for r in agency_rows if r[0] == agency), 0) > med_oblig
            else "high_volume" if next((r[1] for r in agency_rows if r[0] == agency), 0) > med_actions
            else "watch"
        )

        scored.append({
            "award_key": award_key,
            "recipient": recipient,
            "obligation": oblig_f,
            "obligation_millions": round(oblig_f / 1_000_000, 2),
            "end_date": str(end_date) if end_date else None,
            "months_to_end": months,
            "agency": agency,
            "pop_state": pop_state,
            "pricing": pricing,
            "pricing_bucket": pricing_bucket,
            "agency_quadrant": agency_quadrant,
            "signals": signals,
            "signal_count": len(signals),
            "combo_score": score,
            "combo_tier": _combo_tier(score),
        })

    scored.sort(key=lambda x: (-x["combo_score"], x["months_to_end"], -x["obligation"]))
    rows = scored[:limit]

    tier_counts = {"prime": 0, "advance": 0, "monitor": 0, "track": 0}
    for r in rows:
        tier_counts[r["combo_tier"]] = tier_counts.get(r["combo_tier"], 0) + 1

    hot_overlap = sum(1 for r in rows if "hot_agency" in r["signals"])
    prime_m = round(sum(r["obligation_millions"] for r in rows if r["combo_tier"] == "prime"), 2)

    return {
        "meta": {
            "months_ahead": months_ahead,
            "scoring_note": (
                "Combo score stacks USASpending signals: hot buyer (+30), top incumbent (+25), "
                "near-term ≤12m (+20), anchor PoP (+15), flexible pricing (+10), high value (+10). "
                "Brain/vault boosts applied in UI."
            ),
        },
        "summary": {
            "match_count": len(rows),
            "hot_agency_overlap": hot_overlap,
            "prime_count": tier_counts.get("prime", 0),
            "advance_count": tier_counts.get("advance", 0),
            "prime_millions": prime_m,
            "top_signal": max(signal_counts, key=signal_counts.get) if signal_counts else None,
        },
        "signal_mix": [
            {"signal": k, "count": v}
            for k, v in sorted(signal_counts.items(), key=lambda x: -x[1])
        ],
        "tier_counts": tier_counts,
        "matches": rows,
    }


def _table_exists(con, table_name: str) -> bool:
    try:
        n = con.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
            [table_name],
        ).fetchone()[0]
        return n > 0
    except Exception:
        return False


def _resolve_subaward_columns(con) -> Optional[Dict[str, str]]:
    """Best-effort column mapping for usaspending_subawards (wide FFATA bulk schema)."""
    if not _table_exists(con, "usaspending_subawards"):
        return None
    try:
        rows = con.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'usaspending_subawards'"
        ).fetchall()
    except Exception:
        return None
    if not rows:
        return None
    cols = {r[0].lower(): r[0] for r in rows}

    def pick(*needles: str) -> Optional[str]:
        for needle in needles:
            for k, orig in cols.items():
                if needle in k:
                    return orig
        return None

    sub_col = pick("subawardee", "sub_awardee", "subrecipient", "subcontractor")
    if not sub_col:
        return None
    return {
        "sub": sub_col,
        "prime": pick("prime_awardee", "prime_recipient", "prime_award_recipient", "recipient_name"),
        "agency": pick("awarding_agency", "prime_award_agency", "agency_name", "funding_agency"),
        "amount": pick("subaward_amount", "sub_award_amount", "transaction_amount", "amount"),
        "naics": pick("naics"),
    }


def _score_teaming_fit(
    share_pct: float,
    shared_agencies: int,
    shared_millions: float,
    overlap_ratio: float = 0.0,
) -> tuple[str, str]:
    """Tiered fit — avoid collapsing everyone to the same bucket."""
    if share_pct <= 2.0 and shared_agencies >= 2 and shared_millions <= 15:
        if overlap_ratio >= 0.35 or shared_agencies >= 3:
            return "strong", "Niche vendor concentrated at target buyers — strong gap-fill signal"
        return "promising", "Small adjacent vendor — multi-buyer PP, confirm capability match"
    if share_pct <= 4.0 and shared_agencies >= 2 and shared_millions <= 20:
        return "promising", "Regional adjacent player — validate gap before outreach"
    if share_pct <= 6.0 and shared_agencies >= 1 and shared_millions <= 12:
        return "promising", "Limited overlap at shared buyers — worth MCP/web vetting"
    if shared_agencies >= 1 and shared_millions <= 8:
        return "research", "Thin award overlap — subs or web research may surface better fits"
    return "research", "Weak bulk signal — run MCP + marketing research pipeline"


def get_teaming_candidates(
    target_recipient: str,
    naics_codes: Optional[List[str]] = None,
    limit: int = 15,
    exclude_top_n: int = 10,
    max_share_pct: float = 8.0,
    db_path: Path | None = None,
) -> Dict[str, Any]:
    """Gap-fill teammates: adjacent small vendors + subs — explicitly NOT top competitors.

    Excludes market leaders and the displacement target. Surfaces niche primes with
    past performance at shared buyers and FFATA subs when subaward bulk is loaded.
    """
    empty: Dict[str, Any] = {
        "candidates": [],
        "subcontractors": [],
        "meta": {
            "excluded_top_primes": 0,
            "subaward_data": False,
            "research_recommended": True,
            "note": "Define a capability gap and run MCP + marketing research for best results.",
        },
    }
    if not (target_recipient or "").strip():
        return empty

    con = get_db_connection(db_path)
    naics_filter = ""
    naics_where = ""
    if naics_codes:
        quoted = ",".join(f"'{c}'" for c in naics_codes)
        naics_filter = f"AND naics_code IN ({quoted})"
        naics_where = f"WHERE naics_code IN ({quoted})"

    safe_target = (target_recipient or "").replace("'", "''")

    market_rows = con.execute(f"""
        SELECT recipient_name, ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS millions
        FROM {TABLE}
        {naics_where}
        GROUP BY recipient_name
        ORDER BY millions DESC
    """).fetchall()
    total_market = sum(r[1] or 0 for r in market_rows) or 1.0
    top_names = {r[0] for r in market_rows[:exclude_top_n]}
    top_names.add(target_recipient)

    rows = con.execute(f"""
        WITH target_agencies AS (
            SELECT DISTINCT {_AGENCY_EXPR} AS agency
            FROM {TABLE}
            WHERE recipient_name = '{safe_target}'
            {naics_filter}
        ),
        recipient_totals AS (
            SELECT recipient_name, ROUND(SUM(federal_action_obligation) / 1000000.0, 2) AS market_millions
            FROM {TABLE}
            {naics_where}
            GROUP BY recipient_name
        ),
        overlap AS (
            SELECT
                p.recipient_name,
                {_AGENCY_EXPR} AS agency,
                COUNT(*) AS actions,
                ROUND(SUM(p.federal_action_obligation) / 1000000.0, 2) AS millions
            FROM {TABLE} p
            WHERE p.recipient_name != '{safe_target}'
              {naics_filter}
              AND {_AGENCY_EXPR} IN (SELECT agency FROM target_agencies)
            GROUP BY p.recipient_name, {_AGENCY_EXPR}
        )
        SELECT
            o.recipient_name,
            COUNT(DISTINCT o.agency) AS shared_agencies,
            SUM(o.actions) AS total_actions,
            ROUND(SUM(o.millions), 2) AS shared_millions,
            MAX(o.agency) AS sample_agency,
            MAX(rt.market_millions) AS market_millions
        FROM overlap o
        LEFT JOIN recipient_totals rt ON rt.recipient_name = o.recipient_name
        GROUP BY o.recipient_name
        ORDER BY shared_agencies DESC, shared_millions ASC
        LIMIT {max(limit * 3, 30)}
    """).fetchall()

    candidates: List[Dict[str, Any]] = []
    for r in rows:
        name = r[0] or "Unknown"
        if name in top_names:
            continue
        market_m = r[5] or 0
        share_pct = round((market_m / total_market) * 100, 2)
        if share_pct > max_share_pct:
            continue
        shared_ag = r[1] or 0
        shared_m = r[3] or 0
        overlap_ratio = round((shared_m / market_m), 3) if market_m else 0.0
        fit, fit_reason = _score_teaming_fit(share_pct, shared_ag, shared_m, overlap_ratio)
        candidates.append({
            "recipient": name,
            "candidate_type": "adjacent_prime",
            "shared_agencies": shared_ag,
            "total_actions": r[2],
            "shared_millions": shared_m,
            "market_millions": market_m,
            "market_share_pct": share_pct,
            "overlap_ratio": overlap_ratio,
            "sample_agency": r[4],
            "fit": fit,
            "fit_reason": fit_reason,
        })

    fit_order = {"strong": 0, "promising": 1, "research": 2}
    candidates.sort(
        key=lambda c: (
            fit_order.get(c["fit"], 9),
            -(c["shared_agencies"] or 0),
            c["market_share_pct"] or 999,
        )
    )
    candidates = candidates[:limit]

    subcontractors: List[Dict[str, Any]] = []
    sub_cols = _resolve_subaward_columns(con)
    subaward_data = sub_cols is not None
    if sub_cols:
        sub_n, prime_n = sub_cols["sub"], sub_cols.get("prime")
        agency_n, amount_n = sub_cols.get("agency"), sub_cols.get("amount")
        naics_n = sub_cols.get("naics")
        sub_naics = ""
        if naics_n and naics_codes:
            quoted = ",".join(f"'{c}'" for c in naics_codes)
            sub_naics = f"AND CAST({naics_n} AS VARCHAR) IN ({quoted})"
        agency_expr = f"COALESCE(CAST({agency_n} AS VARCHAR), '')" if agency_n else "''"
        amount_expr = (
            f"TRY_CAST({amount_n} AS DOUBLE)"
            if amount_n
            else "0"
        )
        prime_filter = f"AND CAST({prime_n} AS VARCHAR) = '{safe_target}'" if prime_n else ""
        try:
            sub_rows = con.execute(f"""
                WITH target_agencies AS (
                    SELECT DISTINCT {_AGENCY_EXPR} AS agency
                    FROM {TABLE}
                    WHERE recipient_name = '{safe_target}'
                    {naics_filter}
                )
                SELECT
                    CAST({sub_n} AS VARCHAR) AS sub_name,
                    {f"CAST({prime_n} AS VARCHAR)" if prime_n else "'(unknown prime)'"} AS prime_name,
                    COUNT(*) AS sub_actions,
                    ROUND(SUM({amount_expr}) / 1000000.0, 2) AS sub_millions,
                    MAX({agency_expr}) AS sample_agency
                FROM usaspending_subawards
                WHERE CAST({sub_n} AS VARCHAR) IS NOT NULL
                  AND TRIM(CAST({sub_n} AS VARCHAR)) != ''
                  {sub_naics}
                  {prime_filter}
                GROUP BY 1, 2
                HAVING sub_millions > 0 OR sub_actions > 0
                ORDER BY sub_millions DESC NULLS LAST
                LIMIT {limit}
            """).fetchall()
            for sr in sub_rows:
                sub_name = sr[0] or "Unknown"
                if sub_name in top_names or sub_name == target_recipient:
                    continue
                subcontractors.append({
                    "recipient": sub_name,
                    "candidate_type": "subcontractor",
                    "under_prime": sr[1],
                    "shared_agencies": 1,
                    "shared_millions": sr[3] or 0,
                    "total_actions": sr[2],
                    "sample_agency": sr[4],
                    "market_share_pct": 0,
                    "market_millions": sr[3] or 0,
                    "fit": "promising",
                    "fit_reason": f"Sub to {sr[1]} — capability gap fill vs prime displacement",
                })
        except Exception:
            subaward_data = False

    con.close()

    strong_count = sum(1 for c in candidates if c["fit"] == "strong")
    research_recommended = strong_count < 2 and len(subcontractors) < 2

    return {
        "candidates": candidates,
        "subcontractors": subcontractors,
        "meta": {
            "excluded_top_primes": len(top_names),
            "subaward_data": subaward_data,
            "research_recommended": research_recommended,
            "strong_count": strong_count,
            "note": (
                "Bulk data excludes top competitors. Gap-fill partners often need "
                "USASpending + SAM.gov MCP passes and web/marketing research."
                if research_recommended
                else "Review strong/promising rows; validate capability gap before outreach."
            ),
        },
    }


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
        servers_seen: dict[str, list[str]] = {}
        for t in tools:
            if not isinstance(t, dict) or not t.get("name"):
                continue
            sid = t.get("server_name") or t.get("server_id") or "MCP"
            servers_seen.setdefault(sid, []).append(t["name"])
        if servers_seen:
            parts = [f"{srv} ({', '.join(names[:4])}{'…' if len(names) > 4 else ''})" for srv, names in list(servers_seen.items())[:6]]
            context_lines.append("Federal MCPs available to co-pilot (use MCP by data need, not raw endpoints): " + "; ".join(parts) + ".")
        else:
            tool_names = [t.get("name") for t in tools if isinstance(t, dict) and t.get("name")][:8]
            context_lines.append("Available MCP tools: " + ", ".join(tool_names) + ".")
    else:
        context_lines.append("MCP catalog not loaded — SAM.gov direct API fallback still available.")
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
