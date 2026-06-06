# Capture Insights — Roadmap & Future Features

**Status**: Living document. Updated as we ship small focused chunks and as new ideas surface.  
**Core Rule**: We ship the data foundation + immediately useful dashboard/visibility/actions first. Everything else is documented here so the big picture stays visible without bloating current work.

## Guiding Principles (Non-Negotiable)

- Data foundation and trustworthy visibility into total market potential is priority #1.
- Small, focused, high-leverage chunks only. No vibe bloat.
- Plain language, non-expert friendly, educational persistence everywhere.
- Contextual actions that make sense for the current view (no generic buttons everywhere).
- Local-first, privacy-first, public + free data sources primary (USASpending bulk + MCPs when useful).
- Accumulators (pipeline, brain/wiki) compound user knowledge and become seeds for higher layers.
- Every number and action should carry citations/provenance back to source.
- Theme: dark vibrant cyber/glass/neon (Ariadne/Theseus inspired) with useful tooltips.

Current phase (as of June 2026): Core data (bulk historical in single DuckDB) → clean typed queries → modern React dashboard with internal contextual tabs → basic accumulators (pipeline + brain) → holistic resizable floating chat → **button/embedded agentic actions** (click e.g. on expiring → LLM+MCP creates smart SAM monitor with citations) + **app-managed warmup** (MCP catalog + Ollama model at lifespan/CLI start so fewer manual terminal commands). Chat is integrated co-pilot for open work (supplemental for admin tasks).

## Current State (High Level)

- Single DuckDB (`data/capture.duckdb`) populated from 10-year USASpending bulk (prime + sub, all actions, no early NAICS filter).
- FastAPI backend with plain-English query functions and `/data/*` endpoints (kpis, flows, agency-intensity, expiring, vehicles, geo, market_potential, etc.).
- React + TypeScript + Tailwind + custom glass/neon theme frontend.
- Sidebar navigation (Dashboard with 7 internal tabs, Pipeline+Brain, future MCP Tools / Skills / Settings).
- **Contextual actions** (key recent improvement):
  - `+ pipeline` only on Future Opportunities / Combo tabs.
  - `+ brain / wiki` on Competitive Analysis (recipients) and Agency Intelligence (agencies). These accumulate notes + citations and "make the brain smarter".
- Resizable, always-available floating AI co-pilot pane (no separate chat page) with live injected context (current NAICS, active tab, loaded stats, pipeline/brain counts).
- Pipeline + Brain view shows both accumulators together with provenance.
- Top command bar is currently NAICS-focused (defaults to 561210, supports comma-separated).

See also:
- `docs/ARCHITECTURE.md`
- `docs/DATA_PIPELINE.md`
- `docs/UI_THEME.md`
- `docs/data-dictionary-plain-english.md`
- `docs/future-skills-ideas.md` (post-processing skills)
- `README.md` (Ariadne Thread synergy section with the 5 highest-value "baby out of the bath water" concepts)

## Recently Completed (Small Focused Wins)

- Recentered agentic + warmup (per explicit user clarification): Buttons (not chat) as primary activator for agent tasks — e.g. "Create SAM monitor (smart)" on expiring rows uses shared LLM + optional MCP to build smart params/rationale/citation then persists via normal accumulator. Shared llm.py + warmup helper extracted. Lifespan now pre-warms MCP catalog + Ollama model (logs + cache); health/CLI/docs updated for "app start warms, fewer manual windows". Light text/docs adjustments to promote buttons + keep chat as holistic co-pilot. All small, reuse-heavy, per-tab sensible, citations preserved. (See session plan.md for the approved assessment + exact changes.)
- Tab context discipline: actions now match the meaning of each view (no more indiscriminate +pipeline on competitors).
- Brain/Wiki accumulator as first-class counterpart to Pipeline (directly supports "if we come across a new competitor we can click that button and it would run like a competitive intel research or add to an existing wiki").
- **Real persistence for Pipeline + Brain**: on-disk JSON (`data/user_accumulators.json`) + backend endpoints + full frontend wiring (add, delete, edit notes, compounding on re-add for brain). The accumulators now survive everything and the "wiki gets smarter" is durable.
- Holistic floating chat made resizable + larger + context-rich (drag handle + maximize; suggested actions that actually mutate state).
- Insight callouts + plain-language "why this matters for capture" in every tab so the views have real utility beyond raw tables.
- Backend query improvements for better agency names in early data slices.

