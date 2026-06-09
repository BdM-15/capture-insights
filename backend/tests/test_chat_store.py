"""PR6 — file-backed conversation store."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import chat_store


@pytest.fixture(autouse=True)
def isolated_conversations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    conv_dir = tmp_path / "conversations"
    monkeypatch.setattr(chat_store, "_CONVERSATIONS_DIR", conv_dir)
    yield conv_dir


def test_create_and_list_conversation(isolated_conversations: Path):
    conv = chat_store.create_conversation(
        title="New conversation",
        model_provider="xai",
        scope={"naics": "541512"},
    )
    assert conv["id"]
    assert conv["model_provider"] == "xai"
    assert (isolated_conversations / f"{conv['id']}.json").is_file()

    listed = chat_store.list_conversations()
    assert len(listed) == 1
    assert listed[0]["id"] == conv["id"]
    assert listed[0]["model_provider"] == "xai"


def test_append_message_auto_titles(isolated_conversations: Path):
    conv = chat_store.create_conversation()
    chat_store.append_message(conv["id"], role="user", content="Run competitive intel on PIID ABC123")
    chat_store.append_message(
        conv["id"],
        role="assistant",
        content="Queued competitive-intel.",
        source="skill-invoke",
        run_id="run-abc",
        skill_id="competitive-intel",
    )

    loaded = chat_store.load_conversation(conv["id"])
    assert loaded is not None
    assert loaded["title"].startswith("Run competitive intel")
    assert len(loaded["messages"]) == 2
    assert loaded["linked_runs"] == ["run-abc"]


def test_pop_last_assistant_for_regenerate(isolated_conversations: Path):
    conv = chat_store.create_conversation()
    chat_store.append_message(conv["id"], role="user", content="hello")
    chat_store.append_message(conv["id"], role="assistant", content="first")
    chat_store.pop_last_assistant(conv["id"])
    loaded = chat_store.load_conversation(conv["id"])
    assert loaded is not None
    assert [m["role"] for m in loaded["messages"]] == ["user"]


def test_truncate_messages_after_for_edit_resend(isolated_conversations: Path):
    conv = chat_store.create_conversation()
    chat_store.append_message(conv["id"], role="user", content="first question")
    chat_store.append_message(conv["id"], role="assistant", content="first answer")
    m3 = chat_store.append_message(conv["id"], role="user", content="follow up")
    chat_store.append_message(conv["id"], role="assistant", content="second answer")

    chat_store.truncate_messages_after(conv["id"], m3["id"])
    loaded = chat_store.load_conversation(conv["id"])
    assert loaded is not None
    assert [m["content"] for m in loaded["messages"]] == ["first question", "first answer"]


def test_mirror_invoke_to_conversation(isolated_conversations: Path):
    from app.skill_invoke_service import format_skill_for_chat, mirror_invoke_to_conversation

    conv = chat_store.create_conversation()
    result = {
        "ok": True,
        "skill_id": "vault-lint",
        "run_id": "run-test-1",
        "summary": "3 lint issues",
        "path": "copilot/vault/lint.md",
    }
    mirror_invoke_to_conversation(
        conv["id"],
        skill_id="vault-lint",
        inquiry="lint my vault",
        result=result,
    )
    loaded = chat_store.load_conversation(conv["id"])
    assert loaded is not None
    assert len(loaded["messages"]) == 2
    assert loaded["messages"][0]["role"] == "user"
    assert "vault-lint" in loaded["messages"][0]["content"]
    assert loaded["messages"][1]["role"] == "assistant"
    assert loaded["messages"][1]["run_id"] == "run-test-1"
    formatted = format_skill_for_chat(result)
    assert any(a.get("action") == "continue_skill_run" for a in formatted.get("suggested_actions") or [])


def test_conversation_history_for_llm_truncates():
    conv = {
        "messages": [
            {"role": "user", "content": f"msg-{i}"} if i % 2 == 0 else {"role": "assistant", "content": f"reply-{i}"}
            for i in range(20)
        ]
    }
    hist = chat_store.conversation_history_for_llm(conv, max_turns=4)
    assert len(hist) == 4
    assert hist[-1]["role"] in ("user", "assistant")