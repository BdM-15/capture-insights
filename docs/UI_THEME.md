# capture-insights UI Theme & Design System

**Goal**: A dark, vibrant, cyber-professional aesthetic that feels like a serious capture workstation while being fun and scannable for BD/capture managers. Draws inspiration from (but does not copy) two of your prior projects:

- **Ariadne Platform** (ariadne_ui_concept_v2.html): Command-center feel, glassmorphism, neon cyan/magenta/lime accents with glows, holographic effects, top command bar, icon tiles, status indicators, pursuit/opportunity cards with hover lift.
- **proj-theseus** (Capture Workbench): Exact token system and component patterns (see its `STYLE_GUIDE.md`), zero-build philosophy for prototypes (Tailwind CDN + Alpine or vanilla), strong use of CSS custom properties + rgb triplets for transparency/glows, clean sidebar/nav groups, metric cards, pills, icon tiles, educational/operational clarity.

This theme is implemented first in the **thin self-contained dashboard** (served at `GET /` from FastAPI for immediate visibility while bulk data loads). It will be fully realized (with cross-filtering, real interactive charts, actions, etc.) in the medium-term React frontend (`/frontend`).

## Core Palette (Neon + Ink)

Defined as CSS custom properties (see current implementation in `backend/app/main.py` dashboard HTML and future `frontend/` files).

```css
:root {
  --bg: #0a0a12;                 /* Deep cyber black */
  --card: #16161f;               /* Card surface */
  --glass: rgba(22, 22, 31, 0.88); /* Glassmorphism */
  --border: #1f1f2e;
  --edge-strong: #2c3a5e;

  --text: #e0e0ff;
  --muted: #a0a0c0;

  /* Vibrant neon accents (use sparingly for emphasis + glow) */
  --neon-cyan: #00f0ff;
  --neon-magenta: #ff2bd6;
  --neon-lime: #00ff9c;
  --neon-amber: #ffb020;
  --neon-red: #ff3b6b;

  /* RGB triplets for rgba() transparency + glows (critical for consistency) */
  --neon-cyan-rgb: 0, 240, 255;
  --neon-magenta-rgb: 255, 43, 214;
  /* ... add others as needed */
}
```

**Usage rules** (from Theseus STYLE_GUIDE):
- Prefer `var(--neon-cyan)` over hard hex.
- For glows/transparency: `rgba(var(--neon-cyan-rgb), 0.25)`
- Box-shadow glow example: `0 0 18px rgba(var(--neon-cyan-rgb), 0.25)`
- Text neon: `color: var(--neon-cyan); text-shadow: 0 0 6px rgba(var(--neon-cyan-rgb), 0.5);`

## Key Component Patterns (Carry Over to React)

- **Glass cards**: `.glass` + `.card` with hover `translateY(-2px)` + subtle cyan glow.
- **Metric / KPI cards**: Big `font-variant-numeric: tabular-nums`, colored left border or accent, icon tile on side, `metric-label` in muted caps.
- **Nav pills**: Rounded, active state with neon border + background tint.
- **Section headers**: Uppercase tracking, icon + title, subtle bottom border.
- **Flow / intensity visuals**: Use neon gradients for bars, colored nodes in diagrams (Mermaid or Cytoscape/Recharts later).
- **Status / pills**: Small mono badges with neon color variants (lime for positive, amber for attention, magenta for actions).
- **Command / top bar**: Fixed glass header with brand gradient logo, search/input, actions, user tile (Ariadne/Theseus style).
- **Holographic / scanline** (subtle, optional): For hero or important cards.
- **Cyber grid** background (very light): For depth without clutter.
- **Icons**: Font Awesome (current thin) or Lucide (Theseus preference) — consistent set for charts, actions, info.

## Educational / Learning Layer (Tooltips + Persistence)

You specifically liked the idea of the UI teaching the user (always-learning capture manager).

**Current (thin prototype)**:
- `fa-info-circle` icons next to labels/KPIs/sections.
- `title=` attributes with manager-focused explanations ("For BD/Capture: ... Use this to ... Prioritize by $ and fit...").
- Notes under sections explaining stubs, data limitations, and "what becomes possible with more years / your data".

**Planned persistence (medium-term React, low priority for thin now)**:
- A toggle or persistent "Education mode" / help drawer.
- Central `tooltips.json` or `education/` data (so the same explanations live in thin + React + future profile generator).
- On hover or click: richer popovers with examples, "how to act" steps, links to related sections.
- "Why this chart matters" callouts that can be dismissed but remembered per-user (localStorage or user profile later).
- Examples: "High-intensity agencies are where volume + dollars are both above median — these are the ones worth a dedicated pursuit team and early customer calls."

This turns the dashboard into on-the-job training without getting in the way of power users.

