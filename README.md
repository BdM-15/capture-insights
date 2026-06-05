# capture-insights

**Modern local workstation for federal contract capture intelligence.**

Privacy-first analysis of USASpending historical data + live data via battle-tested MCPs (SAM.gov, USASpending, BLS, etc.). AI-assisted professional capture profile generation, competitive insights, opportunity exploration, and evidence-based BD/capture workflows.

No Streamlit. Clean, efficient, maintainable architecture using 2026-era tools. Runs fully locally (offline after setup optional). Free and public sources only.

> **New project** (June 2026). Rethought and rebuilt from the abandoned `BdM-15/Data_Insights` MVP. See [Review & Rethink](#review--rethink-from-data_insights) below.

## Quick Start (Planned)

```powershell
# 1. Clone
git clone https://github.com/BdM-15/capture-insights.git
cd capture-insights

# 2. Python env (uv recommended - fast, modern)
# Install uv if needed: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
uv sync  # or uv venv + pip install -e .

# 3. (Optional) Set up keys for live MCP data
cp .env.example .env
# Edit .env: SAM_API_KEY=..., BLS_API_KEY=... (free at api.data.gov / BLS site)

# 4. Ingest small demo dataset (or connect MCPs)
uv run python scripts/ingest_sample.py

# 5. Run backend + frontend (local web app served on localhost)
# (See below for current status)
```

See `docs/GETTING_STARTED.md` (to be added) and architecture notes.

## What It Will Deliver (End State Vision, Prioritized)

The original intent (refined):

- **Strategic dashboard & explorer**: Spend trends, top contractors/agencies/NAICS, expiring/recompete radar, market share, geographic, vehicle analysis. Powerful multi-dimensional filters with instant feedback.
- **Live + historical hybrid**: Bulk USASpending for deep historical analytics (your "single source of truth" on past performance). Live SAM.gov opportunities, awards, entities via MCPs. Enrichment from BLS wages, GSA CALC+ rates, Per Diem, eCFR/FAR references, Federal Register policy tracking.
- **Capability Stance**: Structured view of *your* (or any company's) core/differentiator/emerging capabilities derived from awards + manual/web enrichment. Gap analysis vs opportunities/competitors.
- **AI Data Agent + Capture Profile Generator** (flagship): Natural language queries grounded in data + citations. One-click (or guided) generation of professional DOCX capture profiles with:
  - Exec summary / go-no-go with PWin factors
  - Market & opportunity profile
  - Competitive positioning & incumbent intel
  - Evidence-based win themes (with source citations)
  - Teaming/partner recommendations
  - Risk notes, action plan
  - Full audit trail
- **Privacy & control**: Everything local. Your strategy never leaves the building. No subs, unlimited use.
- **Knowledge that compounds**: Stances, profiles, notes, and derived insights persist and improve over time.

**Target impact** (from original): 60-85%+ reduction in research/planning time per opportunity. Consistent, defensible, data-backed deliverables.

## Review & Rethink from Data_Insights (BdM-15/Data_Insights)

I did a thorough review of https://github.com/BdM-15/Data_Insights (last substantial code ~Sep 2025, heavy doc updates Dec 2025).

### Core Purpose & Intent (Strong, Unchanged)
- Private local "business intelligence workstation" specifically for federal govcon BD/capture teams.
- Ingest 10s of millions of USASpending records → fast queries/visuals/competitive analysis.
- Maintain company "capability stance".
- AI (local LLM) for chat + drafting narratives/win themes.
- Automated generation of high-quality, citable **Capture Profiles** (9-section professional docs) to accelerate leadership decisions and proposal kickoffs.
- Combine historical performance with forward opportunities (SAM etc.).
- Embed Shipley-style disciplined capture practices + full provenance/auditability.
- ROI pitch: massive time savings, consistency, knowledge retention, better win rates.

The vision in README, WHITE_PAPER.md, PLANNING.md, capture_insights_prd_v2.md, CAPTUREINTEL.md etc. is ambitious and well-articulated for the business problem. Lots of good thinking on data model (3-schema ETL s1_raw/s2_interim/s3_processed), pre-aggs, PWin, teaming, etc.

### What Was Implemented (Impressive for Early Vibe Coding)
- Streamlit multipage app with custom nav/sidebar.
- Postgres + sophisticated ETL pipeline (bulk USASpending primes + subawards, dedup by unique keys, cleansing, fiscal quarter calc, heavy precomputed filter values + dependencies + quarterly_data + indexes in s3_processed for perf).
- Some SAM.gov ingestion (rate-limited, chunked, schema evolution handling).
- Ollama local LLM integration (chat agent page, narrative gen scaffolding).
- Capability stance page.
- Many visualization tabs (market overview, competitive/treemap, vehicles, geo, expiring, agency intel, future opps).
- Capture profile generator (partial, AI sections + data + export to DOCX via python-docx).
- MCP experiments (GitHub MCP server integrated via Docker/launcher, plans for more via PydanticAI + Crawl4AI + Langfuse tracing).
- Massive documentation (white paper, PRDs, planning, data dict, SQL queries catalog, architecture sketches, NEW_REPO_STRUCTURE.md proposing FastAPI+Next.js etc.).
- Lots of supporting: notebooks, mermaid diagrams, test scripts, mcp launcher.

### Pain Points & Bloat (Why Rethink Now)
- **Streamlit limitations & hacks**: Custom navigation (hidden pages + session state + sidebar reruns), heavy session_state for filters/context across "tabs" (actually separate page modules), performance struggles on large data leading to "optimized" SQL paths and precompute everything. State management and complex interactions are painful. User explicitly wants something better.
- **Custom everything for data**: Elaborate 3-schema ETL in Python + raw SQL (dedup, transform, filter precomputes, materialized-like tables). Worked but fragile, slow to evolve, lots of one-off scripts. Hard to maintain as schemas/APIs change.
- **Config & deps bloat**: `config.py` ~17k lines with duplication, legacy rate-limit constants, multiple overlapping get_xxx_config() funcs, business-term-to-column maps, etc. `requirements.txt` is a full pip-freeze pin explosion (transitive + exact versions from a venv).
- **Implementation vs. plans gap**: Ambitious roadmap (SAM full, PWin models, advanced agents, semantic search/RAG, Salesforce, full 9-section profiles with ghosting/pricing, etc.) outpaced the prototype. Many "in progress"/"planned" items. Abandoned before full MCP or polished profile gen.
- **Code smell from vibe evolution**: Long files, repeated patterns across tabs/processors, scattered "optimized" variants, old WSL/Docker/Ollama experiments, insight_venv committed (anti-pattern), lots of planning docs that are now historical.
- **External data**: Custom SAM/USASpending acquisition code that is now better solved by dedicated, hardened, tested tools.
- **No desktop polish**: Web-in-browser only, Streamlit aesthetics.

**Tech has advanced** (2026): Much better local LLMs/tool-calling, mature MCP ecosystem (including the excellent https://github.com/1102tools/federal-contracting-mcps with 8 production-hardened servers for exactly our data sources + regs), DuckDB for local analytics (game changer vs heavy Postgres ETL), better agent libs (PydanticAI), easier polished UIs without Streamlit pain, uv for Python packaging.

### What We Keep / Evolve
- The business problem and end-state capabilities (dashboard, stance, AI agent, flagship capture profiles with citations).
- 3-schema thinking for provenance (adapt to Parquet + DuckDB layers or simple raw/processed).
- Emphasis on local/privacy, citations/audit, evidence-based from real spending, Shipley discipline.
- The detailed data dictionary and SQL viz query catalog as reference.

### New Direction (Efficient + Modern)
See [Architecture Overview](#architecture-overview) below. Key shifts:
- **Data**: DuckDB (primary analytics, fast on-device SQL/aggs) + Chroma (or DuckDB vectors) for semantic/RAG on text. Live data via the 1102tools federal-contracting MCPs (drop-in high-quality tools for SAM, USASpending live, BLS OEWS wages, GSA CALC+, Per Diem, eCFR, FedReg, Regs.gov). Bulk historical still valuable for deep longitudinal analysis without rate limits/cost.
- **AI/Agents**: Local Ollama + modern structured agent framework. Consume MCP tools directly (deterministic data access instead of custom scraping). Custom tools for local DB queries, stance analysis, profile assembly.
- **UI**: FastAPI (clean backend APIs, typed) + modern React/TS frontend (Vite + Tailwind + shadcn/ui or equivalent). Served locally (localhost). Professional, responsive, great tables/viz/filters. Desktop wrapper (Tauri or pywebview) as a follow-on for native app feel/installer.
- **Overall**: uv + pyproject.toml (no more pinned mess), clean layered code (data/repos/services/agents/routers), Pydantic everywhere, provenance baked in, small focused v1, excellent docs from day 1.
- Leverage the excellent planning artifacts from the old repo (NEW_REPO_STRUCTURE.md was already pointing toward FastAPI+Next.js separation + MCP servers).

This will be dramatically leaner, faster to extend, more pleasant to use and maintain, while delivering the same (or better) value faster.

## Architecture Overview (Target for v1+)

```
capture-insights/
├── backend/                 # FastAPI app (uvicorn)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py        # pydantic-settings, clean
│   │   ├── deps.py
│   │   ├── routers/         # /awards, /filters, /summary, /chat, /profiles, /mcp etc.
│   │   ├── services/        # business logic, orchestration
│   │   ├── repositories/    # DuckDB queries (or SQLAlchemy if Postgres)
│   │   ├── agents/          # PydanticAI / LangGraph + MCP clients
│   │   ├── mcp/             # MCP client manager + custom tools (local DB query, profile builder)
│   │   ├── models/          # Pydantic domain + API schemas
│   │   └── utils/           # provenance, citations, export (docx)
│   └── scripts/             # ingest, backfill, etc.
├── frontend/                # Vite + React/TS
│   ├── src/
│   │   ├── components/      # shadcn/ui + custom (FilterBar, KPICard, AwardTable, ProfilePreview)
│   │   ├── pages/           # Dashboard, Explorer, Chat, MyStance, Captures
│   │   ├── lib/             # api client (fetch with types), formatters, viz (recharts)
│   │   └── ...
│   └── ...
├── data/                    # .gitignore'd runtime (duckdb, chroma, samples, cache)
├── scripts/
├── docs/                    # ARCHITECTURE.md, DATA_MODEL.md, MCP_INTEGRATION.md, CAPTURE_PROFILE_SPEC.md, etc.
├── pyproject.toml
├── package.json (or pnpm)
├── .env.example
└── README.md
```

**Data flow highlights**:
- Ingest: scripts or UI-triggered → load small/full USASpending slices (CSV/Parquet) or query MCP → DuckDB (raw + analytics views/tables) + Chroma for embeddings of descriptions/solicitations.
- Queries: Backend uses DuckDB for fast structured filters/aggs/metrics. Semantic via Chroma or hybrid.
- Live: MCP client in agents/services calls sam-gov-mcp, usaspending-gov-mcp, bls-oews-mcp etc. (run servers via uvx or persistent).
- AI: Grounded chat (retrieve context from DB/vectors + MCP) → LLM (Ollama) with structured output for themes/sections.
- Profile: Assemble data + stance + competitor intel + live context → LLM drafts sections → python-docx (or better templating) with embedded citations (award keys, dates, sources, query snapshot).

**Offline mode**: Bulk data + local LLM + cached MCP responses where possible. Live MCPs require net (as expected for current opps).

**Extensibility**: Easy to add more MCPs, new profile sections, PWin heuristics, export formats, saved views/pipelines.

See `docs/ARCHITECTURE.md` (initial version to be added) for details, ADRs, and migration notes from old repo.

## Current Status & Approach (June 2026)

We are building in small, focused, high-quality chunks. No "build to build."

**What exists right now (after first real work session):**
- New public repo + local git.
- Thorough review of the old Data_Insights repo and the excellent federal-contracting-mcps.
- Clear decisions based on your input:
  - **Single DuckDB only** (one simple, powerful file on your computer). No redundant databases (Chroma etc.) until we prove we need them. Everything explained in plain English.
  - Local LLM primary (Ollama). 8GB VRAM friendly recommendation: `qwen2.5:7b` (or similar quantized). You can also use xAI Grok models via API when you want.
  - Training data collection planned from the beginning for future fine-tuning of specialized models.
  - NAICS: 561210 is default but multi-NAICS support is built in from day one.
  - Future skills (visuals/presentations like huashu-design style, IGCE, teaming, etc.) are documented as later work.
- Initial scaffold + very educational `scripts/ingest_sample.py` (synthetic data works immediately; real CSV instructions included).
- Plain-English data dictionary started (Karpathy-style explanations + "how the AI should think about this field").
- Architecture and future-skills ideas docs written with your constraints in mind.

**Progress so far (small focused chunks):**

- Chunk 1: Single DuckDB only + educational ingest script (multi-NAICS, real CSV instructions, synthetic demo) + plain-English data dictionary (Karpathy style) + future skills ideas doc.
- Chunk 2: Reusable query functions (market summary, top agencies, expiring contracts) + FastAPI endpoints (`/data/summary`, `/top-agencies`, `/expiring`, `/snapshot`) that actually return real numbers from your DuckDB.
- Chunk 3 (just done): First real artifact of the flagship feature — `scripts/generate_profile_stub.py` that produces a proper .docx Capture Profile with:
  - Real data pulled from DuckDB (totals, top agencies table, expiring list)
  - Clear sections matching the classic 9-section structure
  - Obvious `[LLM PLACEHOLDER]` areas where we will later inject grounded narrative from Ollama or xAI
  - Citations / methodology note
  - The file is saved in `data/exports/` and is a real Word document you can open today.

All code is heavily commented in plain language. The generator is deliberately a "stub" so we can quickly get to something visible and then improve it (add your stance, real LLM calls, training data logging, live MCP enrichment, etc.).

Next chunk ideas (pick one or suggest your own):
- Minimal React frontend page that calls the /data/* endpoints and shows nice cards + tables.
- First grounded LLM chat (question → pull relevant data from DuckDB → send context + question to Ollama → return answer with citations).
- Enhance the profile stub (more sections, better formatting, save the exact "LLM input context" for training data).
- Make real CSV loading more robust (drag a folder of USASpending downloads and it just works).
- Training data helper (a small script that logs successful profile generations as JSONL for future fine-tuning).

Everything stays small, understandable, and directly serves the end state you described.

## Contributing / Next

This is currently a solo internal project. PRs and discussion welcome once basics land.

Key immediate work (after scaffold):
1. Set up uv + FastAPI skeleton + simple React Vite app that talks to it (served together for easy `dev`).
2. DuckDB + small USASpending sample (e.g. one NAICS/year slice) + core filter + summary endpoints.
3. Basic dashboard UI (cards, trend line, top list, data table).
4. Wire one federal-contracting MCP (usaspending-gov-mcp or sam-gov-mcp) and expose a tool-backed endpoint.
5. Ollama chat endpoint that retrieves from DuckDB + returns grounded answer.
6. DOCX stub for a capture profile using python-docx + template data.
7. Excellent docs (this README + ARCHITECTURE + how to add data/MCP).

## License & Notes

Internal / personal use initially. MIT or similar once stabilized.

Built for serious govcon work while staying free, local, and auditable.

---

**Bottom line**: The original Data_Insights had the right vision and some solid foundations despite the early-vibe mess. With modern primitives (MCPs, DuckDB, better UIs/agents, uv), we can deliver a leaner, more powerful, more enjoyable version much faster. Let's build it right this time.

Questions or priorities? Open an issue or ping the owner.
