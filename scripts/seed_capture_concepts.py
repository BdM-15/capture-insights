#!/usr/bin/env python3
"""Seed atomic Karpathy-style concept pages for capture-insights glossary terms.

Each dashboard label/signal gets its own .md under:
  data/knowledge/global/global_wiki/capture/concepts/

Run from repo root:
  python scripts/seed_capture_concepts.py
"""
from __future__ import annotations

import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOSSARY_TS = ROOT / "frontend" / "src" / "constants" / "captureGlossary.ts"
CONCEPTS_DIR = ROOT / "data" / "knowledge" / "global" / "global_wiki" / "capture" / "concepts"
INDEX_PATH = ROOT / "data" / "knowledge" / "global" / "global_wiki" / "capture" / "capture-insights-index.md"
LEGACY_GLOSSARY = ROOT / "data" / "knowledge" / "global" / "global_wiki" / "capture" / "capture-insights-glossary.md"

# MOC grouping for the index page
CATEGORIES: dict[str, list[str]] = {
    "Market overview": [
        "market-tam",
        "market-momentum",
        "market-concentration",
        "future-funding",
        "recompete-radar",
        "hot-agency-recompete",
        "match-lens",
        "suitability",
        "synergy",
        "follow-the-money",
        "sam-live-discovery",
        "capture-intensity",
        "set-aside-mix",
        "extent-competed",
    ],
    "Agency intelligence": [
        "hot-agency",
        "qual-gate",
        "customer-position",
        "relationship-heatmap",
    ],
    "Competitive analysis": [
        "competitor-posture",
        "strategy-lens",
        "gap-fill-teaming",
        "teaming-fit",
        "shared-buyers",
    ],
    "Contract vehicles & pricing": [
        "buying-posture",
        "idiq-task-orders",
        "vehicle-concentration",
        "vehicle-holders",
        "access-lens",
        "pricing-buckets",
        "firm-fixed-pricing",
        "non-fixed-pricing",
        "dominant-flexible-type",
        "pressure-tier",
        "agency-shape-gate",
        "shape-target-gate",
        "ffp-shaping-radar",
    ],
    "Geographic analysis": [
        "place-of-performance",
        "geo-concentration",
        "state-quadrant",
        "pursuit-lens",
    ],
    "Combo insights": [
        "combo-tier",
        "combo-signals",
    ],
}

APP_LOCATIONS: dict[str, str] = {
    "market-tam": "Market Overview → Market Pulse → Total Market (TAM)",
    "market-momentum": "Market Overview → Market Pulse → Momentum",
    "market-concentration": "Market Overview → Market Pulse → Competitive Field",
    "recompete-radar": "Market Overview → Market Pulse · Future Opportunities → Recompete Radar",
    "future-funding": "Market Overview → Future Funding Potential · Funding at Risk chips",
    "hot-agency-recompete": "Market Overview → Future Funding → Hot-Agency Recompetes",
    "match-lens": "Market Overview → Future Funding → Match Lens (Future)",
    "suitability": "Market Overview → Executive Summary → Suitability",
    "synergy": "Market Overview → Executive Summary → Synergy",
    "hot-agency": "Agency Intelligence · Market Overview intensity tables (★)",
    "follow-the-money": "Market Overview · Competitive Analysis → Money Flows",
    "sam-live-discovery": "Future Opportunities → Live SAM Discovery",
}


def parse_glossary_ts() -> list[dict]:
    text = GLOSSARY_TS.read_text(encoding="utf-8")
    block_re = re.compile(
        r"(\w+):\s*\{\s*label:\s*'((?:\\'|[^'])*)',\s*tip:\s*'((?:\\'|[^'])*)',"
        r"\s*vaultPath:\s*[^,]+,\s*vaultAnchor:\s*'([^']+)'",
        re.DOTALL,
    )
    entries = []
    for m in block_re.finditer(text):
        key, label, tip, anchor = m.group(1), m.group(2), m.group(3), m.group(4)
        tip = tip.replace("\\'", "'")
        label = label.replace("\\'", "'")
        entries.append({"key": key, "label": label, "tip": tip, "anchor": anchor})
    return entries


def related_links(anchor: str, all_anchors: set[str]) -> list[str]:
    links = ["[[capture-insights-index]]"]
    for _cat, anchors in CATEGORIES.items():
        if anchor in anchors:
            for a in anchors:
                if a != anchor and a in all_anchors:
                    links.append(f"[[{a}]]")
            break
    return links[:6]


