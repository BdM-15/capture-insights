/** Combo Insights — cross-signal intersection scoring and capture prioritization */

export type ComboTier = 'prime' | 'advance' | 'monitor' | 'track'
export type ComboSignal =
  | 'hot_agency'
  | 'top_incumbent'
  | 'anchor_pop'
  | 'near_term'
  | 'flex_pricing'
  | 'high_value'
  | 'vault_tracked'

export interface ComboMatch {
  award_key?: string
  recipient: string
  obligation: number
  obligation_millions: number
  end_date?: string | null
  months_to_end: number
  agency: string
  pop_state?: string
  pricing?: string
  pricing_bucket?: string
  agency_quadrant?: string
  signals: ComboSignal[]
  signal_count: number
  combo_score: number
  combo_tier: ComboTier
  vault_boost?: boolean
  display_score?: number
}

export interface ComboInsightsData {
  meta: { months_ahead?: number; scoring_note?: string }
  summary: {
    match_count?: number
    hot_agency_overlap?: number
    prime_count?: number
    advance_count?: number
    prime_millions?: number
    top_signal?: string | null
  }
  signal_mix: { signal: string; count: number }[]
  tier_counts: Partial<Record<ComboTier, number>>
  matches: ComboMatch[]
}

export const COMBO_TIER_META: Record<
  ComboTier,
  { label: string; tone: string; hint: string }
> = {
  prime: {
    label: 'Prime target',
    tone: 'text-neon-magenta',
    hint: 'Multiple strong signals align — advance capture now: customer interface, competitor brief, pipeline.',
  },
  advance: {
    label: 'Advance',
    tone: 'text-neon-cyan',
    hint: 'Worth active positioning — qualify, shape, and map teaming before RFP.',
  },
  monitor: {
    label: 'Monitor',
    tone: 'text-neon-amber',
    hint: 'Some intersection signal — track in vault; invest when timing or relationship improves.',
  },
  track: {
    label: 'Track',
    tone: 'text-text-500',
    hint: 'Radar only in current slice — low stacked signal; don’t over-staff yet.',
  },
}

export const COMBO_SIGNAL_META: Record<ComboSignal, { label: string; short: string; tone: string }> = {
  hot_agency: { label: 'Hot buyer', short: 'Hot agency', tone: 'text-neon-magenta' },
  top_incumbent: { label: 'Top incumbent', short: 'Top prime', tone: 'text-neon-cyan' },
  anchor_pop: { label: 'Anchor PoP', short: 'Anchor geo', tone: 'text-neon-lime' },
  near_term: { label: 'Near-term end', short: '≤12m', tone: 'text-neon-amber' },
  flex_pricing: { label: 'Flexible pricing', short: 'Flex $', tone: 'text-neon-amber' },
  high_value: { label: 'High value', short: 'High $', tone: 'text-neon-cyan' },
  vault_tracked: { label: 'Vault tracked', short: 'Vault', tone: 'text-neon-lime' },
}

export function parseComboInsights(data: unknown): ComboInsightsData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    meta: (d.meta as ComboInsightsData['meta']) || {},
    summary: (d.summary as ComboInsightsData['summary']) || {},
    signal_mix: Array.isArray(d.signal_mix) ? (d.signal_mix as ComboInsightsData['signal_mix']) : [],
    tier_counts: (d.tier_counts as ComboInsightsData['tier_counts']) || {},
    matches: Array.isArray(d.matches) ? (d.matches as ComboMatch[]) : [],
  }
}

export function enrichComboWithVault(
  matches: ComboMatch[],
  isInBrain: (name: string) => boolean,
): ComboMatch[] {
  return matches.map((m) => {
    const vaultBoost = isInBrain(m.recipient) || isInBrain(m.agency)
    const signals = vaultBoost && !m.signals.includes('vault_tracked')
      ? [...m.signals, 'vault_tracked' as ComboSignal]
      : m.signals
    return {
      ...m,
      signals,
      vault_boost: vaultBoost,
      display_score: m.combo_score + (vaultBoost ? 10 : 0),
      signal_count: signals.length,
    }
  })
}

export function buildComboScatterPoints(matches: ComboMatch[]) {
  return matches.map((m) => ({
    name: (m.recipient || '').slice(0, 18),
    x: m.months_to_end,
    y: m.obligation_millions,
    z: Math.max(50, Math.min(240, (m.display_score ?? m.combo_score) * 2)),
    tier: m.combo_tier,
    score: m.display_score ?? m.combo_score,
    agency: m.agency,
  }))
}

export function buildComboBriefPrompt(match: ComboMatch, naics: string): string {
  const signalLabels = match.signals
    .map((s) => COMBO_SIGNAL_META[s]?.label || s)
    .join(', ')
  return [
    `Combo opportunity brief for NAICS ${naics}.`,
    `${match.recipient} / ${match.agency}, ends ${match.end_date} (${match.months_to_end}mo), $${match.obligation_millions}M, PoP ${match.pop_state || '?'}.`,
    `Combo tier: ${match.combo_tier} (score ${match.display_score ?? match.combo_score}). Signals: ${signalLabels || 'none'}.`,
    `Pricing: ${match.pricing || 'unknown'} (${match.pricing_bucket || '?'}).`,
    'Recommend: 30-day capture plan — customer touch, competitor/displacement, teaming, SAM scan. Cite vault + USASpending.',
  ].join(' ')
}

export const COMBO_MCP_STUBS = [
  { label: 'SAM pre-solicitation scan', mcp: 'SAM.gov', status: 'Ready' as const },
  { label: 'Incumbent award history', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Agency forecast / APFS', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Teaming / SB partners', mcp: 'SAM.gov', status: 'Ready' as const },
]