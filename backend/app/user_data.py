"""
user_data.py - Simple on-disk persistence for user accumulators (Pipeline + Brain/Wiki).

This is the real backing store for the contextual +pipeline and +brain/wiki actions.

Stored as a single small JSON file: data/user_accumulators.json
(kept alongside the main capture.duckdb for simplicity and easy inspection/backup).

The frontend talks to it via a few tiny FastAPI endpoints.
This makes the "brain gets smarter over time" actually survive sessions and be durable.

Future: we can migrate the storage to tables inside the same DuckDB if we want everything in one file,
or add sync/export, but JSON is the right small-first step.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

try:
    from . import llm as llm_client
except Exception:
    llm_client = None

USER_DATA_PATH = Path("data/user_accumulators.json")
BRAIN_DIR = Path("data/knowledge/brain")

def _ensure_parent():
    USER_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    BRAIN_DIR.mkdir(parents=True, exist_ok=True)
    # Solid Obsidian/Karpathy foundation README (created once). User points vault at data/knowledge/ for free rich wiki.
    knowledge_root = BRAIN_DIR.parent
    readme = knowledge_root / "README.md"
    if not readme.exists():
        try:
            readme.write_text("""# capture-insights Knowledge (Brain Wiki)

Native Obsidian + Karpathy-style LLM wiki foundation.

- All files are plain Markdown with [[wikilinks]] and frontmatter.
- Point your Obsidian vault at this `data/knowledge/` folder for instant backlinks, graph, search, and human editing.
- The app + LLM (via +brain buttons and agent actions like "Create SAM monitor (smart)") synthesize/append entries seeded from USASpending data insights (intensity, flows, expiring, citations) + your notes.
- Compounding: re-adding the same entity appends new sections + provenance instead of overwriting.
- Current: `brain/` (competitors + agencies). Structure is minimal but ready to grow to global_wiki/, pursuits/<slug>/wiki/, evergreen elements, etc. when you are ready for the full Obsidian/Karpathy LLM brain.
- Citations and provenance are preserved in every entry.

See the main app's Pipeline + Brain view and the data dashboard for the quantitative side that feeds this wiki.
""", encoding="utf-8")
        except Exception:
            pass

    # Light structure expansion (per the confirmed foundation sequence): prepare global/ and pursuits/
    # placeholders now so the folder tree is ready for when we bring in the fuller Obsidian/Karpathy
    # wiki (global seeds, per-pursuit wikis, more synthesis skills). Non-breaking; current brain/ stays the active accumulator substrate.
    for extra in ("global", "pursuits"):
        p = knowledge_root / extra
        p.mkdir(parents=True, exist_ok=True)
        r = p / "README.md"
        if not r.exists():
            try:
                if extra == "global":
                    r.write_text("""# Global Wiki (placeholder)

Prepared for future expansion of the Obsidian/Karpathy LLM brain.

- Will hold LLM-synthesized, cross-cutting entries seeded from the full USASpending dataset (intensity hot spots, flows, recompete patterns, recipient/agency signals) + citations.
- Not limited to explicit +brain clicks.
- Still plain .md + frontmatter + [[wikilinks]]; point the same Obsidian vault at data/knowledge/ to see it alongside brain/.
- When ready: buttons, agents, and chat will be able to contribute here for "evergreen" knowledge that compounds across pursuits.

Current foundation (brain/) is the solid base. This dir exists so the structure does not need rework later.
""", encoding="utf-8")
                else:
                    r.write_text("""# Pursuits (placeholder)

Prepared for future per-pursuit wiki folders (inspired by ariadne reference tiers).

- Example: pursuits/my-big-opp-123/wiki/ (or directly under the slug) will hold competitor notes, win themes, captured intel, SAM monitor outputs, and LLM-synthesized briefs specific to one pipeline item.
- Keeps context tight per opportunity while still linking ([[wikilinks]]) back to global brain/ entries.
- The Pipeline accumulator + per-pursuit folders will become a powerful paired system.

