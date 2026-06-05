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

USER_DATA_PATH = Path("data/user_accumulators.json")

def _ensure_parent():
    USER_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)

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
                return data

    # new entry
    data["brain"] = [entry] + [e for e in data["brain"] if e.get("id") != entry.get("id")]
    data["brain"] = data["brain"][:30]
    _save(data)
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
            break
    _save(data)
    return data

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