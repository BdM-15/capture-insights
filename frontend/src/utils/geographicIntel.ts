/** Geographic / regional capture helpers — delivery concentration + pursuit lenses */

import { buildRelationshipHeatmap, type RelationshipHeatmapModel } from './agencyIntel'

export type GeoConcentration = 'concentrated' | 'moderate' | 'distributed'
export type StateQuadrant = 'hot' | 'high_value' | 'high_volume' | 'watch'
export type PursuitLens = 'anchor' | 'target' | 'niche' | 'monitor'

export interface GeoAnalysisSummary {
  total_millions?: number
  total_actions?: number
  state_count?: number
  top_state?: string | null
  top3_state_pct?: number
  top5_state_pct?: number
  posture?: GeoConcentration
  expiring_state_count?: number
  expiring_millions?: number
}

export interface GeoStateRow {
  state: string
  actions: number
  millions: number
  share_pct: number
  avg_award_k: number
  quadrant: StateQuadrant
  pursuit_lens: PursuitLens
  top_agency?: string | null
  top_agency_millions?: number
  top_recipient?: string | null
  top_recipient_millions?: number
  expiring_count: number
  expiring_millions: number
  nearest_end?: string | null
}

export interface AgencyStatePair {
  agency: string
  state: string
  actions: number
  millions: number
}

export interface ExpiringStateRow {
  state: string
  expiring_count: number
  expiring_millions: number
  nearest_end?: string | null
}

export interface GeoMapState {
  state: string
  actions: number
  millions: number
  share_pct: number
}

export interface StateScatterPoint {
  name: string
  x: number
  y: number
  z: number
  quadrant: StateQuadrant
  isHot: boolean
  sharePct: number
  millions: number
}

export interface GeographicAnalysisData {
  meta: { data_note?: string; months_ahead?: number }
  summary: GeoAnalysisSummary
  by_state: GeoStateRow[]
  map_states: GeoMapState[]
  agency_state_pairs: AgencyStatePair[]
  expiring_by_state: ExpiringStateRow[]
}

export const GEO_CONCENTRATION_META: Record<
  GeoConcentration,
  { label: string; tone: string; hint: string }
> = {
  concentrated: {
    label: 'Regionally concentrated',
    tone: 'text-neon-magenta',
    hint: 'A few states dominate delivery — anchor footprint or teaming in top PoP states is non-optional.',
  },
  moderate: {
    label: 'Moderately distributed',
    tone: 'text-neon-amber',
    hint: 'Visible regional clusters — prioritize top 3–5 states but keep secondary markets on monitor.',
  },
  distributed: {
    label: 'Broadly distributed',
    tone: 'text-neon-lime',
    hint: 'Work spreads across many states — agency/customer targeting may matter more than a single regional hub.',
  },
}

export const STATE_QUADRANT_META: Record<
  StateQuadrant,
  { label: string; short: string; tone: string; hint: string }
> = {
  hot: {
    label: 'Hot — high $ and volume',
    short: 'Hot',
    tone: 'text-neon-magenta',
    hint: 'Active delivery hub — strong past-performance signal and regional BD worth the investment.',
  },
  high_value: {
    label: 'High $ — larger awards',
    short: 'High $',
    tone: 'text-neon-cyan',
    hint: 'Fewer but bigger actions — confirm delivery capacity and key buyer relationships before pursuit.',
  },
  high_volume: {
    label: 'High volume — many actions',
    short: 'High vol',
    tone: 'text-neon-lime',
    hint: 'Steady task-order style work — staffing and regional subcontractor bench matter.',
  },
  watch: {
    label: 'Below medians — monitor',
    short: 'Watch',
    tone: 'text-text-500',
    hint: 'Thin slice signal — track if a target agency shifts work here; don’t over-staff yet.',
  },
}

export const PURSUIT_LENS_META: Record<
  PursuitLens,
  { label: string; tone: string; strategy: string }
> = {
  anchor: {
    label: 'Anchor',
    tone: 'text-neon-magenta',
    strategy: 'Must-win geography — office presence, cleared staff, or a regional prime partner.',
  },
  target: {
    label: 'Target',
    tone: 'text-neon-cyan',
    strategy: 'Worth deliberate regional capture — map buyers and incumbents before RFP.',
  },
  niche: {
    label: 'Niche',
    tone: 'text-neon-lime',
    strategy: 'Surgical plays — expiring work or a specific buyer niche; team locally if you lack footprint.',
  },
  monitor: {
    label: 'Monitor',
    tone: 'text-text-500',
    strategy: 'Track in vault; invest when agency or recompete signal strengthens.',
  },
}

export function getGeoConcentration(top3Pct: number): GeoConcentration {
  if (top3Pct >= 55) return 'concentrated'
  if (top3Pct >= 30) return 'moderate'
  return 'distributed'
}