## Short-term vs Medium-term Guidance (per your note)

You are comfortable saving bigger interactive/UX features (full cross-filter charts, "Add these hot agencies to pipeline" actions, richer persistent education UI, drag-to-reorder, saved views, etc.) for the **medium-term React build**.

**Agreement**: Yes — we will keep the thin dashboard as a **lightweight, zero-friction live data explorer** for now. It gives immediate visibility into whatever bulk chunks you've ingested so far (perfect while the long 2-day download runs externally).

We will **not** invest heavy effort into complex interactivity or new UI patterns in the thin layer that would be rebuilt anyway.

**What we can still do lightly in short-term (low throwaway risk)**:
- Minor polish + bugfixes on the current thin view.
- New backend query endpoints (these are reusable by React later and improve the current data explorer).
- Document the theme tokens + education texts centrally (see this file + planned `frontend/theme-tokens.css` + `data/education/tooltips.json`).
- Keep the current level of inline educational tooltips (cheap and valuable today).

**Medium-term (React in /frontend)** will be where we go all-in on:
- Proper component library using the exact Theseus tokens + Ariadne flair.
- Real interactive charts (Recharts / Plotly / D3) with cross-filtering.
- Actionable UX: "Add to pipeline", one-click briefs, etc.
- Richer education system (persistent, contextual, maybe integrated with the AI agent).
- Full sections matching the powerful old Data_Insights structure but modernized and actually usable for daily capture work.

## React Design System (implemented)

**Single source of truth:** `frontend/src/index.css` (tokens + components) + `frontend/tailwind.config.js` (utility aliases).

### App shell (three tiers)

1. **Topbar** — brand, NAICS search, API health pill, pipeline/brain badges, Refresh, Chat toggle
2. **Sidebar** — grouped nav: INTELLIGENCE / WORKFLOW / TOOLS / SYSTEM
3. **Section bar** — gradient title + mono subtitle + per-view status + Refresh
4. **Panel canvas** — scrollable content area with subtle aurora (balanced ~30% Theseus intensity)

Shell components: `frontend/src/components/shell/`. View metadata: `frontend/src/constants/viewMeta.ts`.

### Surface system (unified card/island/glass)

- `.surface` — base panel (gradient fill, edge border)
- `.surface-accent-{cyan|magenta|lime|amber|purple}` — left neon stripe
- `.surface-hover` — lift + glow on hover
- Legacy `.glass` / `.island` still work; `.island` now delegates to `.surface`

### Reusable components

| Component | Path | Use |
|-----------|------|-----|
| `Surface` | `components/ui/Surface.tsx` | Panels everywhere |
| `Button` | `components/ui/Button.tsx` | primary / soft / ghost + pipeline/brain/vault |
| `MetricCard` | `components/ui/MetricCard.tsx` | KPI strips |
| `StatusPill` | `components/ui/StatusPill.tsx` | API health, stages |
| `TabBar` | `components/ui/TabBar.tsx` | Dashboard secondary nav |
| `EntryRow` | `components/lists/EntryRow.tsx` | Vault/wiki list rows |
| `DataTable` | `components/lists/DataTable.tsx` | Standardized data tables |
| `EmptyState` | `components/ui/EmptyState.tsx` | Zero-data panels with CTAs |
| `Toast` | `components/ui/Toast.tsx` | Action confirmations |
| `AskCoPilotButton` | `components/ui/AskCoPilotButton.tsx` | Data→chat golden threads |
| `BrainEntryCard` | `components/lists/BrainEntryCard.tsx` | Vault brain entry cards |
| `CHART` | `constants/chartTheme.ts` | Recharts/Plotly shared colors |

### Semantic accent rules

- **Cyan** — data, intelligence, primary actions
- **Magenta** — opportunities, intensity, workflow tools
- **Purple** — Knowledge Vault, brain, wiki
- **Lime** — success, live status, system
- **Amber** — attention, vision stubs

### Coding rules

- **No hardcoded hex in TSX** — use Tailwind `ink-*`, `neon-*`, `edge`, `text-*` or CSS vars
- Mono uppercase labels for operational text (`text-[10px] tracking-[0.18em] font-mono`)
- Tabular nums on all metrics and tables
- Motion on chrome and feedback only — not data tables (`prefers-reduced-motion` respected)

## Current Implementation Notes

- **Primary UI:** React SPA in `frontend/` (Vite + Tailwind + Recharts/Plotly), served at `http://127.0.0.1:8000` when built.
- **Thin fallback:** `backend/app/main.py` `simple_dashboard()` — legacy; tokens not synced (low priority).
- **Monolith:** `App.tsx` still holds page logic; shell + shared components extracted incrementally.

---
Maintained as the single source of truth for visual direction. Update this file when tokens or patterns change.