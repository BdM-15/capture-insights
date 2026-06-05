#!/usr/bin/env python
"""
download_usaspending_bulk.py - Timeframe-chunked bulk downloader matching the original Data_Insights approach.

Key alignments per your feedback:
- Uses the EXACT TARGET_FIELDS list from the original prime raw acquisition script (and similar for sub).
- Chunks by small date ranges (default CHUNK_DAYS=2 as you experienced; original code had 7 but you needed 2-day max for reliability).
- Requests ALL contract actions (prime_award_types including IDVs for contracts; "procurement" sub_awards).
- NO NAICS filter (or any other filter) in the download request itself — get everything in the date range so we don't miss mislabeled items.
- Uses the "columns": TARGET_FIELDS in the payload so the generated CSV is slim (only the fields we care about).
- Loops over the full period you specify (e.g. 10 years), one small chunk at a time.
- Saves dated zips/CSVs to data/raw/ for later ingest (which will load into DuckDB using matching schema).
- Robust polling, retries, logging (inspired by original).

This will take hours for 10 years at 2 days/chunk, but only once.

After all chunks, run the ingest on the collected CSVs (it will use the same target fields for the DuckDB table).

For subawards, similar logic from the original sub raw script.

Usage:
  # Full 10 years, 2-day chunks, prime only (recommended start)
  uv run python scripts/download_usaspending_bulk.py --start 2015-10-01 --end 2025-09-30 --chunk-days 2 --type prime

  # Include subawards
  uv run python scripts/download_usaspending_bulk.py --start 2015-10-01 --end 2025-09-30 --chunk-days 2 --type both

The script is resumable in spirit (you can re-run with adjusted dates if interrupted; it doesn't have DB progress yet but prints clear ranges).

Then feed the resulting CSVs (they will be in dated subdirs or flat) to ingest_historical.py which now knows the exact target fields.
"""

import time
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Tuple

import requests
import typer
from tqdm import tqdm

app = typer.Typer(help="Chunked USASpending bulk downloader for prime + sub (2-day chunks, all actions, target fields only).")

BULK_API_URL = "https://api.usaspending.gov/api/v2/bulk_download/awards/"
STATUS_URL_BASE = "https://api.usaspending.gov/api/v2/download/status"

# Exact TARGET_FIELDS from the original Data_Insights usaspending_primeawards_raw.py
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

# For subawards, the original sub script doesn't hardcode a slim list (dynamic table).
# We'll request "procurement" subawards without columns limit for now.
SUB_AWARD_TYPES = ["procurement"]

DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
REQUEST_TIMEOUT = 60
MAX_WAIT_SECONDS = 900
POLL_INTERVAL = 30

