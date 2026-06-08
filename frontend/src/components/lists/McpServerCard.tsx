import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface McpServer {
  id: string
  name: string
  package?: string
  category: string
  use_when: string
  api_key?: string | null
  status: string
  tool_count?: number
  tools?: { name: string; description?: string }[]
}

interface McpServerCardProps {
  server: McpServer
}

function statusLabel(status: string): string {
  if (status === 'online') return 'Online'
  if (status === 'integrated') return 'Ready'
  return 'Catalog'
}

function statusClass(status: string): string {
  if (status === 'online') return 'text-neon-lime border-neon-lime/40'
  if (status === 'integrated') return 'text-neon-amber border-neon-amber/40'
  return 'text-text-500'
}

export function McpServerCard({ server }: McpServerCardProps) {
  const [open, setOpen] = useState(false)
  const tools = server.tools || []
  const hasTools = tools.length > 0

  return (
    <div className="tool-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="tool-card-name">{server.name}</div>
          <div className="text-[9px] text-text-500 font-mono mt-0.5">{server.package || server.id}</div>
          <div className="tool-card-desc mt-1">{server.use_when}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`pill text-[9px] ${statusClass(server.status)}`}>
            {statusLabel(server.status)}
          </span>
          <span className="text-[9px] text-text-500 capitalize">{server.category}</span>
        </div>
      </div>

      {hasTools && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-neon-cyan hover:underline mt-2"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {open ? 'Hide' : 'View'} {tools.length} endpoint{tools.length === 1 ? '' : 's'}
        </button>
      )}

      {!hasTools && server.status === 'catalog' && (
        <div className="text-[9px] text-text-500 mt-2">
          Endpoints register when this MCP is connected — co-pilot will route by {server.name}.
        </div>
      )}

      {open && hasTools && (
        <div className="mt-2 pl-2 border-l border-edge space-y-1.5 max-h-48 overflow-y-auto">
          {tools.map((t) => (
            <div key={t.name} className="min-w-0">
              <div className="text-[10px] font-mono text-text-300">{t.name}</div>
              {t.description && (
                <div className="text-[9px] text-text-500 leading-snug">{t.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}