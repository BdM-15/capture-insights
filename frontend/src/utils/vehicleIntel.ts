/** Contract vehicle / buying mechanism helpers — capture access strategy */

export type VehiclePosture = 'idiq_dominant' | 'standalone_dominant' | 'mixed'
export type VehicleConcentration = 'concentrated' | 'moderate' | 'fragmented'
export type VehicleAccessLens = 'prime_on_vehicle' | 'team_through_holder' | 'standalone_pursuit' | 'monitor'

export interface VehicleAnalysisSummary {
  total_millions?: number
  total_actions?: number
  idv_pct?: number
  standalone_pct?: number
  top_vehicle?: string | null
  top_pricing?: string | null
  top3_vehicle_pct?: number
  posture?: VehiclePosture
}

export interface VehicleComboRow {
  pricing: string
  vehicle: string
  actions: number
  millions: number
  sharePct: number
  accessLens: VehicleAccessLens
}

export interface VehicleHolderRow {
  vehicle: string
  recipient: string
  actions: number
  millions: number
  vehicle_millions?: number
  holderSharePct: number
}

export interface AgencyVehicleRow {
  agency: string
  agency_millions: number
  top_vehicle: string
  top_vehicle_millions: number
  vehicles: { vehicle: string; actions: number; millions: number }[]
}

export interface VehicleAnalysisData {
  summary: VehicleAnalysisSummary
  by_idv: { vehicle: string; actions: number; millions: number }[]
  by_pricing: { pricing: string; actions: number; millions: number }[]
  by_award_type: { award_type: string; actions: number; millions: number }[]
  combinations: { pricing: string; vehicle: string; actions: number; millions: number }[]
  by_extent_competed: { extent_competed: string; actions: number; millions: number }[]
  by_agency: AgencyVehicleRow[]
  vehicle_holders: VehicleHolderRow[]
}

export const VEHICLE_POSTURE_META: Record<
  VehiclePosture,
  { label: string; tone: string; hint: string }
> = {
  idiq_dominant: {
    label: 'IDIQ / task-order heavy',
    tone: 'text-neon-cyan',
    hint: 'Vehicle access matters — map holders, team onto incumbents, or position for on-ramp recompetes.',
  },
  standalone_dominant: {
    label: 'Standalone definitive heavy',
    tone: 'text-neon-lime',
    hint: 'More head-to-head competitions — past performance and price discipline carry more weight than schedule position.',
  },
  mixed: {
    label: 'Mixed buying',
    tone: 'text-neon-amber',
    hint: 'Run dual path: pursue standalone recompetes while cultivating vehicle-holder relationships.',
  },
}

export const VEHICLE_CONCENTRATION_META: Record<
  VehicleConcentration,
  { label: string; tone: string; hint: string }
> = {
  concentrated: {
    label: 'Concentrated vehicles',
    tone: 'text-neon-magenta',
    hint: 'Few mechanisms dominate spend — prioritize holder intel and teaming on those vehicles.',
  },
  moderate: {
    label: 'Moderate concentration',
    tone: 'text-neon-amber',
    hint: 'Multiple viable paths — qualify which vehicles match your capabilities and clearance footprint.',
  },
  fragmented: {
    label: 'Fragmented buying',
    tone: 'text-neon-lime',
    hint: 'No single vehicle gatekeeps the market — compete on capability fit and regional PP.',
  },
}

export const VEHICLE_ACCESS_META: Record<VehicleAccessLens, { label: string; tone: string }> = {
  prime_on_vehicle: { label: 'Prime on vehicle', tone: 'text-neon-lime' },
  team_through_holder: { label: 'Team through holder', tone: 'text-neon-cyan' },
  standalone_pursuit: { label: 'Standalone pursuit', tone: 'text-neon-amber' },
  monitor: { label: 'Monitor', tone: 'text-text-500' },
}

export function getVehicleConcentration(top3Pct: number): VehicleConcentration {
  if (top3Pct >= 60) return 'concentrated'
  if (top3Pct >= 35) return 'moderate'
  return 'fragmented'
}

export function getVehicleAccessLens(
  vehicle: string,
  sharePct: number,
  idvPct: number,
): VehicleAccessLens {
  const v = (vehicle || '').toLowerCase()
  const isStandalone = v.includes('standalone') || v.includes('definitive')
  if (isStandalone || idvPct < 25) {
    return sharePct >= 8 ? 'standalone_pursuit' : 'monitor'
  }
  if (sharePct >= 12) return 'team_through_holder'
  if (sharePct >= 5) return 'prime_on_vehicle'
  return 'monitor'
}

