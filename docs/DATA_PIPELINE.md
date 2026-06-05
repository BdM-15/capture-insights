# Data Pipeline — Plain English Guide

This document explains how data gets into the system and how we keep it up to date. Everything is designed to be understandable even if you are not a database expert.

## The Big Picture (Why This Matters)

The whole point of capture-insights is to give you **visibility** into federal spending so you can find opportunities, understand competitors, and make better bid decisions.

To do that well we need two kinds of data:

1. **Historical data** (what actually happened in the past)
   - Comes from USASpending.gov bulk downloads (huge CSV files).
   - Gives you trends over years, who won what, how much was spent, who the incumbents are, etc.
   - This is the foundation for dashboards, market sizing, and "who is winning in my NAICS".

2. **Live / forward-looking data** (what is happening right now or coming soon)
   - Comes from SAM.gov (opportunities, solicitations, awards).
   - Also enriched with things like BLS wage data, GSA rates, regulations, etc. via the federal-contracting MCP tools.
   - This tells you about active opportunities, recompetes, new set-asides, policy changes.

We keep the heavy historical stuff in a local DuckDB file (one fast file on your computer, no server to manage). Live data is fetched on demand or cached via the MCP tools when you need fresh information.

## Historical Pipeline (Bulk USASpending)

### How you get the data
1. Go to https://www.usaspending.gov/download_center/custom_award_data (or the award search and export).
2. Filter to the NAICS codes you care about (start with 561210, add others later).
3. Choose a date range (e.g. last 5–7 years is usually plenty).
4. Download the Prime Award CSV(s). They can be large — that's normal.

### What the ingest script does (in simple terms)
- Reads the CSV you downloaded.
- Keeps only the columns we actually need (obligation, dates, agency, recipient, NAICS, set-aside, vehicle, etc.).
- Derives useful things the raw data doesn't have cleanly:
  - Fiscal Year (fy) and Quarter — because government spending is tracked on the federal fiscal calendar (Oct–Sep).
  - Clean recipient name + UEI for consistent competitor/incumbent tracking.
- Deduplicates on the official unique key so the same transaction doesn't appear twice.
- Loads everything into one table called `usaspending_prime_awards` inside your local `data/capture.duckdb` file.
- You can run it again later with new CSVs and it will add the new records (incremental friendly).

Command example:
```powershell
uv run python scripts/ingest_historical.py --csv "C:\Downloads\awards_561210_2019-2025.csv" --naics 561210
```

The script is heavily commented so you can read exactly what each step does.

### Why DuckDB?
- One single file.
- Extremely fast at the kinds of questions dashboards ask ("total spent by agency last 3 years", "top recipients in this NAICS", "contracts ending in the next 18 months").
- No separate database server to install or maintain.
- You can even open the .duckdb file directly with the `duckdb` CLI tool and run SQL if you ever want to.

## Live Data via MCPs (Real-Time / Forward)

We will use the excellent free tools from https://github.com/1102tools/federal-contracting-mcps :

- usaspending-gov-mcp → live award and spending queries
- sam-gov-mcp → opportunities, solicitations, entity info, exclusions
- bls-oews-mcp, gsa-calc-mcp, etc. for wage rates, labor categories, per diem

These run locally (you start them with uvx or as background processes). Our code will talk to them using the standard MCP protocol when you need fresh data.

Benefits:
- No need to download everything every time.
- You get current opportunities and recent modifications.
- You can enrich historical records (e.g. "what is the current wage rate for this occupation in this metro?").

We will add a thin MCP client layer (`backend/app/data/mcp.py` or similar) that can:
- Call specific tools (search opportunities by NAICS, get recent awards for a recipient, etc.).
- Cache results locally when appropriate.
- Merge live data with your historical DuckDB when building a dashboard view or a profile.

This is "hybrid" — historical depth + live freshness.

## Data Refresh Strategy (Practical for a Non-Expert)

- **Historical**: Download a new filtered CSV from USASpending whenever you want a big refresh (quarterly or before a major pursuit is common). Run the ingest script. Takes minutes, not hours, because DuckDB is fast.
- **Live**: The UI (or an agent) can call the MCP tools on demand or on a schedule. Results can be stored temporarily in DuckDB or simple JSON files so you don't hammer the government APIs.

Everything stays on your machine. Nothing is sent to any cloud unless you explicitly use the xAI option for heavier LLM work.

## What "ETL Cleaning" Actually Means Here (Simple Version)

Old repo had a very complicated 3-schema (raw → interim → processed) with lots of custom Python and Postgres tricks because they were fighting performance with 60+ million rows in a traditional database.

With DuckDB we can keep it much simpler while still doing the important cleaning:

- Type fixes (dates are dates, dollars are numbers)
- Deduplication on the government's own unique transaction key
- Adding fiscal year/quarter columns (very useful for trends)
- Normalizing recipient names/UEIs so "ACME LLC" and "ACME, LLC" don't show up as two different companies
- (Later) flagging set-asides, vehicles, competition type in easy-to-filter columns

We do this once at ingest time so every dashboard query is fast and consistent.

## Current Status (as of this writing)

- We have a working DuckDB table structure and a set of clean query functions (`backend/app/queries.py`).
- FastAPI endpoints exist that return summary numbers, top agencies, expiring contracts, etc.
- Ingest is still mostly "demo/synthetic" for quick testing.
- Next focus: make the historical CSV ingest real and robust so you can load your actual USASpending downloads.
- After that: add "what are my filter options?" endpoints (distinct agencies, years, set-asides, etc.) that a real UI needs.
- MCP live layer will come as a parallel small piece once the historical side feels solid.

## Next Logical Small Chunks (Data First)

1. Real historical ingest script that handles actual USASpending CSVs with proper cleaning/dedup/derived fields.
2. "Filter options" endpoint + more dashboard-oriented query helpers (by set-aside, vehicle, state, etc.).
3. Basic MCP client wrapper (start with one tool, e.g. search recent awards or opportunities).
4. Simple data refresh CLI or background job pattern.
5. Then — and only then — start building the actual dashboard UI/UX so you can see the insights visually.

This order ensures the data is trustworthy before we spend time on pretty visualizations.

## Questions or Changes?

If you want a different split (e.g. get a very thin "data explorer" HTML page working before the MCP layer), just say so. The goal is to give you visibility into the data as quickly as possible while keeping the foundation solid.

Everything is designed so a non-expert can follow the scripts and docs. If something is unclear, tell me and we'll make the comments or the guide even plainer.