def request_download(start_str: str, end_str: str, is_sub: bool = False) -> Tuple[str, str]:
    """Request bulk download for the small date range. Returns (status_url, file_url)."""
    if is_sub:
        payload = {
            "filters": {
                "sub_award_types": SUB_AWARD_TYPES,
                "date_type": "action_date",
                "date_range": {"start_date": start_str, "end_date": end_str},
                "agencies": [{"type": "awarding", "tier": "toptier", "name": "All"}]
            },
            "file_format": "csv"
            # No "columns" for sub in original sub script; it takes whatever comes.
        }
    else:
        payload = {
            "filters": {
                "prime_award_types": [
                    "A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B",
                    "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"
                ],
                "date_type": "action_date",
                "date_range": {"start_date": start_str, "end_date": end_str},
                "agencies": [{"type": "awarding", "tier": "toptier", "name": "All"}]
            },
            "file_format": "csv",
            "columns": PRIME_TARGET_FIELDS  # Slim CSV with only the fields we want
        }

    print(f"Requesting bulk for {start_str} to {end_str} (sub={is_sub})")
    resp = requests.post(BULK_API_URL, json=payload, headers=DOWNLOAD_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    status_url = data.get("status_url")
    file_url = data.get("file_url")
    if not status_url:
        raise ValueError(f"No status_url returned: {data}")
    print(f"  Status URL: {status_url}")
    if file_url:
        print(f"  File URL immediate: {file_url}")
    return status_url, file_url or ""

def wait_for_ready(status_url: str) -> Optional[str]:
    """Poll until finished or timeout. Returns file_url when ready."""
    start = time.time()
    pbar = tqdm(total=100, desc="Waiting for generation", leave=False)
    last_pct = 0
    while time.time() - start < MAX_WAIT_SECONDS:
        try:
            r = requests.get(status_url, timeout=30)
            r.raise_for_status()
            s = r.json()
            status = s.get("status")
            if status == "finished":
                pbar.update(100 - last_pct)
                pbar.close()
                return s.get("file_url")
            if status in ("failed", "error"):
                pbar.close()
                print(f"Generation failed: {s}")
                return None

            # Percent complete (defensive)
            msg = s.get("message", {})
            pct = 0
            if isinstance(msg, dict):
                pct = int(msg.get("percent_complete", 0))
            elif isinstance(msg, str) and "%" in msg:
                try:
                    pct = int(msg.split("%")[0].strip().split()[-1])
                except:
                    pass
            if pct > last_pct:
                pbar.update(pct - last_pct)
                last_pct = pct

            time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"  Poll error: {e}")
            time.sleep(POLL_INTERVAL)
    pbar.close()
    print("Timed out waiting for file.")
    return None

