"""Data analyzer — EDA on pursuit datasets + DuckDB market slice (no KG)."""

from __future__ import annotations

import json
import re
import statistics
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from ..deterministic.pursuit_paths import pursuit_competitive_intel_json_path
from ..pursuit_intel import gather_usaspending_intel
from ..queries import DEFAULT_DB_PATH, get_db_connection
from ..user_data import write_knowledge_file

_KNOWLEDGE = Path("data") / "knowledge"
_STRUCT_SUFFIXES = (".csv", ".tsv", ".json", ".parquet")


def _list_structured_files(slug: str) -> List[Path]:
    base = (_KNOWLEDGE / "pursuits" / slug).resolve()
    if not base.is_dir():
        return []
    out: List[Path] = []
    for p in sorted(base.rglob("*")):
        if p.is_file() and p.suffix.lower() in _STRUCT_SUFFIXES:
            if p.name.endswith("_sheets.json"):
                continue
            out.append(p)
    return out


def _rel_path(path: Path) -> str:
    return str(path.relative_to(_KNOWLEDGE.resolve())).replace("\\", "/")


def _infer_workflow(inquiry: str) -> str:
    msg = (inquiry or "").lower()
    if any(k in msg for k in ("trend", "time series", "over time", "burn rate")):
        return "trend_analysis"
    if any(k in msg for k in ("compare", " vs ", "versus", "segment")):
        return "comparative"
    if any(k in msg for k in ("anomal", "outlier")):
        return "anomaly_detection"
    if any(k in msg for k in ("hypothesis", "test if", "correlat")):
        return "hypothesis"
    if any(k in msg for k in ("pattern", "insight")):
        return "pattern_detection"
    return "eda"


def _profile_csv_duckdb(path: Path) -> Dict[str, Any]:
    con = duckdb.connect()
    try:
        rel = str(path).replace("\\", "/")
        safe = rel.replace("'", "''")
        row_count = con.execute(
            f"SELECT COUNT(*) FROM read_csv_auto('{safe}', ignore_errors=true)"
        ).fetchone()[0]
        cols = con.execute(
            f"DESCRIBE SELECT * FROM read_csv_auto('{safe}', ignore_errors=true)"
        ).fetchall()
        numeric_cols: List[str] = []
        for name, dtype, *_ in cols:
            if any(t in str(dtype).upper() for t in ("INT", "DOUBLE", "FLOAT", "DECIMAL", "BIGINT")):
                numeric_cols.append(str(name))
        summaries: List[Dict[str, Any]] = []
        for col in numeric_cols[:6]:
            try:
                row = con.execute(
                    f"SELECT MIN(\"{col}\"), MAX(\"{col}\"), AVG(\"{col}\"), "
                    f"STDDEV(\"{col}\"), COUNT(\"{col}\") "
                    f"FROM read_csv_auto('{safe}', ignore_errors=true)"
                ).fetchone()
                summaries.append({
                    "column": col,
                    "min": row[0],
                    "max": row[1],
                    "mean": round(float(row[2]), 4) if row[2] is not None else None,
                    "stddev": round(float(row[3]), 4) if row[3] is not None else None,
                    "non_null": row[4],
                })
            except Exception:
                continue
        return {
            "format": "csv",
            "row_count": int(row_count),
            "column_count": len(cols),
            "columns": [{"name": c[0], "type": str(c[1])} for c in cols[:20]],
            "numeric_summaries": summaries,
        }
    finally:
        con.close()


