import type { ReactNode } from 'react'
import type { HealthState } from './Topbar'
import type { NavGroup, SidebarId, ViewContext, ViewMetaEntry } from '../../constants/viewMeta'
import { resolveSubtitle } from '../../constants/viewMeta'
import { PanelCanvas } from './PanelCanvas'
import { SectionBar } from './SectionBar'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

interface AppShellProps {
  naics: string
  onNaicsChange: (value: string) => void
  onNaicsKeyDown: (e: React.KeyboardEvent) => void
  onRefresh: () => void
  loading: boolean
  showChat: boolean
  onToggleChat: () => void
  health: HealthState
  pipelineCount: number
  brainCount: number
  sidebar: SidebarId
  onSidebarChange: (id: SidebarId) => void
  navGroups: NavGroup[]
  viewMeta: ViewMetaEntry
  viewContext: ViewContext
  status?: string
  children: ReactNode
}

export function AppShell({
  naics,
  onNaicsChange,
  onNaicsKeyDown,
  onRefresh,
  loading,
  showChat,
  onToggleChat,
  health,
  pipelineCount,
  brainCount,
  sidebar,
  onSidebarChange,
  navGroups,
  viewMeta,
  viewContext,
  status,
  children,
}: AppShellProps) {
  const subtitle = resolveSubtitle(viewMeta, viewContext)

  return (
    <div className="app-shell min-h-screen bg-ink-950 text-text-primary font-sans">
      <Topbar
        naics={naics}
        onNaicsChange={onNaicsChange}
        onNaicsKeyDown={onNaicsKeyDown}
        onRefresh={onRefresh}
        loading={loading}
        showChat={showChat}
        onToggleChat={onToggleChat}
        health={health}
        pipelineCount={pipelineCount}
        brainCount={brainCount}
      />

      <div className="app-body flex gap-4 px-4 lg:px-6">
        <Sidebar
          groups={navGroups}
          activeId={sidebar}
          onSelect={onSidebarChange}
          onToggleChat={onToggleChat}
        />

        <main className="main-panel flex-1 min-w-0 flex flex-col">
          <SectionBar
            icon={viewMeta.icon}
            title={viewMeta.title}
            subtitle={subtitle}
            accent={viewMeta.accent}
            status={status}
            loading={loading}
            onRefresh={onRefresh}
          />
          <PanelCanvas>{children}</PanelCanvas>
        </main>
      </div>
    </div>
  )
}