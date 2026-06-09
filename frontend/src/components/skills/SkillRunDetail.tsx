import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, FileText, Wrench } from 'lucide-react'
import type { SkillRunEnvelope, SkillRunStep } from '../../utils/skillRuns'

interface SkillRunDetailProps {
  run: SkillRunEnvelope
  onOpenArtifact?: (path: string) => void
}

function stepIcon(kind: string) {
  if (kind === 'tool') return Wrench
  if (kind === 'reasoning') return FileText
  return CheckCircle2
}

function statusClass(status: string): string {
  if (status === 'error' || status === 'failed') return 'text-neon-red'
  if (status === 'running') return 'text-neon-amber'
  return 'text-neon-lime'
}

function StepRow({ step, defaultOpen }: { step: SkillRunStep; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const Icon = stepIcon(step.kind)

  return (
    <div className="skill-run-step">
      <button type="button" className="skill-run-step-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className={statusClass(step.status)} />
        <span className="skill-run-step-name">{step.name}</span>
        {step.elapsed_ms != null && (
          <span className="skill-run-step-ms">{step.elapsed_ms}ms</span>
        )}
        <span className={`skill-run-step-status ${statusClass(step.status)}`}>{step.status}</span>
      </button>
      {open && (
        <div className="skill-run-step-body">
          {step.input_summary && (
            <div>
              <div className="skill-run-step-label">Input</div>
              <pre className="skill-run-step-pre">{step.input_summary}</pre>
            </div>
          )}
          {step.output_summary && (
            <div>
              <div className="skill-run-step-label">Output</div>
              <pre className="skill-run-step-pre">{step.output_summary}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SkillRunDetail({ run, onOpenArtifact }: SkillRunDetailProps) {
  const [showTranscript, setShowTranscript] = useState(false)

  return (
    <div className="skill-run-detail">
      <div className="skill-run-meta">
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className={`pill ${statusClass(run.status)}`}>{run.status}</span>
          <span className="text-text-500">source: {run.source}</span>
          {run.elapsed_ms != null && (
            <span className="text-text-500 flex items-center gap-1">
              <Clock size={12} /> {run.elapsed_ms}ms
            </span>
          )}
        </div>
        {run.inquiry && (
          <div className="mt-2">
            <div className="text-[9px] uppercase tracking-wide text-text-500 mb-1">Your request</div>
            <div className="text-xs text-text-primary whitespace-pre-wrap">{run.inquiry}</div>
          </div>
        )}
        {run.summary && (
          <div className="mt-2 text-xs text-neon-cyan">{run.summary}</div>
        )}
      </div>

      {run.warnings?.length > 0 && (
        <div className="skill-run-warnings">
          <AlertTriangle size={14} className="text-neon-amber shrink-0" />
          <div className="text-[10px]">{run.warnings.join(' · ')}</div>
        </div>
      )}

      <div className="skill-run-section">
        <div className="skill-run-section-title">Process chain ({run.steps?.length ?? 0})</div>
        <div className="skill-run-steps">
          {(run.steps || []).map((step, i) => (
            <StepRow key={step.id || i} step={step} defaultOpen={i === (run.steps?.length ?? 0) - 1} />
          ))}
        </div>
      </div>

      {(run.transcript?.length ?? 0) > 0 && (
        <div className="skill-run-section">
          <button
            type="button"
            className="skill-run-section-title skill-run-section-toggle"
            onClick={() => setShowTranscript((v) => !v)}
          >
            {showTranscript ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Reasoning / transcript ({run.transcript.length})
          </button>
          {showTranscript && (
            <div className="skill-run-transcript">
              {run.transcript.map((t) => (
                <div key={t.turn} className="skill-run-transcript-turn">
                  <div className="text-[9px] text-text-500">Turn {t.turn} · {t.role}</div>
                  <pre className="skill-run-step-pre">{t.content}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(run.artifacts?.length ?? 0) > 0 && (
        <div className="skill-run-section">
          <div className="skill-run-section-title">Artifacts</div>
          <div className="flex flex-wrap gap-2">
            {run.artifacts.map((a) => (
              <button
                key={a.path}
                type="button"
                className="skill-run-artifact-btn"
                onClick={() => onOpenArtifact?.(a.path)}
              >
                {a.label || a.path}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}