export function buildVehicleComboRows(
  combinations: VehicleAnalysisData['combinations'],
  totalMillions: number,
  idvPct: number,
): VehicleComboRow[] {
  const total = totalMillions || 1
  return combinations.map((c) => {
    const sharePct = Math.round(((c.millions || 0) / total) * 1000) / 10
    return {
      pricing: c.pricing,
      vehicle: c.vehicle,
      actions: c.actions,
      millions: c.millions,
      sharePct,
      accessLens: getVehicleAccessLens(c.vehicle, sharePct, idvPct),
    }
  })
}

export function buildVehicleHolderRows(
  holders: { vehicle: string; recipient: string; actions: number; millions: number; vehicle_millions?: number }[],
): VehicleHolderRow[] {
  return holders.map((h) => ({
    ...h,
    holderSharePct: h.vehicle_millions
      ? Math.round(((h.millions || 0) / h.vehicle_millions) * 1000) / 10
      : 0,
  }))
}

export function parseVehicleAnalysis(data: unknown): VehicleAnalysisData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    summary: (d.summary as VehicleAnalysisSummary) || {},
    by_idv: Array.isArray(d.by_idv) ? d.by_idv as VehicleAnalysisData['by_idv'] : [],
    by_pricing: Array.isArray(d.by_pricing) ? d.by_pricing as VehicleAnalysisData['by_pricing'] : [],
    by_award_type: Array.isArray(d.by_award_type) ? d.by_award_type as VehicleAnalysisData['by_award_type'] : [],
    combinations: Array.isArray(d.combinations) ? d.combinations as VehicleAnalysisData['combinations'] : [],
    by_extent_competed: Array.isArray(d.by_extent_competed)
      ? d.by_extent_competed as VehicleAnalysisData['by_extent_competed']
      : [],
    by_agency: Array.isArray(d.by_agency) ? d.by_agency as AgencyVehicleRow[] : [],
    vehicle_holders: Array.isArray(d.vehicle_holders)
      ? buildVehicleHolderRows(d.vehicle_holders as VehicleHolderRow[])
      : [],
  }
}

export function buildVehicleStrategyPrompt(ctx: {
  naics: string
  summary: VehicleAnalysisSummary
  topCombo?: VehicleComboRow
  smallBizPct?: number
}): string {
  const s = ctx.summary
  return [
    `Contract vehicle strategy for NAICS ${ctx.naics}.`,
    `Market posture: ${s.posture || 'mixed'} — ${s.idv_pct ?? '?'}% IDV/task-order vs ${s.standalone_pct ?? '?'}% standalone.`,
    `Top vehicle: ${s.top_vehicle || 'unknown'}; top pricing: ${s.top_pricing || 'unknown'}; top-3 vehicles = ${s.top3_vehicle_pct ?? '?'}% of spend.`,
    ctx.topCombo
      ? `Largest combo: ${ctx.topCombo.pricing} / ${ctx.topCombo.vehicle} (${ctx.topCombo.sharePct}%).`
      : '',
    ctx.smallBizPct != null ? `Set-aside context: ${ctx.smallBizPct}% small-business weighted.` : '',
    'Recommend: which vehicles to prime, team through, or avoid; holder targets; GSA CALC+ / SAM schedule checks. Cite sources for vault.',
  ].filter(Boolean).join(' ')
}

export type PricingBucket = 'firm_fixed' | 'performance_based' | 'time_materials' | 'cost_reimbursement' | 'other'
export type PressureTier = 'high' | 'moderate' | 'low'
export type FfpShapeGate = 'shape_now' | 'monitor' | 'watch'
export type AgencyShapeGate = 'advance' | 'monitor' | 'defer'

export interface FfpShapingSummary {
  market_non_fixed_pct?: number
  market_cost_reimbursement_pct?: number
  market_time_materials_pct?: number
  market_firm_fixed_pct?: number
  agencies_high_pressure?: number
  shape_now_count?: number
}

export interface AgencyPricingPressure {
  agency: string
  total_millions: number
  firm_fixed_pct: number
  non_fixed_pct: number
  cost_reimbursement_pct: number
  time_materials_pct: number
  performance_based_pct: number
  dominant_non_fixed_pricing?: string | null
  pressure_tier: PressureTier
  shape_gate: AgencyShapeGate
  expiring_non_fixed_count: number
}

export interface FfpShapeTarget {
  award_key?: string
  recipient: string
  agency: string
  end_date?: string
  pricing: string
  pricing_bucket: PricingBucket
  obligation_millions: number
  agency_non_fixed_pct: number
  pressure_tier: PressureTier
  shape_gate: FfpShapeGate
  shape_reason: string
}

