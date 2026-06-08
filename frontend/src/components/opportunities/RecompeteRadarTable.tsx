import { ChevronDown } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'
import type { GlossaryId } from '../../constants/captureGlossary'
import { getGlossaryTip } from '../../constants/captureGlossary'
import { COMBO_SIGNAL_META, COMBO_TIER_META } from '../../utils/comboIntel'
import { signalChips, type OpportunityRow } from '../../utils/opportunitiesIntel'
import { FieldTip } from '../ui/FieldTip'

interface ColumnDef {
  key: string
  label: string
  tipId: GlossaryId
  align?: 'left' | 'right'
}

const COLUMNS: ColumnDef[] = [
  { key: 'priority', label: 'Priority', tipId: 'combo_tier' },
  { key: 'incumbent', label: 'Incumbent', tipId: 'incumbent_holder' },
  { key: 'customer', label: 'Customer agency', tipId: 'hot_agency' },
  { key: 'ends', label: 'Contract ends', tipId: 'recompete_radar' },
  { key: 'value', label: 'Obligated value', tipId: 'future_funding', align: 'right' },
  { key: 'why', label: 'Why flagged', tipId: 'combo_signal' },
  { key: 'status', label: 'Your tracking', tipId: 'your_tracking_status' },
  { key: 'action', label: 'Action', tipId: 'recompete_radar' },
]

interface RecompeteRadarTableProps {
  rows: OpportunityRow[]
  expandedKey: string | null
  rowKey: (row: OpportunityRow, index: number) => string
  isHotAgency: (agency: string) => boolean
  onToggleExpand: (key: string) => void
  onTrack: (row: OpportunityRow) => void
  onOpenWorkspace?: (row: OpportunityRow) => void
  renderExpandedActions: (row: OpportunityRow) => ReactNode
  onGlossaryLearn?: (termId: GlossaryId) => void
}

function SignalList({
  row,
  showAll,
  onToggleMore,
  hiddenCount,
}: {
  row: OpportunityRow
  showAll: boolean
  onToggleMore: () => void
  hiddenCount: number
}) {
  const allChips = signalChips(row.signals)
  const visible = showAll ? allChips : allChips.slice(0, 2)

  if (allChips.length === 0) {
    return <span className="text-text-500">—</span>
  }

  return (
    <div className="flex flex-col gap-0.5 items-start">
      {visible.map((s) => (
        <span
          key={s.key}
          className={`text-[9px] ${s.tone}`}
          title={COMBO_SIGNAL_META[s.key as keyof typeof COMBO_SIGNAL_META]?.label || s.label}
        >
          {COMBO_SIGNAL_META[s.key as keyof typeof COMBO_SIGNAL_META]?.label || s.label}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onToggleMore}
          className="text-[9px] text-neon-cyan hover:underline"
          title="Show all reasons this contract was ranked"
        >
          {showAll ? 'Show fewer' : `+${hiddenCount} more reasons`}
        </button>
      )}
    </div>
  )
}

