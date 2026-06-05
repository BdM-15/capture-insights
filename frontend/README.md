# capture-insights Frontend

Modern React + TypeScript + Vite + Tailwind + shadcn/ui (or equivalent) local web app.

Served alongside (or proxied to) the FastAPI backend on localhost for a seamless workstation experience.

## Planned Tech
- Vite + React 18/19 + TS
- Tailwind + shadcn/ui (or radix + lucide) for professional, accessible components
- TanStack Query + Table for data
- Recharts or Chart.js or Plotly.js for interactive viz (trends, treemaps, geo, etc.)
- Date pickers, multi-selects, powerful filters with URL sync or local state
- Nice data table with row actions ("Generate Profile", "Add to Pipeline", "View Incumbent")
- Side or modal chat for AI Data Agent
- Profile preview + one-click DOCX/PDF/MD export

## Dev (once scaffolded)

```bash
cd frontend
npm install   # or pnpm / yarn
npm run dev   # http://localhost:5173
```

Backend expected at http://localhost:8000 (configure Vite proxy or env).

## Current Status
Scaffold placeholder. Real implementation starts after backend health + first data endpoints are live.

See root README and docs/ for overall architecture and v1 scope (core dashboard + filters + viz + grounded chat + basic profile export).
