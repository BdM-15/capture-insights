#!/usr/bin/env python
"""
Generate a Capture Profile DOCX stub for a NAICS code.

This is the next small focused chunk after the data queries + API.

Usage (after uv sync):

    uv run python scripts/generate_profile_stub.py --naics 561210

It will create a real .docx file in data/exports/ that you can open in Word.

The document contains real numbers pulled from your local DuckDB.
If Ollama is running (with your qwen3.5:9b or the configured model), it will now
actually call the LLM to write the Executive Summary section, grounded only in the
data we pulled. The exact prompt + output is logged to data/training/profiles.jsonl
for future fine-tuning.

This is a small but real step toward the flagship feature.
"""

from pathlib import Path
import typer

from backend.app.profile_generator import generate_profile_stub

app = typer.Typer(help="Generate a v0.1 DOCX capture profile stub from local data.")


@app.command()
def main(
    naics: str = typer.Option("561210", help="Primary NAICS code (e.g. 561210)"),
    output_dir: Path = typer.Option(Path("data/exports"), help="Where to save the .docx"),
):
    """Generate the stub document."""
    out_path = generate_profile_stub(naics=naics, output_dir=output_dir)
    typer.echo(f"\n✅ Capture Profile stub generated:")
    typer.echo(f"   {out_path}")
    typer.echo("\nOpen the file in Microsoft Word.")
    typer.echo("The Executive Summary was written by your local LLM (if Ollama was available) using only the data.")
    typer.echo("A training record was saved in data/training/ so we can improve the model later.")


if __name__ == "__main__":
    app()
