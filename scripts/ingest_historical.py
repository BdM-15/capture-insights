#!/usr/bin/env python
"""
ingest_historical.py — Real USASpending historical data loader (DuckDB)

This is the focused next step for the data foundation.

Plain English:
- You go to usaspending.gov and download a filtered Prime Award CSV (or several)
  for the NAICS you care about (start with 561210).
- Run this script pointing at the CSV(s).
- It does basic ETL:
  - Reads the file(s) efficiently
  - Keeps only useful columns
  - Fixes types (dates, numbers)
  - Derives fiscal year (fy) and quarter (very useful for trends)
  - Deduplicates using the government's own unique key
  - Loads into your single local DuckDB file (data/capture.duckdb)
- You can run it again later with new downloads — it will add the new records.

This is deliberately simpler than the old repo's complex 3-schema Postgres ETL
because DuckDB is extremely good at this kind of analytical workload.

Usage examples:
  # Demo / synthetic (still useful for testing when you don't have a big CSV yet)
  uv run python scripts/ingest_historical.py --demo --naics 561210

  # Real data you downloaded
  uv run python scripts/ingest_historical.py --csv "C:\\Downloads\\awards_561210_*.csv" --naics 561210

  # Multiple NAICS in one load
  uv run python scripts/ingest_historical.py --csv data/raw/*.csv --naics 561210,541512

After loading, the data is immediately queryable by the FastAPI endpoints
and (soon) by the dashboard UI.
"""

from __future__ import annotations

import glob
from pathlib import Path
from typing import List, Optional

import duckdb
import typer

app = typer.Typer(help="Load historical USASpending Prime Award CSVs into local DuckDB with light ETL.")


DEFAULT_DB = Path("data/capture.duckdb")
TABLE = "usaspending_prime_awards"


def ensure_table(con: duckdb.DuckDBPyConnection) -> None:
    """Create the main table if it doesn't exist.

    We keep the column list modest but useful for dashboards:
    - obligation, dates, agencies, recipient, NAICS/PSC, set-aside, vehicle, location.
    """
    con.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            contract_transaction_unique_key TEXT PRIMARY KEY,
            award_id TEXT,
            piid TEXT,
            parent_award_id TEXT,
            federal_action_obligation DOUBLE,
            action_date DATE,
            period_of_performance_current_end_date DATE,
            awarding_agency_name TEXT,
            funding_agency_name TEXT,
            recipient_name TEXT,
            recipient_uei TEXT,
            naics_code TEXT,
            naics_description TEXT,
            product_or_service_code TEXT,
            award_type TEXT,
            type_of_contract_pricing TEXT,
            extent_competed TEXT,
            type_set_aside TEXT,
            recipient_state_code TEXT,
            place_of_performance_state_code TEXT,
            fy INTEGER,
            quarter INTEGER
        )
    """)


def derive_fy_quarter(con: duckdb.DuckDBPyConnection, source_table: str) -> None:
    """Add fiscal year and quarter derived from action_date.

    Federal FY starts October 1.
    """
    con.execute(f"""
        UPDATE {TABLE}
        SET fy = EXTRACT(year FROM action_date + INTERVAL '3 months'),
            quarter = ((EXTRACT(month FROM action_date + INTERVAL '3 months') - 1) / 3) + 1
        FROM {source_table}
        WHERE {TABLE}.contract_transaction_unique_key = {source_table}.contract_transaction_unique_key
    """)


# Core columns from the original Data_Insights (CAPTUREINTEL.md) -- ~50 key elements for business intelligence.
# We project only these during load to keep the DB lean and focused on market potential / capture insights.
# This proves the concept without ingesting every single USASpending column.
PRIME_CORE_COLUMNS = """
    contract_transaction_unique_key,
    award_id,
    piid,
    parent_award_id_piid AS parent_award_id,
    TRY_CAST(federal_action_obligation AS DOUBLE) AS federal_action_obligation,
    TRY_CAST(total_dollars_obligated AS DOUBLE) AS total_dollars_obligated,
    TRY_CAST(potential_total_value_of_award AS DOUBLE) AS potential_total_value_of_award,
    TRY_CAST(action_date AS DATE) AS action_date,
    TRY_CAST(period_of_performance_start_date AS DATE) AS period_of_performance_start_date,
    TRY_CAST(period_of_performance_current_end_date AS DATE) AS period_of_performance_current_end_date,
    TRY_CAST(period_of_performance_potential_end_date AS DATE) AS period_of_performance_potential_end_date,
    awarding_agency_name,
    awarding_sub_agency_name,
    awarding_office_name,
    funding_agency_name,
    funding_sub_agency_name,
    funding_office_name,
    recipient_name,
    recipient_uei,
    recipient_parent_name,
    recipient_parent_uei,
    naics_code,
    naics_description,
    product_or_service_code,
    product_or_service_code_description,
    award_type,
    type_of_contract_pricing,
    extent_competed,
    type_of_set_aside,
    solicitation_date,
    number_of_offers_received,
    subcontracting_plan,
    recipient_state_code,
    primary_place_of_performance_state_code AS place_of_performance_state_code,
    action_type,
    modification_number
