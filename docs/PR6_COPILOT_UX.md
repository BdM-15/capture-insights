# PR6 — Co-pilot UX (research + plan)

**Goal:** Evolve the floating chat from a one-shot prompt box into a **platform-integrated assistant** comparable to Theseus — with session history, conversational turns, model choice (local + xAI frontier), and a shared shell reused by multi-turn skills.

---

## What “great” looks like (benchmarks)

| Product | Pattern | Why it works |
|---------|---------|--------------|
| **Theseus** (`chat_store.py`) | Per-workspace `chats/{id}.json`, new chat / resume / rename / delete, streaming SSE, markdown + citations, skill runs linked to workspace | Same product — file-backed sessions, RFP context on thread, regenerate/edit message |
| **Cursor / VS Code Copilot** | Side panel, `@` context, model picker, thread per task, tool calls inline | Feels embedded — not a modal chatbot |
| **Notion AI** | Block-aware, “continue conversation”, history across pages | Context follows the artifact you’re viewing |
| **Linear** | Triage agent with scoped context (issue, project), action chips | Short loops — agent does work, user confirms |
| **Microsoft Copilot (M365)** | Experience-specific history, resume prior threads | Users expect **New chat** + **History** in production |

**Anti-patterns to avoid:** Single global message array, no persistence, plain-text-only bubbles, hallucinated numbers when skills should run (fixed in PR4), preview panels that don’t stack with drawers.

---

## Current capture-insights baseline (post-PR4/5)

- Chat: in-memory `chatHistory[]`, Fast vs Smart (Ollama only), skill auto-route + `skill-invoke` responses
- Skills: `SkillInvokePanel` + `SkillRunDetail` process chain (`data/runs/`)
- Models: `XAI_API_KEY` in config + Settings connection test — **not wired to chat or multi-turn skills yet**
- Studio: `DocumentPreviewPanel` right rail (stacking fix for skill drawer)

---

## PR6 architecture (proposed)

### 1. Conversation store (mirror Theseus)

```
data/conversations/
  {conversation_id}.json
    id, title, created_at, updated_at
    model_provider: "fast" | "ollama" | "xai"
    model_name: "qwen3.5:9b" | "grok-3" | ...
    scope: { naics, pursuit_slug?, brain_snapshot_hash }
    messages: [{ id, role, content, source, run_id?, suggested_actions? }]
    linked_runs: [run_id, ...]
```

**API:**
- `GET /chat/conversations` — list summaries
- `POST /chat/conversations` — new chat
- `GET /chat/conversations/{id}` — load thread
- `PATCH /chat/conversations/{id}` — rename, change model
- `DELETE /chat/conversations/{id}`
- `POST /chat/conversations/{id}/messages` — send (replaces flat `/chat` for threaded mode)

### 2. Unified assistant shell (UI)

Replace basic floating pane with a **right-rail assistant** (Theseus/Cursor style):

```
┌─────────────────────────────────────┬──────────────────┐
│ Main app (Pipeline / Studio / …)   │ Assistant rail   │
│                                     │ [New chat] [⌄]   │
│                                     │ Model: Grok ▾    │
│                                     │ ───────────────  │
│                                     │ User message     │
│                                     │ Assistant + MD   │
│                                     │ [Run card]       │
│                                     │ [Process chain]  │
│                                     │ ───────────────  │
│                                     │ Input + context  │
└─────────────────────────────────────┴──────────────────┘
```

- **New chat** — fresh `conversation_id`, keeps scope (NAICS, active pursuit)
- **History dropdown** — resume prior sessions
- **Markdown rendering** — `marked` or lightweight MD for assistant messages
- **Run cards** — when `source=skill-invoke`, embed compact `SkillRunDetail` inline + link to full drawer

### 3. Model provider layer

Extend `backend/app/llm.py`:

```python
class LlmProvider(str, Enum):
    FAST = "fast"           # deterministic, no LLM
    OLLAMA = "ollama"
    XAI = "xai"

def chat_messages_multi_provider(messages, *, provider, model=None) -> str
```

- **Fast** — current deterministic `get_chat_response` path
- **Ollama** — local `qwen3.5:9b` (existing)
- **xAI** — OpenAI-compatible `https://api.x.ai/v1` with `grok-3` / `grok-3-mini` (config + Settings key already exist)

**UI:** Three-way toggle in assistant header (not just Smart on/off).

**Skills:** `skill_runtime.run_multi_turn_llm` accepts `provider` — same message list as co-pilot; no second wheel.

### 4. Conversational loops (not one-shot)

| Feature | Implementation |
|---------|----------------|
| Multi-turn context | Pass last N messages from conversation file to LLM / router |
| Skill continuation | `run_id` on message → “continue this run” reopens invoke with prior inquiry + transcript |
| Regenerate | Pop last assistant message, resend with same user turn |
| Edit & resend | Truncate thread at edited message, rerun |
| Streaming | SSE from `/chat/conversations/{id}/messages?stream=1` (Theseus `StreamingResponse` pattern) |

Router: run `route_skill_from_message` on **latest user message** but pass **conversation summary** for disambiguation.

### 5. Shared multi-turn runtime (skills + chat)

One envelope for both:

```json
{
  "conversation_id": "...",
  "skill_id": "proposal-generator",
  "run_id": "...",
  "turn": 3,
  "provider": "xai",
  "messages": [...],
  "inquiry": "expand section 1.2 with more proof points"
}
```

`skill_tool_loop` / `run_multi_turn_llm` append turns to the same `data/runs/` audit file **and** mirror assistant messages into the conversation — single source of truth for “what happened.”

### 6. Context chips (platform integration)

Show live context in assistant input area (not buried in prose):

- NAICS · Active pursuit · Pipeline count · Brain count
- Optional: pinned Studio file path
- “Include vault excerpt” toggle for open preview doc

---

## PR6 delivery slices (suggested order)

| Slice | Scope | Depends on |
|-------|--------|------------|
| **6a** | `ChatStore` + APIs + New chat / History UI | — |
| **6b** | `LlmProvider` + xAI in chat + Settings model labels | 6a |
| **6c** | Markdown messages + run cards inline | 6a |
| **6d** | Streaming SSE + stop button | 6b |
| **6e** | Multi-turn skills share conversation + run_id | 6a, `skill_runtime` |
| **6f** | Right-rail layout merge (chat + skill invoke + preview stacking) | 6c |

---

## Out of scope for PR6 (later)

- Voice / real-time (Copilot Studio)
- Cross-user cloud sync (local-first stays)
- Full Theseus LightRAG query modes (no KG in capture-insights)

---

## References in repo

- Theseus: `govcon-capture-vibe/src/server/chat_store.py`, `chat_routes.py`, `theseus-app-delegates.js` (`newChat`, `openChat`, `regenerateMessage`)
- capture-insights: `skill_run_store.py`, `SkillInvokePanel`, `SkillRunDetail`, `settings_connections.py` (xAI test)