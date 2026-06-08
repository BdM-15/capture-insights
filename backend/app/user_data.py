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
from typing import Any, Dict, List, Optional

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

    # Phase 3: ensure the Karpathy-expected index + log exist (stubs are fine; helpers + agents fill them).
    for fname, starter in [
        ("index.md", "# Knowledge Vault Index\n\n(LLM + helpers maintain this. See schema/capture-llm-wiki.md and run rebuild-index.)\n"),
        ("log.md", "# Knowledge Vault Log\n\nAppend-only. Agents/app append on major ingests/lints.\n"),
    ]:
        p = knowledge_root / fname
        if not p.exists():
            try:
                p.write_text(starter, encoding="utf-8")
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


def _normalize_entity_name(name: str) -> str:
    import re
    s = (name or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[.,'\"()]", "", s)
    return s


def _names_match_entity(a: str, b: str) -> bool:
    na, nb = _normalize_entity_name(a), _normalize_entity_name(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    prefix = min(len(na), len(nb), 18)
    if prefix >= 8 and na[:prefix] == nb[:prefix]:
        return True
    if na in nb or nb in na:
        return True
    return _slug(a) == _slug(b)


def _brain_subdir(typ: str) -> str:
    mapping = {
        "agency": "agencies",
        "competitor": "competitors",
        "recipient": "competitors",
        "office": "offices",
        "teammate": "teammates",
        "partner": "teammates",
    }
    t = (typ or "entity").lower()
    return mapping.get(t, t + "s" if not t.endswith("s") else t)


def _find_existing_brain_entry(brain: List[dict], name: str, typ: str) -> Optional[dict]:
    for existing in brain:
        if (existing.get("type") or "").lower() != (typ or "").lower():
            continue
        if _names_match_entity(existing.get("name", ""), name):
            return existing
    return None


def _find_md_path_for_entity(typ: str, name: str) -> Optional[Path]:
    subdir = BRAIN_DIR / _brain_subdir(typ)
    if not subdir.exists():
        return None
    target_slug = _slug(name)
    exact = subdir / f"{target_slug}.md"
    if exact.exists():
        return exact
    for md in subdir.glob("*.md"):
        try:
            for line in md.read_text(encoding="utf-8").splitlines()[:20]:
                if line.lower().startswith("name:"):
                    fm_name = line.split(":", 1)[1].strip()
                    if _names_match_entity(fm_name, name):
                        return md
        except Exception:
            continue
    return None


def _extract_context_from_entry(entry: dict) -> dict:
    raw = entry.get("raw") or {}
    if not isinstance(raw, dict):
        raw = {}
    return {
        "addedAt": entry.get("addedAt") or "",
        "sourceTab": entry.get("sourceTab") or "brain",
        "citation": entry.get("citation") or "",
        "summary": (entry.get("notes") or "").strip(),
        "award_key": raw.get("award_key") or entry.get("award_key"),
        "agency": raw.get("agency") or entry.get("agency"),
        "office": raw.get("office") or entry.get("office"),
        "recipient": raw.get("recipient") or entry.get("recipient"),
        "end_date": raw.get("end_date"),
        "obligation": raw.get("obligation"),
        "millions": raw.get("millions"),
        "actions": raw.get("actions"),
    }


def _context_dedupe_key(ctx: dict) -> str:
    return "|".join([
        str(ctx.get("citation") or ""),
        str(ctx.get("award_key") or ""),
        str(ctx.get("sourceTab") or ""),
        str(ctx.get("office") or ""),
        (ctx.get("summary") or "")[:96],
    ])


def _canonical_entity_name(existing_name: str, incoming_name: str) -> str:
    if len((incoming_name or "").strip()) > len((existing_name or "").strip()):
        return incoming_name.strip()
    return (existing_name or incoming_name or "unknown").strip()


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
    Same agency/office/competitor (fuzzy name + slug match) appends a new *context*
    to one JSON entry and one .md file — no duplicate folders or files.
    User overlay notes (via update_brain_note) stay separate from auto context.
    """
    data = _load()
    name = (entry.get("name") or "").strip()
    typ = (entry.get("type") or "competitor").lower()
    ctx = _extract_context_from_entry(entry)

    existing = _find_existing_brain_entry(data["brain"], name, typ) if name else None
    if existing:
        existing["name"] = _canonical_entity_name(existing.get("name", ""), name)
        contexts = list(existing.get("contexts") or [])
        dedupe_key = _context_dedupe_key(ctx)
        if not any(_context_dedupe_key(c) == dedupe_key for c in contexts):
            contexts.append(ctx)
        existing["contexts"] = contexts[-25:]

        old_cit = existing.get("citation", "")
        new_cit = entry.get("citation", "")
        if new_cit and new_cit not in (old_cit or ""):
            existing["citation"] = (old_cit + " ; " + new_cit).strip(" ;").strip()
        if entry.get("addedAt"):
            existing["addedAt"] = entry["addedAt"]

        md_path = _find_md_path_for_entity(typ, existing["name"])
        if md_path:
            try:
                existing["wikiPath"] = str(md_path.relative_to(BRAIN_DIR.parent))
            except ValueError:
                existing["wikiPath"] = str(md_path)
        existing["slug"] = _slug(existing["name"])

        _save(data)
        _write_brain_md(existing, new_context=ctx)
        return data

    entry = _assign_id(entry, "brain", data["brain"])
    entry["type"] = typ
    entry["contexts"] = [ctx]
    entry["slug"] = _slug(name)
    entry["notes"] = entry.get("notes") or ""

    data["brain"] = [entry] + [e for e in data["brain"] if e.get("id") != entry.get("id")]
    data["brain"] = data["brain"][:30]
    _save(data)
    _write_brain_md(entry, new_context=ctx)
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
            _update_brain_overlay_md(e)
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
        "offices": "office",
        "office": "office",
        "teammates": "teammate",
        "teammate": "teammate",
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


# === Phase 3: Lint + Index helpers for the Karpathy/Obsidian vault ===
# Structural (fast, no LLM) so the "programmer" (LLM or you) can keep the wiki healthy.
# These power /user/brain/lint and the standalone script + index.md rebuild.
# Follows the workflows described in schema/capture-llm-wiki.md (ingest/query/lint).

REQUIRED_SECTIONS = [
    "key signals",
    "citations & sources",
    "open questions",
    "personal observations",
    "synthesis",
]

def lint_brain_wiki() -> Dict[str, Any]:
    """Lightweight structural lint of native .md vault files against the capture-llm-wiki schema.

    Checks frontmatter basics + presence of key required sections (case-insensitive substring match).
    Reports actionable issues per entry. Pure FS + text (fast). No LLM call here — the schema
    tells external agents how to do deeper lint/synthesis.

    Returns: {
      "ok": bool,
      "issues": int,
      "entries": [ {"name":, "path":, "type":, "issues": [...], "ok": bool }, ... ],
      "legacy_dirs": [...],
      "summary": str
    }
    """
    files = list_brain_wiki_files()
    entries_out = []
    total_issues = 0
    legacy = []

    # detect lingering legacy dirs
    for d in BRAIN_DIR.iterdir():
        if d.is_dir() and d.name.lower() in ("agencys", "competitor"):
            legacy.append(str(d.relative_to(BRAIN_DIR.parent.parent)))

    for f in files:
        content = f.get("content") or ""
        lower = content.lower()
        issues = []

        # frontmatter sanity (very light)
        if not content.lstrip().startswith("---"):
            issues.append("missing or malformed frontmatter (should start with ---)")

        # required-ish sections per schema
        found_sections = 0
        for sec in REQUIRED_SECTIONS:
            if sec in lower:
                found_sections += 1
        if found_sections < 2:
            issues.append("few or no key schema sections found (look for 'Key Signals', 'Citations & Sources', 'Open Questions', 'Personal Observations / Training')")

        # very light staleness hint (no date in first 400 chars of body)
        if "last_updated" not in lower and "added/updated" not in lower:
            issues.append("no obvious last_updated or Added/Updated date section — consider appending on next change")

        ok = len(issues) == 0
        total_issues += len(issues)
        entries_out.append({
            "name": f.get("name"),
            "path": f.get("path"),
            "type": f.get("type"),
            "ok": ok,
            "issues": issues
        })

    summary = f"{len(entries_out)} entries scanned, {total_issues} structural issues. Legacy dirs: {len(legacy)}. Run rebuild-index after fixes."
    return {
        "ok": total_issues == 0 and len(legacy) == 0,
        "issues": total_issues,
        "entries": entries_out,
        "legacy_dirs": legacy,
        "summary": summary,
        "schema_ref": "data/knowledge/schema/capture-llm-wiki.md (see Lint / Health workflow)"
    }


async def auto_fix_vault_issues(lint_report: dict) -> dict:
    """LLM-driven admin: for lint issues, append the missing schema sections to the native .md files.
    This lets the LLM do the maintenance burden per the exact capture-llm-wiki schema.
    Grounded prompt + append only. You click, it handles.
    """
    if not llm_client:
        return {"ok": False, "fixed": 0, "error": "no llm client available (ollama not ready?)"}

    fixed = 0
    knowledge_root = BRAIN_DIR.parent
    today = __import__("datetime").datetime.now().strftime("%Y-%m-%d")

    for e in lint_report.get("entries", []):
        if e.get("ok"):
            continue
        try:
            rel = e.get("path", "").replace("\\", "/")
            p = knowledge_root / rel
            if not p.exists():
                continue
            current = p.read_text(encoding="utf-8")[:1200]
            issues_str = "; ".join(e.get("issues", []))
            prompt = f"""You are maintaining the Knowledge Vault exactly per data/knowledge/schema/capture-llm-wiki.md .

Entry name: {e['name']} (type: {e['type']})
Lint issues found: {issues_str}

Current file start: 
{current}

Task: Append ONLY the missing required sections from the schema (Key Signals from USASpending Data + Citations & Sources, Open Questions / Next Actions, Personal Observations / Training (Shipley etc.), Synthesis / Analysis).

Use the entry name/type for any grounding. Add [[wikilinks]] where natural.
Start with ## Added/Updated {today}
Return ONLY the new markdown text to APPEND (no intro, no ```).

Follow the 3-layer architecture and provenance rules strictly. Keep it concise and actionable."""

            generated = llm_client.call_llm(prompt, temperature=0.15, max_tokens=350)
            if generated and generated.strip():
                with open(p, "a", encoding="utf-8") as f:
                    f.write("\n\n" + generated.strip())
                fixed += 1
        except Exception:
            pass

    return {
        "ok": True,
        "fixed": fixed,
        "message": f"LLM appended schema-compliant fixes to {fixed} entries. Re-lint to verify."
    }


# Global wiki support for cross-cutting/evergreen knowledge (phase post-3 global + data integration)
GLOBAL_DIR = Path("data/knowledge/global")

def list_global_files() -> list:
    """List native .md in global/ for UI display (similar to brain but for global).
    Now more inclusive: includes all .md in subdirs (like ariadne global_wiki, domain_intel).
    Uses filename as name if no frontmatter. This makes the full global vault entries visible.
    """
    results = []
    if not GLOBAL_DIR.exists():
        return results
    for md in GLOBAL_DIR.rglob("*.md"):
        if md.name == "README.md":
            continue
        try:
            content = md.read_text(encoding="utf-8")
            name = md.stem.replace('-', ' ').title()
            typ = "global"
            # look for frontmatter name/type
            for line in content.splitlines()[:15]:
                if line.lower().startswith("name:"):
                    name = line.split(":", 1)[1].strip()
                if line.lower().startswith("type:"):
                    typ = line.split(":", 1)[1].strip()
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
                    if len(excerpt) > 200:
                        break
            if not excerpt.strip():
                # for raw ariadne md without frontmatter, take first 200 chars
                excerpt = content[:200].replace('\n', ' ').strip()
            # include a usable content preview (like brain wiki does) so UI can show real info without extra roundtrip
            preview = content[:1200] + ("..." if len(content) > 1200 else "")
            results.append({
                "name": name,
                "type": typ,
                "path": str(md.relative_to(GLOBAL_DIR.parent)),
                "excerpt": excerpt.strip()[:200],
                "content": preview
            })
        except Exception:
            pass
    return results


def write_knowledge_file(rel_path: str, content: str) -> bool:
    """Safely write a .md file under data/knowledge/. Creates parent dirs."""
    try:
        base = (Path("data") / "knowledge").resolve()
        candidate = (base / rel_path).resolve()
        if not str(candidate).startswith(str(base)):
            return False
        if candidate.suffix.lower() != ".md":
            return False
        candidate.parent.mkdir(parents=True, exist_ok=True)
        candidate.write_text(content, encoding="utf-8")
        return True
    except Exception:
        return False


def read_knowledge_file(rel_path: str) -> Optional[Dict]:
    """Safely read any full .md under data/knowledge/ (global/..., brain/..., training/..., education/...).
    Used by the in-app wiki viewer so you can read the actual synthesized content, citations, personal notes etc.
    without leaving the dashboard. Returns full text + basic meta or None if unsafe / missing.
    Primary reading stays in Obsidian for graph/editing; this is the quick in-UI view.
    """
    try:
        base = (Path("data") / "knowledge").resolve()
        candidate = (base / rel_path).resolve()
        # hard guard: must stay inside the knowledge dir
        if not str(candidate).startswith(str(base)):
            return None
        if not candidate.exists() or not candidate.is_file() or candidate.suffix.lower() != ".md":
            return None
        txt = candidate.read_text(encoding="utf-8")
        return {
            "path": str(candidate.relative_to(base)),
            "content": txt,
            "name": candidate.stem.replace('-', ' ').title(),
            "size": len(txt)
        }
    except Exception:
        return None


async def cross_seed_global_from_data(data_summary: dict) -> dict:
    """LLM synthesizes a global wiki page from current data insights (intensity, flows, etc.) + schema.
    This is the 'global + data integration' action: click button, LLM builds cross-cutting page with citations.
    Writes to global/ with proper frontmatter/sections.
    """
    if not llm_client:
        return {"ok": False, "error": "no llm"}

    summary_str = str(data_summary)[:1500]
    prompt = f"""You are building the global/ cross-cutting section of the Knowledge Vault per data/knowledge/schema/capture-llm-wiki.md.

Data insights summary (intensity hot spots, flows, expiring, etc.):
{summary_str}

Create ONE global page (e.g. title like "Hot Intensity Signals" or "Recipient-Agency Flows" or "Recompete Patterns").
Use YAML frontmatter: name, type: "global", added, citations (from the data), tags.
Then sections: Key Signals from USASpending Data + Citations & Sources, Synthesis / Analysis, Open Questions / Next Actions.
Use [[wikilinks]] to related (e.g. [[Hot Agencies]]).
Return ONLY the full markdown for the new file (no ```).

Ground everything in the provided data summary with citations. Keep concise."""

    generated = llm_client.call_llm(prompt, temperature=0.2, max_tokens=400)
    if not generated:
        return {"ok": False, "error": "llm failed"}

    # slug from first line or default
    slug = "cross-data-signals"
    for line in generated.splitlines()[:5]:
        if line.lower().startswith("name:"):
            slug = _slug(line.split(":",1)[1].strip())
            break

    p = GLOBAL_DIR / f"{slug}.md"
    GLOBAL_DIR.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(generated.strip())

    return {"ok": True, "path": str(p.relative_to(GLOBAL_DIR.parent)), "message": "LLM synthesized and wrote global page from data."}


def rebuild_vault_index() -> str:
    """Rebuilds data/knowledge/index.md from current native wiki files (and light JSON accumulator hints).

    Produces a scannable, LLM + human friendly catalog with wikilinks. Writes the file.
    This is the "index" the schema expects the LLM to maintain on ingests/lints.
    """
    knowledge_root = BRAIN_DIR.parent
    index_path = knowledge_root / "index.md"

    files = list_brain_wiki_files()

    # group lightly
    by_type: Dict[str, List[Dict]] = {}
    for f in files:
        t = f.get("type") or "other"
        by_type.setdefault(t, []).append(f)

    lines = []
    lines.append("# Knowledge Vault Index (auto-rebuilt)")
    lines.append("")
    lines.append("LLM-maintained catalog. Read this first, then [[wikilinks]]. App + agents keep it fresh on ingest/lint.")
    lines.append("")
    lines.append("**Schema contract**: data/knowledge/schema/capture-llm-wiki.md")
    lines.append("**Point Obsidian at**: the `data/knowledge/` folder for graph, backlinks, bases, canvas.")
    lines.append("")

    for t, items in sorted(by_type.items()):
        lines.append(f"## {t.title()}")
        for it in items:
            sig = (it.get("excerpt") or "")[:160].replace("\n", " ")
            lines.append(f"- [[{it['name']}]] ({it['type']}) — {sig}  \n  path: `{it['path']}`")
        lines.append("")

    lines.append("## Notes for Agents / You")
    lines.append("- On new +brain or data seed: append to relevant page(s) + update this index with a one-liner + citation.")
    lines.append("- Run lint first (see /user/brain/lint or scripts/vault_maintain.py --lint).")
    lines.append("- Append to log.md for big events.")
    lines.append("")

    content = "\n".join(lines)
    index_path.write_text(content, encoding="utf-8")
    return content


def _slug(name: str) -> str:
    import re
    s = re.sub(r'[^a-zA-Z0-9]+', '-', (name or 'unknown').lower()).strip('-')
    return s[:60] or 'unknown'


def _strip_frontmatter(content: str) -> str:
    """Return markdown body only (drop leading YAML frontmatter if present)."""
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return content.strip()
    dashes = 0
    for i, line in enumerate(lines):
        if line.strip() == "---":
            dashes += 1
            if dashes >= 2:
                return "\n".join(lines[i + 1 :]).strip()
    return content.strip()


def _format_context_section(ctx: dict, entity_name: str, typ: str) -> str:
    """One append-only context block — ties disparate opportunities to the same entity."""
    lines = [f"## Context — {(ctx.get('addedAt') or '')[:10]} — {ctx.get('sourceTab') or 'brain'}"]
    if ctx.get("award_key"):
        lines.append(f"- **Award**: `{ctx.get('award_key')}`")
    if ctx.get("agency") and typ != "agency":
        lines.append(f"- **Agency**: [[{ctx.get('agency')}]]")
    if ctx.get("office"):
        lines.append(f"- **Office**: [[{ctx.get('office')}]]")
    if ctx.get("recipient") and typ != "competitor":
        lines.append(f"- **Recipient**: [[{ctx.get('recipient')}]]")
    if ctx.get("end_date"):
        lines.append(f"- **PoP ends**: {ctx.get('end_date')}")
    if ctx.get("obligation"):
        try:
            lines.append(f"- **Obligation**: ${float(ctx.get('obligation')) / 1e6:.2f}M")
        except (TypeError, ValueError):
            pass
    if ctx.get("millions"):
        lines.append(f"- **Flow**: ${ctx.get('millions')}M ({ctx.get('actions') or '?'} actions)")
    summary = (ctx.get("summary") or "").strip()
    if summary:
        lines.append("")
        lines.append(summary)
    lines.append("")
    lines.append(f"**Citations**: {ctx.get('citation') or 'N/A'}")
    return "\n".join(lines)


def _update_brain_overlay_md(entry: dict):
    """Update user overlay notes without duplicating context sections."""
    try:
        typ = entry.get("type") or "entity"
        name = entry.get("name") or "unknown"
        path = _find_md_path_for_entity(typ, name)
        if not path:
            subdir = BRAIN_DIR / _brain_subdir(typ)
            subdir.mkdir(parents=True, exist_ok=True)
            path = subdir / f"{_slug(name)}.md"
        overlay = (entry.get("notes") or "").strip()
        marker = "## Personal overlay"
        if path.exists():
            content = path.read_text(encoding="utf-8")
            body = _strip_frontmatter(content)
            if marker in body:
                before, _, _after = body.partition(marker)
                body = before.rstrip() + f"\n\n{marker}\n\n{overlay}\n"
            else:
                body = body.rstrip() + f"\n\n{marker}\n\n{overlay}\n"
            if content.startswith("---"):
                fm_end = content.find("---", 3)
                if fm_end != -1:
                    front = content[: fm_end + 3]
                    path.write_text(front + "\n\n" + body, encoding="utf-8")
                    return
            path.write_text(body, encoding="utf-8")
        else:
            _write_brain_md(entry, new_context=None)
    except Exception:
        pass


def _write_brain_md(entry: dict, new_context: dict | None = None):
    """Write/append a native Obsidian-friendly Markdown file for the Brain entry.

    One file per entity (slug + fuzzy name match). Re-encounters append a dated Context
    section with opportunity-specific provenance — same agency/office/competitor, new signal.
    """
    try:
        name = entry.get("name") or "unknown"
        typ = (entry.get("type") or "entity").lower()
        subdir = BRAIN_DIR / _brain_subdir(typ)
        subdir.mkdir(parents=True, exist_ok=True)

        path = _find_md_path_for_entity(typ, name) or (subdir / f"{_slug(name)}.md")
        ctx = new_context or (entry.get("contexts") or [{}])[-1]
        section = _format_context_section(ctx, name, typ)
        section_key = _context_dedupe_key(ctx)

        frontmatter = f"""---
name: {name}
type: {typ}
id: {entry.get("id", "")}
slug: {_slug(name)}
added: {entry.get("addedAt", "")}
citations: {entry.get("citation", "")}
contexts: {len(entry.get("contexts") or [])}
---

"""

        if path.exists():
            content = path.read_text(encoding="utf-8")
            body = _strip_frontmatter(content)
            if section_key and section_key in body:
                return
            if "## Context —" in body and (ctx.get("summary") or "")[:48] in body:
                return
            path.write_text(content.rstrip() + "\n\n" + section + "\n", encoding="utf-8")
            try:
                entry["wikiPath"] = str(path.relative_to(BRAIN_DIR.parent))
            except ValueError:
                entry["wikiPath"] = str(path)
            return

        body = section
        raw_summary = (ctx.get("summary") or "").strip()

        if llm_client and raw_summary and len(raw_summary) < 200:
            context = (
                f"Entity: {name} (type: {typ}). Citation: {ctx.get('citation', '')}. "
                f"Source: {ctx.get('sourceTab', 'brain')}. Context: {raw_summary}."
            )
            prompt = (
                "You are building an Obsidian-style capture wiki entry (atomic, evidence-based).\n"
                "Write ONLY the body sections below the frontmatter — no YAML. Sections:\n"
                "- Key Signals from USASpending Data + Citations\n"
                "- Citations & Sources\n"
                "- Synthesis / Analysis\n"
                "- Open Questions / Next Actions\n"
                "Use [[wikilinks]] for related agencies/offices/recipients when mentioned. "
                "Do not invent data. Keep concise.\n\n"
                f"{context}\n\nWiki body:"
            )
            try:
                generated = llm_client.call_llm(prompt, temperature=0.2, max_tokens=220)
                if generated and not generated.startswith("[LLM") and len(generated) > 40:
                    body = generated.strip() + "\n\n" + section
            except Exception:
                pass

        path.write_text(frontmatter + body + "\n", encoding="utf-8")
        try:
            entry["wikiPath"] = str(path.relative_to(BRAIN_DIR.parent))
        except ValueError:
            entry["wikiPath"] = str(path)
    except Exception:
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