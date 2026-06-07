import type { ReactNode } from 'react'

interface PanelCanvasProps {
  children: ReactNode
  className?: string
}

export function PanelCanvas({ children, className = '' }: PanelCanvasProps) {
  return (
    <div className={`panel-canvas flex-1 min-w-0 overflow-auto ${className}`.trim()}>
      {children}
    </div>
  )
}