def _analyze_json_file(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"format": "json", "error": str(exc)[:200]}

    if isinstance(data, list):
        return {
            "format": "json_array",
            "row_count": len(data),
            "sample_keys": list(data[0].keys())[:12] if data and isinstance(data[0], dict) else [],
        }

    if not isinstance(data, dict):
        return {"format": "json_scalar", "type": type(data).__name__}

    arrays: Dict[str, int] = {}
    for key, val in data.items():
        if isinstance(val, list) and val:
            arrays[key] = len(val)

    profile: Dict[str, Any] = {
        "format": "json_object",
        "top_level_keys": list(data.keys())[:20],
        "array_fields": arrays,
    }

    txs = (
        data.get("transactions")
        or data.get("all_transactions")
        or (data.get("obligations") or {}).get("transactions")
        or []
    )
    if isinstance(txs, list) and txs:
        amounts: List[float] = []
        years: Dict[str, float] = {}
        for t in txs:
            if not isinstance(t, dict):
                continue
            for key in ("federal_action_obligation", "Award Amount", "amount", "obligation"):
                val = t.get(key)
                if val is not None:
                    try:
                        amt = float(val)
                        amounts.append(amt)
                        break
                    except (TypeError, ValueError):
                        pass
            date_raw = t.get("action_date") or t.get("Start Date") or t.get("date") or ""
            yr = str(date_raw)[:4]
            if yr.isdigit() and amounts:
                years[yr] = years.get(yr, 0.0) + amounts[-1]

        if amounts:
            profile["obligation_stats"] = {
                "transaction_count": len(amounts),
                "total_usd": round(sum(amounts), 2),
                "mean_usd": round(statistics.mean(amounts), 2),
                "median_usd": round(statistics.median(amounts), 2),
                "max_usd": round(max(amounts), 2),
            }
        if years:
            sorted_years = sorted(years.items())
            profile["annual_obligation_trend"] = [
                {"year": y, "total_usd": round(v, 2)} for y, v in sorted_years
            ]
            if len(sorted_years) >= 2:
                first, last = sorted_years[0][1], sorted_years[-1][1]
                profile["trend_direction"] = (
                    "increasing" if last > first * 1.05
                    else "decreasing" if last < first * 0.95
                    else "flat"
                )

    return profile


def _duckdb_market_profile(naics: str, row: Dict[str, Any], *, limit: int = 500) -> Dict[str, Any]:
    if not DEFAULT_DB_PATH.is_file():
        return {"available": False, "error": "capture.duckdb not found — run ingest first"}

    agency = str(row.get("agency") or "")
    recipient = str(row.get("recipient") or "")
    try:
        con = get_db_connection(read_only=True)
    except Exception as exc:
        return {"available": False, "error": str(exc)[:200]}

    try:
        q = """
            SELECT
                COUNT(*) AS award_count,
                SUM(COALESCE(federal_action_obligation, 0)) AS total_obligation,
                AVG(COALESCE(federal_action_obligation, 0)) AS avg_obligation,
                MIN(COALESCE(federal_action_obligation, 0)) AS min_obligation,
                MAX(COALESCE(federal_action_obligation, 0)) AS max_obligation
            FROM usaspending_prime_awards
            WHERE naics_code = ?
        """
        summary = con.execute(q, [naics]).fetchone()
        top_recipients = con.execute(
            """
            SELECT recipient_name, COUNT(*) AS n, SUM(COALESCE(federal_action_obligation, 0)) AS obl
            FROM usaspending_prime_awards
            WHERE naics_code = ?
            GROUP BY recipient_name
            ORDER BY obl DESC NULLS LAST
            LIMIT 10
            """,
            [naics],
        ).fetchall()
        top_agencies = con.execute(
            """
            SELECT parent_award_agency_name, COUNT(*) AS n, SUM(COALESCE(federal_action_obligation, 0)) AS obl
            FROM usaspending_prime_awards
            WHERE naics_code = ?
            GROUP BY parent_award_agency_name
            ORDER BY obl DESC NULLS LAST
            LIMIT 8
            """,
            [naics],
        ).fetchall()
    except Exception as exc:
        return {"available": False, "error": str(exc)[:200]}
    finally:
        con.close()

    return {
        "available": True,
        "naics": naics,
        "award_count": int(summary[0] or 0),
        "total_obligation_usd": round(float(summary[1] or 0), 2),
        "avg_obligation_usd": round(float(summary[2] or 0), 2),
        "min_obligation_usd": round(float(summary[3] or 0), 2),
        "max_obligation_usd": round(float(summary[4] or 0), 2),
        "top_recipients": [
            {"recipient": r[0], "awards": int(r[1]), "obligation_usd": round(float(r[2] or 0), 2)}
            for r in top_recipients
        ],
        "top_agencies": [
            {"agency": a[0], "awards": int(a[1]), "obligation_usd": round(float(a[2] or 0), 2)}
            for a in top_agencies
        ],
        "filter_context": {"agency": agency, "recipient": recipient},
    }


