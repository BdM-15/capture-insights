import { MessageSquare } from 'lucide-react'
import type { AccentColor, NavGroup, SidebarId } from '../../constants/viewMeta'
import { Button } from '../ui/Button'

interface SidebarProps {
  groups: NavGroup[]
  activeId: SidebarId
  onSelect: (id: SidebarId) => void
  onToggleChat: () => void
}

const tileClass: Record<AccentColor, string> = {
  cyan: 'tile-cyan',
  magenta: 'tile-magenta',
  purple: 'tile-purple',
  lime: 'tile-lime',
  amber: 'tile-amber',
}

export function Sidebar({ groups, activeId, onSelect, onToggleChat }: SidebarProps) {
  return (
    <aside className="sidebar-vibrant w-60 shrink-0">
      <div className="sticky top-0 flex flex-col h-full py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="nav-group-label">{group.label}</div>
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeId === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className={`nav-item w-full ${isActive ? 'nav-item-active' : ''}`}
                  >
                    <span className={`nav-icon-tile ${tileClass[item.accent]}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-auto px-3 pt-3 border-t border-edge/50">
          <p className="text-[10px] leading-snug text-text-500 mb-3">
            Pipeline = pursuits you track. Brain = competitors &amp; agencies in your vault.
          </p>
          <Button variant="ghost" size="xs" onClick={onToggleChat} className="w-full justify-center">
            <MessageSquare className="w-3 h-3" />
            Toggle co-pilot
          </Button>
        </div>
      </div>
    </aside>
  )
}