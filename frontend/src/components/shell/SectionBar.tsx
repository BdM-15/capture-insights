import type { LucideIcon } from 'lucide-react'
import { RefreshCw } from 'lucide-react'
import type { AccentColor } from '../../constants/viewMeta'
import { Button } from '../ui/Button'
import { StatusPill } from '../ui/StatusPill'

interface SectionBarProps {
  icon: LucideIcon
  title: string
  subtitle: string
  accent: AccentColor
  status?: string
  loading?: boolean
  onRefresh?: () => void
}

const accentClass: Record<AccentColor, string> = {
  cyan: 'section-accent-cyan',
  magenta: 'section-accent-magenta',
  purple: 'section-accent-purple',
  lime: 'section-accent-lime',
  amber: 'section-accent-amber',
}

const tileClass: Record<AccentColor, string> = {
  cyan: 'tile-cyan',
  magenta: 'tile-magenta',
  purple: 'tile-purple',
  lime: 'tile-lime',
  amber: 'tile-amber',
}

export function SectionBar({
  icon: Icon,
  title,
  subtitle,
  accent,
  status,
  loading,
  onRefresh,
}: SectionBarProps) {
  return (
    <div className={`glass-section-bar ${accentClass[accent]}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`nav-icon-tile ${tileClass[accent]} shrink-0`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h1 className="h1-gradient text-lg font-semibold tracking-tight truncate">{title}</h1>
          <p className="section-subtitle truncate">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {status && (
          <StatusPill tone="neutral" className="max-w-[280px] truncate hidden sm:inline-flex">
            {status}
          </StatusPill>
        )}
        {onRefresh && (
          <Button variant="soft" onClick={onRefresh} disabled={loading} size="xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>
    </div>
  )
}