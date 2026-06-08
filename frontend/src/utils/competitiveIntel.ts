/** Competitive landscape helpers — Data Insights concentration + capture posture */

export interface RecipientFlowSummary {
  topAgency: string
  topMillions: number
  agencyCount: number
  officeCount: number
  totalMillions: number
  totalActions: number
}

export function summarizeRecipientFlows(
  flows: readonly {
    recipient?: string
    agency?: string
    office?: string
    millions?: number
    actions?: number
  }[],
): Map<string, RecipientFlowSummary> {
  const map = new Map<
    string,
    { agencies: Map<string, number>; offices: Set<string>; totalM: number; totalA: number }
  >()
  flows.forEach((f) => {
    const rec = f.recipient || 'Unknown'
    if (!map.has(rec)) map.set(rec, { agencies: new Map(), offices: new Set(), totalM: 0, totalA: 0 })
    const entry = map.get(rec)!
    const ag = f.agency || '(Unspecified)'
    entry.agencies.set(ag, (entry.agencies.get(ag) || 0) + (f.millions || 0))
    if (f.office) entry.offices.add(f.office)
    entry.totalM += f.millions || 0
    entry.totalA += f.actions || 0
  })

  const out = new Map<string, RecipientFlowSummary>()
  map.forEach((entry, recipient) => {
    let topAgency = '—'
    let topMillions = 0
    entry.agencies.forEach((m, a) => {
      if (m > topMillions) {
        topMillions = m
        topAgency = a
      }
    })
    out.set(recipient, {
      topAgency,
      topMillions,
      agencyCount: entry.agencies.size,
      officeCount: entry.offices.size,
      totalMillions: Math.round(entry.totalM * 100) / 100,
      totalActions: entry.totalA,
    })
  })
  return out
}

export type ConcentrationTier = 'high' | 'moderate' | 'fragmented'

export function getConcentrationTier(top3Pct: number): ConcentrationTier {
  if (top3Pct >= 55) return 'high'
  if (top3Pct >= 30) return 'moderate'
  return 'fragmented'
}

export const CONCENTRATION_META: Record<
  ConcentrationTier,
  { label: string; tone: string; hint: string }
> = {
  high: {
    label: 'Highly concentrated',
    tone: 'text-neon-magenta',
    hint: 'Few primes own the market — relationship mapping, teaming, and displacement intel are critical.',
  },
  moderate: {
    label: 'Moderately concentrated',
    tone: 'text-neon-amber',
    hint: 'Visible leaders but room for challengers — target agency niches incumbents under-serve.',
  },
  fragmented: {
    label: 'Fragmented',
    tone: 'text-neon-lime',
    hint: 'No single dominant prime — volume and vehicle access may matter more than one incumbent brief.',
  },
}

export type CompetitorPosture = 'dominant' | 'incumbent' | 'broad' | 'niche'

export function getCompetitorPosture(signals: {
  sharePct: number
  agencyCount: number
  recompeteCount: number
}): CompetitorPosture {
  if (signals.sharePct >= 20) return 'dominant'
  if (signals.recompeteCount >= 2) return 'incumbent'
  if (signals.agencyCount >= 3) return 'broad'
  return 'niche'
}

export const POSTURE_META: Record<
  CompetitorPosture,
  { label: string; tone: string; strategy: string }
> = {
  dominant: {
    label: 'Dominant',
    tone: 'text-neon-magenta',
    strategy: 'Team, ghost, or displace — map their agency strongholds before head-to-head.',
  },
  incumbent: {
    label: 'Incumbent',
    tone: 'text-neon-cyan',
    strategy: 'Recompete timing signal — study their PoP ends and shape evaluation early.',
  },
  broad: {
    label: 'Multi-agency',
    tone: 'text-neon-lime',
    strategy: 'Cross-agency player — find where you can out-position them at specific buyers.',
  },
  niche: {
    label: 'Niche',
    tone: 'text-text-500',
    strategy: 'Monitor — may be a specialist sub or regional prime worth tracking.',
  },
}

export type CompeteStrategy = 'displace' | 'team' | 'ghost' | 'monitor'

export function getCompeteStrategy(
  posture: CompetitorPosture,
  sharePct: number,
  inBrain: boolean,
): CompeteStrategy {
  if (posture === 'dominant' && sharePct >= 25) return 'team'
  if (posture === 'incumbent' || sharePct >= 12) return 'displace'
  if (inBrain) return 'ghost'
  return 'monitor'
}

