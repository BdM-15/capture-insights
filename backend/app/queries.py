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
from typing import List, Dict, Any

import duckdb
from pathlib import Path

# Default location of your single database file.
DEFAULT_DB_PATH = Path("data/capture.duckdb")


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
            awarding_agency_name,
            COUNT(*) as actions,
            ROUND(SUM(federal_action_obligation) / 1000000.0, 2) as total_millions
        FROM usaspending_prime_awards
        WHERE 1=1
        {naics_filter}
        GROUP BY awarding_agency_name
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
            award_id,
            recipient_name,
            federal_action_obligation,
            period_of_performance_current_end_date as end_date,
            awarding_agency_name,
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
    for award_id, recipient, obligation, end_date, agency, naics in rows:
        results.append({
            "award_id": award_id,
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
