"""Catalog of the eight 1102tools federal-contracting MCP servers.

Users think in MCPs (SAM.gov, USASpending, …), not individual tool endpoints.
The app surfaces servers first; endpoints are nested for awareness only.
"""

from __future__ import annotations

from typing import Any, Dict, List

FEDERAL_MCP_SERVERS: List[Dict[str, Any]] = [
    {
        "id": "sam-gov-mcp",
        "name": "SAM.gov",
        "package": "sam-gov-mcp",
        "category": "procurement",
        "use_when": "Entity registration, exclusions, live opportunities, FPDS-style awards, federal hierarchy, subawards",
        "api_key": "SAM_API_KEY",
        "integrated": True,
    },
    {
        "id": "usaspending-gov-mcp",
        "name": "USASpending.gov",
        "package": "usaspending-gov-mcp",
        "executable": "usaspending-mcp",
        "category": "procurement",
        "use_when": "Contract & award history, recipients, agencies, subawards, Treasury accounts",
        "api_key": None,
        "integrated": True,
    },
    {
        "id": "gsa-calc-mcp",
        "name": "GSA CALC+",
        "package": "gsa-calc-mcp",
        "category": "procurement",
        "use_when": "MAS awarded NTE hourly rates — price realism & IGCE support",
        "api_key": None,
        "integrated": True,
    },
    {
        "id": "bls-oews-mcp",
        "name": "BLS OEWS",
        "package": "bls-oews-mcp",
        "category": "procurement",
        "use_when": "Market wage benchmarks by occupation and metro",
        "api_key": "BLS_API_KEY",
        "integrated": True,
    },
    {
        "id": "gsa-perdiem-mcp",
        "name": "GSA Per Diem",
        "package": "gsa-perdiem-mcp",
        "category": "procurement",
        "use_when": "CONUS lodging & M&IE travel rates",
        "api_key": "DATA_GOV_API_KEY",
        "integrated": True,
    },
    {
        "id": "ecfr-mcp",
        "name": "eCFR",
        "package": "ecfr-mcp",
        "category": "regulatory",
        "use_when": "Current CFR text — FAR, DFARS, agency supplements",
        "api_key": None,
        "integrated": True,
    },
    {
        "id": "federal-register-mcp",
        "name": "Federal Register",
        "package": "federal-register-mcp",
        "category": "regulatory",
        "use_when": "Proposed/final rules, notices, executive orders, FAR cases",
        "api_key": None,
        "integrated": True,
    },
    {
        "id": "regulations-gov-mcp",
        "name": "Regulations.gov",
        "package": "regulationsgov-mcp",
        "category": "regulatory",
        "use_when": "Rulemaking dockets, public comments, comment-period tracking",
        "api_key": "DATA_GOV_API_KEY",
        "integrated": True,
    },
]


def get_mcp_server(server_id: str) -> Dict[str, Any] | None:
    for spec in FEDERAL_MCP_SERVERS:
        if spec["id"] == server_id:
            return spec
    return None


def build_mcp_catalog(
    discovered_tools: Dict[str, List[Dict[str, Any]]] | None = None,
) -> Dict[str, Any]:
    """Merge static server metadata with live-discovered tool lists per MCP."""
    discovered_tools = discovered_tools or {}
    servers: List[Dict[str, Any]] = []
    flat_tools: List[Dict[str, Any]] = []

    for spec in FEDERAL_MCP_SERVERS:
        sid = spec["id"]
        live = discovered_tools.get(sid) or []
        status = "online" if live else ("integrated" if spec.get("integrated") else "catalog")
        server = {
            **spec,
            "status": status,
            "tool_count": len(live),
            "tools": live,
        }
        servers.append(server)
        for t in live:
            flat_tools.append({**t, "server_id": sid, "server_name": spec["name"]})

    online_count = sum(1 for s in servers if s["status"] == "online")
    return {
        "servers": servers,
        "tools": flat_tools,
        "server_count": len(servers),
        "online_count": online_count,
    }