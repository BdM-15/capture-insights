import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GlossaryId } from '../../constants/captureGlossary'
import type { SurfaceAccent } from './Surface'
import { FieldTip } from './FieldTip'

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  accent?: SurfaceAccent
  defaultOpen?: boolean
  children: ReactNode
  className?: string
  badge?: ReactNode
  /** Glossary term for section title — layman tip on the section name */
  titleGlossaryId?: GlossaryId
  onGlossaryLearn?: (termId: GlossaryId) => void
}

export function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  accent = 'cyan',
  defaultOpen = true,
  children,
  className = '',
  badge,
  titleGlossaryId,
  onGlossaryLearn,
}: CollapsibleSectionProps) {
  return (
    <details
      className={`collapsible-section surface-accent-${accent} ${className}`.trim()}
      open={defaultOpen}
    >
      <summary className="collapsible-section-summary">
        <div className="collapsible-section-heading">
          {Icon && (
            <span className={`nav-icon-tile tile-${accent === 'none' ? 'cyan' : accent}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <div className="collapsible-section-title">
              {titleGlossaryId ? (
                <FieldTip
                  termId={titleGlossaryId}
                  label={title}
                  onLearnMore={onGlossaryLearn}
                />
              ) : (
                title
              )}
            </div>
            {subtitle && <div className="collapsible-section-subtitle">{subtitle}</div>}
          </div>
          {badge}
        </div>
        <ChevronDown className="collapsible-section-chevron w-4 h-4 shrink-0" />
      </summary>
      <div className="collapsible-section-body">{children}</div>
    </details>
  )
}