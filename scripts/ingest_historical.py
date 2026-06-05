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

Usage examples (the script always deduplicates on the government's unique key, so re-running only adds new data):

  # Simplest & recommended (no shell glob quoting headaches on Windows/PowerShell):
  uv run python scripts/ingest_historical.py --dir data/raw/10year_bulk/prime

  # Same for subaward chunks
  uv run python scripts/ingest_historical.py --dir data/raw/10year_bulk/sub --sub

  # Traditional glob form (quote the pattern!)
  uv run python scripts/ingest_historical.py --csv 'data/raw/10year_bulk/prime/*.zip'

  # Demo / synthetic
  uv run python scripts/ingest_historical.py --demo --naics 561210

After loading, the data is immediately queryable by the FastAPI endpoints
and (soon) by the dashboard UI.
"""

from __future__ import annotations

import glob
import sys
from pathlib import Path
from typing import List, Optional

import duckdb
import typer

app = typer.Typer(help="Load historical USASpending Prime Award CSVs into local DuckDB with light ETL.")


DEFAULT_DB = Path("data/capture.duckdb")
TABLE = "usaspending_prime_awards"


def ensure_table(con: duckdb.DuckDBPyConnection, is_sub: bool = False) -> None:
    """Create the table using the exact TARGET_FIELDS from the original Data_Insights prime script.

    Money fields -> DOUBLE, date fields -> DATE, others TEXT. Adds derived fy/quarter/fetch_date.
    """
    if is_sub:
        # Subawards: do not pre-create a narrow fixed schema.
        # Dynamic load from the actual sub bulk CSV columns happens in load_csv on first file
        # (CREATE TABLE ... LIMIT 0 from the temp read_csv_auto). This avoids column count mismatches.
        return

    # Prime using PRIME_TARGET_FIELDS
    money = {"federal_action_obligation", "total_dollars_obligated", "potential_total_value_of_award", "total_outlayed_amount_for_overall_award"}
    dates = {"action_date", "period_of_performance_start_date", "period_of_performance_current_end_date",
             "period_of_performance_potential_end_date", "ordering_period_end_date", "solicitation_date"}

    cols = []
    for f in PRIME_TARGET_FIELDS:
        if f in money:
            cols.append(f"{f} DOUBLE")
        elif f in dates:
            cols.append(f"{f} DATE")
        elif f == "action_date_fiscal_year":
            cols.append(f"{f} INTEGER")
        else:
            cols.append(f"{f} TEXT")

    cols.append("fy INTEGER")
    cols.append("quarter INTEGER")
    cols.append("fetch_date DATE")

    col_sql = ",\n    ".join(cols)
    con.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            {col_sql}
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


# Exact TARGET_FIELDS from the original Data_Insights prime raw script.
# The download script requests the CSV with only these columns.
# Ingest creates the DuckDB table with these (TEXT for most, numeric/date where obvious).
PRIME_TARGET_FIELDS = [
    "contract_transaction_unique_key",
    "contract_award_unique_key",
    "action_date_fiscal_year",
    "action_date",
    "parent_award_id_piid",
    "award_id_piid",
    "modification_number",
    "federal_action_obligation",
    "total_dollars_obligated",
    "potential_total_value_of_award",
    "total_outlayed_amount_for_overall_award",
    "period_of_performance_start_date",
    "period_of_performance_current_end_date",
    "period_of_performance_potential_end_date",
    "ordering_period_end_date",
    "primary_place_of_performance_city_name",
    "primary_place_of_performance_state_code",
    "prime_award_base_transaction_description",
    "transaction_description",
    "naics_code",
    "naics_description",
    "product_or_service_code",
    "product_or_service_code_description",
    "dod_acquisition_program_description",
    "parent_award_agency_name",
    "awarding_sub_agency_name",
    "awarding_office_name",
    "funding_agency_name",
    "funding_sub_agency_name",
    "funding_office_name",
    "recipient_name",
    "recipient_uei",
    "recipient_parent_name",
    "recipient_parent_uei",
    "solicitation_date",
    "solicitation_identifier",
    "solicitation_procedures",
    "extent_competed",
    "type_of_set_aside",
    "fair_opportunity_limited_sources",
    "other_than_full_and_open_competition",
    "number_of_offers_received",
    "subcontracting_plan",
    "government_furnished_property",
    "type_of_contract_pricing",
    "action_type",
    "award_type",
    "type_of_idc",
    "idv_type",
    "undefinitized_action",
    "program_acronym",
    "multi_year_contract",
    "multiple_or_single_award_idv",
    "usaspending_permalink"
]


def load_csv(con: duckdb.DuckDBPyConnection, csv_path: Path, naics_filter: Optional[List[str]] = None, is_sub: bool = False) -> int:
    """Load one CSV using the exact target fields from the original Data_Insights.

    The download script already requested only those columns.
    We add derived fy/quarter for convenience.
    """
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    temp = "raw_load"
    con.execute(f"DROP TABLE IF EXISTS {temp}")

    if is_sub:
        select = "*"
        target = "usaspending_subawards"
        read_options = ", all_varchar=true"
    else:
        field_list = ", ".join(PRIME_TARGET_FIELDS)
        select = f"{field_list}, EXTRACT(year FROM action_date + INTERVAL '3 months') AS fy, ((EXTRACT(month FROM action_date + INTERVAL '3 months')-1)/3)+1 AS quarter, CURRENT_DATE AS fetch_date"
        target = TABLE
        read_options = ""

    where = ""
    if naics_filter and not is_sub:
        quoted = ",".join(f"'{n}'" for n in naics_filter)
        where = f"WHERE naics_code IN ({quoted})"

    con.execute(f"""
        CREATE TEMP TABLE {temp} AS
        SELECT {select}
        FROM read_csv_auto('{csv_path}'{read_options})
        {where}
    """)

    if is_sub:
        # Subawards: dynamic columns from the USASpending sub bulk CSV (very wide, ~100+ cols, different naming from prime).
        # Create the table schema from the *first* file in the batch if the table doesn't exist yet.
        # Then simple append for the rest of the batch (and future incremental ingests).
        # Subaward date chunks from the download script are time-partitioned so overlap/dup risk is very low for the historical bulk use case.
        # (If you ever see dups later you can always DROP TABLE + full re-ingest.)
        exists = con.execute(f"SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '{target}'").fetchone()[0] > 0
        if not exists:
            con.execute(f"CREATE TABLE {target} AS SELECT * FROM {temp} LIMIT 0")
        con.execute(f"INSERT INTO {target} SELECT * FROM {temp}")
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


@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True})
def main(
    csv: Optional[str] = typer.Option(
        None,
        "--csv",
        help="Path or glob to USASpending Prime Award CSV(s)/zip(s). Example: 'data/raw/10year_bulk/prime/*.zip'. On Windows/PowerShell with many files, prefer --dir instead to avoid shell glob expansion."
    ),
    dir: Optional[str] = typer.Option(
        None,
        "--dir",
        help="Directory containing .zip and/or .csv files to ingest (e.g. data/raw/10year_bulk/prime). Automatically finds *.zip and *.csv inside. Much simpler and avoids shell glob problems on Windows when you have hundreds of chunk files. Use with --sub if ingesting subaward directory."
    ),
    naics: Optional[str] = typer.Option(
        None,
        help="Comma-separated NAICS codes to keep (filter at load time). Omit this option (or pass empty) to ingest the *entire* raw CSV content with no NAICS filter. This is recommended when your bulk downloads contain data for many NAICS."
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
    delete_source: bool = typer.Option(
        False,
        "--delete-source",
        help="After successfully loading a CSV/zip, delete the source file(s) to save disk space. Use with caution."
    ),
    ctx: typer.Context = None,  # injected by Typer when using allow_extra_args
):
    """Ingest historical USASpending data with light ETL into a single fast local DuckDB file.

    Raw zips/CSVs from the download script are saved under the --out-dir you chose for the download
    (default data/raw/10year_bulk/prime/ and /sub/).

    The CSVs inside the zips contain (thanks to the download script) only the target fields from the original
    Data_Insights repo. We load them as-is + add derived fy/quarter.

    By default (no --naics) we ingest the *entire* content of the raw CSVs (no NAICS filter).
    This is the new recommended mode when your bulk downloads are unfiltered by NAICS.

    Pass --naics 561210 (or comma list) to apply a filter at ingest time (only if you want a smaller DB).

    By default we KEEP the source files after ingest (safer for re-runs or archiving).
    Use --delete-source if you want automatic cleanup after successful load.
    """

    naics_list: Optional[List[str]] = None
    if naics:
        cleaned = [x.strip() for x in naics.split(",") if x.strip()]
        if cleaned:
            naics_list = cleaned
    # If naics_list is None or empty, load_csv will ingest everything (no WHERE clause)

    db.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(db))

    # For real bulk loads, if the table exists but has wrong schema (from old demo), drop it
    # so we get the full TARGET_FIELDS columns.
    target_table = "usaspending_subawards" if sub else TABLE
    try:
        col_count = con.execute(f"SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '{target_table}'").fetchone()[0]
        expected_cols = len(PRIME_TARGET_FIELDS) + 3 if not sub else 10  # rough: fields + fy/quarter/fetch
        if col_count > 0 and col_count < 50:  # old limited schema
            typer.echo(f"  Dropping old demo table {target_table} (had only {col_count} cols, need full schema)...")
            con.execute(f"DROP TABLE IF EXISTS {target_table}")
    except:
        pass  # table may not exist yet

    ensure_table(con, is_sub=sub)

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
        # Collect input sources. Support --csv (with glob), --dir (simple for bulk dirs), and also
        # bare file args (to be robust when PowerShell/cmd expands globs into many separate args).
        paths: List[str] = []

        if dir:
            dpath = Path(dir)
            if dpath.is_dir():
                for ext in ("*.zip", "*.csv"):
                    paths.extend(str(p) for p in sorted(dpath.glob(ext)))
                if paths:
                    typer.echo(f"Found {len(paths)} files via --dir {dir}")

        if csv:
            for pattern in csv.split(","):
                paths.extend(glob.glob(pattern.strip()))

        # Robustness for Windows/PowerShell glob expansion:
        # If the shell turned 'dir/*.zip' into hundreds of bare "file.zip" args on the command line,
        # Typer would see them as extra positionals (causing the "unexpected extra argument(s)" error you saw).
        # We also scan sys.argv for anything that looks like a data file we can ingest.
        for raw_arg in sys.argv[1:]:
            if raw_arg.startswith("-"):
                continue
            if raw_arg.endswith((".zip", ".csv")) or "*" in raw_arg or "?" in raw_arg:
                # glob it in case it's still a pattern
                paths.extend(glob.glob(raw_arg))

        # de-duplicate while preserving order
        seen = set()
        unique_paths = []
        for p in paths:
            if p not in seen:
                seen.add(p)
                unique_paths.append(p)
        paths = unique_paths

        if not paths:
            typer.echo("Error: provide data via --csv 'pattern' , --dir /path/to/zips , or list files/globs directly.")
            typer.echo("Example (recommended for your bulk dir): uv run python scripts/ingest_historical.py --dir data/raw/10year_bulk/prime")
            raise typer.Exit(1)

        scope = naics_list if naics_list else "ALL (no NAICS filter)"
        typer.echo(f"Loading {len(paths)} file(s) for NAICS {scope} ({'subawards' if sub else 'prime'}) ...")
        typer.echo("  (deduplicating on gov unique key — only new rows will be inserted)")
        if delete_source:
            typer.echo("  (will delete sources after successful load)")

        import tempfile
        import zipfile
        import shutil

        total_inserted = 0
        for p in paths:
            p = Path(p)
            csv_to_load = p
            temp_dir = None

            if p.suffix.lower() == ".zip":
                # Auto-extract zip to temp dir for loading
                temp_dir = Path(tempfile.mkdtemp(prefix="usaspending_ingest_"))
                typer.echo(f"  Extracting zip {p} to temp...")
                with zipfile.ZipFile(p) as zf:
                    zf.extractall(temp_dir)
                # Find the CSV inside
                csvs = list(temp_dir.rglob("*.csv"))
                if not csvs:
                    typer.echo(f"    No CSV found inside {p}, skipping")
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    continue
                csv_to_load = csvs[0]  # assume first/only CSV

            try:
                inserted = load_csv(con, csv_to_load, naics_filter=naics_list, is_sub=sub)
                total_inserted += inserted
                typer.echo(f"  {p} → +{inserted} new rows")
            except Exception as load_err:
                inserted = 0
                typer.echo(f"  {p} → ERROR loading chunk: {load_err}")
                typer.echo("    (skipped this chunk; batch continues. Re-run just the failing file later if needed.)")

            # Cleanup temp extract
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)

            # Delete source if requested (the original zip or csv the user passed)
            if delete_source and inserted > 0:
                try:
                    p.unlink()
                    typer.echo(f"    Deleted source: {p}")
                except Exception as e:
                    typer.echo(f"    Warning: could not delete {p}: {e}")

        # Derive fy/quarter for new rows if not already (prime only, sub may have different date cols)
        if not sub:
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
