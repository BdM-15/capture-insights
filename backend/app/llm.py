"""
backend/app/llm.py

Thin shared client + helpers for local LLM (Ollama primary) used across the app
for agentic features (smart monitor creation from buttons, chat narratives, profiles, etc.).

Unifies the previous two access patterns (raw urllib in queries + `import ollama` in profile_generator).
Prefers the official `ollama` python package for list/chat when available (better model discovery).
Graceful fallbacks, grounded prompts, training log hook.

Warmup helpers called from lifespan for "app start warms everything".
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

try:
    import ollama
    OLLAMA_LIB_AVAILABLE = True
except Exception:
    OLLAMA_LIB_AVAILABLE = False
    ollama = None  # type: ignore

# Fallback raw http (kept for the chat path until fully migrated)
import json
import urllib.request

try:
    from .config import settings as app_settings
except ImportError:
    app_settings = None  # type: ignore


def get_configured_model() -> str:
    if app_settings and hasattr(app_settings, "ollama_model"):
        return app_settings.ollama_model
    return "qwen2.5:7b"


def list_available_models() -> List[str]:
    """Return list of model names from Ollama (empty if unreachable)."""
    if OLLAMA_LIB_AVAILABLE and ollama is not None:
        try:
            resp = ollama.list()
            return [m.get("name") or m.get("model", "") for m in (resp.get("models") or [])]
        except Exception:
            pass
    # raw fallback
    try:
        host = (app_settings.ollama_host if app_settings else "http://localhost:11434").rstrip("/")
        req = urllib.request.Request(f"{host}/api/tags")
        with urllib.request.urlopen(req, timeout=2) as r:
            data = json.loads(r.read())
            return [m.get("name") or m.get("model", "") for m in (data.get("models") or [])]
    except Exception:
        return []


def pick_best_model(preferred: str | None = None) -> str:
    """Auto-detect and pick a good instruct model if the configured one is missing."""
    configured = preferred or get_configured_model()
    available = list_available_models()
    if configured in available or not available:
        return configured
    preferred_keywords = ["qwen2.5", "qwen3", "llama3.1", "mistral-nemo", "instruct"]
    for kw in preferred_keywords:
        for cand in available:
            if kw in cand.lower() and "embed" not in cand.lower():
                return cand
    return available[0]


def call_llm(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 300,
    system: str | None = None,
) -> str:
    """
    Grounded LLM call. Returns text or a clear placeholder on any failure.
    Used by button agentic flows (smart SAM monitor), profile narratives, etc.
    """
    if not (OLLAMA_LIB_AVAILABLE and ollama is not None):
        # raw http path (matches old queries.py style)
        try:
            host = (app_settings.ollama_host if app_settings else "http://localhost:11434").rstrip("/")
            payload: Dict[str, Any] = {
                "model": pick_best_model(model),
                "prompt": (system + "\n\n" + prompt if system else prompt),
                "stream": False,
                "options": {"temperature": temperature, "num_predict": max_tokens},
            }
            req = urllib.request.Request(
                f"{host}/api/generate",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                result = json.loads(resp.read())
            text = (result.get("response") or "").strip()
            return text or "[LLM returned empty response]"
        except Exception as e:
            return f"[LLM call failed: {type(e).__name__}. Using placeholder.]"

    # Preferred: ollama lib
    try:
        chosen = pick_best_model(model)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = ollama.chat(
            model=chosen,
            messages=messages,
            options={"temperature": temperature, "num_predict": max_tokens},
        )
        text = (resp.get("message", {}).get("content") or "").strip()
        return text or "[LLM returned empty response]"
    except Exception as e:
        return f"[LLM call failed: {type(e).__name__}. Using placeholder. Error: {str(e)[:100]}]"


async def warmup_ollama() -> Dict[str, Any]:
    """Called from lifespan to preload model and report readiness (non-blocking best effort)."""
    info: Dict[str, Any] = {"ok": False, "model": get_configured_model(), "available": []}
    try:
        info["available"] = list_available_models()
        # Small call to force load into memory (keep_alive helps)
        _ = call_llm("Say 'ready'.", max_tokens=5, temperature=0.0)
        info["ok"] = True
    except Exception as e:
        info["error"] = str(e)[:120]
    return info


# Future: add call_mcp_tool or agent context builders here if they grow.