For now the main brain/ (and the light My Focus derived view) give the immediate value from your +brain and agentic button actions. Structure is here so expansion is just "fill in" not "re-architect".
""", encoding="utf-8")
            except Exception:
                pass

    # One-time hygiene for legacy dir from early foundation slice (agencys/ -> agencies/).
    # Safe move of .md files; old empty dir can stay or be removed by user.
    try:
        legacy = BRAIN_DIR / "agencys"
        target = BRAIN_DIR / "agencies"
        if legacy.exists() and legacy.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            for md in legacy.glob("*.md"):
                dest = target / md.name
                if not dest.exists():
                    md.replace(dest)
            # leave legacy dir (harmless); user can rmdir if empty
    except Exception:
        pass

def _load() -> Dict[str, List[dict]]:
    if not USER_DATA_PATH.exists():
        return {"pipeline": [], "brain": []}
    try:
        with open(USER_DATA_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
            return {
                "pipeline": list(raw.get("pipeline", [])),
                "brain": list(raw.get("brain", [])),
            }
    except Exception:
        # Corrupt or unreadable file -> start fresh but don't lose the day
        return {"pipeline": [], "brain": []}

def _save(data: Dict[str, List[dict]]):
    _ensure_parent()
    # Write atomically-ish
    tmp = USER_DATA_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp.replace(USER_DATA_PATH)

def get_accumulators() -> Dict[str, List[dict]]:
    """Return the current persisted pipeline and brain lists."""
    return _load()

def _assign_id(entry: dict, kind: str, existing: List[dict]) -> dict:
    if entry.get("id"):
        return entry
    base = entry.get("award_key") or entry.get("recipient") or entry.get("agency") or entry.get("name") or ""
    new_id = f"{kind}-{base}-{len(existing)}-{int(__import__('time').time()*1000)}"
    return {**entry, "id": new_id}

def add_to_pipeline(entry: dict) -> Dict[str, List[dict]]:
    data = _load()
    entry = _assign_id(entry, "pipe", data["pipeline"])
    # de-dupe on id
    data["pipeline"] = [entry] + [e for e in data["pipeline"] if e.get("id") != entry.get("id")]
    data["pipeline"] = data["pipeline"][:25]  # keep recent
    _save(data)
    return data

def add_to_brain(entry: dict) -> Dict[str, List[dict]]:
    """
    Add or compound a brain entry.
    If an entry with the same (name, type) already exists, we append to its notes + citations
    instead of creating a duplicate. This is how the wiki/brain "gets smarter".
    """
    data = _load()
    entry = _assign_id(entry, "brain", data["brain"])

    name = entry.get("name")
    typ = entry.get("type")
    if name and typ:
        for existing in data["brain"]:
            if existing.get("name") == name and existing.get("type") == typ:
                # compound
                old_notes = existing.get("notes", "")
                new_notes = entry.get("notes", "")
                existing["notes"] = (old_notes + " | " + new_notes).strip(" |").strip()
                old_cit = existing.get("citation", "")
                new_cit = entry.get("citation", "")
                existing["citation"] = (old_cit + " ; " + new_cit).strip(" ;").strip()
                if entry.get("addedAt"):
                    existing["addedAt"] = entry["addedAt"]
                _save(data)
                _write_brain_md(existing)
                return data

    # new entry
    data["brain"] = [entry] + [e for e in data["brain"] if e.get("id") != entry.get("id")]
    data["brain"] = data["brain"][:30]
    _save(data)
    _write_brain_md(entry)
    return data

def remove_from_pipeline(entry_id: str) -> Dict[str, List[dict]]:
    data = _load()
    data["pipeline"] = [e for e in data["pipeline"] if e.get("id") != entry_id]
    _save(data)
    return data

def remove_from_brain(entry_id: str) -> Dict[str, List[dict]]:
    data = _load()
    data["brain"] = [e for e in data["brain"] if e.get("id") != entry_id]
    _save(data)
    return data

def update_brain_note(entry_id: str, notes: str) -> Dict[str, List[dict]]:
    data = _load()
    for e in data["brain"]:
        if e.get("id") == entry_id:
            e["notes"] = notes or ""
            _write_brain_md(e)
            break
    _save(data)
    return data


def list_brain_wiki_files() -> List[Dict[str, str]]:
    """List the native wiki .md files for Brain (Obsidian/Karpathy foundation).
    Returns list of {name, type, path, content, excerpt} for the app to surface the wiki.
    Robust to legacy dirs (agencys/) and prefers frontmatter type.
    The 'excerpt' is the first real synthesized body content (after frontmatter) for nice primary-list display.
    """
    results = []
    if not BRAIN_DIR.exists():
        return results

    dir_type_map = {
        "agencies": "agency",
        "agencys": "agency",   # legacy
        "competitors": "competitor",
        "competitor": "competitor",
    }

    for sub in BRAIN_DIR.iterdir():
        if not sub.is_dir():
            continue
        dir_key = sub.name.lower()
        fallback_type = dir_type_map.get(dir_key, dir_key.rstrip('s'))

        for md in sub.glob("*.md"):
            try:
                content = md.read_text(encoding="utf-8")
                # Prefer authoritative type from frontmatter
                typ = fallback_type
                name = md.stem.replace('-', ' ').title()
                for line in content.splitlines()[:15]:
                    if line.lower().startswith("name:"):
                        name = line.split(":", 1)[1].strip()
                    if line.lower().startswith("type:"):
                        t = line.split(":", 1)[1].strip().lower()
                        if t in ("agency", "agencies", "competitor", "competitors"):
                            typ = "agency" if "agency" in t else "competitor"

                # Build a clean excerpt: skip frontmatter (until the *closing* ---), take first real synthesized body
                excerpt = ""
                dashes = 0
                for line in content.splitlines():
                    if line.strip() == "---":
                        dashes += 1
                        if dashes >= 2:
                            break
                        continue
                    if dashes >= 1 and line.strip():
                        excerpt += line + " "
                        if len(excerpt) > 320:
                            break
                if not excerpt.strip():
                    excerpt = content[:320]

                results.append({
                    "name": name,
                    "type": typ,
                    "path": str(md.relative_to(BRAIN_DIR.parent.parent)),
                    "content": content[:500] + ("..." if len(content) > 500 else ""),
                    "excerpt": excerpt.strip()[:320] + ("..." if len(excerpt) > 320 else "")
                })
            except Exception:
                pass
    return results[:60]  # cap for safety


def _slug(name: str) -> str:
    import re
    s = re.sub(r'[^a-zA-Z0-9]+', '-', (name or 'unknown').lower()).strip('-')
    return s[:60] or 'unknown'


def _write_brain_md(entry: dict):
    """Write/append a native Obsidian-friendly Markdown file for the Brain entry.
    This is the foundation slice: plain .md with frontmatter + [[wikilinks]]-ready content,
    citations preserved, so user can immediately point Obsidian at data/knowledge/brain/
    for free rich wiki UI (backlinks, graph, search). The app still uses the JSON accumulator
    for speed; md files are the compounding wiki substrate aligned with Karpathy/Obsidian.
    Later slices can make the app read from md and expand to global_wiki/ + pursuits/ tiers.

    LLM is used here (when available) to synthesize richer, more structured wiki-style content
    from the triggering data context + citations. This makes the Brain a true LLM-augmented
    wiki that compounds knowledge from the USASpending insights and your actions.
    """
    try:
        name = entry.get("name") or "unknown"
        typ = entry.get("type") or "entity"
        if typ == 'agency':
            sub = 'agencies'
        elif typ == 'competitor':
            sub = 'competitors'
        else:
            sub = typ + 's' if not typ.endswith('s') else typ
        subdir = BRAIN_DIR / sub
        subdir.mkdir(parents=True, exist_ok=True)
        slug = _slug(name)
        path = subdir / f"{slug}.md"

        frontmatter = f"""---
