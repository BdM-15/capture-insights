import type { SkillEntry } from '../components/lists/SkillCard'

export interface SkillCategoryGroup {
  id: string
  label: string
  skills: SkillEntry[]
  count?: number
}

export interface SkillsCatalogData {
  skills?: SkillEntry[]
  skill_count?: number
  categories?: SkillCategoryGroup[]
  status_counts?: Record<string, number>
  active_count?: number
  draft_count?: number
  catalog_count?: number
  orchestrator_count?: number
  multi_turn_skills?: string[]
  note?: string
}

export function skillsInCategory(catalog: SkillsCatalogData | null, categoryId: string): SkillEntry[] {
  const group = catalog?.categories?.find((c) => c.id === categoryId)
  return group?.skills || []
}

export function skillById(catalog: SkillsCatalogData | null, id: string): SkillEntry | undefined {
  return catalog?.skills?.find((s) => s.id === id)
}

export function skillsByIds(catalog: SkillsCatalogData | null, ids: string[]): SkillEntry[] {
  const all = catalog?.skills || []
  return ids.map((id) => all.find((s) => s.id === id)).filter(Boolean) as SkillEntry[]
}