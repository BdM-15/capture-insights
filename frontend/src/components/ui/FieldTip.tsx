import { Info } from 'lucide-react'
import { CAPTURE_GLOSSARY, type GlossaryId } from '../../constants/captureGlossary'

interface FieldTipProps {
  termId: GlossaryId
  /** Optional visible label before the icon (e.g. column header text) */
  label?: string
  className?: string
  showLearnLink?: boolean
  onLearnMore?: (termId: GlossaryId) => void
}

export function FieldTip({
  termId,
  label,
  className = '',
  showLearnLink = true,
  onLearnMore,
}: FieldTipProps) {
  const entry = CAPTURE_GLOSSARY[termId]
  if (!entry) return label ? <span className={className}>{label}</span> : null

  return (
    <span className={`inline-flex items-center gap-0.5 align-middle ${className}`.trim()}>
      {label && <span>{label}</span>}
      <span
        title={entry.tip}
        className="info-icon inline-flex shrink-0 cursor-help"
        aria-label={`About ${entry.label}`}
      >
        <Info size={10} />
      </span>
      {showLearnLink && onLearnMore && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onLearnMore(termId)
          }}
          className="text-[9px] text-neon-cyan hover:underline shrink-0 ml-0.5"
          title={`Open ${entry.label} in Knowledge Vault`}
        >
          vault
        </button>
      )}
    </span>
  )
}