import { useEffect, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { fetchSkillRun, type SkillRunEnvelope } from '../../utils/skillRuns'
import { SkillRunDetail } from '../skills/SkillRunDetail'

interface ChatRunCardProps {
  runId: string
  skillId?: string
  onOpenArtifact?: (path: string) => void
  onViewFull?: (runId: string, skillId?: string) => void
}

export function ChatRunCard({ runId, skillId, onOpenArtifact, onViewFull }: ChatRunCardProps) {
  const [run, setRun] = useState<SkillRunEnvelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSkillRun(runId)
      .then((r) => {
        if (!cancelled) setRun(r)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  if (loading) {
    return (
      <div className="chat-run-card">
        <Loader2 className="w-3 h-3 animate-spin text-neon-cyan" />
        <span className="text-[10px] text-text-500">Loading process chain…</span>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="chat-run-card chat-run-card--muted">
        <span className="text-[10px]">Run {runId}</span>
        {onViewFull && (
          <button type="button" className="chat-run-card-link" onClick={() => onViewFull(runId, skillId)}>
            View run
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="chat-run-card">
      <button type="button" className="chat-run-card-head" onClick={() => setExpanded((v) => !v)}>
        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className="chat-run-card-title">{run.skill_id}</span>
        <span className="chat-run-card-status">{run.status}</span>
        {run.elapsed_ms != null && <span className="text-text-500">{run.elapsed_ms}ms</span>}
      </button>
      {run.summary && <div className="chat-run-card-summary">{run.summary}</div>}
      {expanded && (
        <div className="chat-run-card-body">
          <SkillRunDetail run={run} onOpenArtifact={onOpenArtifact} />
        </div>
      )}
      {onViewFull && (
        <button type="button" className="chat-run-card-link" onClick={() => onViewFull(runId, skillId)}>
          Open full drawer
        </button>
      )}
    </div>
  )
}