"""
Simple CLI for capture-insights (ingest, serve, chat, profile, etc.).

Run with: uv run capture-insights --help (after install) or python -m capture_insights.cli
"""

from __future__ import annotations

import typer

app = typer.Typer(help="capture-insights - local federal contract intelligence workstation")


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8000, reload: bool = True, with_frontend: bool = False):
    """Start the FastAPI backend (MCP + Ollama warmed in lifespan).
    Use --with-frontend to also launch the Vite dev server as a child (experimental).
    """
    import uvicorn

    typer.echo(f"Starting capture-insights API on http://{host}:{port} (MCP/Ollama warmup in lifespan)")
    if with_frontend:
        typer.echo("  (also launching frontend dev — close this to stop both)")
    uvicorn.run(
        "backend.app.main:app",
        host=host,
        port=port,
        reload=reload,
    )


@app.command()
def ingest_sample(naics: str = "541512", years: int = 2):
    """Ingest a small USASpending sample slice into DuckDB for dev/demo."""
    typer.echo(f"[stub] Would download small USASpending slice for NAICS {naics} last {years} years...")
    typer.echo("TODO: implement with polars + usaspending bulk or MCP + load to DuckDB.")


@app.command()
def chat(question: str):
    """Quick grounded chat test against local data + LLM."""
    typer.echo(f"[stub] Would answer: {question}")
    typer.echo("TODO: retrieve context (DuckDB + Chroma) + call Ollama + return with citations.")


@app.command()
def profile(award_id: str, output: str = "capture-profile.docx"):
    """Generate a v0 capture profile DOCX for a given award/opportunity."""
    typer.echo(f"[stub] Generating profile for {award_id} -> {output}")
    typer.echo("TODO: assemble data + stance + LLM sections + python-docx export.")


if __name__ == "__main__":
    app()