"""

SUB_CORE_COLUMNS = """
    subaward_unique_key,
    prime_award_unique_key,
    TRY_CAST(subaward_amount AS DOUBLE) AS subaward_amount,
    TRY_CAST(subaward_action_date AS DATE) AS subaward_action_date,
    subawardee_name,
    subawardee_uei,
    subawardee_parent_name,
    subaward_description,
    naics_code  -- may come from prime join later
"""

def load_csv(con: duckdb.DuckDBPyConnection, csv_path: Path, naics_filter: Optional[List[str]] = None, is_sub: bool = False) -> int:
    """Load one CSV (or glob-expanded path) with basic cleaning and projection to core columns.

    Returns number of rows inserted after dedup.
    """
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    temp = "raw_load"
    con.execute(f"DROP TABLE IF EXISTS {temp}")

    if is_sub:
        select = SUB_CORE_COLUMNS
        target = "usaspending_subawards"
    else:
        select = PRIME_CORE_COLUMNS
        target = TABLE

    where = ""
    if naics_filter:
        quoted = ",".join(f"'{n}'" for n in naics_filter)
        where = f"WHERE naics_code IN ({quoted})"

    con.execute(f"""
        CREATE TEMP TABLE {temp} AS
        SELECT {select}
        FROM read_csv_auto('{csv_path}')
        {where}
    """)

    # Simple dedup insert (for sub, the PK is different)
    if is_sub:
        con.execute(f"""
            INSERT INTO {target}
            SELECT r.*
            FROM {temp} r
            LEFT JOIN {target} t ON r.subaward_unique_key = t.subaward_unique_key
            WHERE t.subaward_unique_key IS NULL
        """)
    else:
        con.execute(f"""
            INSERT INTO {target}
            SELECT r.*
            FROM {temp} r
            LEFT JOIN {target} t ON r.contract_transaction_unique_key = t.contract_transaction_unique_key
            WHERE t.contract_transaction_unique_key IS NULL
        """)

    inserted = con.execute(f"SELECT COUNT(*) FROM {temp}").fetchone()[0]
    con.execute(f"DROP TABLE {temp}")
    return inserted


@app.command()
def main(
    csv: Optional[str] = typer.Option(
        None,
        help="Path or glob to USASpending Prime Award CSV(s) you downloaded. Example: data/raw/awards_561210_*.csv . For subawards use --sub flag."
    ),
    naics: str = typer.Option(
        "561210",
        help="Comma-separated NAICS codes to keep (filter at load time). Default is your main one."
    ),
    demo: bool = typer.Option(
        False,
        help="Load a small synthetic demo dataset instead of a real CSV (useful for testing)."
    ),
    sub: bool = typer.Option(
        False,
        "--sub",
        help="Treat input CSVs as subaward files (loads into usaspending_subawards table)."
    ),
    db: Path = typer.Option(DEFAULT_DB, help="Path to the DuckDB file."),
):
    """Ingest historical USASpending data with light ETL into a single fast local DuckDB file."""

    naics_list = [x.strip() for x in naics.split(",") if x.strip()]

    db.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(db))

    if sub:
        # For subawards, ensure a sub table too (simplified schema for now)
        con.execute("""
            CREATE TABLE IF NOT EXISTS usaspending_subawards (
                subaward_unique_key TEXT PRIMARY KEY,
                prime_award_unique_key TEXT,
                subaward_amount DOUBLE,
                subaward_action_date DATE,
                subawardee_name TEXT,
                subawardee_uei TEXT,
                naics_code TEXT,  -- often from prime or sub
                fy INTEGER,
                quarter INTEGER
            )
        """)
        target_table = "usaspending_subawards"
    else:
        ensure_table(con)
        target_table = TABLE

    if demo:
        typer.echo("Loading synthetic demo data (good for quick testing)...")
        if sub:
            con.execute(f"""
                INSERT OR IGNORE INTO {target_table} VALUES
                ('SYN-SUB-001', 'SYN-561210-001', 450000.0, '2024-02-01', 'SMALL SUB LLC', 'UEI-SUB-DEMO', '561210', 2024, 1)
            """)
        else:
            con.execute(f"""
                INSERT OR IGNORE INTO {target_table} VALUES
                ('SYN-561210-001', 'SYN-561210-001', 'PIID-561-001', NULL, 2450000.0, '2023-11-15', '2024-11-14',
                 'DEPARTMENT OF DEFENSE', 'DEPARTMENT OF THE ARMY',
                 'ACME FACILITY SERVICES LLC', 'UEI-561210-DEMO1', '561210', 'Facilities Support Services',
                 'Z1DA', 'DELIVERY ORDER', 'FIRM FIXED PRICE', 'FULL AND OPEN COMPETITION',
                 'NO SET ASIDE USED', 'VA', 'VA', 2024, 1)
            """)
        total = con.execute(f"SELECT COUNT(*) FROM {target_table}").fetchone()[0]
        typer.echo(f"Demo data loaded. Total rows: {total}")
    else:
        if not csv:
            typer.echo("Error: --csv is required unless you use --demo")
            raise typer.Exit(1)

        paths = []
        for pattern in csv.split(","):
            paths.extend(glob.glob(pattern.strip()))

        if not paths:
            typer.echo(f"No files matched: {csv}")
            raise typer.Exit(1)

        typer.echo(f"Loading {len(paths)} file(s) for NAICS {naics_list} ({'subawards' if sub else 'prime'}) ...")

        total_inserted = 0
        for p in paths:
            inserted = load_csv(con, Path(p), naics_filter=naics_list, is_sub=sub)
            total_inserted += inserted
            typer.echo(f"  {p} → +{inserted} new rows")

        # Derive fy/quarter for new rows if not already
        con.execute(f"""
            UPDATE {target_table}
            SET fy = EXTRACT(year FROM action_date + INTERVAL '3 months'),
                quarter = ((EXTRACT(month FROM action_date + INTERVAL '3 months') - 1) / 3) + 1
            WHERE fy IS NULL
        """)

        total = con.execute(f"SELECT COUNT(*) FROM {target_table}").fetchone()[0]
        typer.echo(f"\nDone. Total rows in {target_table}: {total}")
        typer.echo(f"New rows inserted this run: {total_inserted}")

    con.close()
    typer.echo(f"\nYour data is now in {db}")
    typer.echo("You can query it with the FastAPI endpoints or directly with `uv run duckdb {db}`")
    typer.echo("\nTip: After loading real bulk for 10 years (via the download script), you will have excellent visibility into market potential for your NAICS. Use MCP tools later for long-horizon agencies like DOE or fresh opportunities.")


if __name__ == "__main__":
    app()
