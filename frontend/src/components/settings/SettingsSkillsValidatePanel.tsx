import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { fetchSkillsValidation, type SkillsValidationReport } from '../../utils/skillsValidate'

export function SettingsSkillsValidatePanel() {
  const [report, setReport] = useState<SkillsValidationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSkillsValidation()
      setReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const failures = (report?.results || []).filter((r) => !r.ok)

  return (
    <div className="settings-validate-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <ShieldCheck size={14} className="text-neon-lime shrink-0" />
            Agent Skills spec check
          </div>
          <div className="text-[10px] text-text-500 mt-0.5">
            Validates <code className="font-mono">skills/*/SKILL.md</code> frontmatter per{' '}
            <a href="https://agentskills.io/specification" target="_blank" rel="noreferrer" className="text-neon-cyan hover:underline">
              agentskills.io
            </a>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Re-check
        </Button>
      </div>

      {error && <div className="settings-test-result is-fail mb-3">{error}</div>}

      {loading && !report ? (
        <div className="text-xs text-text-500 font-mono">Running validation…</div>
      ) : report ? (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`settings-validate-badge ${report.ok ? 'is-ok' : 'is-fail'}`}>
              {report.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {report.ok ? 'All skills valid' : `${report.error_count} issue(s)`}
            </span>
            <span className="text-[10px] font-mono text-text-500">
              {report.skill_count} skills · validator: {report.validator}
            </span>
          </div>

          {failures.length > 0 ? (
            <ul className="settings-validate-failures space-y-2">
              {failures.map((row) => (
                <li key={row.skill_id} className="settings-validate-failure">
                  <div className="font-mono text-xs text-neon-amber">{row.skill_id}</div>
                  <ul className="mt-1 space-y-0.5">
                    {row.problems.map((p) => (
                      <li key={p} className="text-[10px] text-text-400 font-mono">{p}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[10px] text-text-500 font-mono truncate" title={report.skills_root}>
              {report.skills_root}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}