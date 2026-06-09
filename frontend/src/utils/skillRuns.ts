import type { SkillEntry } from '../components/lists/SkillCard'

export interface SkillRunStep {
  id: string
  kind: string
  name: string
  status: string
  input_summary?: string
  output_summary?: string
  elapsed_ms?: number
  detail?: Record<string, unknown>
  at?: string
}

export interface SkillRunTranscriptTurn {
  turn: number
  role: string
  content: string
  tool_calls?: unknown[]
}

export interface SkillRunArtifact {
  path: string
  label: string
}

export interface SkillRunEnvelope {
  run_id: string
  skill_id: string
  source: string
  status: string
  inquiry: string
  inputs?: Record<string, unknown>
  context?: Record<string, unknown>
  started_at: string
  finished_at?: string
  elapsed_ms?: number
  steps: SkillRunStep[]
  transcript: SkillRunTranscriptTurn[]
  warnings: string[]
  artifacts: SkillRunArtifact[]
  result?: Record<string, unknown>
  summary?: string
}

export interface SkillRunListItem {
  run_id: string
  skill_id: string
  source: string
  status: string
  inquiry_preview?: string
  summary?: string
  started_at?: string
  finished_at?: string
  elapsed_ms?: number
  step_count?: number
  artifact_count?: number
}

export async function fetchSkillRuns(skillId?: string, limit = 30): Promise<SkillRunListItem[]> {
  const q = new URLSearchParams()
  if (skillId) q.set('skill_id', skillId)
  q.set('limit', String(limit))
  const res = await fetch(`/skills/runs?${q}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.runs || []) as SkillRunListItem[]
}

export async function fetchSkillRun(runId: string): Promise<SkillRunEnvelope | null> {
  const res = await fetch(`/skills/runs/${encodeURIComponent(runId)}`)
  if (!res.ok) return null
  return (await res.json()) as SkillRunEnvelope
}

export async function fetchSkillDetail(skillId: string): Promise<(SkillEntry & { body_md?: string }) | null> {
  const res = await fetch(`/skills/${encodeURIComponent(skillId)}`)
  if (!res.ok) return null
  return (await res.json()) as SkillEntry & { body_md?: string }
}

export function inquiryPlaceholder(skillId: string): string {
  const map: Record<string, string> = {
    'competitive-intel': 'e.g. Burn rate on FA805122F0001 — peak obligations and final OY costs',
    'teaming-finder': 'e.g. Gap-fill partners for cybersecurity staffing vs incumbent',
    'compliance-auditor': 'e.g. Audit FAR clauses cited in pursuit brief',
    'vault-synthesize': 'e.g. Compound pursuit intel into vault synthesis page',
    'vault-lint': 'Optional: focus lint on global_wiki only',
    'capture-brief': 'e.g. One-page brief emphasizing recompete timing',
    'ptw-analysis': 'e.g. PTW baseline vs incumbent run rate — aggressive but credible posture',
    'pursuit-kickoff': 'Optional: focus areas for kickoff chain (defaults to standard brief + SAM + comp snapshot)',
    'proposal-generator': 'e.g. Draft executive summary and volume outline from pursuit artifacts',
    'subcontractor-sow-builder': 'e.g. SOW for teaming partner Acme — scope from vault shall-statements',
    'huashu-design': 'e.g. One-pager deck for industry day with evidence from competitive intel',
    'value-propositions': 'e.g. Outcome-led hooks for DOE facilities recompete',
    'positioning': 'e.g. How we position vs incumbent on transition risk',
    'competitor-profiling': 'e.g. Profile incumbent teaming posture at this agency',
  }
  return map[skillId] || 'Describe what you want this skill to do…'
}