import type { ReactNode } from 'react'

interface EntryRowProps {
  title: string
  type?: string
  excerpt?: string
  path?: string
  onClick?: () => void
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function EntryRow({
  title,
  type,
  excerpt,
  path,
  onClick,
  actions,
  children,
  className = '',
}: EntryRowProps) {
  return (
    <div className={`entry-row ${className}`.trim()}>
      <div
        className={`entry-row-main ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
        onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className="entry-row-title">
          {title}
          {type && <span className="entry-type">{type}</span>}
        </div>
        {excerpt && <div className="entry-row-excerpt">{excerpt}</div>}
        {path && <div className="entry-row-path">{path}</div>}
        {children}
      </div>
      {actions && <div className="entry-row-actions">{actions}</div>}
    </div>
  )
}