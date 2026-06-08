import type { ReactNode } from 'react'
import type { GlossaryId } from '../../constants/captureGlossary'
import { FieldTip } from './FieldTip'

interface StatChipProps {
  label: string
  value: ReactNode
  sublabel?: ReactNode
  termId: GlossaryId
  onLearnMore?: (termId: GlossaryId) => void
  valueClassName?: string
}

export function StatChip({
  label,
  value,
  sublabel,
  termId,
  onLearnMore,
  valueClassName = '',
}: StatChipProps) {
  return (
    <div className="market-stat-chip">
      <div className="label flex items-center gap-0.5 flex-wrap">
        <FieldTip termId={termId} label={label} onLearnMore={onLearnMore} />
      </div>
      <div className={`value ${valueClassName}`.trim()}>{value}</div>
      {sublabel != null && sublabel !== '' && (
        <div className="text-[9px] text-text-500 mt-0.5">{sublabel}</div>
      )}
    </div>
  )
}