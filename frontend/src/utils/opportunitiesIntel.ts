/** Future Opportunities intel — scored recompetes + SAM seeds + proactive hits */

import {
  buildClientComboInsights,
  COMBO_SIGNAL_META,
  COMBO_TIER_META,
  type ComboMatch,
  type ComboTier,
} from './comboIntel'

export type { ComboTier, ComboMatch }

export interface SamBudgetStatus {
  date: string
  used: number
  limit: number
  remaining: number
  pct_used: number
}

export interface LiveSamHit {
  title: string
  noticeType?: string
  responseDeadLine?: string
  agency?: string
  link?: string
  description?: string
  _source?: string
}

export interface OpportunityRow extends ComboMatch {
  in_brain?: boolean
  has_monitor?: boolean
  pursuit_slug?: string
  pursuit_brief_path?: string
  suggested_sam_keywords?: string
  suggested_notice_types?: string
  tier_label?: string
  live_sam_hits?: LiveSamHit[]
  live_sam_source?: string
}

export interface OpportunitiesIntelData {
  meta: {
    months_ahead?: number
    naics?: string
    scoring_note?: string
    proactive_sam?: {
      enabled: boolean
      reason?: string
      rows_targeted?: number
    }
  }
  readiness: {
    sam_budget?: SamBudgetStatus
  }
  summary: {
    row_count?: number
    hot_agency_count?: number
    brain_overlap?: number
    no_monitor_hot?: number
    prime_millions?: number
    expiring_24m?: number
    future_funding_24m_m?: number
    sam_monitors_in_pipeline?: number
  }
  tier_counts: Partial<Record<ComboTier, number>>
  rows: OpportunityRow[]
}

export interface WorkstationReadiness {
  status: 'ready' | 'degraded' | string
  duckdb_ready?: boolean
  ollama_ready?: boolean
  sam_api_configured?: boolean
  mcp_enabled?: boolean
  mcp_tools_count?: number
  sam_budget?: SamBudgetStatus
  checks?: Record<string, boolean>
}

export function parseOpportunitiesIntel(data: unknown): OpportunitiesIntelData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    meta: (d.meta as OpportunitiesIntelData['meta']) || {},
    readiness: (d.readiness as OpportunitiesIntelData['readiness']) || {},
    summary: (d.summary as OpportunitiesIntelData['summary']) || {},
    tier_counts: (d.tier_counts as OpportunitiesIntelData['tier_counts']) || {},
    rows: Array.isArray(d.rows) ? (d.rows as OpportunityRow[]) : [],
  }
}

/** Client fallback when /data/opportunities-intel unavailable */
export function buildClientOpportunitiesIntel(args: {
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
  pipeline?: Array<{ type?: string; citation?: string; keywords?: string }>
  brainNames?: string[]
}): OpportunitiesIntelData {
  const combo = buildClientComboInsights({
    expiring: args.expiring,
    intensity: args.intensity,
    topRecipients: args.topRecipients,
    anchorStates: args.anchorStates,
  })
  const monitorKeys = new Set<string>()
  for (const p of args.pipeline || []) {
    if (p.type !== 'sam-monitor') continue
    const citation = String(p.citation || '')
    if (citation.includes('trigger:')) {
      monitorKeys.add(citation.split('trigger:', 1)[1].split('•', 1)[0].trim())
    }
    if (p.keywords) monitorKeys.add(String(p.keywords).toLowerCase())
  }
  const brainSet = new Set((args.brainNames || []).map((b) => b.toLowerCase().slice(0, 18)))

  const rows: OpportunityRow[] = (combo.matches || []).map((m) => {
    const recipient = (m.recipient || '').toLowerCase().slice(0, 18)
    const agency = (m.agency || '').toLowerCase().slice(0, 18)
    const inBrain = [...brainSet].some(
      (bn) => bn && (recipient.includes(bn) || agency.includes(bn) || bn.includes(recipient) || bn.includes(agency)),
    )
    const awardKey = String(m.award_key || '')
    const kwSeed = [m.agency, m.recipient].filter(Boolean).join(' ').slice(0, 48)
    const hasMonitor = monitorKeys.has(awardKey) || monitorKeys.has(kwSeed.toLowerCase())
    return {
      ...m,
      in_brain: inBrain,
      has_monitor: hasMonitor,
      display_score: (m.combo_score || 0) + (inBrain ? 10 : 0),
      tier_label: COMBO_TIER_META[m.combo_tier]?.label || m.combo_tier,
      suggested_sam_keywords: kwSeed || 'NAICS 561210',
    }
  })

  rows.sort(
    (a, b) =>
      (b.display_score || 0) - (a.display_score || 0) ||
      (a.months_to_end || 99) - (b.months_to_end || 99) ||
      (b.obligation || 0) - (a.obligation || 0),
  )

  const hotCount = rows.filter((r) => r.signals?.includes('hot_agency')).length
  const brainOverlap = rows.filter((r) => r.in_brain).length
  const noMonitorHot = rows.filter(
    (r) => r.signals?.includes('hot_agency') && !r.has_monitor,
  ).length

  return {
    meta: {
      scoring_note:
        'Client-side fallback (restart backend for full /data/opportunities-intel with SAM budget + proactive hits).',
      proactive_sam: { enabled: false, reason: 'fallback' },
    },
    readiness: {},
    summary: {
      row_count: rows.length,
      hot_agency_count: hotCount,
      brain_overlap: brainOverlap,
      no_monitor_hot: noMonitorHot,
      prime_millions: rows
        .filter((r) => r.combo_tier === 'prime')
        .reduce((s, r) => s + (r.obligation_millions || 0), 0),
      sam_monitors_in_pipeline: (args.pipeline || []).filter((p) => p.type === 'sam-monitor').length,
    },
    tier_counts: combo.tier_counts || {},
    rows,
  }
}

export function signalChips(signals: string[] | undefined) {
  return (signals || []).map((sig) => {
    const meta = COMBO_SIGNAL_META[sig as keyof typeof COMBO_SIGNAL_META]
    return meta ? { key: sig, label: meta.short, tone: meta.tone } : { key: sig, label: sig, tone: 'text-text-500' }
  })
}