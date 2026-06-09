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

from enum import Enum
from typing import Any, Dict, Iterator, List, Optional

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
    return "qwen3.5:9b"


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


def chat_messages(
    messages: List[Dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 800,
    timeout_seconds: float | None = None,
) -> str:
    """Multi-turn chat for tools-mode skills."""
    if OLLAMA_LIB_AVAILABLE and ollama is not None:
        try:
            chosen = pick_best_model(model)
            kwargs: Dict[str, Any] = {}
            if timeout_seconds is not None and timeout_seconds > 0:
                # ollama python client forwards unknown kwargs to the HTTP client
                kwargs["timeout"] = timeout_seconds
            resp = ollama.chat(
                model=chosen,
                messages=messages,
                options={"temperature": temperature, "num_predict": max_tokens},
                **kwargs,
            )
            text = (resp.get("message", {}).get("content") or "").strip()
            return text or "[LLM returned empty response]"
        except Exception as e:
            return f"[LLM call failed: {type(e).__name__}. Error: {str(e)[:100]}]"
    # Fallback: flatten to single prompt
    parts = []
    for m in messages:
        role = m.get("role", "user")
        parts.append(f"{role.upper()}: {m.get('content', '')}")
    return call_llm("\n\n".join(parts), model=model, temperature=temperature, max_tokens=max_tokens)


class LlmProvider(str, Enum):
    FAST = "fast"
    OLLAMA = "ollama"
    XAI = "xai"


def default_xai_model() -> str:
    return "grok-3-mini"


def chat_messages_multi_provider(
    messages: List[Dict[str, str]],
    *,
    provider: str | LlmProvider = LlmProvider.OLLAMA,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 1200,
    timeout_seconds: float | None = 45.0,
) -> tuple[str, str]:
    """Returns (text, model_label)."""
    prov = provider.value if isinstance(provider, LlmProvider) else str(provider)
    if prov == LlmProvider.XAI.value:
        return _chat_xai(messages, model=model or default_xai_model(), temperature=temperature, max_tokens=max_tokens, timeout=timeout_seconds), model or default_xai_model()
    return chat_messages(messages, model=model, temperature=temperature, max_tokens=max_tokens, timeout_seconds=timeout_seconds), pick_best_model(model)


def iter_stream_chat_messages_multi_provider(
    messages: List[Dict[str, str]],
    *,
    provider: str | LlmProvider = LlmProvider.OLLAMA,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 1200,
    timeout_seconds: float | None = 90.0,
) -> Iterator[str]:
    """Yield assistant text chunks for SSE streaming."""
    prov = provider.value if isinstance(provider, LlmProvider) else str(provider)
    if prov == LlmProvider.XAI.value:
        yield from _stream_xai(
            messages,
            model=model or default_xai_model(),
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout_seconds,
        )
        return
    yield from _stream_ollama(
        messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_seconds=timeout_seconds,
    )


def _stream_ollama(
    messages: List[Dict[str, str]],
    *,
    model: str | None,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float | None,
) -> Iterator[str]:
    chosen = pick_best_model(model)
    if OLLAMA_LIB_AVAILABLE and ollama is not None:
        try:
            kwargs: Dict[str, Any] = {}
            if timeout_seconds is not None and timeout_seconds > 0:
                kwargs["timeout"] = timeout_seconds
            stream = ollama.chat(
                model=chosen,
                messages=messages,
                stream=True,
                options={"temperature": temperature, "num_predict": max_tokens},
                **kwargs,
            )
            for chunk in stream:
                text = (chunk.get("message") or {}).get("content") or ""
                if text:
                    yield text
            return
        except Exception as exc:
            yield f"[LLM stream failed: {type(exc).__name__}: {str(exc)[:100]}]"
            return
    yield from _iter_chars(call_llm(
        "\n\n".join(f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in messages),
        model=chosen,
        temperature=temperature,
        max_tokens=max_tokens,
    ))


def _iter_chars(text: str) -> Iterator[str]:
    step = 24
    for i in range(0, len(text), step):
        yield text[i : i + step]


def _stream_xai(
    messages: List[Dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
    timeout: float | None,
) -> Iterator[str]:
    from .api_keys import is_xai_key_configured

    if not is_xai_key_configured():
        yield "[xAI not configured — set XAI_API_KEY in .env and test in Settings]"
        return

    base = (app_settings.xai_base_url if app_settings else "https://api.x.ai/v1").rstrip("/")
    key = app_settings.xai_api_key if app_settings else ""
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    try:
        import httpx

        with httpx.Client(timeout=timeout or 90) as client:
            with client.stream(
                "POST",
                f"{base}/chat/completions",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {key}",
                },
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = parsed.get("choices") or []
                    if not choices:
                        continue
                    delta = (choices[0].get("delta") or {}).get("content") or ""
                    if delta:
                        yield delta
    except Exception as exc:
        yield f"[xAI stream failed: {type(exc).__name__}: {str(exc)[:160]}]"


def _chat_xai(
    messages: List[Dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
    timeout: float | None,
) -> str:
    from .api_keys import is_xai_key_configured

    if not is_xai_key_configured():
        return "[xAI not configured — set XAI_API_KEY in .env and test in Settings]"

    base = (app_settings.xai_base_url if app_settings else "https://api.x.ai/v1").rstrip("/")
    key = app_settings.xai_api_key if app_settings else ""
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout or 45) as resp:
            data = json.loads(resp.read())
        choices = data.get("choices") or []
        if choices:
            text = (choices[0].get("message") or {}).get("content") or ""
            return text.strip() or "[xAI returned empty response]"
        return "[xAI returned no choices]"
    except Exception as exc:
        return f"[xAI call failed: {type(exc).__name__}: {str(exc)[:160]}]"


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
