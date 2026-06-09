#!/usr/bin/env python3
"""CI helper — exit 1 if any skills/*/SKILL.md fails agentskills.io validation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.skill_validation import validate_all_skills  # noqa: E402


def main() -> int:
    report = validate_all_skills()
    print(json.dumps({
        "ok": report["ok"],
        "skill_count": report["skill_count"],
        "error_count": report["error_count"],
        "validator": report["validator"],
    }, indent=2))

    if not report["ok"]:
        for row in report["results"]:
            if not row["ok"]:
                print(f"\n{row['skill_id']}:")
                for p in row["problems"]:
                    print(f"  - {p}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())