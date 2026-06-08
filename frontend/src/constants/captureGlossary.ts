/** Layman tips + vault paths for capture-insights labels and signals */

export type GlossaryId =
  | 'non_fixed_pricing'
  | 'dominant_flex_pricing'
  | 'pressure_tier'
  | 'agency_shape_gate'
  | 'shape_gate'
  | 'ffp_shaping_radar'
  | 'firm_fixed_pricing'
  | 'idiq_task_order'
  | 'access_lens'
  | 'vehicle_holder'
  | 'buying_posture'
  | 'top3_vehicle_share'
  | 'gap_fill_teaming'
  | 'teaming_fit'
  | 'shared_buyers'
  | 'strategy_lens'
  | 'competitor_posture'
  | 'market_concentration'
  | 'hot_agency'
  | 'qual_gate'
  | 'customer_position'
  | 'relationship_heatmap'
  | 'capture_intensity'
  | 'recompete_radar'
  | 'suitability_stub'
  | 'synergy_stub'
  | 'set_aside_mix'
  | 'extent_competed'
  | 'pricing_bucket'
  | 'place_of_performance'
  | 'geo_concentration'
  | 'state_quadrant'
  | 'pursuit_lens'
  | 'combo_tier'
  | 'combo_signal'

export interface GlossaryEntry {
  label: string
  tip: string
  vaultPath: string
  vaultAnchor?: string
  vaultTitle?: string
}

export const GLOSSARY_VAULT_PATH = 'global/global_wiki/capture/capture-insights-glossary.md'

