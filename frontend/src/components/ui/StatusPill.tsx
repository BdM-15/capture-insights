import type { ReactNode } from 'react'

export type StatusTone = 'live' | 'processing' | 'pending' | 'failed' | 'neutral'

interface StatusPillProps {
  tone?: StatusTone
  children: ReactNode
  className?: string
}

export function StatusPill({
  tone = 'neutral',
  children,
  className = '',
}: StatusPillProps) {
  const toneClass = tone === 'neutral' ? '' : `is-${tone}`
  return (
    <span className={`status-pill ${toneClass} ${className}`.trim()}>
      {children}
    </span>
  )
}