#!/usr/bin/env python
"""
vault_maintain.py — Phase 3 lint + index helper for the Knowledge Vault (Karpathy LLM wiki).

Run standalone (even if the FastAPI app is down) or when the app is running for richer data.

Usage (from project root):
  uv run python scripts/vault_maintain.py --lint
  uv run python scripts/vault_maintain.py --rebuild-index
  uv run python scripts/vault_maintain.py --all --clean-legacy

It reuses the exact same logic the app exposes at /user/brain/lint and /user/brain/rebuild-index
(imported from backend.app.user_data) so behavior is identical whether called from script or UI/agents.

This is the "maintenance" tool the schema (data/knowledge/schema/capture-llm-wiki.md) expects
the LLM (local ollama or external via obsidian-skills) + you to use.

See also:
- data/knowledge/README.md (point Obsidian here)
- data/knowledge/schema/capture-llm-wiki.md (the contract)
- The in-app Knowledge Vault sidebar (good enough UI for seeding + light browsing)
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

# Try to use the real app logic (preferred — keeps everything in sync with the backend).
try:
    from backend.app.user_data import lint_brain_wiki, rebuild_vault_index, BRAIN_DIR
    HAS_APP_LOGIC = True
except Exception:
    HAS_APP_LOGIC = False
    BRAIN_DIR = Path("data/knowledge/brain")


def run_lint():
    print("=== Knowledge Vault Lint (structural, per schema/capture-llm-wiki.md) ===")
    if HAS_APP_LOGIC:
        report = lint_brain_wiki()
    else:
        # Minimal pure-FS fallback (so the script is useful even without the full env)
        report = _pure_fs_lint()

    print(report.get("summary", ""))
    print(f"ok={report.get('ok')}")
    if report.get("legacy_dirs"):
        print("Legacy dirs still present:", report["legacy_dirs"])

    for e in report.get("entries", []):
        if not e.get("ok"):
            print(f"  - {e['name']} ({e['type']}): {e['issues']}")

    print("\nTip: after fixing, run with --rebuild-index (or hit the /user/brain/rebuild-index endpoint).")
    print("For deep lint/synthesis/hand-off work: use this folder as your Obsidian vault + obsidian-skills agents.")
    return report


def _pure_fs_lint():
    # Very small fallback so the script remains usable outside the uv env.
    results = []
    issues_total = 0
    if not BRAIN_DIR.exists():
        return {"ok": False, "issues": 0, "entries": [], "legacy_dirs": [], "summary": "No brain/ dir yet."}

    for sub in BRAIN_DIR.iterdir():
        if not sub.is_dir():
            continue
        for md in sub.glob("*.md"):
            try:
                txt = md.read_text(encoding="utf-8").lower()
                iss = []
                if not txt.strip().startswith("---"):
                    iss.append("missing frontmatter")
                if "key signals" not in txt and "citations" not in txt:
                    iss.append("missing key schema sections")
                issues_total += len(iss)
                results.append({
                    "name": md.stem,
                    "path": str(md.relative_to(BRAIN_DIR.parent.parent)),
                    "type": sub.name.rstrip("s"),
                    "ok": len(iss) == 0,
                    "issues": iss
                })
            except Exception:
                pass

    legacy = [str(p) for p in BRAIN_DIR.iterdir() if p.is_dir() and p.name.lower() in ("agencys",)]
    return {
        "ok": issues_total == 0 and not legacy,
        "issues": issues_total,
        "entries": results,
        "legacy_dirs": legacy,
        "summary": f"pure-fs fallback: {len(results)} entries, {issues_total} issues"
    }


def run_rebuild_index():
    print("=== Rebuilding data/knowledge/index.md ===")
    if HAS_APP_LOGIC:
        content = rebuild_vault_index()
    else:
        # minimal
        idx = Path("data/knowledge/index.md")
        idx.parent.mkdir(parents=True, exist_ok=True)
        content = "# Knowledge Vault Index (pure-fs stub)\n\nRun with the full app env for rich output.\n"
        idx.write_text(content, encoding="utf-8")

    print(f"Wrote {len(content)} bytes to data/knowledge/index.md")
    print("Open in Obsidian or any MD viewer. Agents should keep this + log.md updated on ingests.")
    return content


def clean_legacy():
    print("=== Cleaning legacy dirs (agencys/ etc.) ===")
    if not HAS_APP_LOGIC:
        print("Full app logic not importable; skipping (run inside the project uv env).")
        return
    # The _ensure_parent already does the safe move. We can just rmdir the now-empty legacy.
    legacy = BRAIN_DIR / "agencys"
    if legacy.exists():
        try:
            legacy.rmdir()
            print("Removed empty legacy agencys/")
        except Exception as e:
            print(f"Could not rmdir (may still contain files or in use): {e}")
    else:
        print("No legacy agencys/ dir found (or already cleaned).")


def main():
    ap = argparse.ArgumentParser(description="Vault maintenance (lint + index) for capture-insights Knowledge Vault")
    ap.add_argument("--lint", action="store_true", help="Run structural lint (frontmatter + schema sections)")
    ap.add_argument("--rebuild-index", action="store_true", help="Rebuild data/knowledge/index.md")
    ap.add_argument("--clean-legacy", action="store_true", help="Remove now-empty legacy dirs (agencys/ etc.)")
    ap.add_argument("--all", action="store_true", help="lint + rebuild-index + clean-legacy")
    args = ap.parse_args()

    if not any([args.lint, args.rebuild_index, args.clean_legacy, args.all]):
        ap.print_help()
        print("\nRecommended for handoff: uv run python scripts/vault_maintain.py --all")
        return

    if args.all or args.lint:
        run_lint()
    if args.all or args.rebuild_index:
        run_rebuild_index()
    if args.all or args.clean_legacy:
        clean_legacy()

    print("\nDone. See data/knowledge/schema/capture-llm-wiki.md for the full contract (ingest/query/lint workflows).")
    print("Point Obsidian at data/knowledge/ for the real rich experience (graph, your education/ notes, external agents).")


if __name__ == "__main__":
    main()