export const STRATEGY_META: Record<CompeteStrategy, { label: string; tone: string }> = {
  displace: { label: 'Displace', tone: 'text-neon-magenta' },
  team: { label: 'Team', tone: 'text-neon-cyan' },
  ghost: { label: 'Ghost', tone: 'text-neon-lime' },
  monitor: { label: 'Monitor', tone: 'text-text-500' },
}

export type TeamingCandidateType = 'adjacent_prime' | 'subcontractor'
export type TeamingFit = 'strong' | 'promising' | 'research'

export type TeamingSignalSource = 'bulk' | 'subaward' | 'flow_fallback'

export interface TeamingCandidate {
  recipient: string
  candidateType: TeamingCandidateType
  sharedAgencies: number
  sharedMillions: number
  totalActions: number
  sampleAgency?: string
  marketSharePct?: number
  marketMillions?: number
  underPrime?: string
  fit: TeamingFit
  fitReason: string
  /** True when market share is tiny — likely adjacent, not a head-to-head competitor */
  niche?: boolean
  signalSource?: TeamingSignalSource
}

export interface TeamingSearchResult {
  candidates: TeamingCandidate[]
  subcontractors: TeamingCandidate[]
  meta: {
    excluded_top_primes?: number
    subaward_data?: boolean
    research_recommended?: boolean
    strong_count?: number
    note?: string
    capability_gap?: string
  }
}

export function getSetAsideTeamingHint(
  setAsideRows: readonly { set_aside?: string; millions?: number }[],
): { smallBizPct: number; hint: string } {
  const total = setAsideRows.reduce((s, r) => s + (r.millions || 0), 0) || 1
  const sb = setAsideRows
    .filter((r) => {
      const label = (r.set_aside || '').toUpperCase()
      return label.includes('SMALL') || label.includes('8(A)') || label.includes('SDVOSB') || label.includes('HUBZONE')
    })
    .reduce((s, r) => s + (r.millions || 0), 0)
  const smallBizPct = Math.round((sb / total) * 100)
  const hint = smallBizPct >= 35
    ? 'High set-aside share — teaming with certified small businesses is a strong displacement lever.'
    : smallBizPct >= 15
      ? 'Mixed set-aside market — evaluate both prime and teammate paths.'
      : 'Full-and-open weighted — teaming for capability gap or past performance may matter more than set-aside status.'
  return { smallBizPct, hint }
}

function mapRawTeamingRow(
  r: Record<string, unknown>,
  signalSource: TeamingSignalSource = 'bulk',
): TeamingCandidate {
  const marketSharePct = r.market_share_pct != null ? Number(r.market_share_pct) : undefined
  const candidateType = (r.candidate_type as TeamingCandidateType) || 'adjacent_prime'
  return {
    recipient: String(r.recipient || 'Unknown'),
    candidateType,
    sharedAgencies: Number(r.shared_agencies) || 0,
    sharedMillions: Number(r.shared_millions) || 0,
    totalActions: Number(r.total_actions) || 0,
    sampleAgency: r.sample_agency ? String(r.sample_agency) : undefined,
    marketSharePct,
    marketMillions: r.market_millions != null ? Number(r.market_millions) : undefined,
    underPrime: r.under_prime ? String(r.under_prime) : undefined,
    fit: (r.fit as TeamingFit) || 'research',
    fitReason: String(r.fit_reason || 'Validate via research workflow'),
    niche: candidateType === 'subcontractor' || (marketSharePct != null && marketSharePct <= 3),
    signalSource,
  }
}

export function parseTeamingApiResponse(data: unknown): TeamingSearchResult {
  if (Array.isArray(data)) {
    return {
      candidates: data.map((r) => mapRawTeamingRow(r as Record<string, unknown>)),
      subcontractors: [],
      meta: { research_recommended: true },
    }
  }
  if (!data || typeof data !== 'object') {
    return { candidates: [], subcontractors: [], meta: {} }
  }
  const d = data as Record<string, unknown>
  return {
    candidates: (Array.isArray(d.candidates) ? d.candidates : []).map((r) =>
      mapRawTeamingRow(r as Record<string, unknown>, 'bulk'),
    ),
    subcontractors: (Array.isArray(d.subcontractors) ? d.subcontractors : []).map((r) =>
      mapRawTeamingRow(r as Record<string, unknown>, 'subaward'),
    ),
    meta: (d.meta as TeamingSearchResult['meta']) || {},
  }
}

