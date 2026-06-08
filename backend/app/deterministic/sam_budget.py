"""SAM.gov API daily budget (1000/day) + short-lived response cache."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

SAM_DAILY_LIMIT = 1000
CACHE_TTL_SEC = 45 * 60  # 45 minutes
BUDGET_FILE = Path("data/sam_budget.json")

_memory_cache: Dict[str, Tuple[float, Any]] = {}


def _utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load_state() -> Dict[str, Any]:
    if not BUDGET_FILE.exists():
        return {"date": _utc_today(), "count": 0}
    try:
        data = json.loads(BUDGET_FILE.read_text(encoding="utf-8"))
        if data.get("date") != _utc_today():
            return {"date": _utc_today(), "count": 0}
        return data
    except Exception:
        return {"date": _utc_today(), "count": 0}


def _save_state(state: Dict[str, Any]) -> None:
    BUDGET_FILE.parent.mkdir(parents=True, exist_ok=True)
    BUDGET_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def get_budget_status() -> Dict[str, Any]:
    state = _load_state()
    used = int(state.get("count", 0))
    remaining = max(0, SAM_DAILY_LIMIT - used)
    return {
        "date": state.get("date", _utc_today()),
        "used": used,
        "limit": SAM_DAILY_LIMIT,
        "remaining": remaining,
        "pct_used": round((used / SAM_DAILY_LIMIT) * 100, 1) if SAM_DAILY_LIMIT else 0,
    }


def reserve_sam_call(count: int = 1) -> bool:
    """Return True if budget allows recording `count` API calls."""
    status = get_budget_status()
    return status["remaining"] >= count


def record_sam_call(count: int = 1) -> Dict[str, Any]:
    state = _load_state()
    state["count"] = int(state.get("count", 0)) + count
    state["date"] = _utc_today()
    _save_state(state)
    return get_budget_status()


def cache_key(naics: str, keywords: str, notice_types: str, limit: int) -> str:
    raw = f"{naics}|{keywords}|{notice_types}|{limit}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def cache_get(key: str) -> Optional[Any]:
    entry = _memory_cache.get(key)
    if not entry:
        return None
    ts, payload = entry
    if time.time() - ts > CACHE_TTL_SEC:
        _memory_cache.pop(key, None)
        return None
    return payload


def cache_set(key: str, payload: Any) -> None:
    _memory_cache[key] = (time.time(), payload)