export function getStateMedians(states: readonly { actions: number; millions: number }[]): {
  actions: number
  millions: number
} {
  if (!states.length) return { actions: 0, millions: 0 }
  const sortedA = [...states].map((s) => s.actions).sort((a, b) => a - b)
  const sortedM = [...states].map((s) => s.millions).sort((a, b) => a - b)
  const mid = Math.floor(states.length / 2)
  return { actions: sortedA[mid] ?? 0, millions: sortedM[mid] ?? 0 }
}

export function classifyStateQuadrant(
  actions: number,
  millions: number,
  medActions: number,
  medMillions: number,
): StateQuadrant {
  const highActions = actions > medActions
  const highMillions = millions > medMillions
  if (highActions && highMillions) return 'hot'
  if (highMillions) return 'high_value'
  if (highActions) return 'high_volume'
  return 'watch'
}

export function buildStateScatterData(mapStates: readonly GeoMapState[]): StateScatterPoint[] {
  const valid = mapStates.filter((s) => /^[A-Z]{2}$/.test(s.state))
  const med = getStateMedians(valid)
  return valid.map((s) => {
    const quadrant = classifyStateQuadrant(s.actions, s.millions, med.actions, med.millions)
    const avgK = s.actions ? (s.millions * 1000) / s.actions : 0
    return {
      name: s.state,
      x: s.actions,
      y: s.millions * 1e6,
      z: Math.max(48, Math.min(220, avgK / 2)),
      quadrant,
      isHot: quadrant === 'hot',
      sharePct: s.share_pct,
      millions: s.millions,
    }
  })
}

export function buildAgencyStateHeatmap(
  pairs: readonly AgencyStatePair[],
  maxAgencies = 6,
  maxStates = 10,
): RelationshipHeatmapModel {
  const rows = pairs.map((p) => ({
    agency: p.agency,
    recipient: p.state,
    actions: p.actions,
    millions: p.millions,
  }))
  return buildRelationshipHeatmap(rows, maxAgencies, maxStates)
}

export function isMappableState(state: string): boolean {
  return /^[A-Z]{2}$/.test(state) && state !== '??'
}

export function parseGeographicAnalysis(data: unknown): GeographicAnalysisData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    meta: (d.meta as GeographicAnalysisData['meta']) || {},
    summary: (d.summary as GeoAnalysisSummary) || {},
    by_state: Array.isArray(d.by_state) ? (d.by_state as GeoStateRow[]) : [],
    map_states: Array.isArray(d.map_states) ? (d.map_states as GeoMapState[]) : [],
    agency_state_pairs: Array.isArray(d.agency_state_pairs)
      ? (d.agency_state_pairs as AgencyStatePair[])
      : [],
    expiring_by_state: Array.isArray(d.expiring_by_state)
      ? (d.expiring_by_state as ExpiringStateRow[])
      : [],
  }
}

export function buildRegionalStrategyPrompt(ctx: {
  naics: string
  summary: GeoAnalysisSummary
  topState?: GeoStateRow
  expiringState?: ExpiringStateRow
}): string {
  const parts = [
    `Regional capture brief for NAICS ${ctx.naics}.`,
    `Delivery geography: ${ctx.summary.posture || 'unknown'} posture — top state ${ctx.summary.top_state || '?'}, top 3 states ${ctx.summary.top3_state_pct ?? '?'}% of slice.`,
  ]

  if (ctx.topState) {
    parts.push(
      `Anchor/target: ${ctx.topState.state} — $${ctx.topState.millions}M (${ctx.topState.share_pct}%), top buyer ${ctx.topState.top_agency || '?'}, top incumbent ${ctx.topState.top_recipient || '?'}, ${ctx.topState.expiring_count} expiring in window.`,
    )
  }
  if (ctx.expiringState) {
    parts.push(
      `Expiring cluster: ${ctx.expiringState.state} — ${ctx.expiringState.expiring_count} awards, $${ctx.expiringState.expiring_millions}M, nearest end ${ctx.expiringState.nearest_end || '?'}.`,
    )
  }
  parts.push(
    'Recommend: regional teaming vs organic footprint, cleared staff / facility needs, travel cost in PTW, SAM PoP filters for live reqs. Cite USASpending + vault sources.',
  )
  return parts.join(' ')
}

export const GEO_MCP_STUBS = [
  { label: 'Awards by place of performance', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Live reqs by state / PoP', mcp: 'SAM.gov', status: 'Ready' as const },
  { label: 'Regional labor rate sanity', mcp: 'GSA CALC+', status: 'Catalog' as const },
  { label: 'Subcontractor / SB by state', mcp: 'SAM.gov', status: 'Ready' as const },
]