const FIT_SORT: Record<TeamingFit, number> = { strong: 0, promising: 1, research: 2 }

/** Drop top competitors and merge subs ahead of adjacent bulk overlap. */
export function enrichTeamingCandidates(
  raw: unknown,
  topRecipientNames: readonly string[],
): TeamingCandidate[] {
  const parsed = parseTeamingApiResponse(raw)
  const exclude = new Set(topRecipientNames.slice(0, 10).filter(Boolean))
  const seen = new Set<string>()
  const merged: TeamingCandidate[] = []

  for (const row of [...parsed.subcontractors, ...parsed.candidates]) {
    if (!row.recipient || exclude.has(row.recipient) || seen.has(row.recipient)) continue
    seen.add(row.recipient)
    merged.push(row)
  }

  return merged.sort((a, b) => {
    const fitDelta = (FIT_SORT[a.fit] ?? 9) - (FIT_SORT[b.fit] ?? 9)
    if (fitDelta !== 0) return fitDelta
    if (a.candidateType !== b.candidateType) {
      return a.candidateType === 'subcontractor' ? -1 : 1
    }
    return (b.sharedAgencies - a.sharedAgencies) || (a.marketSharePct ?? 999) - (b.marketSharePct ?? 999)
  })
}

export interface TeamingResearchStub {
  id: string
  label: string
  note: string
  prompt: (ctx: {
    target: string
    naics: string
    gap: string
    smallBizPct: number
  }) => string
}

