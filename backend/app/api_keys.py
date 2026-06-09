"""Central API key presence checks — never expose values."""

from __future__ import annotations

from .config import settings

_PLACEHOLDER_FRAGMENTS = (
    "your_sam_api_key_here",
    "your_xai_key_here",
    "your_bls_api_key_here",
    "your_datagov_key_here",
)


def _clean(val: str | None) -> str:
    if not val:
        return ""
    # Strip inline .env comments if parser left them attached
    return val.split("#", 1)[0].strip()


def _is_placeholder(val: str) -> bool:
    low = val.lower()
    return not val or low.startswith("your_") or any(p in low for p in _PLACEHOLDER_FRAGMENTS)


def is_sam_key_configured() -> bool:
    key = _clean(settings.sam_api_key)
    return bool(key) and not _is_placeholder(key) and len(key) >= 20


def is_xai_key_configured() -> bool:
    key = _clean(settings.xai_api_key)
    return bool(key) and not _is_placeholder(key) and len(key) >= 8


def is_bls_key_configured() -> bool:
    key = _clean(settings.bls_api_key)
    return bool(key) and not _is_placeholder(key) and len(key) >= 8


def is_data_gov_key_configured() -> bool:
    key = _clean(settings.data_gov_api_key)
    return bool(key) and not _is_placeholder(key) and len(key) >= 8


def is_env_key_configured(env_key: str | None) -> bool:
    if not env_key:
        return True
    mapping = {
        "SAM_API_KEY": is_sam_key_configured,
        "BLS_API_KEY": is_bls_key_configured,
        "DATA_GOV_API_KEY": is_data_gov_key_configured,
        "REGULATIONS_GOV_API_KEY": is_data_gov_key_configured,
        "XAI_API_KEY": is_xai_key_configured,
    }
    checker = mapping.get(env_key)
    return checker() if checker else False