name: {name}
type: {typ}
id: {entry.get("id", "")}
added: {entry.get("addedAt", "")}
citations: {entry.get("citation", "")}
---

"""

        raw_notes = entry.get("notes", "").strip()
        body = raw_notes or "No notes yet. Add via +brain or agent actions."

        # Use LLM (if available) to synthesize a richer wiki-style entry when the provided notes
        # are basic/short. This is the "LLM wiki" part: grounded in data + citations, atomic,
        # linkable, ready for compounding.
        if llm_client and len(body) < 200 and name:
            context = f"Entity: {name} (type: {typ}). Citation: {entry.get('citation','')}. Trigger source: {entry.get('sourceTab','brain')}. NAICS context: {entry.get('naics','')}. Raw notes: {raw_notes}."
            prompt = (
                "You are helping build a capture professional's Obsidian-style LLM wiki / knowledge base (Karpathy notes style).\n"
                "Create a clean, atomic Markdown note for this entity. Use sections like:\n"
                "- Key Signals from Data\n"
                "- Citations & Sources\n"
                "- Open Questions / Next Actions\n"
                "Keep it concise (4-8 sentences total), professional, and evidence-based. Include relevant [[wikilinks]] to related entities if obvious from the name (e.g. [[DHS]] or competitor names).\n"
                "Base everything only on the provided context. Do not invent data.\n\n"
                f"Context:\n{context}\n\nWrite the wiki note now:"
            )
            try:
                generated = llm_client.call_llm(prompt, temperature=0.2, max_tokens=180)
                if generated and not generated.startswith("[LLM") and len(generated) > 30:
                    body = generated.strip()
            except Exception:
                pass  # fall back to raw notes

        # Append mode for compounding (new synthesized content from LLM/buttons gets added)
        existing = ""
        if path.exists():
            existing = path.read_text(encoding="utf-8").strip() + "\n\n"

        new_section = f"""## Added/Updated {entry.get("addedAt", "")[:10]}
{body}

**Citations**: {entry.get("citation", "N/A")}
_Source_: {entry.get("sourceTab", "brain")} • NAICS {entry.get("naics", "")}
"""

        path.write_text(frontmatter + existing + new_section, encoding="utf-8")
    except Exception:
        # Non-fatal; JSON accumulator is still authoritative for the app
        pass

def clear_all():
    """Dev helper / reset."""
    _save({"pipeline": [], "brain": []})
    return get_accumulators()

def clear_pipeline() -> Dict[str, List[dict]]:
    data = _load()
    data["pipeline"] = []
    _save(data)
    return data

def clear_brain() -> Dict[str, List[dict]]:
    data = _load()
    data["brain"] = []
    _save(data)
    return data