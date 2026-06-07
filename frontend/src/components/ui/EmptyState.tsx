import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SurfaceAccent } from './Surface'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  actions?: ReactNode
  accent?: SurfaceAccent
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  accent = 'cyan',
}: EmptyStateProps) {
  return (
    <div className={`empty-state surface-accent-${accent}`}>
      {Icon && (
        <div className={`empty-state-icon tile-${accent === 'none' ? 'cyan' : accent}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="empty-state-title">{title}</div>
      <p className="empty-state-desc">{description}</p>
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  )
}