import { relationshipStrength } from '../../utils/agencyIntel'
import type { RelationshipHeatmapModel } from '../../utils/agencyIntel'

interface RelationshipHeatmapProps {
  model: RelationshipHeatmapModel
  onAgencyClick?: (agency: string) => void
  onCellClick?: (agency: string, recipient: string, actions: number) => void
}

function shortLabel(value: string, max = 14): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function RelationshipHeatmap({ model, onAgencyClick, onCellClick }: RelationshipHeatmapProps) {
  const { agencies, recipients, cells, maxActions } = model
  if (!agencies.length || !recipients.length) {
    return <div className="chart-module-empty">Need agency–competitor award data in this NAICS slice.</div>
  }

  return (
    <div className="relationship-heatmap-wrap">
      <div
        className="relationship-heatmap-grid"
        style={{ gridTemplateColumns: `minmax(88px, 1.1fr) repeat(${recipients.length}, minmax(44px, 1fr))` }}
      >
        <div className="relationship-heatmap-corner" />
        {recipients.map((recipient) => (
          <div key={recipient} className="relationship-heatmap-col-head" title={recipient}>
            {shortLabel(recipient, 12)}
          </div>
        ))}

        {agencies.map((agency) => (
          <div key={agency} className="relationship-heatmap-row">
            <button
              type="button"
              className="relationship-heatmap-row-head"
              title={`${agency} — filter recompetes`}
              onClick={() => onAgencyClick?.(agency)}
            >
              {shortLabel(agency, 16)}
            </button>
            {recipients.map((recipient) => {
              const cell = cells.get(`${agency}|${recipient}`)
              const actions = cell?.actions || 0
              const strength = relationshipStrength(actions, maxActions)
              const millions = cell?.millions
              const title = cell
                ? `${agency} × ${recipient}: ${actions} awards${millions != null ? ` · $${millions}M` : ''}`
                : `${agency} × ${recipient}: no awards in slice`

              return (
                <button
                  key={`${agency}-${recipient}`}
                  type="button"
                  className={`relationship-heatmap-cell${actions ? ' has-data' : ''}`}
                  title={title}
                  style={{
                    backgroundColor: actions
                      ? `rgba(var(--neon-magenta-rgb), ${0.12 + strength * 0.72})`
                      : undefined,
                  }}
                  onClick={() => {
                    if (actions && onCellClick) onCellClick(agency, recipient, actions)
                  }}
                >
                  {actions > 0 ? (
                    <span className="relationship-heatmap-cell-value">{actions}</span>
                  ) : (
                    <span className="relationship-heatmap-cell-empty">·</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-text-500 mt-2">
        Cell = award count (stronger fill = more awards). Click agency row to filter Future Opportunities; click cell to track competitor.
      </div>
    </div>
  )
}