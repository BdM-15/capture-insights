export interface SkillRuntimeSettings {
  max_turns: number
  llm_timeout_seconds: number
  llm_max_tokens_per_turn: number
  mcp_handshake_timeout: number
  mcp_tool_call_timeout: number
  mcp_shutdown_timeout: number
  max_tool_result_chars: number
  max_read_bytes: number
  max_write_bytes: number
  max_script_seconds: number
  max_kg_entities_per_type: number
  max_kg_chunks: number
  max_kg_chunks_per_entity: number
  max_kg_relationships_per_entity: number
  idv_page_limit: number
  max_idv_pages: number
  transaction_page_limit: number
  max_transaction_pages: number
  max_orders_per_vehicle: number
}

export interface SkillRuntimeSnapshot {
  settings: SkillRuntimeSettings
  defaults: SkillRuntimeSettings
  env_locked?: string[]
  storage_path?: string
  note?: string
}

export async function fetchSkillRuntimeSettings(): Promise<SkillRuntimeSnapshot> {
  const res = await fetch('/settings/skill-runtime')
  if (!res.ok) throw new Error(`Failed to load skill runtime settings (${res.status})`)
  return res.json()
}

export async function saveSkillRuntimeSettings(
  values: Partial<SkillRuntimeSettings>,
): Promise<SkillRuntimeSnapshot> {
  const res = await fetch('/settings/skill-runtime', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  if (!res.ok) throw new Error(`Failed to save skill runtime settings (${res.status})`)
  return res.json()
}

export async function resetSkillRuntimeSettings(): Promise<SkillRuntimeSnapshot> {
  const res = await fetch('/settings/skill-runtime/reset', { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to reset skill runtime settings (${res.status})`)
  return res.json()
}

export function runtimeSummary(s: SkillRuntimeSettings): string {
  return `turns=${s.max_turns} · llm=${s.llm_timeout_seconds}s · tokens=${s.llm_max_tokens_per_turn} · mcp=${s.mcp_tool_call_timeout}s · tool=${s.max_tool_result_chars} chars`
}