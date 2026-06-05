#!/usr/bin/env python
"""
Ingest a small USASpending sample into local DuckDB for dev/demo.

For real use: download full bulk CSVs from https://www.usaspending.gov/download_center or use the usaspending-gov-mcp.

This is a stub to get the pipeline shape right. Replace with Polars + robust loader.
"""

from __future__ import annotations

import duckdb
from pathlib import Path

import typer

app = typer.Typer()


@app.command()
def main(
    naics: str = typer.Option("541512", help="NAICS code to filter sample (e.g. 541512 IT)"),
    out: Path = typer.Option(Path("data/capture.duckdb"), help="Output DuckDB path"),
    limit: int = typer.Option(50_000, help="Row limit for demo slice"),
):
    """Create/append a tiny demo table from a hypothetical CSV or MCP fetch."""
    typer.echo(f"Creating demo DuckDB at {out} for NAICS ~{naics} (limit {limit})")

    out.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(out))

    # Stub: in real life we'd read a downloaded awards CSV or call MCP and transform.
    # For now just create the expected wide table skeleton + a few fake rows.
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
            -- add the columns you actually need for filters/viz
            fy INTEGER,
            quarter INTEGER
        )
    """)

    # Insert a couple of illustrative rows (replace with real load)
    con.execute("""
        INSERT OR REPLACE INTO usaspending_prime_awards VALUES
        ('DEMO-001', 'DEMO-001', 'PIID123', NULL, 1250000.0, '2024-03-15', '2025-03-14',
         'DEPARTMENT OF DEFENSE', 'DEPARTMENT OF DEFENSE',
         'ACME SYSTEMS INC', 'UEI-DEMO-001', '541512', 'Computer Systems Design Services',
         'D399', 'DELIVERY ORDER', 'FIRM FIXED PRICE', 'FULL AND OPEN COMPETITION',
         'NO SET ASIDE USED', 'VA', 'VA', 2024, 1),
        ('DEMO-002', 'DEMO-002', 'PIID456', 'PARENT-001', 875000.0, '2024-06-01', '2025-05-31',
         'DEPARTMENT OF HOMELAND SECURITY', 'DEPARTMENT OF HOMELAND SECURITY',
         'BETA CONSULTING LLC', 'UEI-DEMO-002', '541512', 'Computer Systems Design Services',
         'D399', 'DELIVERY ORDER', 'TIME AND MATERIALS', 'FULL AND OPEN AFTER EXCLUSION',
         'SMALL BUSINESS SET ASIDE', 'DC', 'DC', 2024, 2)
    """)

    count = con.execute("SELECT COUNT(*) FROM usaspending_prime_awards").fetchone()[0]
    typer.echo(f"Demo table ready. Rows: {count}")
    typer.echo("Next: implement real bulk or MCP ingest + transformations + indexes/views.")


if __name__ == "__main__":
    app()
