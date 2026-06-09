"""
profile_generator.py

This is a focused, small chunk to produce a real .docx file from the data we already have.

Goal for this chunk:
- Take a "snapshot" (market summary + top agencies + expiring) for a NAICS
- Generate a professional-looking Word document with clear sections
- Include real numbers from DuckDB + citations (award keys or "synthetic demo")
- Have obvious placeholders where the LLM will fill narrative later ("Win Themes", "Executive Summary narrative", etc.)
- Save the file so the user can open it in Word and see something real immediately

This directly advances the flagship "Automated Capture Profile Generator" capability.

Everything is commented in plain language.

Later we will:
- Pass rich context to Ollama (or xAI) to fill the narrative parts
- Log the exact (context, good_output) pairs into data/training/ for fine-tuning
- Make this callable from the API and the future React UI

Current output is intentionally a "stub" / v0.1 so we can iterate fast without over-engineering.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

from .queries import get_quick_opportunity_snapshot

# Optional LLM integration for narrative sections
try:
    import ollama
    from backend.app.config import settings as app_settings
    OLLAMA_AVAILABLE = True
except Exception:
    OLLAMA_AVAILABLE = False
    app_settings = None  # type: ignore


def _add_heading_with_style(doc: Document, text: str, level: int = 1) -> None:
    heading = doc.add_heading(text, level=level)
    return heading


def _add_key_value_paragraph(doc: Document, label: str, value: str) -> None:
    p = doc.add_paragraph()
    run = p.add_run(f"{label}: ")
    run.bold = True
    p.add_run(str(value))


def generate_profile_stub(
    naics: str = "561210",
    output_dir: Path | None = None,
    db_path: Path | None = None,
) -> Path:
    """
    Generate a basic .docx capture profile stub for the given NAICS.

    This is the "hello world" version of the flagship feature.

    It pulls real data using the queries we already built, then lays it out
    in a clean Word document with sections that match the classic capture profile structure.

    Returns the Path to the created .docx file.
    """
    snapshot = get_quick_opportunity_snapshot(naics)

    summary = snapshot.get("summary", {})
    top_agencies = snapshot.get("top_agencies", [])
    expiring = snapshot.get("expiring_soon", [])

    if output_dir is None:
        output_dir = Path("data/exports")
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    filename = f"{naics}_Capture_Profile_Stub_{timestamp}.docx"
    output_path = output_dir / filename

    doc = Document()

    # Title
    title = doc.add_heading(f"Capture Profile (Stub) – NAICS {naics}", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Meta block
    meta = doc.add_paragraph()
    meta.add_run("Generated: ").bold = True
    meta.add_run(datetime.now().strftime("%Y-%m-%d %H:%M"))
    meta.add_run("   |   Data source: Local DuckDB (demo data)")
    meta.add_run("   |   This is a v0.1 stub – narrative sections are placeholders")

    doc.add_paragraph()

    # 1. Executive Summary
    _add_heading_with_style(doc, "1. Executive Summary", 1)

    # Try to get a real LLM-written narrative (grounded in the data)
    narrative = generate_executive_summary_narrative(
        naics=naics,
        summary=summary,
        top_agencies=top_agencies,
    )

    p = doc.add_paragraph(narrative)

    # Log this as a training example (even if it was a placeholder)
    try:
        log_training_example(
            naics=naics,
            task="executive_summary",
            input_context={
                "summary": summary,
                "top_agencies": top_agencies[:3] if top_agencies else [],
            },
            output_text=narrative,
            model_used=model or "placeholder",
        )
    except Exception:
        pass  # logging failure should never break profile generation

    doc.add_paragraph()
    _add_key_value_paragraph(doc, "Total actions in scope", summary.get("total_actions", "N/A"))
    _add_key_value_paragraph(doc, "Total obligated (millions)", f"${summary.get('total_millions', 0)}M")
    _add_key_value_paragraph(doc, "Average action size (thousands)", f"${summary.get('avg_thousands', 0)}K")
    _add_key_value_paragraph(doc, "Date range in data", f"{summary.get('earliest_date')} to {summary.get('latest_date')}")

    doc.add_paragraph()

    # 2. Market Overview
    _add_heading_with_style(doc, "2. Market Overview", 1)

    if top_agencies:
        table = doc.add_table(rows=1, cols=3)
        table.style = 'Table Grid'
        hdr_cells = table.rows[0].cells
        hdr_cells[0].text = "Agency"
        hdr_cells[1].text = "Actions"
        hdr_cells[2].text = "Total ($M)"

        for agency in top_agencies:
            row_cells = table.add_row().cells
            row_cells[0].text = str(agency.get("agency", ""))
            row_cells[1].text = str(agency.get("actions", ""))
            row_cells[2].text = str(agency.get("total_millions", ""))

        doc.add_paragraph()
    else:
        doc.add_paragraph("No agency data available in current snapshot.")

    # 3. Opportunity Highlights (expiring / recompete radar)
    _add_heading_with_style(doc, "3. Opportunity Highlights – Contracts Ending Soon", 1)

    if expiring:
        table = doc.add_table(rows=1, cols=4)
        table.style = 'Table Grid'
        hdr = table.rows[0].cells
        hdr[0].text = "Award ID"
        hdr[1].text = "Recipient"
        hdr[2].text = "Obligation ($)"
        hdr[3].text = "End Date"

        for item in expiring:
            row = table.add_row().cells
            row[0].text = str(item.get("award_id", ""))
            row[1].text = str(item.get("recipient", ""))
            row[2].text = f"{item.get('obligation', 0):,.0f}"
            row[3].text = str(item.get("end_date", ""))
    else:
        p = doc.add_paragraph()
        p.add_run("No contracts shown as expiring in the current synthetic data window. ").italic = True
        p.add_run("When using real data this section will list real recompete candidates with citations to the source award records.")

    doc.add_paragraph()

    # 4. Win Themes (placeholder)
    _add_heading_with_style(doc, "4. Win Themes (AI-generated in final version)", 1)
    p = doc.add_paragraph()
    p.add_run(
        "[This section will be populated by the LLM using your company stance + the data above + "
        "any live SAM opportunities. Each theme will include citations back to specific award keys or "
        "MCP results so everything is traceable.]"
    ).italic = True

    doc.add_paragraph("Example structure that will appear:")
    doc.add_paragraph("• Theme 1: Proven performance in [specific sub-area] demonstrated by X consecutive awards totaling $Y (source: award keys ...)", style='List Bullet')
    doc.add_paragraph("• Theme 2: ...", style='List Bullet')

    # 5. Methodology & Citations
    _add_heading_with_style(doc, "5. Methodology & Data Citations", 1)

    p = doc.add_paragraph()
    p.add_run("Data source: ").bold = True
    p.add_run("Local DuckDB file (data/capture.duckdb). All figures come from the usaspending_prime_awards table filtered to the requested NAICS code(s).")

    p = doc.add_paragraph()
    p.add_run("This stub was generated without any external API calls (except possibly future MCP enrichment).")

    p = doc.add_paragraph()
    p.add_run("In the production version every number and narrative claim will carry explicit citations (award unique keys, SAM solicitation IDs, date of data pull, model version used).")

    # Footer note
    doc.add_paragraph()
    footer = doc.add_paragraph()
    footer.add_run("=== END OF STUB ===").bold = True
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER

    p = doc.add_paragraph()
    p.add_run(
        "Next steps for this feature: wire in real LLM calls for the narrative sections, "
        "add your company stance data, pull live opportunities via MCP, and log (context + output) "
        "pairs for fine-tuning."
    ).italic = True

    doc.save(output_path)
    return output_path


def generate_executive_summary_narrative(
    naics: str,
    summary: Dict[str, Any],
    top_agencies: List[Dict[str, Any]],
    model: str | None = None,
) -> str:
    """
    Use local LLM (Ollama) to write a short Executive Summary narrative.

    The prompt is deliberately grounded: we pass the actual numbers from DuckDB
    and instruct the model to use only that data + be concise and cite sources.

    This is the first real example of "AI-assisted" content in the profile.
    We also return the text so the caller can log it for training data.
    """
    if not OLLAMA_AVAILABLE:
        return (
            "[LLM not available in this environment. "
            "In normal use this would be written by your local model "
            "using the exact numbers below.]"
        )

    configured = model or (app_settings.ollama_model if app_settings else "qwen3.5:9b")

    # Auto-detect available models and pick a sensible one if the configured isn't present
    try:
        available = [m.get("name") or m.get("model", "") for m in ollama.list().get("models", [])]
        if configured not in available and available:
            # Prefer good instruct-style models
            preferred_keywords = ["qwen2.5", "qwen3", "llama3.1", "mistral-nemo", "instruct"]
            for kw in preferred_keywords:
                for candidate in available:
                    if kw in candidate.lower() and "embed" not in candidate.lower():
                        configured = candidate
                        break
                if configured != (model or (app_settings.ollama_model if app_settings else "")):
                    break
            if configured not in available:
                configured = available[0]
    except Exception:
        pass

    model = configured

    # Build a tight, grounded context
    context_lines = [
        f"NAICS: {naics}",
        f"Total actions: {summary.get('total_actions', 'N/A')}",
        f"Total obligated: ${summary.get('total_millions', 0)} million",
        f"Average action size: ${summary.get('avg_thousands', 0)} thousand",
        f"Date range: {summary.get('earliest_date')} to {summary.get('latest_date')}",
    ]
    if top_agencies:
        context_lines.append("Top agencies by spend:")
        for a in top_agencies[:3]:
            context_lines.append(f"  - {a.get('agency')}: ${a.get('total_millions')}M ({a.get('actions')} actions)")

    context = "\n".join(context_lines)

    prompt = f"""You are a professional government contracting capture analyst.

