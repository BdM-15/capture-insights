# capture-insights Frontend

**Modern React + TypeScript + Vite + Tailwind local web app** for the full capture manager experience.

This will be the medium-term home for the rich, interactive, actionable dashboard (cross-filtering, real charts including intensity scatter + proper Sankey flows, "add hot agencies / expiring to pipeline" actions, richer persistent education/tooltips, etc.).

The thin self-contained dashboard at the FastAPI root (`/`) remains the zero-friction live explorer while bulk data grows.

## Theme Consistency (Ariadne + Theseus family)

We are aligning the visual language across your capture tools:

- Deep cyber bg + glassmorphism
- Neon accents: cyan (#00f0ff primary), magenta (#ff2bd6), lime, amber
- Strong use of CSS custom properties + rgb triplets for glows/transparency (see `docs/UI_THEME.md`)
- Icon tiles, pills, hover lifts, subtle holographic/scan effects
- Educational layer (tooltips + "why this matters for capture" + how to act)

Tokens and patterns are documented in `docs/UI_THEME.md` (extracted from the current thin prototype + Theseus STYLE_GUIDE + Ariadne concept).

When the React work starts in earnest we will:
- Extract `frontend/src/styles/theme.css` (or tokens) as the single source.
- Use the exact component patterns (`.card.glass`, `.btn-*`, `.icon-tile`, nav pills, etc.).
- Port + enhance the current sections (Market Overview, Capture Intensity, etc.).

## Planned Tech
- Vite + React 18/19 + TS
- Tailwind (with our theme tokens)
- TanStack Query for data fetching from FastAPI `/data/*`
- Recharts / Plotly / D3 for the serious interactive viz (scatter with quadrants, real Sankey, geo, trends, vehicles)
- Powerful persistent filters (URL sync)
- Actionable rows / buttons ("Add these to my pipeline", "Generate brief from current view")
- Education that persists (tooltips, help drawer, contextual "learn" tied to the central `data/education/tooltips.json`)
- Later: chat, profile preview + export, etc.

## Dev (once scaffolded)

```bash
cd frontend
npm install   # or pnpm / yarn
npm run dev   # http://localhost:5173
```

Backend expected at http://localhost:8000 (configure proxy in vite.config).

## Current Status (as of latest)

Theme + basic dashboard concepts proven in the thin FastAPI-served version (with real bulk data).

Major new UX (interactive charts with actions, full education persistence, pipeline integration) is intentionally saved for this React layer per your preference — no heavy throwaway work on the thin prototype.

See `docs/UI_THEME.md` and `data/education/tooltips.json` for the foundation we're carrying forward.

See root README + conversation history for the overall plan (data first, then this dashboard, then profiles/chat/MCP/skills).

When you're ready to kick off the scaffold (even a minimal shell + theme + one ported view), let me know and we'll start the files.
