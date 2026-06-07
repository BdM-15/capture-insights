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

**Current phase**: Phase 3 — Knowledge Vault lint/index helpers + Obsidian + external LLM/agent handoff (see data/knowledge/HANDOFF_OBSIDIAN_EXTERNAL_LLM.md + schema/ + scripts/vault_maintain.py). The vault UI was signed off as "much better... on the right track. Good enough for now" at end of phase 2.

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
  - Future skills (visuals/presentations like huashu-design style, IGCE, teaming, etc.) are documented in `docs/future-skills-ideas.md` as later work. Broader roadmap and future feature ideas (including the flexible agency/competitor search bar) live in `docs/ROADMAP_AND_FUTURE_FEATURES.md`.
- Initial scaffold + very educational `scripts/ingest_sample.py` (synthetic data works immediately; real CSV instructions included).
- Plain-English data dictionary started (Karpathy-style explanations + "how the AI should think about this field").
- Architecture and future-skills ideas docs written with your constraints in mind.

**Progress so far (small focused chunks) — data foundation + actionable buttons + startup ergonomics are the explicit priority (recentered per user feedback on agentic interfaces + warmup):**

- Chunk (recent): Button-activated agentic for real tasks (e.g. on an expiring contract in Future Opportunities: "Create SAM monitor (smart)" runs LLM+MCP behind the scenes to produce a rich, cited monitor entry in your Pipeline with smart keywords/notice types + rationale back to the source award. Manual forms remain as escape hatches. Chat co-pilot is integrated for open-ended use (not the only/primary surface).
- Chunk (recent): App-managed warmup at start (lifespan pre-calls MCP catalog + Ollama model load + cache; CLI notes + health reflect ready state). One (or two) commands bring a "warmed" workstation; no mandatory separate `uvx sam-gov-mcp` or model loads for normal button/agent flows (on-demand still works).
- All changes small, reuse existing (accumulators, MCP client, LLM patterns from profile, expiring data, URL builders), per-tab context respected, citations in notes. See docs/ROADMAP_AND_FUTURE_FEATURES.md (reframed agentic section) and the living plan.md in the dev session for assessment + details. Data + dashboard remain #1.

- Chunk 1: Single DuckDB only + educational ingest + plain-English data dictionary + future skills doc.
- Chunk 2: Reusable query functions + FastAPI data endpoints (`/data/summary`, `/top-agencies`, etc.).
- Chunk 3 (profile/LLM preview): We built an early version of the capture profile generator + real LLM narrative + training logging. This proved the end-to-end vision and gave us our first training example. Per your feedback we are parking heavy artifact/LLM generation work for now.
- Chunk 4 (data foundation + visibility dashboard — in progress, "If all is good, continue..."):
  - `scripts/download_usaspending_bulk.py` robust: 2-day chunking (your proven safe size), resume via .download_progress, 403 recovery by re-polling status_url for fresh file_url + retries. You are successfully running the full 10yr (both prime+sub, ALL contract actions, no early NAICS filter) in a separate window. First ~8-16 days of 2015 chunks already downloaded as dated zips.
  - `scripts/ingest_historical.py` + real loads: ingests the .zip (auto-extracts the slim TARGET_FIELDS CSV), **by default ingests the entire raw CSV content with no NAICS filter** (omit --naics), optional --naics 561210,xxx to filter at load time, --sub for teaming table, dedup, derived fy/quarter.
  - All core queries aligned to the exact 50+ columns from original Data_Insights (parent_award_agency_name, type_of_set_aside, contract_award_unique_key etc.).
  - `/data/market_potential`, `/data/fy-trends`, `/data/set-aside`, `/data/filters`, `/data/expiring`, etc. all work on real bulk data.
  - **Interactive visibility dashboard live at root `/`** (self-contained HTML/JS, no React yet): 
    - NAICS selector (multi supported), one-click Refresh All.
    - Market Potential card (actions, $M, unique competitors, trend).
    - FY Spend Trends with simple bars (derived fiscal year).
    - Set-Aside / Competition breakdown (small business share visible).
    - Top Agencies + Top Recipients (incumbents/competitors).
    - Expiring/Recompete radar (lights up as you load recent years).
    - Filters explorer (distinct values actually present in your data).
    - Prominent instructions: keep the bulk download running externally; when new zips appear, re-ingest (the same command works incrementally) and refresh the dashboard to see history grow.
  - `docs/DATA_PIPELINE.md` + README updated with the exact workflow.

Next (still data first):
- Keep the long bulk download running in its window. Periodically (or at end of a FY batch) ingest the new zips with the one-liner (supports globs via the comma trick or temp script). Dashboard becomes more powerful with each added year.
- Add MCP integration (start with usaspending-gov-mcp + sam-gov-mcp clients) for live gaps + long-horizon vehicles (e.g. 20yr DOE) + opportunities you mentioned.
- When 2-3 years of real data + MCP are solid, scaffold the real frontend (Vite/React in /frontend) that consumes the same /data/* endpoints.
- Then: grounded chat over the data, profile artifacts, training collection, skills.

We are aligned: solid data pipelines (historical bulk foundation + MCP) → trustworthy dashboard for "visibility into our companies total market potential" and ability to navigate → later artifacts/chat/training/skills.

We are aligned: solid data pipelines (historical + real-time) → trustworthy dashboard/ visualizations for visibility → then the cool stuff (chat, profiles, training, skills like huashu-design renders).
- First grounded LLM chat (question → pull relevant data from DuckDB → send context + question to Ollama → return answer with citations).
- Enhance the profile stub (more sections, better formatting, save the exact "LLM input context" for training data).
- Make real CSV loading more robust (drag a folder of USASpending downloads and it just works).
- Training data helper (a small script that logs successful profile generations as JSONL for future fine-tuning).

Everything stays small, understandable, and directly serves the end state you described.

## Ariadne Thread Synergy & Full Vision (Roadmap Context — Not Current Scope)

**Important framing (per project principles):** capture-insights remains **laser-focused on the data foundation and insights layer first**. Get the data right — reliable, queryable, insightful — and it becomes the source of truth and trigger engine for higher-level workflows. We build piece-by-piece, small and focused, to avoid the bloat seen in prior efforts (Data_Insights, ariadne-thread). "Grill-with-docs" sessions (Matt Pocock skill) are useful for deep dives but were over-applied previously, leading to hyper-focused scope creep without the big-picture end game. Here we keep the North Star in view while staying disciplined.

**Baby-out-of-the-bath-water approach (no copy-paste):** We do *not* replicate ariadne-thread's full complexity, MVPs, or monolithic structure. We extract the highest-leverage concepts that align with our lean, data-first, local, MCP-powered, global-chat + actionable platform vision. Many of Ariadne's "data elements" (packet fields, evidence, seller baselines, opportunity context) can flow directly from or be triggered by capture-insights outputs (market potential summaries, expiring+intensity combos, flows, agency/recipient data, vehicles, geo, etc.). These serve as inputs/triggers for skills, MCPs, research, brainstorming, agents, and work-product loops — without capture-insights itself becoming the full lifecycle manager.

**Highest-leverage concepts from ariadne-thread (mapped to 5 priorities for synergy):**

1. **Living Packet as central accumulation + data-driven trigger** (highest leverage, per user direction): The "packet" is simply the living accumulation of structured data elements for an opportunity (requirements, evidence, assumptions, gaps, actions). capture-insights supplies many core elements directly (e.g., from bulk data: obligations, competitors, expiring contracts, intensity scores, flows, set-aside/vehicle context) and acts as the trigger engine (e.g., "new high-intensity expiring contract in your NAICS" fires research, skill runs, MCP enrichment, or profile updates). This keeps the packet "alive" and data-backed without reinventing data acquisition.

2. **Command & Control Management / Portfolio Pulse + Command Center** (highest leverage, per user direction): Global visibility + routing cockpit (not a mega-scroll of tabs). Our dashboard + sidebar navigation (Dashboard views with internal lenses for Market/Opportunities/Agency/Competitive/Vehicles/Geo/Combos, plus Pipeline, Tools, etc.) + persistent global elements (filters, chat, pipeline tray) directly support this. Portfolio-level pulse (triage by urgency, freshness, data signals) + focused work on one opportunity. Avoids siloed pages; everything interconnected via shared data state.

3. **Review-gated workflows, provenance, and human-in-the-loop discipline** (Shipley-aligned): Nothing becomes "trusted" (e.g., added to packet, action plan, profile) without explicit review/accept. Our current "add to pipeline" actions, combo insights, education tooltips, and status notes are the seed. Future: explicit gates on data-derived recommendations before they feed skills/MCPs/agents. Full audit trail/citations from our DuckDB queries.

4. **Federal Data MCP + bulk hybrid enrichment as the reliable data spine**: Ariadne relies heavily on MCPs (SAM, USAspending, BLS, etc.) and profiles. capture-insights already delivers the hybrid (10yr bulk for deep history + live MCPs) with clean endpoints. This becomes the "source of truth" layer for Ariadne's seller baselines, opportunity discovery, recompete intel, etc. — no duplication.

5. **Knowledge Layer / Structured Knowledge + LLM-wiki vault for compounding**: Global data elements, typed relationships, and a living knowledge base (beyond per-opportunity). Our queries + market potential summaries + combos feed structured knowledge. Future: lightweight vault (inspired by Ariadne's Obsidian/LLM-wiki + Theseus patterns) that turns insights into reusable elements, triggers, and context for the global chat/agent. Keeps opportunity-specific state (packets) separate from global knowledge.

**How this keeps us focused while looking ahead:**
- Current phase: Data acquisition (bulk + MCP), clean DuckDB schema/queries, dashboard for visibility/navigation (with global chat, pipeline actions, combos, education).
- Next small focused increments (only after data is solid): Extend endpoints for packet-like structures, opportunity/portfolio stubs driven by data signals, review gates on actions, knowledge projection from insights.
- Full Ariadne-style (living packets as first-class, full command center orchestration, agents/skills over the data, artifact assembly, etc.) lives in the vision section below — we only pull the next piece when the foundation supports it without bloat.
- Big picture end game (Ariadne North Star adapted): One elegant local Command Center where a capture pro manages the full lifecycle with minimum friction. capture-insights provides the trustworthy data/insights foundation and triggers; higher layers (packets, actions, knowledge, agents) compose on top using the same modular, review-gated, global-chat, cyber-professional UX principles.

This section is *not* a commitment to implement Ariadne features here. It is a map to ensure piece-by-piece work serves the larger platform without losing the forest for the trees. All current work stays small, data-first, and directly useful for BD/capture visibility and decision-making today.

See also:
- `docs/ROADMAP_AND_FUTURE_FEATURES.md` (central living planning doc — future features, near-term priorities, and the flexible global search/command bar idea)
- `docs/UI_THEME.md` (cyberpunk command-center aesthetic)
- `docs/future-skills-ideas.md` (post-processing skills)
- The Ariadne Thread synergy section below (we extract the highest-leverage concepts only)

We document future ideas here first so the big picture stays visible without bloating current small focused work.

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
