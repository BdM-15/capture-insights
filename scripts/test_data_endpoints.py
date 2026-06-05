"""
Test the new data endpoints locally.

Run:
uv run python scripts/test_data_endpoints.py

This starts the FastAPI app in memory (no real server needed) and calls the endpoints.
It proves that the queries module + API layer are working together.

We set PYTHONPATH so the import finds everything from the repo root.
"""

import os
import sys
from pathlib import Path

# Make sure we can import from the repo root
repo_root = Path(__file__).parent.parent
sys.path.insert(0, str(repo_root))

from fastapi.testclient import TestClient

# Import the app we just built
from backend.app.main import app

client = TestClient(app)

print("=== Testing /health ===")
r = client.get("/health")
print(r.json())

print("\n=== Testing /data/summary (default 561210) ===")
r = client.get("/data/summary")
print(r.json())

print("\n=== Testing /data/top-agencies ===")
r = client.get("/data/top-agencies?naics=561210&limit=3")
print(r.json())

print("\n=== Testing /data/expiring ===")
r = client.get("/data/expiring?naics=561210&months=36&limit=5")
print(r.json())

print("\n=== Testing /data/snapshot (combined view) ===")
r = client.get("/data/snapshot?naics=561210")
print(r.json())

print("\n✅ All basic data endpoints are responding. Ready for frontend or agent use.")
