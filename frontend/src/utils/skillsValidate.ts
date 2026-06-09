export interface SkillValidationRow {
  skill_id: string
  ok: boolean
  problems: string[]
  path: string
}

export interface SkillsValidationReport {
  ok: boolean
  skills_root: string
  skill_count: number
  error_count: number
  validator: string
  standard: string
  results: SkillValidationRow[]
}

export async function fetchSkillsValidation(): Promise<SkillsValidationReport> {
  const res = await fetch('/skills/validate')
  if (!res.ok) {
    throw new Error(`Validation failed (${res.status})`)
  }
  return res.json()
}