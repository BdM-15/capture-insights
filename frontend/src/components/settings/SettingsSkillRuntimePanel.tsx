import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save, TimerReset } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  fetchSkillRuntimeSettings,
  resetSkillRuntimeSettings,
  runtimeSummary,
  saveSkillRuntimeSettings,
  type SkillRuntimeSettings,
  type SkillRuntimeSnapshot,
} from '../../utils/settingsSkillRuntime'

interface FieldSpec {
  key: keyof SkillRuntimeSettings
  label: string
  min: number
  max: number
  step?: number
  hint?: string
}

const FIELD_GROUPS: FieldSpec[][] = [
  [
    { key: 'max_turns', label: 'Max turns (global ceiling)', min: 1, max: 500, hint: 'Effective = min(skill budget, this cap)' },
    { key: 'llm_timeout_seconds', label: 'LLM timeout (s)', min: 1, max: 3600 },
    { key: 'llm_max_tokens_per_turn', label: 'LLM tokens / turn', min: 256, max: 32768, hint: 'Raise if drafts cut off mid-answer' },
    { key: 'mcp_handshake_timeout', label: 'MCP handshake (s)', min: 0.1, max: 3600, step: 0.1 },
  ],
  [
    { key: 'mcp_tool_call_timeout', label: 'MCP tool call (s)', min: 0.1, max: 3600, step: 0.1 },
    { key: 'mcp_shutdown_timeout', label: 'MCP shutdown (s)', min: 0.1, max: 3600, step: 0.1 },
    { key: 'max_tool_result_chars', label: 'Tool result chars', min: 500, max: 2000000, hint: 'MCP payload truncation limit' },
    { key: 'max_read_bytes', label: 'Max read bytes', min: 1000, max: 5000000 },
  ],
  [
    { key: 'max_write_bytes', label: 'Max write bytes', min: 1000, max: 20000000 },
    { key: 'max_script_seconds', label: 'Script timeout (s)', min: 1, max: 86400 },
    { key: 'max_kg_entities_per_type', label: 'Context entities / type', min: 1, max: 5000, hint: 'Pursuit/vault context (PR2)' },
    { key: 'max_kg_chunks', label: 'Context chunks', min: 1, max: 5000 },
  ],
  [
    { key: 'max_kg_chunks_per_entity', label: 'Chunks / entity', min: 0, max: 500 },
    { key: 'max_kg_relationships_per_entity', label: 'Relationships / entity', min: 0, max: 500 },
  ],
  [
    { key: 'idv_page_limit', label: 'IDV page size', min: 1, max: 500, hint: 'Orders per USAspending page' },
    { key: 'max_idv_pages', label: 'Max IDV pages', min: 1, max: 2000, hint: '100+ orders ≈ 4+ pages at size 25' },
    { key: 'transaction_page_limit', label: 'Tx page size', min: 10, max: 5000 },
    { key: 'max_transaction_pages', label: 'Max tx pages / award', min: 1, max: 500 },
  ],
  [
    { key: 'max_orders_per_vehicle', label: 'Max orders / vehicle', min: 1, max: 2000, hint: 'Safety cap — raise for large IDIQs' },
  ],
]

function RuntimeField({
  spec,
  value,
  locked,
  onChange,
}: {
  spec: FieldSpec
  value: number
  locked: boolean
  onChange: (key: keyof SkillRuntimeSettings, v: number) => void
}) {
  return (
    <label className="settings-runtime-field">
      <span className="settings-runtime-label">
        {spec.label}
        {locked && <span className="settings-runtime-locked" title="Locked by .env override"> · env</span>}
      </span>
      <input
        type="number"
        min={spec.min}
        max={spec.max}
        step={spec.step ?? 1}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(spec.key, Number(e.target.value))}
        className="settings-runtime-input"
      />
      {spec.hint && <span className="settings-runtime-hint">{spec.hint}</span>}
    </label>
  )
}

export function SettingsSkillRuntimePanel() {
  const [snapshot, setSnapshot] = useState<SkillRuntimeSnapshot | null>(null)
  const [values, setValues] = useState<SkillRuntimeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSkillRuntimeSettings()
      setSnapshot(data)
      setValues({ ...data.settings })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const envLocked = new Set(snapshot?.env_locked ?? [])

  function onChange(key: keyof SkillRuntimeSettings, v: number) {
    if (!values || envLocked.has(key)) return
    setValues({ ...values, [key]: v })
  }

  async function onSave() {
    if (!values) return
    setSaving(true)
    setError(null)
    try {
      const data = await saveSkillRuntimeSettings(values)
      setSnapshot(data)
      setValues({ ...data.settings })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onReset() {
    setSaving(true)
    setError(null)
    try {
      const data = await resetSkillRuntimeSettings()
      setSnapshot(data)
      setValues({ ...data.settings })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-runtime-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <TimerReset size={14} className="text-neon-magenta shrink-0" />
            Global skill runtime caps
          </div>
          <div className="text-[10px] font-mono text-text-500 mt-0.5 truncate">
            {values ? runtimeSummary(values) : loading ? 'loading…' : '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={loading || saving}>
            <RotateCcw size={14} />
            Reset
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={loading || saving || !values}>
            <Save size={14} />
            {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {snapshot?.note && (
        <p className="text-[10px] text-text-500 mb-3 leading-relaxed">{snapshot.note}</p>
      )}

      {error && <div className="settings-test-result is-fail mb-3">{error}</div>}

      {loading || !values ? (
        <div className="text-xs text-text-500 font-mono">Loading runtime caps…</div>
      ) : (
        <div className="space-y-4">
          {FIELD_GROUPS.map((group, gi) => (
            <div key={gi} className="settings-runtime-grid">
              {group.map((spec) => (
                <RuntimeField
                  key={spec.key}
                  spec={spec}
                  value={values[spec.key]}
                  locked={envLocked.has(spec.key)}
                  onChange={onChange}
                />
              ))}
            </div>
          ))}
          {envLocked.size > 0 && (
            <div className="text-[9px] text-text-500 font-mono">
              Fields marked · env are locked by .env — remove the override to edit in UI.
            </div>
          )}
        </div>
      )}
    </div>
  )
}