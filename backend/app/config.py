"""
Pydantic settings for capture-insights backend.

Clean, validated, single source of truth. No monster 17k-line legacy config.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # App
    app_env: Literal["development", "staging", "production"] = "development"
    app_version: str = "0.1.0"
    log_level: str = "INFO"

    # Data - We deliberately use ONE store (DuckDB) for simplicity.
    # See docs for plain-English explanation. No Chroma/Postgres in early versions.
    duckdb_path: Path = Path("data/capture.duckdb")

    # LLM - Local first (good for 8GB VRAM), with optional xAI fallback
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"   # Safe & strong on 8GB VRAM. qwen2.5:7b or similar.
    ollama_temperature: float = 0.3

    # xAI Grok (via their OpenAI-compatible endpoint) - use when you want more power
    # or for generating training examples to later fine-tune a local model.
    xai_api_key: str | None = None
    xai_base_url: str = "https://api.x.ai/v1"

    # MCP / API keys (for federal-contracting-mcps etc.)
    sam_api_key: str | None = None
    bls_api_key: str | None = None
    data_gov_api_key: str | None = None

    sam_api_base_url: str = "https://api.sam.gov/opportunities/v2/search"

    # Feature flags
    enable_live_mcps: bool = True
    enable_ai_features: bool = True

    # Backend server
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # Frontend dev server (for convenience scripts)
    frontend_port: int = 5173

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"


settings = Settings()

# Ensure data dirs exist on import (convenience for local dev)
settings.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
settings.chroma_path.mkdir(parents=True, exist_ok=True)