def _insights_from_profiles(
    profiles: List[Dict[str, Any]],
    workflow: str,
    market: Dict[str, Any],
) -> List[Dict[str, str]]:
    insights: List[Dict[str, str]] = []
    for p in profiles:
        if p.get("obligation_stats"):
            stats = p["obligation_stats"]
            insights.append({
                "observation": f"{stats['transaction_count']} obligation transactions totaling ${stats['total_usd']:,.0f}",
                "insight": f"Median transaction ${stats['median_usd']:,.0f} — use for burn-rate sanity checks",
                "source": p.get("source_path", "json"),
            })
        if p.get("trend_direction"):
            insights.append({
                "observation": f"Annual obligation trend is {p['trend_direction']}",
                "insight": "Compare to PoP remaining — accelerating spend may signal recompete pressure",
                "source": p.get("source_path", "json"),
            })
        if p.get("row_count") and p.get("numeric_summaries"):
            insights.append({
                "observation": f"CSV {p.get('source_path')}: {p['row_count']} rows, {p['column_count']} columns",
                "insight": f"Numeric columns profiled: {', '.join(s['column'] for s in p['numeric_summaries'][:3])}",
                "source": p.get("source_path", "csv"),
            })

    if market.get("available"):
        insights.append({
            "observation": f"DuckDB NAICS {market['naics']}: {market['award_count']:,} awards, ${market['total_obligation_usd']:,.0f} total obligation",
            "insight": f"Top recipient: {(market.get('top_recipients') or [{}])[0].get('recipient', 'n/a')}",
            "source": "duckdb:usaspending_prime_awards",
        })

    if workflow == "trend_analysis" and not any(p.get("annual_obligation_trend") for p in profiles):
        insights.append({
            "observation": "No time-series field found in pursuit files",
            "insight": "Run competitive-intel first for transaction-level obligation trend",
            "source": "workflow",
        })

    return insights[:10]


def _brief_md(envelope: Dict[str, Any], row: Dict[str, Any], inquiry: str) -> str:
    lines = [
        "---",
        "type: pursuit-artifact",
        "artifact: data_analysis",
        "---",
        "",
        "# Data analysis report",
        "",
        f"**Context:** {row.get('agency') or 'n/a'} · {row.get('recipient') or 'n/a'}",
        f"**Workflow:** {envelope.get('workflow')} · **Inquiry:** {inquiry or '(comprehensive EDA)'}",
        "",
        "## Datasets analyzed",
        "",
    ]
    for p in envelope.get("datasets") or []:
        src = p.get("source_path", "unknown")
        if p.get("error"):
            lines.append(f"- `{src}` — error: {p['error']}")
        elif p.get("row_count") is not None:
            lines.append(f"- `{src}` — {p.get('row_count')} rows ({p.get('format')})")
        elif p.get("award_count") is not None:
            lines.append(f"- DuckDB NAICS {p.get('naics')} — {p['award_count']:,} awards")
        else:
            lines.append(f"- `{src}` — {p.get('format', 'profiled')}")

    lines.extend(["", "## Key insights", ""])
    for ins in envelope.get("insights") or []:
        lines.append(f"- **{ins.get('observation')}** — {ins.get('insight')} `[{ins.get('source')}]`")

    if envelope.get("obligation_trend"):
        lines.extend(["", "## Obligation trend", ""])
        for pt in envelope["obligation_trend"][:8]:
            lines.append(f"- {pt.get('year')}: ${pt.get('total_usd', 0):,}")

    lines.extend([
        "",
        "## Limitations",
        "",
        "- Analysis is deterministic EDA — no invented statistics",
        "- Upload CSV/JSON to Studio or run competitive-intel for richer obligation series",
        "",
        f"Full JSON: `data_analysis.json`",
    ])
    return "\n".join(lines)


