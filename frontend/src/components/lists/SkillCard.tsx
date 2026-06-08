import { AskCoPilotButton } from '../ui/AskCoPilotButton'

export interface SkillEntry {
  id: string
  name: string
  source: string
  category: string
  use_when: string
  mcp_deps?: string[]
  status: string
  repo_path?: string
}

interface SkillCardProps {
  skill: SkillEntry
  naics?: string
  contextHint?: string
  onAsk: (prompt: string) => void
  onOpenMcp?: () => void
}

function statusClass(status: string): string {
  if (status === 'partial') return 'text-neon-amber border-neon-amber/40'
  if (status === 'active') return 'text-neon-lime border-neon-lime/40'
  if (status === 'stub') return 'text-text-500'
  return 'text-neon-cyan border-neon-cyan/30'
}

function statusLabel(status: string): string {
  if (status === 'catalog') return 'Catalog'
  if (status === 'partial') return 'Partial'
  if (status === 'planned') return 'Planned'
  if (status === 'stub') return 'Stub'
  if (status === 'active') return 'Active'
  return status
}

function sourceLabel(source: string): string {
  if (source === '1102') return '1102tools'
  if (source === 'theseus') return 'Theseus'
  if (source === 'marketingskills') return 'marketingskills'
  return source
}

export function SkillCard({ skill, naics, contextHint, onAsk, onOpenMcp }: SkillCardProps) {
  const deps = skill.mcp_deps || []
  return (
    <div className="tool-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="tool-card-name">{skill.name}</div>
          <div className="text-[9px] text-text-500 mt-0.5">{sourceLabel(skill.source)} · {skill.category}</div>
          <div className="tool-card-desc mt-1">{skill.use_when}</div>
          {deps.length > 0 && (
            <div className="text-[9px] text-text-500 mt-1">
              MCPs:{' '}
              {deps.map((d, i) => (
                <span key={d}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    onClick={onOpenMcp}
                    className="text-neon-cyan hover:underline"
                  >
                    {d.replace('-mcp', '').replace(/-/g, ' ')}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={`pill text-[9px] shrink-0 ${statusClass(skill.status)}`}>
          {statusLabel(skill.status)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <AskCoPilotButton
          prompt={`Run the "${skill.name}" skill workflow for NAICS ${naics || 'current slice'}. ${contextHint ? `Context: ${contextHint}. ` : ''}Purpose: ${skill.use_when}. Use paired MCPs where needed. Output vault-ready with citations.`}
          label="Stub run"
          onAsk={onAsk}
        />
        {skill.repo_path && (
          <span className="text-[9px] text-text-500 font-mono self-center">{skill.repo_path}</span>
        )}
      </div>
    </div>
  )
}