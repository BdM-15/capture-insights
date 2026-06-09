import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, Play, X } from 'lucide-react'
import type { SkillEntry } from '../lists/SkillCard'
import { Button } from '../ui/Button'
import { loadActiveConversationId } from '../../utils/conversations'
import { invokeSkill, type SkillInvokeRequest, type SkillInvokeResult } from '../../utils/skillInvoke'
import {
  fetchSkillDetail,
  fetchSkillRun,
  fetchSkillRuns,
  inquiryPlaceholder,
  type SkillRunEnvelope,
  type SkillRunListItem,
} from '../../utils/skillRuns'
import { SkillRunDetail } from './SkillRunDetail'

export interface SkillInvokeContext {
  naics: string
  brain: unknown[]
  pipeline: unknown[]
  pursuitItem: Record<string, unknown> | null
  useSmartModel: boolean
}

interface SkillInvokePanelProps {
  skill: SkillEntry
  context: SkillInvokeContext
  initialRunId?: string | null
  stackRightOffset?: number
  onClose: () => void
  onOpenArtifact?: (path: string) => void
  onRunComplete?: (result: SkillInvokeResult) => void
  mirrorToConversation?: boolean
}

export function SkillInvokePanel({
  skill,
  context,
  initialRunId,
  stackRightOffset = 0,
  onClose,
  onOpenArtifact,
  onRunComplete,
  mirrorToConversation = true,
}: SkillInvokePanelProps) {
  const [inquiry, setInquiry] = useState('')
  const [detail, setDetail] = useState<(SkillEntry & { body_md?: string }) | null>(null)
  const [runs, setRuns] = useState<SkillRunListItem[]>([])
  const [activeRun, setActiveRun] = useState<SkillRunEnvelope | null>(null)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<SkillInvokeResult | null>(null)
  const [tab, setTab] = useState<'invoke' | 'history'>('invoke')

  const loadHistory = useCallback(async () => {
    const items = await fetchSkillRuns(skill.id, 20)
    setRuns(items)
  }, [skill.id])

  const openRun = useCallback(async (runId: string) => {
    const run = await fetchSkillRun(runId)
    if (run) {
      setActiveRun(run)
      setTab('invoke')
    }
  }, [])

  useEffect(() => {
    void fetchSkillDetail(skill.id).then(setDetail)
    void loadHistory()
  }, [skill.id, loadHistory])

  useEffect(() => {
    if (initialRunId) void openRun(initialRunId)
  }, [initialRunId, openRun])

  async function handleRun() {
    setRunning(true)
    setLastResult(null)
    setActiveRun(null)
    try {
      const conversationId = mirrorToConversation ? loadActiveConversationId() : null
      const body: SkillInvokeRequest = {
        skill_id: skill.id,
        inquiry: inquiry.trim(),
        naics: context.naics,
        brain: context.brain as SkillInvokeRequest['brain'],
        pipeline: context.pipeline as SkillInvokeRequest['pipeline'],
        pursuit_item: context.pursuitItem,
        use_llm: context.useSmartModel && !!skill.supports_llm,
        conversation_id: conversationId || undefined,
      }
      const result = await invokeSkill(body)
      setLastResult(result)
      onRunComplete?.(result)
      if (result.run_id) {
        const run = await fetchSkillRun(result.run_id)
        if (run) setActiveRun(run)
      }
      await loadHistory()
    } finally {
      setRunning(false)
    }
  }

  const pursuitLabel = context.pursuitItem
    ? `${String(context.pursuitItem.recipient || 'Pursuit')} @ ${String(context.pursuitItem.agency || 'agency')}`
    : 'No pipeline row — add pursuit first for pursuit skills'

  return (
    <div
      className="skill-invoke-pane fixed top-14 bottom-0 z-[65] flex flex-col overflow-hidden rounded-l-3xl w-[min(480px,100vw)]"
      style={{ right: stackRightOffset }}
    >
      <div className="skill-invoke-header">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary truncate">{skill.name}</div>
          <div className="text-[10px] text-text-500 font-mono">{skill.id}</div>
        </div>
        <button type="button" className="chat-icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="skill-invoke-tabs">
        <button
          type="button"
          className={tab === 'invoke' ? 'active' : ''}
          onClick={() => setTab('invoke')}
        >
          Run
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'active' : ''}
          onClick={() => { setTab('history'); void loadHistory() }}
        >
          <History size={12} /> History ({runs.length})
        </button>
      </div>

      <div className="skill-invoke-body flex-1 overflow-y-auto min-h-0">
        {tab === 'history' ? (
          <div className="p-3 space-y-2">
            {runs.length === 0 && (
              <div className="text-xs text-text-500">No runs yet for this skill.</div>
            )}
            {runs.map((r) => (
              <button
                key={r.run_id}
                type="button"
                className="skill-run-history-row"
                onClick={() => void openRun(r.run_id)}
              >
                <div className="flex justify-between gap-2">
                  <span className={`text-[10px] ${r.status === 'completed' ? 'text-neon-lime' : 'text-neon-amber'}`}>
                    {r.status}
                  </span>
                  <span className="text-[9px] text-text-500">{r.started_at?.slice(0, 16)}</span>
                </div>
                <div className="text-xs text-text-primary truncate mt-0.5">
                  {r.inquiry_preview || r.summary || r.run_id}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <div className="insight text-xs">
              {detail?.use_when || skill.use_when || skill.description}
            </div>

            <div className="skill-invoke-context">
              <div className="text-[9px] uppercase text-text-500 mb-1">Context</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="pill text-[9px]">NAICS {context.naics}</span>
                <span className="pill text-[9px]">Pipeline {context.pipeline.length}</span>
                <span className="pill text-[9px]">Brain {context.brain.length}</span>
              </div>
              <div className="text-[10px] text-text-400 mt-1 truncate">{pursuitLabel}</div>
            </div>

            <div>
              <label className="text-[9px] uppercase text-text-500 mb-1 block">Your request</label>
              <textarea
                className="skill-invoke-inquiry"
                rows={4}
                value={inquiry}
                onChange={(e) => setInquiry(e.target.value)}
                placeholder={inquiryPlaceholder(skill.id)}
              />
              <div className="text-[9px] text-text-500 mt-1">
                Optional for most skills — required for contract-specific intel (PIID in text).
              </div>
            </div>

            {skill.supports_llm && (
              <div className="text-[10px] text-text-500">
                Smart model: {context.useSmartModel ? 'on' : 'off'} (toggle in topbar)
              </div>
            )}

            <Button variant="primary" onClick={() => void handleRun()} disabled={running}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {running ? 'Running…' : 'Run skill'}
            </Button>

            {lastResult && !lastResult.ok && (
              <div className="text-xs text-neon-red">{lastResult.error}</div>
            )}

            {activeRun && (
              <SkillRunDetail run={activeRun} onOpenArtifact={onOpenArtifact} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}