function TrackingStatus({ row }: { row: OpportunityRow }) {
  const liveHits = row.live_sam_hits?.length ?? 0
  const lines: { text: string; className: string; tip?: string }[] = []

  if (row.in_brain) {
    lines.push({
      text: 'In your vault',
      className: 'text-neon-lime',
      tip: 'A competitor or agency on this row is already in your Knowledge Vault / Brain.',
    })
  }
  if (row.has_monitor) {
    lines.push({
      text: 'SAM search saved',
      className: 'text-neon-cyan',
      tip: getGlossaryTip('sam_search_saved'),
    })
  }
  if (liveHits > 0) {
    lines.push({
      text: `${liveHits} notice${liveHits === 1 ? '' : 's'} on SAM.gov`,
      className: 'text-neon-lime',
      tip: 'Live postings on SAM.gov that matched a proactive search for this row.',
    })
  }
  if (lines.length === 0) {
    return (
      <span className="text-text-500" title="Not in your vault and no SAM search saved in Pipeline yet">
        Not tracked yet
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((line) => (
        <div key={line.text} className={`${line.className}`} title={line.tip}>
          {line.text}
          {line.text === 'SAM search saved' && (
            <div className="text-[9px] text-text-500 font-normal mt-0.5">
              Saved search in Pipeline
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function RecompeteRadarTable({
  rows,
  expandedKey,
  rowKey,
  isHotAgency,
  onToggleExpand,
  onTrack,
  onOpenWorkspace,
  renderExpandedActions,
  onGlossaryLearn,
}: RecompeteRadarTableProps) {
  const [signalsExpandedKeys, setSignalsExpandedKeys] = useState<Set<string>>(new Set())

  const toggleSignals = (key: string) => {
    setSignalsExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="recompete-radar-table w-full">
      <div className="recompete-radar-intro insight magenta mb-3">
        <p className="mb-1.5">
          <strong className="text-text-primary">What this is:</strong> Government contracts whose work period ends in the next 36 months — the earliest window to shape a follow-on competition (a &ldquo;recompete&rdquo;).
        </p>
        <p className="text-[10px] text-text-400 leading-relaxed">
          Each row is one award. Read left to right: who holds it today, which agency buys it, when it ends, how much is obligated, and why the system ranked it.
          <strong className="text-text-primary"> Your tracking</strong> shows what you have already saved (vault entries, SAM searches in Pipeline) — not government data.
          Hover <span className="text-text-300">ⓘ</span> on column headers for definitions.
        </p>
      </div>

      <div className="data-table-wrap">
        <table className="data-table recompete-radar-grid">
          <thead className="data-table-head-sticky">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`data-table-th ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.key === 'action' ? 'recompete-col-action' : ''}`}
                >
                  {col.key === 'action' ? (
                    col.label
                  ) : (
                    <FieldTip
                      termId={col.tipId}
                      label={col.label}
                      onLearnMore={onGlossaryLearn}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = rowKey(row, index)
              const expanded = expandedKey === key
              const signalsExpanded = signalsExpandedKeys.has(key)
              const tierMeta = COMBO_TIER_META[row.combo_tier]
              const score = row.display_score ?? row.combo_score ?? 0
              const millions = row.obligation_millions ?? (row.obligation || 0) / 1e6
              const endLabel = row.end_date?.slice?.(0, 10) || row.end_date || '—'
              const months = row.months_to_end
              const signalCount = row.signals?.length ?? 0
              const hiddenSignals = Math.max(0, signalCount - 2)
              const hot = isHotAgency(row.agency || '')

              return (
                <Fragment key={key}>
                  <tr
                    className={`${hot ? 'intensity-row-hot' : ''} ${expanded ? 'recompete-row-expanded' : ''}`}
                  >
                    <td className="data-table-td align-top">
                      <div className={`text-[10px] font-semibold uppercase tracking-wide ${tierMeta?.tone || 'text-text-500'}`}>
                        {row.tier_label || tierMeta?.label || row.combo_tier}
                      </div>
                      <div className="text-sm font-bold text-neon-lime tabular-nums mt-0.5" title="Priority score — higher means more aligned signals">
                        {score}
                      </div>
                      <div className="text-[9px] text-text-500 mt-0.5">
                        <FieldTip termId="priority_score" label="score" showLearnLink={false} />
                      </div>
                    </td>
                    <td className="data-table-td align-top min-w-[140px]">
                      <div className="font-medium text-text-primary" title={row.recipient}>
                        {row.recipient || '—'}
                      </div>
                      {row.award_key && (
                        <div className="text-[9px] text-text-500 font-mono mt-0.5" title="USASpending award identifier">
                          ID {String(row.award_key).slice(0, 14)}
                        </div>
                      )}
                    </td>
                    <td className="data-table-td align-top text-neon-cyan min-w-[120px]">
                      <span title={row.agency}>{row.agency || '—'}</span>
                      {hot && (
                        <div className="text-[9px] text-neon-magenta mt-0.5">Hot buyer</div>
                      )}
                    </td>
                    <td className="data-table-td align-top font-mono text-xs whitespace-nowrap">
                      <div>{endLabel}</div>
                      {months != null && (
                        <div className="text-[9px] text-text-500 mt-0.5">{months} months left</div>
                      )}
                    </td>
                    <td className="data-table-td align-top text-right tabular-nums text-neon-cyan font-medium whitespace-nowrap">
                      ${millions.toFixed(1)}M
                      <div className="text-[9px] text-text-500 font-normal">obligated</div>
                    </td>
                    <td className="data-table-td align-top min-w-[100px]">
                      <SignalList
                        row={row}
                        showAll={signalsExpanded}
                        hiddenCount={hiddenSignals}
                        onToggleMore={() => toggleSignals(key)}
                      />
                    </td>
                    <td className="data-table-td align-top text-[10px]">
                      <TrackingStatus row={row} />
                    </td>
                    <td className="data-table-td align-top recompete-col-action">
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          type="button"
                          className="action-btn pipeline text-xs whitespace-nowrap"
                          onClick={() => onTrack(row)}
                          title={getGlossaryTip('track_pipeline')}
                        >
                          + Track
                        </button>
                        {onOpenWorkspace && (
                          <button
                            type="button"
                            className="action-btn ghost text-xs"
                            onClick={() => onOpenWorkspace(row)}
                            title="Open pursuit workspace — vault briefs and capture skills for this row"
                          >
                            Workspace
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-btn ghost text-xs inline-flex items-center gap-0.5"
                          onClick={() => onToggleExpand(key)}
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Hide' : 'More'}
                          <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="recompete-detail-row">
                      <td colSpan={COLUMNS.length} className="data-table-td">
                        <div className="recompete-detail-panel">
                          {signalCount > 0 && (
                            <div className="mb-2">
                              <div className="text-[10px] text-text-400 font-medium mb-1">All ranking reasons</div>
                              <div className="flex flex-wrap gap-1">
                                {signalChips(row.signals).map((s) => (
                                  <span
                                    key={s.key}
                                    className={`pill text-[9px] ${s.tone}`}
                                    title={COMBO_SIGNAL_META[s.key as keyof typeof COMBO_SIGNAL_META]?.label || s.label}
                                  >
                                    {COMBO_SIGNAL_META[s.key as keyof typeof COMBO_SIGNAL_META]?.label || s.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {row.suggested_sam_keywords && (
                            <p className="text-[10px] text-text-500 mb-2">
                              <span className="text-text-400 font-medium">Suggested SAM.gov search: </span>
                              {row.suggested_sam_keywords}
                              <span className="text-text-500"> — paste into SAM.gov to find early notices (RFI, Sources Sought) for this cycle.</span>
                            </p>
                          )}
                          <div className="recompete-detail-actions">{renderExpandedActions(row)}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}