## Near-Term Next Steps (Recommended Small Chunks — Prioritized)

These are the things we should tackle in the next 1-3 focused sessions while bulk ingest continues and the current UI gets polished.

1. **Persist Pipeline & Brain accumulators (Highest leverage — DONE)**
   - Real on-disk persistence implemented: `data/user_accumulators.json` (created on first add).
   - Backend module + endpoints (`/user/accumulators`, POST /user/pipeline, POST /user/brain with compounding logic, DELETE, PATCH note, /clear).
   - Frontend fully wired: load on start, add/remove/note update all go through server then re-sync state. Delete buttons + editable notes in the Pipeline+Brain view.
   - Compounding for brain (re-adding same name+type appends notes/citations) lives in the backend so the wiki truly "gets smarter".
   - Falls back gracefully if backend not reachable.
   - This was the chosen next after documenting the flexible search bar. It makes the contextual actions actually durable and compounds the knowledge layer immediately.
   - The JSON file is simple, inspectable, and lives next to your DuckDB. Migration to DuckDB tables can happen later if desired.

2. **Richer chat grounding (thin real backend support)**
   - Current chat is excellent context injection + smart stub responses + action triggers.
   - Add a real (even if simple) `/chat` endpoint that can:
     - Receive current app state (naics, activeTab, kpi snapshot, brain items, etc.).
     - Return responses that reference actual loaded data + brain entries.
   - Optional: very light retrieval over recent rows or brain notes.
   - This makes the always-on co-pilot feel substantially more useful without building a full agent yet.

3. **One stronger derived view / combo (e.g. "My Focus" or "Watch List")**
   - A new small tab or section that automatically surfaces high-value intersections:
     - Expiring contracts in agencies or from recipients that are in the user's Brain.
     - High-intensity agencies where the user already has brain entries.
   - This turns the manual accumulators into automatic "smart alerts" and gives immediate daily value.

4. **Future Opportunities + SAM.gov MCP Hybrid (Current focus)**
   - Enhance the "Future Opportunities" tab (currently basic expiring list from USASpending + pipeline).
   - Use USASpending historical to identify recompete cycles (known buyers, vehicles, incumbents, $ patterns).
   - Use that to proactively "get ahead" of SAM.gov: seed searches/monitors for RFIs, Sources Sought, Special Notices, eventual RFPs/solicitations on those exact cycles.
   - SAM.gov side fills the "new" : Commercial Solutions Openings (CSOs), Open Solicitations, OTAs, brand new traditional FAR requirements that have no clean historical cycle yet.
   - Features: Live SAM search in the tab (keywords + notice types), results table with direct links, "+ pipeline", and "Create SAM Monitor" (saves search params + generates ready SAM search URL to Pipeline/Brain for recurring tracking).
   - Cross-refs: From an expiring row, one-click "Search SAM for this" to prefill (using agency/NAICS/recipient keywords).
   - Future: Full sam-gov-mcp client (instead of or in addition to direct API), saved "Monitors" as first-class accumulator, chat suggests "based on this expiring in hot agency, here are 3 matching live SAM notices — monitor them?", auto-generate monitors from brain + expiring intersections.
   - Backend: /mcp/sam/opportunities endpoint (direct for now, using SAM_API_KEY from .env; prepared for MCP tools).
   - This creates the full "predictable historical cycles + live/emerging discovery" funnel for capture.