export const CAPTURE_GLOSSARY: Record<GlossaryId, GlossaryEntry> = {
  non_fixed_pricing: {
    label: 'Non-fixed pricing',
    tip: 'Contract dollars not locked to a fixed total price — includes time-and-materials (pay by hour/materials), cost-reimbursement (government pays actual costs plus fee), and similar flexible structures. High share means pricing risk and structure may change on recompetes.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'non-fixed-pricing',
  },
  dominant_flex_pricing: {
    label: 'Dominant flexible type',
    tip: 'The single most-used flexible (non-firm-fixed) pricing label at this agency in your data slice — e.g. Time & Materials or Cost Plus Fixed Fee. Tells you what kind of contract language to expect when shaping toward firm-fixed.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'dominant-flexible-type',
  },
  pressure_tier: {
    label: 'Pressure tier',
    tip: 'How much of an agency’s spend is still on flexible pricing. High = buyer may face policy or oversight pressure to shift toward firm-fixed or performance-based deals. Use to prioritize shaping conversations, not as a guarantee.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'pressure-tier',
  },
  agency_shape_gate: {
    label: 'Shape gate',
    tip: 'Advance = high flexible-pricing share plus expiring non-fixed work — worth early customer shaping. Monitor = some signal, track RFIs and recompete timing. Defer = low signal in current data; don’t over-invest yet.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'agency-shape-gate',
  },
  shape_gate: {
    label: 'Shape gate',
    tip: 'Shape now = flexible-priced contract ending soon at a buyer under pricing pressure — open a pre-RFP window to influence requirements and contract type. Monitor = watch. Watch = weaker signal in this slice.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'shape-target-gate',
  },
  ffp_shaping_radar: {
    label: 'FFP shaping radar',
    tip: 'Finds agencies and expiring contracts where flexible pricing dominates — places you may influence a shift to firm-fixed or performance-based terms before the RFP drops. Pairs policy context with your USASpending slice.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'ffp-shaping-radar',
  },
  firm_fixed_pricing: {
    label: 'Firm fixed pricing',
    tip: 'You propose one total price; you absorb overrun risk if work costs more than bid. Government favors this when requirements are clear. Common on mature services and productized work.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'firm-fixed-pricing',
  },
  idiq_task_order: {
    label: 'IDIQ / task order share',
    tip: 'Percent of spend awarded as orders against existing IDIQ/GWAC/BPA vehicles instead of new standalone contracts. High share means schedule access and incumbent holders matter as much as head-to-head bids.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'idiq-task-orders',
  },
  access_lens: {
    label: 'Access lens',
    tip: 'Suggested capture path for this pricing+vehicle combo: prime on an existing vehicle, team through a holder who has schedule position, or pursue standalone competitions. Not a decision — a starting hypothesis.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'access-lens',
  },
  vehicle_holder: {
    label: 'Vehicle holder',
    tip: 'Prime that receives the most dollars on a given contract vehicle (IDIQ, BPA, etc.). Teaming target if you lack schedule position; competitive intel if you plan to displace.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'vehicle-holders',
  },
  buying_posture: {
    label: 'Buying posture',
    tip: 'Whether this market buys mainly through task orders on existing vehicles, standalone contracts, or a mix. Drives whether you invest in schedule access, open competition, or both.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'buying-posture',
  },
  top3_vehicle_share: {
    label: 'Top 3 vehicle share',
    tip: 'Percent of market dollars flowing through the three largest contract vehicles. High concentration = a few schedules or contract types gate most work.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'vehicle-concentration',
  },
  gap_fill_teaming: {
    label: 'Gap-fill teaming',
    tip: 'Partners who bring a capability you lack to help win against an incumbent — usually adjacent vendors or subs, not the market’s top primes. Bulk overlap is a weak signal; research confirms fit.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'gap-fill-teaming',
  },
  teaming_fit: {
    label: 'Teaming fit',
    tip: 'Strong = small vendor with credible past performance at shared buyers. Promising = worth vetting. Needs research = thin data — run MCP and web research before outreach.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'teaming-fit',
  },
  shared_buyers: {
    label: 'Shared buyers',
    tip: 'Count of agencies where both you (or a candidate) and the displacement target have won work. Proxy for customer familiarity — not proof they will team with you.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'shared-buyers',
  },
  strategy_lens: {
    label: 'Strategy lens',
    tip: 'Displace = head-to-head against incumbent. Team = partner with or through them. Ghost = compete without naming them. Monitor = track only. Based on share and vault context.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'strategy-lens',
  },
  competitor_posture: {
    label: 'Competitor posture',
    tip: 'Dominant = large share. Incumbent = holds expiring work. Multi-agency = broad footprint. Niche = smaller specialist. Informs brief depth and teaming vs displacement.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'competitor-posture',
  },
  market_concentration: {
    label: 'Market concentration',
    tip: 'Share of obligations held by the top 3 primes. High = few winners control the market; relationship and vehicle strategy critical.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'market-concentration',
  },
  hot_agency: {
    label: 'Hot agency',
    tip: 'Agency above median on both award count and dollars in your NAICS slice — active and valuable. Original Data Insights “above the line” quadrant.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'hot-agency',
  },
  qual_gate: {
    label: 'Qual gate',
    tip: 'Shipley-style qualify signal: Advance = pursue actively. Monitor = watch and light touch. Defer = don’t spend capture resources yet. Data-backed proxy, not a formal gate review.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'qual-gate',
  },
  customer_position: {
    label: 'Customer position',
    tip: 'Unknown = no vault relationship. Known = in brain/wiki. Active pursuit = hot agency or recompete timing plus vault entry. Tracks Shipley unknown → favored journey.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'customer-position',
  },
  relationship_heatmap: {
    label: 'Relationship heatmap',
    tip: 'Darker cells = more awards between a buyer and prime. Shows entrenched relationships — team around, displace, or price-to-win with eyes open.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'relationship-heatmap',
  },
  capture_intensity: {
    label: 'Capture intensity',
    tip: 'Scatter of agencies by award volume (actions) vs total dollars. Median lines split hot / high-value / high-volume / watch quadrants.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'capture-intensity',
  },
  recompete_radar: {
    label: 'Recompete radar',
    tip: 'Contracts whose performance period ends soon — earliest signal to shape requirements, build relationships, and position before the follow-on competition.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'recompete-radar',
  },
  suitability_stub: {
    label: 'Suitability',
    tip: 'Vision metric: future % of expiring work matching your business unit capabilities from vault + requirements research. Stub until capability profile is loaded.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'suitability-synergy',
  },
  synergy_stub: {
    label: 'Synergy',
    tip: 'Vision metric: future % of opportunities where another business unit’s strengths create a teaming play. Stub until multi-BU capability map is in vault.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'suitability-synergy',
  },
  set_aside_mix: {
    label: 'Set-aside mix',
    tip: 'How dollars break out by small-business and other set-aside categories. High SB share = teaming with certified partners may be required or advantageous.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'set-aside-mix',
  },
  extent_competed: {
    label: 'Extent competed',
    tip: 'Whether work was full-and-open, set-aside, sole source, etc. Informs competition level and who can bid.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'extent-competed',
  },
  pricing_bucket: {
    label: 'Pricing type',
    tip: 'USASpending contract pricing category rolled up for analysis: firm fixed, performance-based (incentive fees), T&M, cost-type, or other.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'pricing-buckets',
  },
  place_of_performance: {
    label: 'Place of performance',
    tip: 'Where contract work is delivered (USASpending primary PoP state). Drives staffing, travel, cleared facilities, and regional teaming — not the same as where the prime’s corporate HQ sits.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'place-of-performance',
  },
  geo_concentration: {
    label: 'Regional concentration',
    tip: 'Share of obligated dollars in the top 3 delivery states. High concentration means a few geographies gate most work — anchor footprint or partner there.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'geo-concentration',
  },
  state_quadrant: {
    label: 'State quadrant',
    tip: 'Hot = above median on both award count and dollars in this slice. High $ = larger awards. High vol = many actions. Watch = below both medians.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'state-quadrant',
  },
  pursuit_lens: {
    label: 'Pursuit lens',
    tip: 'Anchor = must-have regional position. Target = worth deliberate BD. Niche = surgical/expiring-driven. Monitor = track only. Hypothesis from PoP data, not a gate decision.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'pursuit-lens',
  },
  combo_tier: {
    label: 'Combo tier',
    tip: 'Stacked intersection score from expiring work + hot buyer + top incumbent + anchor PoP + timing + pricing. Prime = pursue now. Advance = active capture. Monitor = watch. Track = radar only.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'combo-tier',
  },
  combo_signal: {
    label: 'Combo signal',
    tip: 'Individual intersection that contributed to the combo score — e.g. hot agency, top incumbent, near-term end, anchor place of performance. More signals = higher confidence to invest capture resources.',
    vaultPath: GLOSSARY_VAULT_PATH,
    vaultAnchor: 'combo-signals',
  },
}

export function getGlossaryTip(id: GlossaryId): string {
  return CAPTURE_GLOSSARY[id]?.tip ?? ''
}