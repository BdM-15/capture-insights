#!/usr/bin/env python
"""
INGEST SAMPLE DATA INTO DUCKDB - Plain English Version for Non-Experts

This script creates ONE single file (a .duckdb file) that holds all your government contract data
in a super-fast, easy-to-query way.

What is DuckDB in plain English?
- Think of it as "Excel on steroids that lives in ONE file on your computer".
- You talk to it using simple English-like commands called SQL (SELECT, WHERE, GROUP BY).
- It is incredibly fast for asking "how much money did the Navy spend on IT last year?" across millions of rows.
- No separate server to start. No username/password hassle for local use. Just one file: data/capture.duckdb
- Everything (your awards table + any summaries) lives in this one file. No redundancy with other databases.

Why only DuckDB (no ChromaDB or Postgres for now)?
- You asked to keep it simple and avoid redundancy.
- DuckDB can handle BOTH:
  - Normal "numbers and categories" questions (total dollars, top agencies).
  - Later, "find similar contract descriptions" (semantic search) using built-in tools.
- One tool to learn = less overwhelm. We can add a second database only if we prove we truly need it.

Your main NAICS right now: 561210 (Facilities Support Services)
The script supports MULTIPLE NAICS easily. Just pass a comma list or change the default.

How to get REAL data (recommended for serious work):
1. Go to https://www.usaspending.gov/download_center/custom_award_data
2. Choose "Prime Award" data.
3. Filter by your NAICS code(s), date range (e.g. last 5 years), agencies if wanted.
4. Download the CSV (it may be split into files - that's OK).
5. Put the CSV(s) in the data/ folder.
6. Run this script pointing at the CSV path (see --csv option below).
7. Or even better later: we will add direct support for the official usaspending-gov-mcp tool so you don't download giant files manually.

For this starter chunk we use SYNTHETIC (fake but realistic) data so you can run it immediately and see the shape.
This lets you experiment with queries without waiting for big downloads.

Future training data collection:
This same script/folder structure will later export "good examples" of analysis (prompt + excellent answer)
into data/training/ so we can fine-tune a custom model later on "how to write govcon win themes for 561210 contracts".

Run examples (after `uv sync`):
  uv run python scripts/ingest_sample.py --help
  uv run python scripts/ingest_sample.py                    # default 561210 synthetic
  uv run python scripts/ingest_sample.py --naics 541512,561210   # multiple NAICS
  uv run python scripts/ingest_sample.py --csv data/my_real_download.csv --naics 561210

Then explore with:
  uv run python -c "
  import duckdb
  con = duckdb.connect('data/capture.duckdb')
  print(con.execute('SELECT naics_code, COUNT(*) as rows, SUM(federal_action_obligation) as total_dollars FROM usaspending_prime_awards GROUP BY naics_code').df())
  "
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import duckdb
import typer

app = typer.Typer(
    help="Ingest contract data into a single simple DuckDB file. Non-expert friendly."
)


def create_awards_table(con: duckdb.DuckDBPyConnection) -> None:
    """Create the main table that will hold all contract awards.

    Plain English column explanations (we will expand this into a full Karpathy-style wiki):
    - federal_action_obligation: The actual dollars the government has paid or committed on this transaction.
    - action_date: When this change to the contract happened.
    - naics_code: The industry code (your main one is 561210 = Facilities Support Services).
    - recipient_name / recipient_uei: Who got the money (the prime contractor).
    - awarding_agency_name: Which big agency is paying (DOD, DHS, etc.).
    - extent_competed: Was it competed or sole source?
    - type_set_aside: Small business set-aside, 8(a), SDVOSB, etc. Very important for eligibility.
    """
    con.execute("""
        CREATE TABLE IF NOT EXISTS usaspending_prime_awards (
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
            fy INTEGER,           -- Fiscal Year we derive for easy yearly analysis
            quarter INTEGER       -- 1,2,3,4 for quarterly trends
        )
    """)


def load_synthetic_demo_data(con: duckdb.DuckDBPyConnection, naics_list: List[str]) -> int:
    """Load realistic fake rows across a couple of years so you can immediately see trends.

    This is only for learning the shape and testing filters right now.
    Real work will use actual downloaded CSVs or MCP data.
    """
    rows_inserted = 0
    for naics in naics_list:
        if naics == "561210":
            # Several 561210 rows across 2023-2025 to demonstrate trends
            demo_rows = [
                ('SYN-561210-001', 'SYN-561210-001', 'PIID-561-001', None, 2450000.0, '2023-11-15', '2024-11-14', 'DEPARTMENT OF DEFENSE', 'DEPARTMENT OF THE ARMY', 'ACME FACILITY SERVICES LLC', 'UEI-561210-DEMO1', '561210', 'Facilities Support Services', 'Z1DA', 'DELIVERY ORDER', 'FIRM FIXED PRICE', 'FULL AND OPEN COMPETITION', 'NO SET ASIDE USED', 'VA', 'VA', 2024, 1),
                ('SYN-561210-002', 'SYN-561210-002', 'PIID-561-002', None, 1875000.0, '2024-04-01', '2025-03-31', 'DEPARTMENT OF HOMELAND SECURITY', 'DEPARTMENT OF HOMELAND SECURITY', 'BETA SUPPORT PARTNERS INC', 'UEI-561210-DEMO2', '561210', 'Facilities Support Services', 'Z1DA', 'DELIVERY ORDER', 'TIME AND MATERIALS', 'FULL AND OPEN AFTER EXCLUSION', 'SMALL BUSINESS SET ASIDE', 'DC', 'DC', 2024, 2),
                ('SYN-561210-003', 'SYN-561210-003', 'PIID-561-003', None, 3120000.0, '2024-07-10', '2025-07-09', 'DEPARTMENT OF DEFENSE', 'DEPARTMENT OF THE ARMY', 'ACME FACILITY SERVICES LLC', 'UEI-561210-DEMO1', '561210', 'Facilities Support Services', 'Z1DA', 'DELIVERY ORDER', 'FIRM FIXED PRICE', 'FULL AND OPEN COMPETITION', 'NO SET ASIDE USED', 'VA', 'VA', 2024, 3),
                ('SYN-561210-004', 'SYN-561210-004', 'PIID-561-004', None, 980000.0, '2025-02-05', '2026-02-04', 'DEPARTMENT OF VETERANS AFFAIRS', 'DEPARTMENT OF VETERANS AFFAIRS', 'GAMMA FACILITIES INC', 'UEI-561210-DEMO3', '561210', 'Facilities Support Services', 'Z1DA', 'DELIVERY ORDER', 'FIRM FIXED PRICE', 'COMPETED UNDER SAP', 'SMALL BUSINESS SET ASIDE', 'FL', 'FL', 2025, 1),
            ]
            for row in demo_rows:
                # Use parameters to safely insert (None becomes NULL)
                placeholders = ",".join(["?"] * len(row))
                con.execute(f"INSERT OR REPLACE INTO usaspending_prime_awards VALUES ({placeholders})", row)
            rows_inserted += len(demo_rows)
        else:
            con.execute(f"""
                INSERT OR REPLACE INTO usaspending_prime_awards VALUES
                ('SYN-{naics}-001', 'SYN-{naics}-001', 'PIID-{naics}-001', NULL, 950000.0, '2024-02-20', '2025-02-19',
                 'DEPARTMENT OF VETERANS AFFAIRS', 'DEPARTMENT OF VETERANS AFFAIRS',
                 'OTHER CONTRACTOR LLC', 'UEI-{naics}-DEMO', '{naics}', 'Other services',
                 'D399', 'DELIVERY ORDER', 'FIRM FIXED PRICE', 'FULL AND OPEN COMPETITION',
                 'NO SET ASIDE USED', 'TX', 'TX', 2024, 1)
            """)
            rows_inserted += 1
    return rows_inserted


def load_from_csv(con: duckdb.DuckDBPyConnection, csv_path: Path, naics_list: List[str]) -> int:
    """Load real data from a CSV you downloaded from USASpending.

    This is the path you will use for real work.
    The script will filter to only the NAICS you care about and add fiscal year/quarter columns.
    """
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}. Download from usaspending.gov first.")

    # DuckDB can read CSV directly and transform in one go - very powerful and simple.
    # We select only useful columns and derive fy/quarter.
    con.execute(f"""
        INSERT INTO usaspending_prime_awards
        SELECT
            contract_transaction_unique_key,
            award_id,
            piid,
            parent_award_id,
            federal_action_obligation,
            action_date,
            period_of_performance_current_end_date,
            awarding_agency_name,
            funding_agency_name,
            recipient_name,
            recipient_uei,
            naics_code,
            naics_description,
            product_or_service_code,
            award_type,
            type_of_contract_pricing,
            extent_competed,
            type_set_aside,
            recipient_state_code,
            place_of_performance_state_code,
            EXTRACT(year FROM action_date) AS fy,
            ((EXTRACT(month FROM action_date) - 1) / 3) + 1 AS quarter
        FROM read_csv_auto('{csv_path}')
        WHERE naics_code IN ({','.join([f"'{n}'" for n in naics_list])})
          AND federal_action_obligation IS NOT NULL
    """)
    return con.execute("SELECT COUNT(*) FROM usaspending_prime_awards").fetchone()[0]


@app.command()
def main(
    naics: str = typer.Option(
        "561210",
        help="Comma-separated NAICS codes. Default is your main one (561210). Example: 561210,541512,541690"
    ),
    csv: Path | None = typer.Option(
        None,
        help="Path to a real USASpending CSV you downloaded. If omitted, we use small synthetic demo data."
    ),
    out: Path = typer.Option(
        Path("data/capture.duckdb"),
        help="Where to save the single DuckDB file. This is your entire local database."
    ),
):
    """Create or update your local contract intelligence database (one DuckDB file).

    This is the foundation everything else (dashboards, AI chat, profile generation) will read from.
    """
    naics_list = [n.strip() for n in naics.split(",") if n.strip()]

    typer.echo("=== capture-insights Data Ingestion (Non-Expert Edition) ===")
    typer.echo(f"Target NAICS codes: {naics_list}")
    typer.echo(f"DuckDB file: {out}")
    typer.echo("Using ONE database (DuckDB) for simplicity - no duplicate stores.")

    out.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(out))

    create_awards_table(con)

    if csv:
        typer.echo(f"Loading from your real CSV: {csv}")
        count = load_from_csv(con, csv, naics_list)
    else:
        typer.echo("Loading small SYNTHETIC demo data (good for learning the shape right now).")
        typer.echo("When ready for real work: download CSV from usaspending.gov and use --csv flag.")
        count = load_synthetic_demo_data(con, naics_list)

    # Quick sanity view - this is the kind of question you will ask constantly.
    # We avoid pandas here so the script has fewer dependencies for the very first run.
    typer.echo("\n--- Quick preview (what your data looks like) ---")
    rows = con.execute("""
        SELECT 
            naics_code,
            COUNT(*) as num_transactions,
            ROUND(SUM(federal_action_obligation)/1000000.0, 2) as total_millions,
            MIN(action_date) as earliest,
            MAX(action_date) as latest
        FROM usaspending_prime_awards
        GROUP BY naics_code
        ORDER BY total_millions DESC
    """).fetchall()

    for r in rows:
        print(f"  NAICS {r[0]}: {r[1]} transactions, ~${r[2]}M total, {r[3]} to {r[4]}")

    typer.echo(f"\nDone. Total rows in your database: {count}")
    typer.echo("You can now query this file from Python, the backend API, or even directly with 'uv run duckdb data/capture.duckdb'")
    typer.echo("Next chunk will add real filters, summaries, and the first dashboard pieces on top of this.")


if __name__ == "__main__":
    app()
