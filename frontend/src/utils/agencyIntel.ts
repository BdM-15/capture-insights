/** Agency capture intel helpers — Data Insights quadrants + Shipley-style qualification signals */

export type AgencyQuadrant = 'hot' | 'high_value' | 'high_volume' | 'watch'

export interface AgencyMedians {
  actions: number
  oblig: number
}

export function getAgencyQuadrant(
  awardCount: number,
  totalOblig: number,
  medians: AgencyMedians,
): AgencyQuadrant {
  const highActions = awardCount > medians.actions
  const highOblig = totalOblig > medians.oblig
  if (highActions && highOblig) return 'hot'
  if (highOblig) return 'high_value'
  if (highActions) return 'high_volume'
  return 'watch'
}

export const QUADRANT_META: Record<
  AgencyQuadrant,
  { label: string; short: string; tone: string; shipleyHint: string }
> = {
  hot: {
    label: 'Hot — above both medians',
    short: 'Hot',
    tone: 'text-neon-magenta',
    shipleyHint: 'Prime BD target: early customer interface, shape requirements, build favored position pre-RFP.',
  },
  high_value: {
    label: 'High $ — fewer but larger awards',
    short: 'High $',
    tone: 'text-neon-cyan',
    shipleyHint: 'Strategic account — qualify on customer assessment + competitive intel before heavy invest.',
  },
  high_volume: {
    label: 'High volume — many actions',
    short: 'High vol',
    tone: 'text-neon-lime',
    shipleyHint: 'Volume game — confirm delivery capability and vehicle access; team if needed.',
  },
  watch: {
    label: 'Below medians — monitor',
    short: 'Watch',
    tone: 'text-text-500',
    shipleyHint: 'Defer deep capture until data or relationship signal improves.',
  },
}

export type QualGate = 'advance' | 'monitor' | 'defer'

export function getQualGate(signals: {
  isHot: boolean
  inBrain: boolean
  recompeteCount: number
  sharePct: number
}): QualGate {
  if (signals.isHot && signals.recompeteCount > 0) return 'advance'
  if (signals.isHot || signals.inBrain || signals.recompeteCount > 0) return 'monitor'
  if (signals.sharePct >= 8) return 'monitor'
  return 'defer'
}

export const QUAL_GATE_META: Record<QualGate, { label: string; tone: string }> = {
  advance: { label: 'Advance', tone: 'text-neon-magenta' },
  monitor: { label: 'Monitor', tone: 'text-neon-amber' },
  defer: { label: 'Defer', tone: 'text-text-500' },
}

/** Shipley: unknown → known → favored. Data-backed proxy from vault + engagement signals. */
export type CustomerPosition = 'unknown' | 'known' | 'active'

export function getCustomerPosition(inBrain: boolean, recompeteCount: number, isHot: boolean): CustomerPosition {
  if (inBrain && (recompeteCount > 0 || isHot)) return 'active'
  if (inBrain) return 'known'
  return 'unknown'
}

export const CUSTOMER_POSITION_META: Record<CustomerPosition, { label: string; shipley: string }> = {
  unknown: {
    label: 'Unknown',
    shipley: 'Research market, open customer interface, listen for needs & timing (Shipley Customer Interface).',
  },
  known: {
    label: 'Known',
    shipley: 'In vault — validate requirements, influence evaluation criteria, qualify early & often.',
  },
  active: {
    label: 'Active pursuit',
    shipley: 'Hot + timing signal — run decision gate: advance, defer, or redirect resources.',
  },
}

export interface AgencyFlowSummary {
  topRecipient: string
  topMillions: number
  flowCount: number
  totalMillions: number
}

export function summarizeAgencyFlows(
  flows: readonly { agency?: string; recipient?: string; millions?: number }[],
): Map<string, AgencyFlowSummary> {
  const map = new Map<string, { recipients: Map<string, number>; total: number }>()
  flows.forEach((f) => {
    const agency = f.agency || '(Unspecified)'
    if (!map.has(agency)) map.set(agency, { recipients: new Map(), total: 0 })
    const entry = map.get(agency)!
    const rec = f.recipient || 'Unknown'
    const m = f.millions || 0
    entry.recipients.set(rec, (entry.recipients.get(rec) || 0) + m)
    entry.total += m
  })
  const out = new Map<string, AgencyFlowSummary>()
  map.forEach((entry, agency) => {
    let topRecipient = '—'
    let topMillions = 0
    entry.recipients.forEach((m, r) => {
      if (m > topMillions) {
        topMillions = m
        topRecipient = r
      }
    })
    out.set(agency, {
      topRecipient,
      topMillions,
      flowCount: entry.recipients.size,
      totalMillions: entry.total,
    })
  })
  return out
}

export interface RelationshipRow {
  agency: string
  recipient: string
  actions: number
  millions?: number
}

export interface RelationshipHeatmapModel {
  agencies: string[]
  recipients: string[]
  cells: Map<string, RelationshipRow>
  maxActions: number
}

export function buildRelationshipHeatmap(
  relationships: readonly RelationshipRow[],
  maxAgencies = 8,
  maxRecipients = 8,
): RelationshipHeatmapModel {
  const agencyTotals = new Map<string, number>()
  const recipientTotals = new Map<string, number>()
  relationships.forEach((r) => {
    agencyTotals.set(r.agency, (agencyTotals.get(r.agency) || 0) + (r.actions || 0))
    recipientTotals.set(r.recipient, (recipientTotals.get(r.recipient) || 0) + (r.actions || 0))
  })

  const agencies = [...agencyTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxAgencies)
    .map(([name]) => name)
  const recipients = [...recipientTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxRecipients)
    .map(([name]) => name)

  const agencySet = new Set(agencies)
  const recipientSet = new Set(recipients)
  const cells = new Map<string, RelationshipRow>()
  let maxActions = 0

  relationships.forEach((r) => {
    if (!agencySet.has(r.agency) || !recipientSet.has(r.recipient)) return
    const key = `${r.agency}|${r.recipient}`
    cells.set(key, r)
    if (r.actions > maxActions) maxActions = r.actions
  })

  return { agencies, recipients, cells, maxActions: maxActions || 1 }
}

/** 0–1 strength for heatmap cell fill from award count. */
export function relationshipStrength(actions: number, maxActions: number): number {
  if (!actions || !maxActions) return 0
  return Math.min(1, actions / maxActions)
}