5. **Button/Embedded Agentic for Concrete Admin Tasks + App-Managed Warmup (Recentered per user clarification) — In progress (small chunks)**
   - User clarification: "I guess i didnt mean that my only interface for agentic will be through the ai chat. I meant like when i go to place and find something that needs to be done i can click a button and that will acivate the agent to complete the task or it will be accomplishe as an embedded piece of the rendering or retrival. so if i find an recurring contractgin experiing in 12 months i can click create sam.gov monitor and that would create the monitor automatically with the llm or whatever. I like the idea of being abel to do stuff through the ai but that was a way down the road future idea."
   - "when our app is started it will also need to warmup the mcp servers and ollama model so we dont have to have multiple manually invoked startup commands in different window."
   - "Just assess, lets recenter ourselves before we go down and huge complicated build out where we lose sight of the goal."
   - Approach (small focused, reuse-heavy):
     - Primary "activate the agent" surface = contextual buttons in the correct tab (e.g. on expiring row in Future Opportunities: "Create SAM monitor (smart)"). The backend action runs LLM (shared client) + optional MCP search to produce smart keywords/notice_types + rationale + citation (back to the exact expiring award_key or SAM result), then persists via the normal accumulator (rich sam-monitor entry with monitorUrl). FE shows loading + success echo + immediate "My SAM Monitors" update.
     - Embedded: hot-recompete combos or insight areas can surface recommended agent-created monitors.
     - Chat remains the holistic always-on co-pilot for open questions, overlaps, "what to watch" — valuable and kept, but not the *only* or *primary* for defined admin tasks (reverted strong "escape hatch / primary is co-pilot" messaging).
     - Warmup at start: lifespan now pre-calls MCP catalog (pays uvx spawn cost early + populates cache) and Ollama model load (list + tiny generate). Health/ logs reflect "warmed". CLI serve enhanced with flag + notes. Result: one (or two) commands bring a ready workstation; no mandatory separate `uvx` or model-load windows for normal button/agent use (on-demand still works as before).
   - Reuses (no bloat): add_to_pipeline + user accumulators, mcp search/list + existing /mcp/sam hybrid, profile_generator LLM pattern (now extracted to shared llm.py + warmup helper), expiring query shape + current URL builder logic, FE add/sync + table render, lifespan/health skeleton.
   - Status: Chunk 1 (smart button + action + shared llm + FE wiring + light text) + basic Chunk 2 (lifespan pre-warm + comment/docs updates for "no manual") landed. See plan.md in session for full verified steps + file list. Next: fuller docs recenter (ROADMAP/ README/ARCHITECTURE) + verification run + commit.
   - Future (documented, not now): deeper chat agentic loops, persistent MCP child procs, auto-suggest on render, "My Focus" view that uses the new smart monitors + brain + intensity, cloud LLM option, full process manager for "one binary starts everything".

   (The prior chat-heavy "agentic foundation" work is retained as a useful supplemental path and for power users, but recentered per the explicit clarification above.)

6. **Command bar polish (while keeping it NAICS-focused for now)**
   - Quick suggestions / recent NAICS chips.
   - "Apply current tab's top agency/recipient as temporary lens" (client-side filter on already-loaded data, no full re-scope yet).
   - Better loading / error states and a "data freshness" indicator (how many chunks ingested, date range covered).

7. **Basic education / tooltip persistence improvements**
   - Wire more of the existing `data/education/tooltips.json` into the React UI (info icons on the new insight boxes, on the +brain buttons, etc.).
   - Add a couple "why this number changed" notes when data is partial.

Do these one at a time. Ship, use, then pick the next.

## Future Features & Ideas (Documented — Do Not Build Yet)

This section captures ideas that are valuable for the end-state vision but are explicitly **not in scope for the current data + dashboard foundation phase**.

### Flexible Global Search / Context Bar (Agency, Competitor, NAICS, Keyword) — High Priority Future

**Current limitation (as of now)**: The top search/command bar is NAICS-only. Default view is correctly based on the user's main NAICS (561210), with support for multiple. All dashboard tabs, KPIs, flows, intensity, expiring, etc. filter by the selected NAICS codes.

**Future desired behavior** (add when core is solid):
- The bar evolves into a smart, multi-dimensional "Scope + Search" control.
- User can enter (or select from suggestions):
  - NAICS code(s) — current behavior, remains the default starting point.
  - Agency / customer name (e.g. "Department of Energy", "DOD", "Federal Acquisition Service", "Department of Veterans Affairs").
  - Competitor / Recipient name (e.g. a prime the user sees in the Competitive tab, or a company they want to understand as potential teammate or threat).
  - Free-text keywords or solicitation-like phrases.
- When the scope changes, **all data insights update** to reflect the new lens:
  - Market Overview / KPIs become "spend and activity for this agency in my relevant NAICS" or "total captured by this competitor across the market".
  - Flows, agency-intensity, expiring, vehicles, geo, and combo views re-compute for the selected scope.
  - "Future Opportunities" shows recompetes relevant to that agency or held by that competitor.