export interface FfpShapingRadar {
  meta: {
    policy_note?: string
    eo_reference?: string
  }
  summary: FfpShapingSummary
  agency_pressure: AgencyPricingPressure[]
  shape_targets: FfpShapeTarget[]
}

export const PRESSURE_TIER_META: Record<PressureTier, { label: string; tone: string }> = {
  high: { label: 'High pressure', tone: 'text-neon-magenta' },
  moderate: { label: 'Moderate', tone: 'text-neon-amber' },
  low: { label: 'Low', tone: 'text-text-500' },
}

export const FFP_SHAPE_GATE_META: Record<FfpShapeGate, { label: string; tone: string }> = {
  shape_now: { label: 'Shape now', tone: 'text-neon-lime' },
  monitor: { label: 'Monitor', tone: 'text-neon-amber' },
  watch: { label: 'Watch', tone: 'text-text-500' },
}

export const AGENCY_SHAPE_GATE_META: Record<AgencyShapeGate, { label: string; tone: string }> = {
  advance: { label: 'Advance', tone: 'text-neon-magenta' },
  monitor: { label: 'Monitor', tone: 'text-neon-amber' },
  defer: { label: 'Defer', tone: 'text-text-500' },
}

export const PRICING_BUCKET_META: Record<PricingBucket, { label: string; tone: string }> = {
  firm_fixed: { label: 'Firm fixed', tone: 'text-neon-lime' },
  performance_based: { label: 'Performance-based', tone: 'text-neon-cyan' },
  time_materials: { label: 'T&M / LH', tone: 'text-neon-amber' },
  cost_reimbursement: { label: 'Cost-type', tone: 'text-neon-magenta' },
  other: { label: 'Other', tone: 'text-text-500' },
}

export function parseFfpShapingRadar(data: unknown): FfpShapingRadar | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    meta: (d.meta as FfpShapingRadar['meta']) || {},
    summary: (d.summary as FfpShapingSummary) || {},
    agency_pressure: Array.isArray(d.agency_pressure)
      ? d.agency_pressure as AgencyPricingPressure[]
      : [],
    shape_targets: Array.isArray(d.shape_targets)
      ? d.shape_targets as FfpShapeTarget[]
      : [],
  }
}

export function buildFfpShapingPrompt(ctx: {
  naics: string
  summary: FfpShapingSummary
  target?: FfpShapeTarget
  agency?: AgencyPricingPressure
}): string {
  const parts = [
    `FFP / performance-based shaping brief for NAICS ${ctx.naics}.`,
    `Market: ${ctx.summary.market_non_fixed_pct ?? '?'}% non-fixed pricing (${ctx.summary.market_cost_reimbursement_pct ?? '?'}% cost-type, ${ctx.summary.market_time_materials_pct ?? '?'}% T&M).`,
    'EO context: agencies pushed toward firm-fixed and performance-based structures — use as qualification signal, not guarantee.',
  ]
  if (ctx.agency) {
    parts.push(
      `Agency ${ctx.agency.agency}: ${ctx.agency.non_fixed_pct}% non-fixed, ${ctx.agency.pressure_tier} pressure, dominant flexible type: ${ctx.agency.dominant_non_fixed_pricing || 'unknown'}.`,
    )
  }
  if (ctx.target) {
    parts.push(
      `Target: ${ctx.target.recipient} / ${ctx.target.agency}, ${ctx.target.pricing}, ends ${ctx.target.end_date}, $${ctx.target.obligation_millions}M. ${ctx.target.shape_reason}`,
    )
  }
  parts.push(
    'Recommend: pre-RFP shaping moves (measurable requirements, commercial items, performance metrics), SAM RFIs/sources sought scan, IGCE/PTW implications. Cite sources for vault.',
  )
  return parts.join(' ')
}

export const FFP_SHAPING_MCP_STUBS = [
  { label: 'RFI / Sources Sought scan', mcp: 'SAM.gov', status: 'Ready' as const },
  { label: 'Incumbent pricing history', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'FFP labor rate sanity', mcp: 'GSA CALC+', status: 'Catalog' as const },
  { label: 'Pre-solicitation notices', mcp: 'SAM.gov', status: 'Ready' as const },
]

export const VEHICLE_MCP_STUBS = [
  { label: 'Schedule / GWAC holders', mcp: 'SAM.gov', status: 'Ready' as const },
  { label: 'Labor rate realism', mcp: 'GSA CALC+', status: 'Catalog' as const },
  { label: 'Award history by vehicle', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Set-aside on-ramp', mcp: 'SAM.gov', status: 'Ready' as const },
]