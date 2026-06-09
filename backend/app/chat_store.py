"""File-backed co-pilot conversations (PR6 — mirror Theseus chat_store pattern)."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_CONVERSATIONS_DIR = Path("data") / "conversations"
_MAX_MESSAGES = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _slug_title(text: str, *, max_len: int = 48) -> str:
    clean = re.sub(r"\s+", " ", (text or "").strip())
    if not clean:
        return "New conversation"
    return clean[:max_len] + ("…" if len(clean) > max_len else "")


def _conversation_path(conversation_id: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id)
    return _CONVERSATIONS_DIR / f"{safe}.json"


def list_conversations(*, limit: int = 40) -> List[Dict[str, Any]]:
    root = _CONVERSATIONS_DIR.resolve()
    if not root.is_dir():
        return []
    items: List[Dict[str, Any]] = []
    for path in sorted(root.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        msgs = data.get("messages") or []
        last = msgs[-1] if msgs else {}
        items.append({
            "id": data.get("id") or path.stem,
            "title": data.get("title") or "Conversation",
            "updated_at": data.get("updated_at") or data.get("created_at"),
            "created_at": data.get("created_at"),
            "model_provider": data.get("model_provider", "fast"),
            "message_count": len(msgs),
            "preview": (last.get("content") or "")[:120],
        })
        if len(items) >= limit:
            break
    return items


def create_conversation(
    *,
    title: str = "New conversation",
    model_provider: str = "fast",
    model_name: Optional[str] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    cid = uuid.uuid4().hex[:12]
    now = _now_iso()
    conv = {
        "id": cid,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "model_provider": model_provider,
        "model_name": model_name,
        "scope": scope or {},
        "messages": [],
        "linked_runs": [],
    }
    save_conversation(conv)
    return conv


def load_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    path = _conversation_path(conversation_id)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_conversation(conv: Dict[str, Any]) -> None:
    cid = str(conv.get("id") or "")
    if not cid:
        raise ValueError("conversation id required")
    path = _conversation_path(cid)
    path.parent.mkdir(parents=True, exist_ok=True)
    conv["updated_at"] = _now_iso()
    path.write_text(json.dumps(conv, indent=2, default=str), encoding="utf-8")


def update_conversation(
    conversation_id: str,
    *,
    title: Optional[str] = None,
    model_provider: Optional[str] = None,
    model_name: Optional[str] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    conv = load_conversation(conversation_id)
    if not conv:
        return None
    if title is not None:
        conv["title"] = title
    if model_provider is not None:
        conv["model_provider"] = model_provider
    if model_name is not None:
        conv["model_name"] = model_name
    if scope is not None:
        conv["scope"] = {**(conv.get("scope") or {}), **scope}
    save_conversation(conv)
    return conv


def delete_conversation(conversation_id: str) -> bool:
    path = _conversation_path(conversation_id)
    if path.is_file():
        path.unlink()
        return True
    return False


def append_message(
    conversation_id: str,
    *,
    role: str,
    content: str,
    source: Optional[str] = None,
    model: Optional[str] = None,
    run_id: Optional[str] = None,
    skill_id: Optional[str] = None,
    suggested_actions: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    conv = load_conversation(conversation_id)
    if not conv:
        return None
    msg = {
        "id": uuid.uuid4().hex[:10],
        "role": role,
        "content": content,
        "source": source,
        "model": model,
        "run_id": run_id,
        "skill_id": skill_id,
        "suggested_actions": suggested_actions,
        "created_at": _now_iso(),
    }
    messages = list(conv.get("messages") or [])
    messages.append(msg)
    if len(messages) > _MAX_MESSAGES:
        messages = messages[-_MAX_MESSAGES:]
    conv["messages"] = messages

    if role == "user" and (conv.get("title") or "") in ("New conversation", ""):
        conv["title"] = _slug_title(content)

    if run_id and run_id not in (conv.get("linked_runs") or []):
        conv.setdefault("linked_runs", []).append(run_id)

    save_conversation(conv)
    return msg


def truncate_messages_after(conversation_id: str, message_id: str) -> Optional[Dict[str, Any]]:
    """Remove messages from message_id onward (for edit/resend)."""
    conv = load_conversation(conversation_id)
    if not conv:
        return None
    messages = conv.get("messages") or []
    idx = next((i for i, m in enumerate(messages) if m.get("id") == message_id), None)
    if idx is None:
        return conv
    conv["messages"] = messages[:idx]
    save_conversation(conv)
    return conv


def pop_last_assistant(conversation_id: str) -> Optional[Dict[str, Any]]:
    conv = load_conversation(conversation_id)
    if not conv:
        return None
    messages = list(conv.get("messages") or [])
    while messages and messages[-1].get("role") != "assistant":
        messages.pop()
    if messages and messages[-1].get("role") == "assistant":
        messages.pop()
    conv["messages"] = messages
    save_conversation(conv)
    return conv


def conversation_history_for_llm(conv: Dict[str, Any], *, max_turns: int = 12) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for m in (conv.get("messages") or [])[-max_turns:]:
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": str(content)[:4000]})
    return out