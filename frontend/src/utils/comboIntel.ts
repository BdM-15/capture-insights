/** Combo Insights — cross-signal intersection scoring and capture prioritization */

import { getStateMedians } from './geographicIntel'

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

function comboTierFromScore(score: number): ComboTier {
  if (score >= 55) return 'prime'
  if (score >= 35) return 'advance'
  if (score >= 20) return 'monitor'
  return 'track'
}

/** Client-side fallback when /data/combo-insights is unavailable (stale server, etc.). */
export function buildClientComboInsights(ctx: {
  expiring: readonly {
    award_key?: string
    recipient?: string
    obligation?: number
    end_date?: string
    agency?: string
    pop_state?: string
    pricing?: string
    pricing_bucket?: string
    months_to_end?: number
  }[]
  intensity: readonly { agency: string; award_count: number; total_oblig: number }[]
  topRecipients: readonly { recipient?: string; name?: string }[]
  anchorStates?: readonly string[]
}): ComboInsightsData {
  const medActions = getStateMedians(ctx.intensity.map((a) => ({ actions: a.award_count, millions: 0 }))).actions
  const medOblig =
    ctx.intensity.length
      ? [...ctx.intensity].map((a) => a.total_oblig).sort((a, b) => a - b)[Math.floor(ctx.intensity.length / 2)]
      : 0
  const hotAgencies = new Set(
    ctx.intensity
      .filter((a) => a.award_count > medActions && a.total_oblig > medOblig)
      .map((a) => a.agency),
  )
  const topRecipients = new Set(
    ctx.topRecipients.map((r) => r.recipient || r.name || '').filter(Boolean),
  )
  const anchorStates = new Set(ctx.anchorStates || [])

  const obligations = ctx.expiring.map((e) => e.obligation || 0).sort((a, b) => a - b)
  const medObligExp = obligations[Math.floor(obligations.length / 2)] || 0

  const signalCounts: Record<string, number> = {}
  const matches: ComboMatch[] = ctx.expiring.map((e) => {
    const oblig = e.obligation || 0
    const months = e.months_to_end ?? 0
    const signals: ComboSignal[] = []
    let score = 0

    if (e.agency && hotAgencies.has(e.agency)) {
      signals.push('hot_agency')
      score += 30
      signalCounts.hot_agency = (signalCounts.hot_agency || 0) + 1
    }
    if (e.recipient && topRecipients.has(e.recipient)) {
      signals.push('top_incumbent')
      score += 25
      signalCounts.top_incumbent = (signalCounts.top_incumbent || 0) + 1
    }
    if (e.pop_state && anchorStates.has(e.pop_state)) {
      signals.push('anchor_pop')
      score += 15
      signalCounts.anchor_pop = (signalCounts.anchor_pop || 0) + 1
    }
    if (months <= 12) {
      signals.push('near_term')
      score += 20
      signalCounts.near_term = (signalCounts.near_term || 0) + 1
    }
    if (e.pricing_bucket && e.pricing_bucket !== 'firm_fixed') {
      signals.push('flex_pricing')
      score += 10
      signalCounts.flex_pricing = (signalCounts.flex_pricing || 0) + 1
    }
    if (oblig >= medObligExp && medObligExp > 0) {
      signals.push('high_value')
      score += 10
      signalCounts.high_value = (signalCounts.high_value || 0) + 1
    }

    return {
      award_key: e.award_key,
      recipient: e.recipient || 'Unknown',
      obligation: oblig,
      obligation_millions: Math.round((oblig / 1_000_000) * 100) / 100,
      end_date: e.end_date,
      months_to_end: months,
      agency: e.agency || '(Unspecified)',
      pop_state: e.pop_state,
      pricing: e.pricing,
      pricing_bucket: e.pricing_bucket,
      signals,
      signal_count: signals.length,
      combo_score: score,
      combo_tier: comboTierFromScore(score),
    }
  })

  matches.sort((a, b) => (b.combo_score - a.combo_score) || (a.months_to_end - b.months_to_end))

  const tier_counts: Partial<Record<ComboTier, number>> = {}
  matches.forEach((m) => {
    tier_counts[m.combo_tier] = (tier_counts[m.combo_tier] || 0) + 1
  })

  return {
    meta: {
      months_ahead: 36,
      scoring_note: 'Client-side fallback scoring (restart backend for full /data/combo-insights endpoint).',
    },
    summary: {
      match_count: matches.length,
      hot_agency_overlap: matches.filter((m) => m.signals.includes('hot_agency')).length,
      prime_count: tier_counts.prime || 0,
      advance_count: tier_counts.advance || 0,
      prime_millions: Math.round(
        matches.filter((m) => m.combo_tier === 'prime').reduce((s, m) => s + m.obligation_millions, 0) * 100,
      ) / 100,
      top_signal: Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    },
    signal_mix: Object.entries(signalCounts)
      .map(([signal, count]) => ({ signal, count }))
      .sort((a, b) => b.count - a.count),
    tier_counts,
    matches,
  }
}

export const COMBO_MCP_STUBS = [
  { label: 'SAM pre-solicitation scan', mcp: 'SAM.gov', status: 'Ready' as const },
  { label: 'Incumbent award history', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Agency forecast / APFS', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Teaming / SB partners', mcp: 'SAM.gov', status: 'Ready' as const },
]