Write a concise, professional Executive Summary (3-5 sentences) for a Capture Profile.

Use ONLY the following data. Do not invent numbers or agencies.

Be direct and evidence-based. Mention the most important agency and any notable patterns.

End with one sentence on strategic implication for a company pursuing work in this NAICS.

Data:
{context}

Write the summary now:"""

    try:
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.3, "num_predict": 250},
        )
        text = response.get("message", {}).get("content", "").strip()
        if not text:
            text = "[LLM returned empty response]"
        return text
    except Exception as e:
        return f"[LLM call failed: {type(e).__name__}. Using placeholder. Error: {str(e)[:120]}]"


def log_training_example(
    naics: str,
    task: str,
    input_context: Dict[str, Any],
    output_text: str,
    model_used: str,
    path: Path | None = None,
) -> None:
    """
    Append a training example for future fine-tuning.

    This is how we will collect high-quality (prompt/context, good_output) pairs
    every time the user approves or edits a generated section.

    Stored as simple JSONL so it's easy to use later with fine-tuning tools.
    """
    if path is None:
        path = Path("data/training/profiles.jsonl")
    path.parent.mkdir(parents=True, exist_ok=True)

    import json
    from datetime import datetime

    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "task": task,
        "naics": naics,
        "model": model_used,
        "input": input_context,
        "output": output_text,
    }

    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    # Allow quick manual test
    out = generate_profile_stub("561210")
    print(f"Generated stub profile at: {out}")
    print("Open it in Microsoft Word to see the current v0.1 layout.")