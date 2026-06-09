"""Tools-mode skill runners (PR2).

Runners are imported lazily from skill_invoke_service to avoid heavy deps at package load.
"""

from .competitive_intel import run_competitive_intel

__all__ = ["run_competitive_intel"]