export const TEAMING_MCP_STUBS = [
  { label: 'Subcontractor history', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Set-aside / entity search', mcp: 'SAM.gov', status: 'Ready' as const },
  { label: 'Adjacent NAICS awards', mcp: 'USASpending.gov', status: 'Catalog' as const },
  { label: 'Office-level PP overlap', mcp: 'USASpending.gov', status: 'Catalog' as const },
]

export const TEAMING_MARKETING_STUBS: TeamingResearchStub[] = [
  {
    id: 'capability-gap',
    label: 'Capability gap map',
    note: 'What we lack vs incumbent — who fills it',
    prompt: ({ target, naics, gap }) =>
      `Capability gap teaming search: we need teammates to displace ${target} in NAICS ${naics}. Our gap: ${gap || '(define gap)'}. Find adjacent vendors/subs (NOT top market primes) who fill this gap. Use USASpending + SAM.gov MCPs and web research. Return 5–8 names with rationale and team vs ghost recommendation.`,
  },
  {
    id: 'sub-hunter',
    label: 'Sub / niche hunter',
    note: 'FFATA subs and regional specialists',
    prompt: ({ target, naics }) =>
      `Find subcontractors and niche specialists who have worked under or alongside ${target} in NAICS ${naics}. Exclude top-10 market primes. Use USASpending subaward data + SAM entity search + web. Rank gap-fill potential.`,
  },
  {
    id: 'set-aside-partners',
    label: 'Set-aside partners',
    note: 'Certified SBs for displacement lever',
    prompt: ({ target, naics, smallBizPct }) =>
      `Set-aside teaming scan for NAICS ${naics} to help displace ${target}. Market is ${smallBizPct}% small-business weighted. Find certified small businesses with past performance at shared buyers — not headline competitors. Cite SAM + award sources.`,
  },
  {
    id: 'competitor-profiling',
    label: 'Partner vetting',
    note: 'Strengths, vehicles, risk flags',
    prompt: ({ target, naics, gap }) =>
      `Vet potential teammates (not ${target}) for a displacement play in NAICS ${naics}. Gap to fill: ${gap || 'TBD'}. For each candidate assess vehicles, PP at target buyers, conflicts, and ghost risk.`,
  },
]

export function buildTeamingDeepSearchPrompt(ctx: {
  target: string
  naics: string
  gap: string
  smallBizPct: number
  metaNote?: string
}): string {
  return [
    `Teaming / gap-fill finder (NOT top competitors): displace ${ctx.target} in NAICS ${ctx.naics}.`,
    ctx.gap ? `Capability gap: ${ctx.gap}.` : 'Define our capability gap first.',
    `Set-aside context: ${ctx.smallBizPct}% small-business weighted in slice.`,
    'Use USASpending.gov MCP (awards, subs, office overlap) + SAM.gov MCP (entity, set-aside).',
    'Supplement with web/marketing research for adjacent vendors and subs the bulk data misses.',
    'Return: name, type (adjacent prime / sub), fit (strong/promising/research), why, shared buyers, conflicts, team vs ghost.',
    ctx.metaNote ? `Bulk signal note: ${ctx.metaNote}` : '',
    'Cite sources for Knowledge Vault.',
  ].filter(Boolean).join(' ')
}

/** Client fallback — excludes top primes from flow slice. */
export function buildTeamingCandidatesFromFlows(
  targetRecipient: string,
  flows: readonly {
    recipient?: string
    agency?: string
    millions?: number
    actions?: number
  }[],
  topRecipientNames: readonly string[],
  limit = 12,
): TeamingSearchResult {
  const target = targetRecipient || ''
  const excludeSet = new Set([...topRecipientNames.slice(0, 10), target])
  const targetAgencies = new Set(
    flows.filter((f) => f.recipient === target).map((f) => f.agency || '(Unspecified)'),
  )
  if (!targetAgencies.size) {
    return { candidates: [], subcontractors: [], meta: { research_recommended: true } }
  }

  const byRecipient = new Map<string, { agencies: Set<string>; millions: number; actions: number }>()
  flows.forEach((f) => {
    const rec = f.recipient || ''
    const ag = f.agency || '(Unspecified)'
    if (!rec || excludeSet.has(rec) || !targetAgencies.has(ag)) return
    if (!byRecipient.has(rec)) byRecipient.set(rec, { agencies: new Set(), millions: 0, actions: 0 })
    const entry = byRecipient.get(rec)!
    entry.agencies.add(ag)
    entry.millions += f.millions || 0
    entry.actions += f.actions || 0
  })

  const candidates = [...byRecipient.entries()]
    .map(([recipient, entry]) => {
      const sharedAgencies = entry.agencies.size
      const sharedMillions = Math.round(entry.millions * 100) / 100
      const fit: TeamingFit =
        sharedAgencies >= 3 && sharedMillions <= 10
          ? 'strong'
          : sharedAgencies >= 2 && sharedMillions <= 15
            ? 'promising'
            : 'research'
      return {
        recipient,
        candidateType: 'adjacent_prime' as const,
        sharedAgencies,
        sharedMillions,
        totalActions: entry.actions,
        sampleAgency: [...entry.agencies][0],
        fit,
        fitReason: fit === 'strong'
          ? 'Multi-buyer flow overlap — likely adjacent, validate gap'
          : fit === 'promising'
            ? 'Small flow-slice overlap — confirm gap fill via MCP research'
            : 'Flow slice only — run full teaming research',
        niche: true,
        signalSource: 'flow_fallback' as const,
      }
    })
    .sort((a, b) => b.sharedAgencies - a.sharedAgencies || a.sharedMillions - b.sharedMillions)
    .slice(0, limit)

  return {
    candidates,
    subcontractors: [],
    meta: {
      research_recommended: candidates.filter((c) => c.fit === 'strong').length < 2,
      excluded_top_primes: excludeSet.size,
      subaward_data: false,
    },
  }
}

export const TEAMING_FIT_META: Record<TeamingFit, { label: string; tone: string }> = {
  strong: { label: 'Strong gap-fill', tone: 'text-neon-lime' },
  promising: { label: 'Promising', tone: 'text-neon-amber' },
  research: { label: 'Needs research', tone: 'text-text-500' },
}

export const TEAMING_TYPE_META: Record<TeamingCandidateType, { label: string }> = {
  adjacent_prime: { label: 'Adjacent vendor' },
  subcontractor: { label: 'Sub / FFATA' },
}

export interface CompetitorIntelRow {
  recipient: string
  actions?: number
  millions?: number
  flow?: RecipientFlowSummary
  sharePct: number
  recomp: { count: number; millions: number }
  inBrain: boolean
  posture: CompetitorPosture
  strategy: CompeteStrategy
}

/** Match expiring row to a known top recipient (prefix overlap). */
export function recipientMatchesExpiring(recipientName: string, expiringRecipient: string): boolean {
  const a = (recipientName || '').toLowerCase().slice(0, 18)
  const b = (expiringRecipient || '').toLowerCase().slice(0, 18)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}