import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { COMBO_TIER_META } from '../../utils/comboIntel'
import { signalChips, type OpportunityRow } from '../../utils/opportunitiesIntel'

interface RecompeteRowCardProps {
  row: OpportunityRow
  expanded: boolean
  isHot?: boolean
  onToggle: () => void
  onTrack: () => void
  expandedActions: ReactNode
}

export function RecompeteRowCard({
  row,
  expanded,
  isHot,
  onToggle,
  onTrack,
  expandedActions,
}: RecompeteRowCardProps) {
  const tierMeta = COMBO_TIER_META[row.combo_tier]
  const score = row.display_score ?? row.combo_score ?? 0
  const millions = row.obligation_millions ?? (row.obligation || 0) / 1e6
  const endLabel = row.end_date?.slice?.(0, 7) || row.end_date || '—'
  const chips = signalChips(row.signals).slice(0, 3)
  const liveHits = row.live_sam_hits?.length ?? 0

  return (
    <div className={`recompete-row-card ${isHot ? 'is-hot' : ''} ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" className="recompete-row-main" onClick={onToggle} aria-expanded={expanded}>
        <div className="recompete-row-priority">
          <span className={`recompete-tier-badge ${tierMeta?.tone || 'text-text-500'}`}>
            {row.tier_label || tierMeta?.label || row.combo_tier}
          </span>
          <span className="recompete-score">{score}</span>
        </div>

        <div className="recompete-row-body min-w-0">
          <div className="recompete-row-title">
            <span className="truncate" title={row.recipient}>{row.recipient || '—'}</span>
            <span className="recompete-row-sep">·</span>
            <span className="truncate text-neon-cyan" title={row.agency}>{row.agency || '—'}</span>
          </div>
          <div className="recompete-row-meta">
            {chips.map((s) => (
              <span key={s.key} className={`recompete-signal ${s.tone}`}>{s.label}</span>
            ))}
            {row.in_brain && <span className="recompete-status text-neon-lime">Brain</span>}
            {row.has_monitor && <span className="recompete-status text-neon-cyan">Monitor</span>}
            {liveHits > 0 && <span className="recompete-status text-neon-lime">{liveHits} SAM</span>}
          </div>
        </div>

        <div className="recompete-row-timing">
          <span className="recompete-end">{endLabel}</span>
          <span className="recompete-months">{row.months_to_end ?? '?'}mo</span>
        </div>

        <div className="recompete-row-value tabular-nums text-neon-cyan">
          ${millions.toFixed(1)}M
        </div>

        <ChevronDown size={14} className={`recompete-chevron shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <div className="recompete-row-footer">
        <button type="button" className="action-btn pipeline text-xs" onClick={onTrack}>
          + Track
        </button>
        <button type="button" className="action-btn ghost text-xs" onClick={onToggle}>
          {expanded ? 'Less' : 'Details'}
        </button>
      </div>

      {expanded && (
        <div className="recompete-row-detail">
          {row.suggested_sam_keywords && (
            <div className="text-[10px] text-text-500 mb-2">
              SAM seed: <span className="text-text-400">{row.suggested_sam_keywords}</span>
            </div>
          )}
          {liveHits > 0 && (
            <div className="text-[10px] text-neon-lime mb-2">
              {liveHits} live SAM hit{liveHits === 1 ? '' : 's'} on this cycle
            </div>
          )}
          <div className="recompete-row-detail-actions">{expandedActions}</div>
        </div>
      )}
    </div>
  )
}