def render_concept(entry: dict, all_anchors: set[str]) -> str:
    anchor = entry["anchor"]
    label = entry["label"]
    tip = entry["tip"]
    app_loc = APP_LOCATIONS.get(anchor, "Capture Insights dashboard (contextual label)")
    related = "\n".join(f"- {lnk}" for lnk in related_links(anchor, all_anchors))
    today = date.today().isoformat()
    slug_id = anchor.replace("-", "_")
    return f"""---
name: "{label}"
type: concept
id: global-concept-{slug_id}
entity_type: capture-signal
source_module: capture-insights
tags: [capture-insights, glossary]
last_updated: "{today}"
---

# {label}

> One atomic concept page (Karpathy LLM wiki). Hover the **info** icon in the app for the short tip; this page compounds context over time.

## What it means

{tip}

## In the app

{app_loc}

## Key signals from USASpending

- Grounded in the current NAICS-filtered dashboard slice (bulk history + KPI endpoints).
- Re-ingest or widen NAICS to refresh; never treat a single snapshot as permanent truth.

## Synthesis / analysis

Use this signal with vault entries ([[customer-position]], competitive posture, vehicles) before advancing capture resources. Append dated notes below as you learn.

## Open questions / next actions

- What threshold would change your pursue / monitor / defer decision for this signal?
- Which [[brain/]] agency or competitor entries should link here after your next +brain action?

## Related

{related}

## Added/Updated {today}

- Seeded from `captureGlossary.ts` via `scripts/seed_capture_concepts.py`.
"""


def render_index(all_anchors: set[str]) -> str:
    today = date.today().isoformat()
    sections = []
    for cat, anchors in CATEGORIES.items():
        lines = [f"### {cat}", ""]
        for a in anchors:
            if a in all_anchors:
                lines.append(f"- [[{a}]]")
        sections.append("\n".join(lines))
    body = "\n\n".join(sections)
    return f"""---
name: Capture Insights Concepts Index
type: index
id: global-capture-insights-index
source_module: capture-insights
last_updated: "{today}"
tags: [capture-insights, index, moc]
---

# Capture Insights — Concept Index

Map of content (MOC) for dashboard labels and signals. **One concept = one file** under `concepts/` — not a single monolithic glossary. Follows `data/knowledge/schema/capture-llm-wiki.md` (Karpathy LLM wiki pattern).

Click **vault** beside any in-app label to open the matching concept page.

{body}

## How this vault stays organized

1. **Atomic pages** — each signal/concept is its own `.md` with wikilinks.
2. **This index** — LLM and humans navigate from here; update when adding terms.
3. **Schema** — `data/knowledge/schema/capture-llm-wiki.md` defines frontmatter and append-only updates.
4. **Regenerate** — `python scripts/seed_capture_concepts.py` refreshes stubs from `captureGlossary.ts` (won't overwrite your appended sections).

## Added/Updated {today}

- Reorganized from monolithic glossary into `concepts/` + this index.
"""


def render_legacy_redirect() -> str:
    today = date.today().isoformat()
    return f"""---
name: Capture Insights Glossary (legacy redirect)
type: index
source_module: capture-insights
last_updated: "{today}"
---

# Capture Insights Glossary

**This page moved.** Each term now has its own atomic concept file.

→ Start at **[[capture-insights-index]]** (`concepts/` folder).

Monolithic glossaries don't scale in the Karpathy LLM wiki pattern — linked atomic pages do.
"""


def main() -> None:
    entries = parse_glossary_ts()
    if not entries:
        raise SystemExit(f"No glossary entries parsed from {GLOSSARY_TS}")

    CONCEPTS_DIR.mkdir(parents=True, exist_ok=True)
    all_anchors = {e["anchor"] for e in entries}

    written = 0
    for entry in entries:
        path = CONCEPTS_DIR / f"{entry['anchor']}.md"
        content = render_concept(entry, all_anchors)
        if not path.exists() or path.read_text(encoding="utf-8")[:80] != content[:80]:
            path.write_text(content, encoding="utf-8")
            written += 1

    INDEX_PATH.write_text(render_index(all_anchors), encoding="utf-8")
    LEGACY_GLOSSARY.write_text(render_legacy_redirect(), encoding="utf-8")

    print(f"Seeded {len(entries)} concepts ({written} written/updated) → {CONCEPTS_DIR}")
    print(f"Index → {INDEX_PATH}")


if __name__ == "__main__":
    main()