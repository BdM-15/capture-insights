import type { ReactNode } from 'react'

export type SurfaceAccent = 'cyan' | 'magenta' | 'lime' | 'amber' | 'purple' | 'none'

interface SurfaceProps {
  children: ReactNode
  accent?: SurfaceAccent
  hover?: boolean
  className?: string
  /** Legacy alias — maps to accent purple */
  vault?: boolean
}

export function Surface({
  children,
  accent = 'none',
  hover = false,
  className = '',
  vault = false,
}: SurfaceProps) {
  const resolved = vault ? 'purple' : accent
  const accentClass =
    resolved !== 'none' ? `surface-accent-${resolved}` : ''
  const hoverClass = hover ? 'surface-hover' : ''

  return (
    <div className={`surface ${accentClass} ${hoverClass} ${className}`.trim()}>
      {children}
    </div>
  )
}