import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SurfaceAccent } from './Surface'

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  accent?: SurfaceAccent
  defaultOpen?: boolean
  children: ReactNode
  className?: string
  badge?: ReactNode
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
            <div className="collapsible-section-title">{title}</div>
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