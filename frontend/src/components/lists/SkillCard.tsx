import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { AskCoPilotButton } from '../ui/AskCoPilotButton'
import { Button } from '../ui/Button'

export interface SkillEntry {
  id: string
  name: string
  description?: string
  category?: string
  category_label?: string
  use_when: string
  mcp_deps?: string[]
  status: string
  origin?: string
  runtime?: string
  invoke?: string[]
  supports_llm?: boolean
  max_turns?: number
  orchestrates?: string[]
  repo_path?: string
  runnable?: boolean
}

interface SkillCardProps {
  skill: SkillEntry
  naics?: string
  contextHint?: string
  onAsk: (prompt: string) => void
  onRun?: (skillId: string) => Promise<void>
  onOpenInvoke?: (skill: SkillEntry) => void
  onOpenMcp?: () => void
}

function statusClass(status: string): string {
  if (status === 'draft') return 'text-neon-amber border-neon-amber/40'
  if (status === 'active') return 'text-neon-lime border-neon-lime/40'
  if (status === 'orchestrator') return 'text-neon-cyan border-neon-cyan/40'
  if (status === 'catalog') return 'text-text-500'
  return 'text-neon-cyan border-neon-cyan/30'
}

function statusLabel(status: string): string {
  if (status === 'catalog') return 'Catalog'
  if (status === 'draft') return 'Draft'
  if (status === 'planned') return 'Planned'
  if (status === 'orchestrator') return 'Orchestrator'
  if (status === 'active') return 'Active'
  return status
}

export function SkillCard({ skill, naics, contextHint, onAsk, onRun, onOpenInvoke, onOpenMcp }: SkillCardProps) {
  const [running, setRunning] = useState(false)
  const deps = skill.mcp_deps || []
  const multiTurn = skill.runtime === 'tools' || skill.runtime === 'multi-turn'
  const canRun = skill.runnable === true && !!(onOpenInvoke || onRun)

  async function handleRun() {
    if (running) return
    if (onOpenInvoke) {
      onOpenInvoke(skill)
      return
    }
    if (!onRun) return
    setRunning(true)
    try {
      await onRun(skill.id)
    } finally {
      setRunning(false)
    }
  }

  const refinePrompt = `Refine the "${skill.name}" output (${skill.id}) for NAICS ${naics || 'current slice'}. ${contextHint ? `Context: ${contextHint}. ` : ''}${skill.use_when}`

  return (
    <div className="tool-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="tool-card-name">{skill.name}</div>
          <div className="text-[9px] text-text-500 mt-0.5">
            {skill.category_label || skill.category || 'Skill'}
            {multiTurn && skill.max_turns ? ` · up to ${skill.max_turns} turns` : ''}
          </div>
          <div className="tool-card-desc mt-1">{skill.use_when || skill.description}</div>
          {skill.orchestrates && skill.orchestrates.length > 0 && (
            <div className="text-[9px] text-text-500 mt-1 font-mono">
              Chains: {skill.orchestrates.join(' → ')}
            </div>
          )}
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
        {canRun ? (
          <Button variant="primary" size="sm" onClick={handleRun} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running…' : onOpenInvoke ? 'Configure & Run' : 'Run'}
          </Button>
        ) : (
          <span className="text-[9px] text-text-500 self-center px-1">
            {skill.status === 'catalog' ? 'Catalog — runner coming soon' : 'Not wired yet'}
          </span>
        )}
        <AskCoPilotButton
          prompt={refinePrompt}
          label="Refine in chat"
          onAsk={onAsk}
        />
        {skill.repo_path && (
          <span className="text-[9px] text-text-500 font-mono self-center">{skill.repo_path}</span>
        )}
      </div>
    </div>
  )
}