async def run_data_analyzer(
    row: Dict[str, Any],
    *,
    slug: str,
    naics: str = "561210",
    inquiry: str = "",
    use_llm: bool = False,
) -> Dict[str, Any]:
    workflow = _infer_workflow(inquiry)
    profiles: List[Dict[str, Any]] = []
    obligation_trend: List[Dict[str, Any]] = []

    for path in _list_structured_files(slug):
        rel = _rel_path(path)
        if path.suffix.lower() == ".csv":
            prof = _profile_csv_duckdb(path)
        elif path.suffix.lower() == ".json":
            prof = _analyze_json_file(path)
        else:
            prof = {"format": path.suffix.lower(), "note": "format recognized; deep profile deferred"}
        prof["source_path"] = rel
        profiles.append(prof)
        if prof.get("annual_obligation_trend"):
            obligation_trend = prof["annual_obligation_trend"]

    intel_rel = pursuit_competitive_intel_json_path(slug)
    intel_path = (_KNOWLEDGE / intel_rel).resolve()
    if intel_path.is_file() and intel_rel not in {p.get("source_path") for p in profiles}:
        prof = _analyze_json_file(intel_path)
        prof["source_path"] = intel_rel
        profiles.append(prof)
        if prof.get("annual_obligation_trend"):
            obligation_trend = prof["annual_obligation_trend"]

    market = _duckdb_market_profile(naics, row)
    if market.get("available"):
        market["source_path"] = "duckdb:usaspending_prime_awards"
        profiles.append(market)

    spend = gather_usaspending_intel(row, naics, limit=6)
    insights = _insights_from_profiles(profiles, workflow, market)

    envelope: Dict[str, Any] = {
        "schema_version": "1.0-capture-insights",
        "skill_id": "data-analyzer",
        "slug": slug,
        "workflow": workflow,
        "inquiry": inquiry,
        "datasets": profiles,
        "insights": insights,
        "obligation_trend": obligation_trend,
        "duckdb_context": spend,
        "capture_lens": (
            "Domain-agnostic EDA on files you already have in Studio plus DuckDB market slice — "
            "let the data drive the story; pair with competitive-intel for obligation time series."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }

    base = f"pursuits/{slug}/02_intel"
    json_rel = f"{base}/data_analysis.json"
    md_rel = f"{base}/data_analysis.md"
    brief = _brief_md(envelope, row, inquiry)

    json_path = (_KNOWLEDGE / json_rel).resolve()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")

    llm_used = False
    if use_llm and insights:
        from ..skill_registry import get_skill
        from ..skill_runtime import run_multi_turn_llm

        spec = get_skill("data-analyzer")
        extra, _ = await run_multi_turn_llm(
            system_prompt=(
                "Data analyst for capture teams. Turn EDA findings into 5 actionable bullets. "
                "Only cite numbers present in the JSON. Prefix FINAL: on last message."
            ),
            user_prompt=json.dumps({"insights": insights, "workflow": workflow}, default=str)[:10000],
            skill=spec,
        )
        if extra and "LLM call failed" not in extra:
            narrative = extra.split("FINAL:", 1)[-1].strip() if "FINAL:" in extra.upper() else extra
            brief += f"\n\n## Analyst narrative (LLM)\n\n{narrative}\n"
            envelope["narrative_llm"] = narrative
            llm_used = True
            json_path.write_text(json.dumps(envelope, indent=2, default=str), encoding="utf-8")

    if not write_knowledge_file(md_rel, brief):
        return {"ok": False, "skill_id": "data-analyzer", "error": f"failed to write {md_rel}"}

    warnings: List[str] = []
    if not profiles:
        warnings.append("No CSV/JSON in pursuit folder — analyzed DuckDB market slice only")
    if not market.get("available"):
        warnings.append(market.get("error") or "DuckDB market profile unavailable")

    return {
        "ok": True,
        "skill_id": "data-analyzer",
        "slug": slug,
        "path": md_rel,
        "json_path": json_rel,
        "finding_count": len(insights),
        "artifact_count": len(profiles),
        "used_llm": llm_used,
        "warnings": warnings,
        "summary": f"Data analysis · {workflow} · {len(profiles)} dataset(s) · {len(insights)} insights",
    }