def download_zip(file_url: str, dest: Path) -> None:
    """Stream the zip to disk."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading to {dest} ...")
    with requests.get(file_url, headers=DOWNLOAD_HEADERS, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)
    print(f"  Saved {dest} ({dest.stat().st_size / 1024 / 1024:.1f} MiB)")

def daterange_chunks(start: datetime, end: datetime, chunk_days: int) -> List[Tuple[datetime, datetime]]:
    """Yield (chunk_start, chunk_end) pairs."""
    chunks = []
    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        chunks.append((current, chunk_end))
        current = chunk_end + timedelta(days=1)
    return chunks

@app.command()
def main(
    start: str = typer.Option(..., "--start", help="Overall start date YYYY-MM-DD (e.g. 2015-10-01 for ~10 years)"),
    end: str = typer.Option(..., "--end", help="Overall end date YYYY-MM-DD (e.g. 2025-09-30)"),
    chunk_days: int = typer.Option(2, "--chunk-days", help="Days per request (use 2 as you found reliable)"),
    type: str = typer.Option("prime", "--type", help="prime | sub | both"),
    out_dir: Path = typer.Option(Path("data/raw/bulk_chunks"), "--out-dir"),
):
    """Download in small date chunks for the full period, no NAICS filter, only target fields, all contract actions."""
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    chunks = daterange_chunks(start_dt, end_dt, chunk_days)

    print(f"Will process {len(chunks)} chunks of ~{chunk_days} days each from {start} to {end}")
    print(f"Type: {type}. Output root: {out_dir}")
    print("Files will be saved under <out_dir>/prime/ and <out_dir>/sub/ as dated .zip files.")
    print("Raw CSVs are inside the zips. You can leave them or extract manually. Ingest will read from the zips or extracted CSVs.")

    do_prime = type in ("prime", "both")
    do_sub = type in ("sub", "both")

    # Simple resume support: track last successful end date in a .progress file
    progress_file = out_dir / ".download_progress"
    last_successful_end = None
    if progress_file.exists():
        try:
            last_successful_end = datetime.strptime(progress_file.read_text().strip(), "%Y-%m-%d")
            print(f"Resuming after {last_successful_end.date()}")
        except Exception:
            pass

    for i, (cstart, cend) in enumerate(chunks):
        if last_successful_end and cend <= last_successful_end:
            print(f"Skipping already-completed chunk ending {cend.date()}")
            continue

        start_str = cstart.strftime("%Y-%m-%d")
        end_str = cend.strftime("%Y-%m-%d")
        print(f"\n[{i+1}/{len(chunks)}] {start_str} to {end_str}")

        success = True

        prime_dest = out_dir / "prime" / f"prime_{start_str}_to_{end_str}.zip"
        sub_dest = out_dir / "sub" / f"sub_{start_str}_to_{end_str}.zip"

        prime_ok = True
        sub_ok = True

        if do_prime:
            prime_ok = False
            status_url = None
            for attempt in range(5):  # more retries for download reliability
                try:
                    status_url, file_url = request_download(start_str, end_str, is_sub=False)
                    if not file_url and status_url:
                        file_url = wait_for_ready(status_url)
                    if file_url:
                        download_zip(file_url, prime_dest)
                        print(f"  Saved {prime_dest}")
                        prime_ok = True
                        break
                    else:
                        print(f"  Prime chunk no file_url yet (attempt {attempt+1})")
                        time.sleep(30)
                except Exception as e:
                    print(f"  Prime chunk error (attempt {attempt+1}/5): {e}")
                    if "403" in str(e) and status_url:
                        # Generated link expired — re-poll for a fresh one
                        print("    403 on download link — re-polling status for fresh URL...")
                        file_url = wait_for_ready(status_url)
                        if file_url:
                            try:
                                download_zip(file_url, prime_dest)
                                print(f"  Saved {prime_dest}")
                                prime_ok = True
                                break
                            except Exception as e2:
                                print(f"    Still failed after fresh URL: {e2}")
                    if attempt < 4:
                        time.sleep((attempt + 1) * 45)
                    else:
                        print("  Giving up on this prime chunk after retries. You can manually download using the last status_url printed above.")

        if do_sub:
            sub_ok = False
            status_url = None
            for attempt in range(5):
                try:
                    status_url, file_url = request_download(start_str, end_str, is_sub=True)
                    if not file_url and status_url:
                        file_url = wait_for_ready(status_url)
                    if file_url:
                        download_zip(file_url, sub_dest)
                        print(f"  Saved {sub_dest}")
                        sub_ok = True
                        break
                    else:
                        print(f"  Sub chunk no file_url yet (attempt {attempt+1})")
                        time.sleep(30)
                except Exception as e:
                    print(f"  Sub chunk error (attempt {attempt+1}/5): {e}")
                    if "403" in str(e) and status_url:
                        print("    403 on download link — re-polling status for fresh URL...")
                        file_url = wait_for_ready(status_url)
                        if file_url:
                            try:
                                download_zip(file_url, sub_dest)
                                print(f"  Saved {sub_dest}")
                                sub_ok = True
                                break
                            except Exception as e2:
                                print(f"    Still failed after fresh URL: {e2}")
                    if attempt < 4:
                        time.sleep((attempt + 1) * 45)

        if prime_ok or sub_ok:
            # Update progress so we can resume (even partial success for the date range)
            progress_file.write_text(end_str)
            last_successful_end = cend

        # Be nice to the API between chunks
        time.sleep(5)

    print("\nDone (or interrupted - you can re-run the same command to resume from last successful chunk).")
    print("Raw zips saved under --out-dir (default data/raw/bulk_chunks/prime/ and /sub/). They are NEVER auto-deleted by this script.")
    print("You can run ingest directly on the .zip files (it extracts to temp internally):")
    print("  uv run python scripts/ingest_historical.py --dir data/raw/bulk_chunks/prime   # simplest; ingests only new data (dedups automatically)")
    print("  (add --sub for the sub zips; add --delete-source to auto-delete the original zips after successful load into DuckDB)")
    print("Ingest uses the exact TARGET_FIELDS from the original Data_Insights for the DuckDB schema.")
    print("The ingest will use the exact same target fields for the DuckDB schema.")

if __name__ == "__main__":
    app()