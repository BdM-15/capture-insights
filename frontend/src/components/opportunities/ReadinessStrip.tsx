import type { WorkstationReadiness } from '../../utils/opportunitiesIntel'

interface ReadinessStripProps {
  readiness: WorkstationReadiness | null
}

export function ReadinessStrip({ readiness }: ReadinessStripProps) {
  const checks = readiness?.checks || {}
  const samBudget = readiness?.sam_budget
  const ok = readiness?.status === 'ready'

  return (
    <div className={`readiness-strip ${ok ? '' : 'is-degraded'}`}>
      <span className={`readiness-strip-status ${ok ? 'text-neon-lime' : 'text-neon-amber'}`}>
        {ok ? 'Ready' : 'Degraded'}
      </span>
      <span className="readiness-strip-item">DuckDB {checks.duckdb ? '✓' : '✗'}</span>
      <span className="readiness-strip-item">SAM {readiness?.sam_api_configured ? '✓' : '—'}</span>
      <span className="readiness-strip-item">
        MCP {readiness?.mcp_tools_count ? `${readiness.mcp_tools_count} tools` : 'off'}
      </span>
      {samBudget && (
        <span className="readiness-strip-item text-neon-cyan">
          Budget {samBudget.remaining}/{samBudget.limit}
        </span>
      )}
    </div>
  )
}