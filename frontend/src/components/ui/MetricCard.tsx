import { Info } from 'lucide-react'
import type { SurfaceAccent } from './Surface'

interface MetricCardProps {
  label: string
  value: string
  tooltip?: string
  accent?: SurfaceAccent
  stub?: boolean
  valueClass?: string
}

export function MetricCard({
  label,
  value,
  tooltip,
  accent = 'cyan',
  stub,
  valueClass = '',
}: MetricCardProps) {
  const accentColors: Record<string, string> = {
    cyan: 'text-neon-cyan',
    magenta: 'text-neon-magenta',
    lime: 'text-neon-lime',
    amber: 'text-neon-amber',
    purple: 'text-accent-purple',
    none: 'text-text-primary',
  }

  return (
    <div className={`metric-card surface-accent-${accent}`}>
      <div className="metric-card-label">
        {label}
        {tooltip && (
          <span title={tooltip} className="info-icon ml-1 inline-flex">
            <Info size={10} />
          </span>
        )}
        {stub && <span className="metric-stub ml-1">vision</span>}
      </div>
      <div className={`metric-card-value ${accentColors[accent] ?? ''} ${valueClass}`}>
        {value}
      </div>
    </div>
  )
}