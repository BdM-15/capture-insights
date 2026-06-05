# Architecture & Design Notes (capture-insights)

This document captures the rationale, decisions, and high-level design for the 2026 rebuild.

## Goals (Non-Negotiable)
- **Privacy-first & local**: All data, LLM inference, and heavy processing on the user's machine. Optional live MCP calls only when explicitly enabled.
- **Evidence & citations everywhere**: Every number, narrative, and recommendation must be traceable to source records (award keys, dates, MCP call ids, query timestamps, model version).
- **Usable by BD/capture pros, not just devs**: Fast filters, beautiful but functional viz, one-click professional outputs.
- **Maintainable & extensible**: Clean layers, typed contracts, small focused modules. Easy to add new MCPs, profile sections, data sources.
- **Modern 2026 primitives**: DuckDB, Chroma (vectors), official MCP SDK, PydanticAI/LangGraph agents, FastAPI + modern TS frontend, uv packaging. No Streamlit.
- **Hybrid data**: Historical bulk depth (USASpending) + live forward-looking (SAM via MCPs) + enrichment (BLS wages, rates, regs).

## High-Level Layers
1. **Data Ingestion & Storage**
   - Bulk historical: USASpending.gov CSVs (or API bulk) → Polars → Parquet snapshots → DuckDB (raw + analytics tables/views).
   - Live/forward: federal-contracting-mcps (sam-gov-mcp, usaspending-gov-mcp, etc.) via stdio/SSE MCP client.
   - Vectors/RAG: Chroma (or DuckDB vector extension) on award descriptions, solicitation text, capability notes, stance text.
   - Provenance: Every ingested record or enrichment carries source, fetch_time, query_params, etc.

2. **Core Domain / Repositories / Services**
   - Repositories: thin data access (DuckDB SQL or Polars expressions, Chroma queries).
   - Services: business logic (market share calc, expiring logic, stance derivation, opportunity scoring, citation formatting).
   - Strong Pydantic models for all domain concepts (Award, Opportunity, Stance, WinTheme, CaptureProfileSection, etc.).

3. **Agents & Tools**
   - MCP client manager (discover, connect, call the 8+ federal MCPs + custom local tools).
   - Custom tools: local_db_query (safe read-only), stance_analyzer, profile_assembler, citation_builder, web_intel (future).
   - Orchestration: PydanticAI or LangGraph for multi-step flows (e.g. "research this recompete" = fetch live SAM + historical incumbent + stance match + LLM narrative + risk flags).
   - Grounding + guardrails: always retrieve context first, require citations in structured outputs.

4. **API Layer (FastAPI)**
   - Thin routers.
   - Typed request/response with Pydantic.
   - Endpoints for: filters/metadata (for UI dropdowns), summary KPIs, awards search (paginated + sorted), viz payloads, chat (stream?), generate_profile (async job or sync for small), mcp health/tools.
   - OpenAPI first-class for frontend codegen or docs.

5. **Presentation (Frontend)**
   - Local web app (Vite React/TS).
   - Professional govcon aesthetic (clean cards, blues/grays, high information density but scannable).
   - Powerful filter bar (persistent or shareable via URL state).
   - Interactive dashboard + explorer.
   - AI chat surface (grounded answers with sources).
   - Profile wizard/preview/export.

6. **Output & Delivery**
   - DOCX (python-docx) primary for capture profiles (templates + injected tables + narratives + citations).
   - Also MD, JSON (structured data), PDF (later).
   - Future: PPT exec brief, Excel pipeline export.

## Key Technology Choices & Rationale (June 2026)
- **DuckDB over Postgres for v1 analytics**: In-process, zero ops, reads Parquet natively, vectorized, excellent SQL for exactly the filter + agg workloads we have. Handles tens of millions of rows comfortably on a good laptop. Postgres remains an option later for shared/team use.
- **Chroma (or equiv) for vectors**: Simple, local, great metadata filtering + similarity. Pairs well with DuckDB for hybrid search (structured + semantic).
- **federal-contracting-mcps (1102tools)**: Production-hardened, deterministic, low-context, tested (2600+ tests), easy key injection. Replaces almost all custom SAM/USASpending/BLS acquisition code from the old repo. Run via `uvx` or persistent processes.
- **FastAPI + React/TS (shadcn)**: Clean separation, typed contract (OpenAPI), best-in-class DX for rich interactive UI. Localhost only (no public hosting needed).
- **Ollama + structured agents**: Local, private, improving rapidly. Tool calling + Pydantic models for reliable outputs.
- **uv + pyproject**: Reproducible, fast, modern Python packaging. No more massive pinned requirements.txt or committed venvs.
- **python-docx for profiles**: Battle-tested, precise control over professional formatting, tables, headings, citations.

## Data Model Sketch (High Level)
- Core fact: awards (primes + subawards) with full USASpending columns + our derived (fy, quarter, normalized recipient, etc.).
- Dimensions: agencies, recipients (with UEI hierarchy), NAICS/PSC, contract types/vehicles, set-asides, places of performance.
- Derived: quarterly aggregates, top-N by various groupings, expiring windows, competition intensity (actions vs obligation).
- Company/Competitor Stance: JSONB-like or normalized tables + vector embeddings. Core capabilities, NAICS/PSC history, key awards, news/intel, keywords.
- Documents for RAG: award descriptions, SAM solicitations (full text + metadata), stance narratives, past profiles.
- Profile artifacts: versioned CaptureProfile records (inputs snapshot + generated sections + citations + model hash).

See old repo's CAPTUREINTEL.md and docs for rich field-level detail; adapt rather than copy.

## MCP Integration Strategy
- Run desired MCP servers (e.g. via `uvx mcp-server-usaspending-gov` or from source).
- Use `mcp` Python SDK to connect (stdio or SSE).
- Expose safe, high-level tools in our agent layer (never raw "call any MCP tool" to the LLM without guardrails).
- Cache results where appropriate (with provenance).
- Support "offline mode" that disables or mocks live MCPs.

## v1 Scope (Core, as agreed)
- Local data load (small USASpending slice or via MCP).
- Powerful filters + interactive dashboard (spend trends, top players, expiring contracts, basic competitive).
- Basic AI chat grounded in the loaded data + citations.
- One capture profile export (DOCX, 4-5 key sections with data + LLM narratives + citations).

Everything else (full stance, advanced agents, many MCPs, PWin, full 9 sections, teaming radar, desktop wrapper, etc.) is follow-on.

## Migration Notes from Data_Insights
- Keep the business language and success metrics.
- Port useful SQL viz queries and data dictionary concepts (modernized).
- The proposed structure in old `docs/NEW_REPO_STRUCTURE.md` was already directionally excellent (FastAPI + frontend separation, MCP servers, services/repos). We are realizing a version of it.
- Discard Streamlit entirely, the massive custom ETL complexity (DuckDB makes many precomputes unnecessary or trivial), and the config bloat.

## Open Decisions / Future ADRs
- Exact vector store (Chroma vs LanceDB vs DuckDB native vs pgvector later).
- Agent framework (PydanticAI vs LangGraph vs custom MCP + LLM loop).
- Profile document quality bar and templating approach.
- How "My Company" stance is initially populated (UEI pull via MCP + manual curation + web intel).
- Desktop wrapper (Tauri vs pywebview vs "just use the browser tab" + shortcut).
- Multi-user / team sharing (Postgres + auth later? or file-based sync?).

Record significant decisions as ADRs in `docs/adr/`.

---

This is a living document. Update as we implement and learn.
