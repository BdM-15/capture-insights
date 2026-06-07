import type { LucideIcon } from 'lucide-react'

export interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
}

interface TabBarProps {
  tabs: readonly TabItem[]
  activeId: string
  onChange: (id: string) => void
}

export function TabBar({ tabs, activeId, onChange }: TabBarProps) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`filter-pill ${active ? 'filter-pill-active' : ''}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}