- Data sources for the scoped view (hybrid):
  - Primary / fast: the local DuckDB bulk data (historical depth).
  - Live / gaps / forward-looking: federal-contracting-mcps (SAM.gov for entity info, additional usaspending queries for long-tail or recent actions, BLS for pricing context, etc.).
  - Knowledge overlay: the local Brain/Wiki accumulator (user's own accumulated notes, citations, and research on that exact agency or competitor) becomes first-class context and can be shown alongside the quantitative data.
- Ability to combine scopes (e.g. specific NAICS + one agency, or one competitor + "show me the agencies they win with most").
- "Reset to my main market (561210)" easy one-click.
- Results remain citable (every number traces back to specific bulk rows, MCP call, or brain entry + timestamp).

**Why this is powerful for the job**:
- "I need to deeply understand this one customer (agency) right now" — without losing the overall market picture.
- "Watch this specific competitor" — instantly see their footprint, concentration risk, agencies they dominate, expiring work they currently hold, plus anything the user has already researched and saved in the brain.
- Turns the dashboard from "filter the whole market by NAICS" into a true "investigative lens" tool for customers and players.
- Directly feeds the higher Ariadne-style layers (living packets can be initialized from a scoped view + brain entries; command & control can have "pinned watches" on key agencies/competitors).

**Status**: Documented here. **Do not implement now.**  
The current NAICS command bar + the per-tab +brain/wiki accumulators are the correct short-term foundation. The flexible search will be much more powerful (and the implementation cleaner) once we have:
- Solid persistence for brain/wiki entries.
- Good citation/provenance discipline.
- Experience using the current contextual views so we know what "good scoped output" looks like.
- Some MCP wiring for the live enrichment part.

When we are ready, this feature will likely touch:
- Frontend command bar (typeahead + chips for current scope, history of recent scopes).
- Backend query layer (more flexible filtering by agency name/uei, recipient name, plus MCP orchestration for on-demand enrichment).
- Chat context (the co-pilot should know the current scope and be able to answer "tell me more about this agency using the brain + latest SAM data").
- The Brain/Wiki itself becoming queryable context.

### Other Future Areas (High Level)

- **Knowledge Layer / Structured Wiki Vault** — The Brain/Wiki accumulator (currently local state that we will persist) grows into a first-class, searchable, citable knowledge base. MCP research and user notes get appended with provenance. This becomes a major input to the global chat and future skills. (See Ariadne "Knowledge Layer" mapping in README.)
- **MCP Integration** — Hybrid bulk (depth) + live MCP calls (freshness, entity details, solicitations, long contracts that bulk might miss). Start with high-value ones (SAM, additional usaspending) only when the core data explorer is daily-useful.
- **Review Gates + Provenance Discipline** — Nothing added to pipeline/brain (or later packets) is "trusted" without explicit user review/accept. Full audit trail.
- **Training Data Collection** — While using the system, automatically (or with one click) log good examples (scoped views + final notes + outcomes) as JSONL for eventual fine-tuning of specialized capture models (Qwen or other, local 8GB VRAM friendly).
- **Skills / Post-Processing Deliverables** — See dedicated `docs/future-skills-ideas.md` (huashu-design style visuals, full profiles, IGCE, teaming recommender, competitor ghosting, weekly briefs, etc.). The core must produce clean, citable "insight packages" first.
- **Advanced Visuals & Interaction** — Real interactive scatter (intensity), proper Sankey flows, maps, brushing/linking across tabs, "add this combo as a watch".
- **Ariadne Thread Synergies** (higher vision, not current scope) — Living Packet as accumulation of data elements + triggers from our queries/brain; Command & Control / Portfolio Pulse via the dashboard + global elements + chat; Federal Data MCP + bulk hybrid spine; Knowledge Layer / LLM-wiki vault. We take only the highest-leverage concepts ("baby out of the bath water") without copying the old repo.
- **Profile / Capability Loading** — Bring in user's own past performance (UEI history) so suitability, synergy, win-rate signals, and "my share" become real instead of stubs.
- **Scheduling / Automation** — Scheduled "refresh my watches" or "weekly market pulse" that updates brain entries and notifies.

## How We Decide What to Build Next

1. Does it make the current data + dashboard meaningfully more useful for real capture work today?
2. Is it a small focused chunk (can be understood, implemented, and tested in one or two sessions)?
3. Does it strengthen the accumulators, citations, or context that future features (including the flexible search above) will rely on?
4. Is the idea documented here first?

We explicitly avoid building "just because it's cool" or re-creating the bloat from the old Data_Insights / ariadne-thread experiments.

---

**Next action after reading this doc**: The team (or user + AI) picks the top 1 item from Near-Term, ships it, updates this doc with what was learned, then repeats.

Document created June 2026 based on live conversation feedback. Update freely as priorities shift, but always keep the "small focused + data first" discipline.