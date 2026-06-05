#!/usr/bin/env python
"""
download_usaspending_bulk.py

Tool to download bulk prime and subaward CSVs from USASpending.gov using their Bulk Download API.

This addresses your request to get the raw data for the last ~10 years (FY2015-FY2025) of prime and sub awards.

Usage (examples):

# Download prime awards for last 10 fiscal years (all agencies, all NAICS -- WARNING: very large!)
uv run python scripts/download_usaspending_bulk.py --type prime --years 2015-2025 --out-dir data/raw/prime

# Download only for specific NAICS (recommended to start, keeps it manageable for proof of concept)
uv run python scripts/download_usaspending_bulk.py --type prime --years 2015-2025 --naics 561210,541512 --out-dir data/raw/prime

# Subawards for same
uv run python scripts/download_usaspending_bulk.py --type sub --years 2015-2025 --naics 561210 --out-dir data/raw/sub

# One year at a time for very large sets
uv run python scripts/download_usaspending_bulk.py --type prime --years 2024 --out-dir data/raw/prime

The script will:
- POST to the Bulk Download API with appropriate filters (award_types for prime, fiscal years or date range).
- Poll the status until the file is ready.
- Stream-download the zip to your out-dir.
- You then unzip and feed the CSVs to ingest_historical.py (which will select only the ~50 key elements we care about from the original Data_Insights to keep the DB lean).

After download + ingest, you will have the foundation for visibility into market potential.

For long-duration contracts (e.g. 20-year at DOE): After bulk, we can use the usaspending-gov-mcp and sam-gov-mcp to supplement with recent modifications, current opportunities, and agency-specific deep dives that the 10-year bulk might miss or be slow to refresh.

This matches the hybrid approach: bulk for historical depth + MCP for freshness and gaps.

The script is non-interactive, logs progress, and can be run in background or scheduled.

Requirements: requests (added if needed via uv).

Run with --help for all options.
"""

import time
import zipfile
from pathlib import Path
from typing import List, Optional

import requests
import typer

app = typer.Typer(help="Download USASpending bulk prime/subaward CSVs via official Bulk Download API.")

BULK_API_BASE = "https://api.usaspending.gov/api/v2/bulk_download"
STATUS_ENDPOINT = f"{BULK_API_BASE}/status"
DOWNLOAD_ENDPOINT = f"{BULK_API_BASE}/awards/"  # for prime; sub has separate but similar

# Award types for prime contracts (A=Delivery Order, B=Definitive Contract, C=Purchase Order, D=Blanket Purchase Agreement etc.)
PRIME_AWARD_TYPES = ["A", "B", "C", "D"]
# For subawards, the sub_awards endpoint uses different params.

def request_bulk_download(
    award_types: List[str],
    fiscal_years: List[str],
    naics_codes: Optional[List[str]] = None,
    file_format: str = "csv",
    is_subaward: bool = False,
) -> dict:
    """POST to bulk download API and return the response with file_name or request info."""
    if is_subaward:
        url = f"{BULK_API_BASE}/sub_awards/"
        payload = {
            "filters": {
                "sub_award_types": ["sub_award"],  # or specific
                "fiscal_year": fiscal_years,
            },
            "file_format": file_format,
        }
        if naics_codes:
            # Note: subaward filter may be on prime naics or sub; API supports naics in some cases
            payload["filters"]["naics_codes"] = naics_codes
    else:
        url = DOWNLOAD_ENDPOINT
        payload = {
            "filters": {
                "award_types": award_types,
                "fiscal_year": fiscal_years,
            },
            "file_format": file_format,
        }
        if naics_codes:
            payload["filters"]["naics_codes"] = naics_codes

    print(f"Requesting bulk download from {url} with payload: {payload}")
    resp = requests.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    print(f"Response: {data}")
    return data


def poll_for_file(file_name: str, max_wait_minutes: int = 60) -> Optional[str]:
    """Poll status until file_url is available."""
    url = f"{STATUS_ENDPOINT}/?file_name={file_name}"
    start = time.time()
    while time.time() - start < max_wait_minutes * 60:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        status = resp.json()
        print(f"Status for {file_name}: {status.get('status')}")
        if status.get("file_url"):
            return status["file_url"]
        if status.get("status") in ("failed", "error"):
            print("Download generation failed.")
            return None
        time.sleep(10)  # polite poll
    print("Timed out waiting for file generation.")
    return None


def download_file(url: str, dest: Path) -> None:
    """Stream download the zip."""
    print(f"Downloading from {url} to {dest} ...")
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
    print(f"Downloaded {dest} ({dest.stat().st_size / (1024**2):.1f} MB)")


@app.command()
def main(
    type: str = typer.Option(..., "--type", help="prime or sub"),
    years: str = typer.Option(..., "--years", help="e.g. 2015-2025 or 2020,2021,2022 or single 2024"),
    naics: Optional[str] = typer.Option(None, "--naics", help="Comma separated NAICS to filter, e.g. 561210,541512. Omit for ALL (huge files!)"),
    out_dir: Path = typer.Option(Path("data/raw"), "--out-dir", help="Directory for the downloaded zips"),
    max_wait: int = typer.Option(120, "--max-wait", help="Max minutes to wait for USASpending to prepare the file"),
):
    """Request and download bulk CSVs for prime or sub awards."""
    is_sub = type.lower() == "sub"
    if type.lower() not in ("prime", "sub"):
        raise typer.BadParameter("--type must be prime or sub")

    # Parse years
    if "-" in years:
        start, end = map(int, years.split("-"))
        fiscal_years = [str(y) for y in range(start, end + 1)]
    else:
        fiscal_years = [y.strip() for y in years.split(",")]

    naics_list = [n.strip() for n in naics.split(",")] if naics else None

    print(f"Preparing {type} bulk download for FYs {fiscal_years}")
    if naics_list:
        print(f"  Filtered to NAICS: {naics_list}")
    else:
        print("  WARNING: No NAICS filter -- this will be a VERY large download (tens to hundreds of GB uncompressed for 10 years).")

    award_types = PRIME_AWARD_TYPES if not is_sub else None

    try:
        resp = request_bulk_download(
            award_types=award_types or [],
            fiscal_years=fiscal_years,
            naics_codes=naics_list,
            is_subaward=is_sub,
        )
    except Exception as e:
        print(f"Failed to request download: {e}")
        raise typer.Exit(1)

    file_name = resp.get("file_name")
    if not file_name:
        print("No file_name in response. Response was:", resp)
        raise typer.Exit(1)

    file_url = poll_for_file(file_name, max_wait_minutes=max_wait)
    if not file_url:
        print("Could not get download URL.")
        raise typer.Exit(1)

    # Determine filename
    year_str = years.replace("-", "to")
    naics_str = f"_naics{'-'.join(naics_list)}" if naics_list else "_all"
    suffix = "subawards" if is_sub else "prime_awards"
    zip_name = f"usaspending_{suffix}_fy{year_str}{naics_str}.zip"
    dest = out_dir / zip_name

    download_file(file_url, dest)

    print(f"\nSuccess! Downloaded to {dest}")
    print("Next steps:")
    print(f"  1. Unzip it: unzip {dest} -d {out_dir}/unzipped/")
    print(f"  2. Feed the CSV(s) to the ingest: uv run python scripts/ingest_historical.py --csv {out_dir}/unzipped/*.csv --naics {','.join(naics_list) if naics_list else '561210'}")
    print("  3. The ingest will project only the key ~50 elements from the original Data_Insights schema to keep things lean.")


if __name__ == "__main__":
    app()
