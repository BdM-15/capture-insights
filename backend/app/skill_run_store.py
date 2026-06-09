"""Persist auditable skill runs — Theseus-inspired, capture-insights adapted (no KG)."""

from __future__ import annotations

import json
import re
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_RUNS_ROOT = Path("data") / "runs"
_current_tracker: ContextVar[Optional["SkillRunTracker"]] = ContextVar(
    "skill_run_tracker", default=None
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _slugify_inquiry(text: str, *, max_len: int = 48) -> str:
    raw = re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")
    return (raw[:max_len] or "run").rstrip("_")


def make_run_id(skill_id: str, inquiry: str = "") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    suffix = _slugify_inquiry(inquiry)
    return f"{stamp}_{skill_id}_{suffix}"[:120]


class SkillRunTracker:
    """Records process chain steps for one invoke."""

    def __init__(
        self,
        *,
        run_id: str,
        skill_id: str,
        source: str,
        inquiry: str = "",
        inputs: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        self.run_id = run_id
        self.skill_id = skill_id
        self.source = source
        self.inquiry = inquiry
        self.inputs = inputs or {}
        self.context = context or {}
        self.started_at = _utc_now()
        self.finished_at: Optional[str] = None
        self.status = "running"
        self.steps: List[Dict[str, Any]] = []
        self.transcript: List[Dict[str, Any]] = []
        self.warnings: List[str] = []
        self.artifacts: List[Dict[str, str]] = []
        self._open_step: Optional[Dict[str, Any]] = None
        self._step_t0: Optional[float] = None

    def step(
        self,
        name: str,
        *,
        kind: str = "process",
        status: str = "ok",
        input_summary: str = "",
        output_summary: str = "",
        detail: Optional[Dict[str, Any]] = None,
        elapsed_ms: Optional[int] = None,
    ) -> None:
        self.steps.append({
            "id": f"step-{len(self.steps) + 1}",
            "kind": kind,
            "name": name,
            "status": status,
            "input_summary": input_summary[:500] if input_summary else "",
            "output_summary": output_summary[:2000] if output_summary else "",
            "detail": detail or {},
            "elapsed_ms": elapsed_ms,
            "at": _utc_now(),
        })

    def step_begin(self, name: str, *, kind: str = "process", input_summary: str = "") -> None:
        import time

        if self._open_step:
            self.step_end(status="ok", output_summary="(closed by next step)")
        self._step_t0 = time.perf_counter()
        self._open_step = {"name": name, "kind": kind, "input_summary": input_summary[:500]}

    def step_end(
        self,
        *,
        status: str = "ok",
        output_summary: str = "",
        detail: Optional[Dict[str, Any]] = None,
    ) -> None:
        import time

        if not self._open_step:
            return
        elapsed = None
        if self._step_t0 is not None:
            elapsed = int((time.perf_counter() - self._step_t0) * 1000)
        self.step(
            self._open_step["name"],
            kind=self._open_step["kind"],
            status=status,
            input_summary=self._open_step.get("input_summary", ""),
            output_summary=output_summary,
            detail=detail,
            elapsed_ms=elapsed,
        )
        self._open_step = None
        self._step_t0 = None

    def add_transcript_turn(
        self,
        *,
        turn: int,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self.transcript.append({
            "turn": turn,
            "role": role,
            "content": content[:8000],
            "tool_calls": tool_calls or [],
        })

    def add_warning(self, msg: str) -> None:
        if msg and msg not in self.warnings:
            self.warnings.append(msg[:500])

    def add_artifact(self, path: str, label: str = "") -> None:
        if not path:
            return
        self.artifacts.append({"path": path, "label": label or path})

    def finalize(self, result: Dict[str, Any]) -> Dict[str, Any]:
        if self._open_step:
            ok = bool(result.get("ok"))
            self.step_end(
                status="ok" if ok else "error",
                output_summary=result.get("summary") or result.get("error") or "",
            )
        self.finished_at = _utc_now()
        self.status = "completed" if result.get("ok") else "failed"
        try:
            t0 = datetime.fromisoformat(self.started_at.replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(self.finished_at.replace("Z", "+00:00"))
            elapsed_ms = int((t1 - t0).total_seconds() * 1000)
        except Exception:
            elapsed_ms = sum(s.get("elapsed_ms") or 0 for s in self.steps)

        for key in ("path", "json_path"):
            p = result.get(key)
            if p:
                self.add_artifact(str(p), label=key)

        envelope = {
            "run_id": self.run_id,
            "skill_id": self.skill_id,
            "source": self.source,
            "status": self.status,
            "inquiry": self.inquiry,
            "inputs": self.inputs,
            "context": self.context,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "elapsed_ms": elapsed_ms,
            "steps": self.steps,
            "transcript": self.transcript,
            "warnings": self.warnings,
            "artifacts": self.artifacts,
            "result": result,
            "summary": result.get("summary") or result.get("error") or "",
        }
        save_run(envelope)
        return envelope

    def to_dict(self) -> Dict[str, Any]:
        return {
            "run_id": self.run_id,
            "skill_id": self.skill_id,
            "source": self.source,
            "status": self.status,
            "inquiry": self.inquiry,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "steps": self.steps,
            "transcript": self.transcript,
            "warnings": self.warnings,
            "artifacts": self.artifacts,
        }


def start_run(
    *,
    skill_id: str,
    source: str,
    inquiry: str = "",
    inputs: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    run_id: Optional[str] = None,
) -> SkillRunTracker:
    rid = run_id or make_run_id(skill_id, inquiry)
    tracker = SkillRunTracker(
        run_id=rid,
        skill_id=skill_id,
        source=source,
        inquiry=inquiry,
        inputs=inputs or {},
        context=context or {},
    )
    _current_tracker.set(tracker)
    save_run({
        **tracker.to_dict(),
        "inputs": tracker.inputs,
        "context": tracker.context,
        "finished_at": None,
        "elapsed_ms": None,
        "result": None,
        "summary": "Running…",
    })
    return tracker


def active_tracker() -> Optional[SkillRunTracker]:
    return _current_tracker.get()


def clear_tracker() -> None:
    _current_tracker.set(None)


def _run_path(skill_id: str, run_id: str) -> Path:
    base = _RUNS_ROOT.resolve()
    safe_skill = re.sub(r"[^a-z0-9-]", "", skill_id.lower())
    safe_run = re.sub(r"[^a-z0-9_-]", "", run_id.lower())
    return (base / safe_skill / f"{safe_run}.json").resolve()


def save_run(envelope: Dict[str, Any]) -> bool:
    try:
        skill_id = str(envelope.get("skill_id") or "unknown")
        run_id = str(envelope.get("run_id") or uuid.uuid4().hex)
        path = _run_path(skill_id, run_id)
        if not str(path).startswith(str(_RUNS_ROOT.resolve())):
            return False
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")
        return True
    except Exception:
        return False


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    root = _RUNS_ROOT.resolve()
    if not root.is_dir():
        return None
    for path in root.rglob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("run_id") == run_id:
            return data
    return None


def list_runs(
    *,
    skill_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    root = _RUNS_ROOT.resolve()
    if not root.is_dir():
        return []

    paths: List[Path] = []
    if skill_id:
        safe = re.sub(r"[^a-z0-9-]", "", skill_id.lower())
        skill_dir = root / safe
        if skill_dir.is_dir():
            paths = list(skill_dir.glob("*.json"))
    else:
        paths = list(root.rglob("*.json"))

    rows: List[Dict[str, Any]] = []
    for path in sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        rows.append({
            "run_id": data.get("run_id"),
            "skill_id": data.get("skill_id"),
            "source": data.get("source"),
            "status": data.get("status"),
            "inquiry_preview": (data.get("inquiry") or "")[:120],
            "summary": data.get("summary") or (data.get("result") or {}).get("summary"),
            "started_at": data.get("started_at"),
            "finished_at": data.get("finished_at"),
            "elapsed_ms": data.get("elapsed_ms"),
            "step_count": len(data.get("steps") or []),
            "artifact_count": len(data.get("artifacts") or []),
        })
        if len(rows) >= limit:
            break
    return rows