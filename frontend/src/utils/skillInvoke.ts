import type { SkillRunEnvelope } from './skillRuns'

export interface SkillInvokeResult {
  ok: boolean
  skill_id?: string
  run_id?: string
  conversation?: import('./conversations').Conversation
  run?: SkillRunEnvelope
  error?: string
  hint?: string
  path?: string
  json_path?: string
  docx_path?: string
  pdf_path?: string
  slug?: string
  summary?: string
  runnable?: boolean
  used_llm?: boolean
  child_order_count?: number
  transaction_count?: number
  candidate_count?: number
  issues?: number
  finding_count?: number
  critical_count?: number
  artifact_count?: number
  warnings?: string[]
}

export interface SkillInvokeRequest {
  skill_id: string
  inquiry?: string
  naics?: string
  brain?: unknown[]
  pipeline?: unknown[]
  pursuit_item?: Record<string, unknown> | null
  contract_number?: string
  displacement_target?: string
  capability_gap?: string
  scope?: string
  use_llm?: boolean
  conversation_id?: string
}

export async function invokeSkill(body: SkillInvokeRequest): Promise<SkillInvokeResult> {
  const res = await fetch('/skills/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok && !data.error) {
    return { ok: false, skill_id: body.skill_id, error: `Request failed (${res.status})` }
  }
  return data as SkillInvokeResult
}