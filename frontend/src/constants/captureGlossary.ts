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
  | 'market_tam'
  | 'market_momentum'
  | 'future_funding'
  | 'follow_the_money'
  | 'sam_live_discovery'
  | 'hot_agency_recompete'
  | 'match_lens'
  | 'incumbent_holder'
  | 'priority_score'
  | 'your_tracking_status'
  | 'sam_search_saved'

export interface GlossaryEntry {
  label: string
  tip: string
  vaultPath: string
  vaultAnchor?: string
  vaultTitle?: string
}

/** Karpathy-style atomic concept pages (one term = one .md). */
export const CONCEPT_VAULT_DIR = 'global/global_wiki/capture/concepts'

export const CAPTURE_CONCEPTS_INDEX = 'global/global_wiki/capture/capture-insights-index.md'

/** @deprecated Monolithic glossary — use atomic concepts + index. */
export const GLOSSARY_VAULT_PATH = CAPTURE_CONCEPTS_INDEX

export function conceptVaultPath(slug: string): string {
  return `${CONCEPT_VAULT_DIR}/${slug}.md`
}

export const CAPTURE_GLOSSARY: Record<GlossaryId, GlossaryEntry> = {
  non_fixed_pricing: {
    label: 'Non-fixed pricing',
    tip: 'Contract dollars not locked to a fixed total price — includes time-and-materials (pay by hour/materials), cost-reimbursement (government pays actual costs plus fee), and similar flexible structures. High share means pricing risk and structure may change on recompetes.',
    vaultPath: conceptVaultPath('non-fixed-pricing'),
    vaultAnchor: 'non-fixed-pricing',
  },
  dominant_flex_pricing: {
    label: 'Dominant flexible type',
    tip: 'The single most-used flexible (non-firm-fixed) pricing label at this agency in your data slice — e.g. Time & Materials or Cost Plus Fixed Fee. Tells you what kind of contract language to expect when shaping toward firm-fixed.',
    vaultPath: conceptVaultPath('dominant-flexible-type'),
    vaultAnchor: 'dominant-flexible-type',
  },
  pressure_tier: {
    label: 'Pressure tier',
    tip: 'How much of an agency’s spend is still on flexible pricing. High = buyer may face policy or oversight pressure to shift toward firm-fixed or performance-based deals. Use to prioritize shaping conversations, not as a guarantee.',
    vaultPath: conceptVaultPath('pressure-tier'),
    vaultAnchor: 'pressure-tier',
  },
  agency_shape_gate: {
    label: 'Shape gate',
    tip: 'Advance = high flexible-pricing share plus expiring non-fixed work — worth early customer shaping. Monitor = some signal, track RFIs and recompete timing. Defer = low signal in current data; don’t over-invest yet.',
    vaultPath: conceptVaultPath('agency-shape-gate'),
    vaultAnchor: 'agency-shape-gate',
  },
  shape_gate: {
    label: 'Shape gate',
    tip: 'Shape now = flexible-priced contract ending soon at a buyer under pricing pressure — open a pre-RFP window to influence requirements and contract type. Monitor = watch. Watch = weaker signal in this slice.',
    vaultPath: conceptVaultPath('shape-target-gate'),
    vaultAnchor: 'shape-target-gate',
  },
  ffp_shaping_radar: {
    label: 'FFP shaping radar',
    tip: 'Finds agencies and expiring contracts where flexible pricing dominates — places you may influence a shift to firm-fixed or performance-based terms before the RFP drops. Pairs policy context with your USASpending slice.',
    vaultPath: conceptVaultPath('ffp-shaping-radar'),
    vaultAnchor: 'ffp-shaping-radar',
  },
  firm_fixed_pricing: {
    label: 'Firm fixed pricing',
    tip: 'You propose one total price; you absorb overrun risk if work costs more than bid. Government favors this when requirements are clear. Common on mature services and productized work.',
    vaultPath: conceptVaultPath('firm-fixed-pricing'),
    vaultAnchor: 'firm-fixed-pricing',
  },
  idiq_task_order: {
    label: 'IDIQ / task order share',
    tip: 'Percent of spend awarded as orders against existing IDIQ/GWAC/BPA vehicles instead of new standalone contracts. High share means schedule access and incumbent holders matter as much as head-to-head bids.',
    vaultPath: conceptVaultPath('idiq-task-orders'),
    vaultAnchor: 'idiq-task-orders',
  },
  access_lens: {
    label: 'Access lens',
    tip: 'Suggested capture path for this pricing+vehicle combo: prime on an existing vehicle, team through a holder who has schedule position, or pursue standalone competitions. Not a decision — a starting hypothesis.',
    vaultPath: conceptVaultPath('access-lens'),
    vaultAnchor: 'access-lens',
  },
  vehicle_holder: {
    label: 'Vehicle holder',
    tip: 'Prime that receives the most dollars on a given contract vehicle (IDIQ, BPA, etc.). Teaming target if you lack schedule position; competitive intel if you plan to displace.',
    vaultPath: conceptVaultPath('vehicle-holders'),
    vaultAnchor: 'vehicle-holders',
  },
  buying_posture: {
    label: 'Buying posture',
    tip: 'Whether this market buys mainly through task orders on existing vehicles, standalone contracts, or a mix. Drives whether you invest in schedule access, open competition, or both.',
    vaultPath: conceptVaultPath('buying-posture'),
    vaultAnchor: 'buying-posture',
  },
  top3_vehicle_share: {
    label: 'Top 3 vehicle share',
    tip: 'Percent of market dollars flowing through the three largest contract vehicles. High concentration = a few schedules or contract types gate most work.',
    vaultPath: conceptVaultPath('vehicle-concentration'),
    vaultAnchor: 'vehicle-concentration',
  },
  gap_fill_teaming: {
    label: 'Gap-fill teaming',
    tip: 'Partners who bring a capability you lack to help win against an incumbent — usually adjacent vendors or subs, not the market’s top primes. Bulk overlap is a weak signal; research confirms fit.',
    vaultPath: conceptVaultPath('gap-fill-teaming'),
    vaultAnchor: 'gap-fill-teaming',
  },
  teaming_fit: {
    label: 'Teaming fit',
    tip: 'Strong = small vendor with credible past performance at shared buyers. Promising = worth vetting. Needs research = thin data — run MCP and web research before outreach.',
    vaultPath: conceptVaultPath('teaming-fit'),
    vaultAnchor: 'teaming-fit',
  },
  shared_buyers: {
    label: 'Shared buyers',
    tip: 'Count of agencies where both you (or a candidate) and the displacement target have won work. Proxy for customer familiarity — not proof they will team with you.',
    vaultPath: conceptVaultPath('shared-buyers'),
    vaultAnchor: 'shared-buyers',
  },
  strategy_lens: {
    label: 'Strategy lens',
    tip: 'Displace = head-to-head against incumbent. Team = partner with or through them. Ghost = compete without naming them. Monitor = track only. Based on share and vault context.',
    vaultPath: conceptVaultPath('strategy-lens'),
    vaultAnchor: 'strategy-lens',
  },
  competitor_posture: {
    label: 'Competitor posture',
    tip: 'Dominant = large share. Incumbent = holds expiring work. Multi-agency = broad footprint. Niche = smaller specialist. Informs brief depth and teaming vs displacement.',
    vaultPath: conceptVaultPath('competitor-posture'),
    vaultAnchor: 'competitor-posture',
  },
  market_concentration: {
    label: 'Market concentration',
    tip: 'Share of obligations held by the top 3 primes. High = few winners control the market; relationship and vehicle strategy critical.',
    vaultPath: conceptVaultPath('market-concentration'),
    vaultAnchor: 'market-concentration',
  },
  hot_agency: {
    label: 'Hot agency',
    tip: 'Agency above median on both award count and dollars in your NAICS slice — active and valuable. Original Data Insights “above the line” quadrant.',
    vaultPath: conceptVaultPath('hot-agency'),
    vaultAnchor: 'hot-agency',
  },
  qual_gate: {
    label: 'Qual gate',
    tip: 'Shipley-style qualify signal: Advance = pursue actively. Monitor = watch and light touch. Defer = don’t spend capture resources yet. Data-backed proxy, not a formal gate review.',
    vaultPath: conceptVaultPath('qual-gate'),
    vaultAnchor: 'qual-gate',
  },
  customer_position: {
    label: 'Customer position',
    tip: 'Unknown = no vault relationship. Known = in brain/wiki. Active pursuit = hot agency or recompete timing plus vault entry. Tracks Shipley unknown → favored journey.',
    vaultPath: conceptVaultPath('customer-position'),
    vaultAnchor: 'customer-position',
  },
  relationship_heatmap: {
    label: 'Relationship heatmap',
    tip: 'Darker cells = more awards between a buyer and prime. Shows entrenched relationships — team around, displace, or price-to-win with eyes open.',
    vaultPath: conceptVaultPath('relationship-heatmap'),
    vaultAnchor: 'relationship-heatmap',
  },
  capture_intensity: {
    label: 'Capture intensity',
    tip: 'Scatter of agencies by award volume (actions) vs total dollars. Median lines split hot / high-value / high-volume / watch quadrants.',
    vaultPath: conceptVaultPath('capture-intensity'),
    vaultAnchor: 'capture-intensity',
  },
  recompete_radar: {
    label: 'Recompete radar',
    tip: 'Contracts whose performance period ends soon — earliest signal to shape requirements, build relationships, and position before the follow-on competition.',
    vaultPath: conceptVaultPath('recompete-radar'),
    vaultAnchor: 'recompete-radar',
  },
  suitability_stub: {
    label: 'Suitability',
    tip: 'Vision metric: future % of expiring work matching your business unit capabilities from vault + requirements research. Stub until capability profile is loaded.',
    vaultPath: conceptVaultPath('suitability'),
    vaultAnchor: 'suitability',
  },
  synergy_stub: {
    label: 'Synergy',
    tip: 'Vision metric: future % of opportunities where another business unit’s strengths create a teaming play. Stub until multi-BU capability map is in vault.',
    vaultPath: conceptVaultPath('synergy'),
    vaultAnchor: 'synergy',
  },
  set_aside_mix: {
    label: 'Set-aside mix',
    tip: 'How dollars break out by small-business and other set-aside categories. High SB share = teaming with certified partners may be required or advantageous.',
    vaultPath: conceptVaultPath('set-aside-mix'),
    vaultAnchor: 'set-aside-mix',
  },
  extent_competed: {
    label: 'Extent competed',
    tip: 'Whether work was full-and-open, set-aside, sole source, etc. Informs competition level and who can bid.',
    vaultPath: conceptVaultPath('extent-competed'),
    vaultAnchor: 'extent-competed',
  },
  pricing_bucket: {
    label: 'Pricing type',
    tip: 'USASpending contract pricing category rolled up for analysis: firm fixed, performance-based (incentive fees), T&M, cost-type, or other.',
    vaultPath: conceptVaultPath('pricing-buckets'),
    vaultAnchor: 'pricing-buckets',
  },
  place_of_performance: {
    label: 'Place of performance',
    tip: 'Where contract work is delivered (USASpending primary PoP state). Drives staffing, travel, cleared facilities, and regional teaming — not the same as where the prime’s corporate HQ sits.',
    vaultPath: conceptVaultPath('place-of-performance'),
    vaultAnchor: 'place-of-performance',
  },
  geo_concentration: {
    label: 'Regional concentration',
    tip: 'Share of obligated dollars in the top 3 delivery states. High concentration means a few geographies gate most work — anchor footprint or partner there.',
    vaultPath: conceptVaultPath('geo-concentration'),
    vaultAnchor: 'geo-concentration',
  },
  state_quadrant: {
    label: 'State quadrant',
    tip: 'Hot = above median on both award count and dollars in this slice. High $ = larger awards. High vol = many actions. Watch = below both medians.',
    vaultPath: conceptVaultPath('state-quadrant'),
    vaultAnchor: 'state-quadrant',
  },
  pursuit_lens: {
    label: 'Pursuit lens',
    tip: 'Anchor = must-have regional position. Target = worth deliberate BD. Niche = surgical/expiring-driven. Monitor = track only. Hypothesis from PoP data, not a gate decision.',
    vaultPath: conceptVaultPath('pursuit-lens'),
    vaultAnchor: 'pursuit-lens',
  },
  combo_tier: {
    label: 'Combo tier',
    tip: 'Stacked intersection score from expiring work + hot buyer + top incumbent + anchor PoP + timing + pricing. Prime = pursue now. Advance = active capture. Monitor = watch. Track = radar only.',
    vaultPath: conceptVaultPath('combo-tier'),
    vaultAnchor: 'combo-tier',
  },
  combo_signal: {
    label: 'Combo signal',
    tip: 'Individual intersection that contributed to the combo score — e.g. hot agency, top incumbent, near-term end, anchor place of performance. More signals = higher confidence to invest capture resources.',
    vaultPath: conceptVaultPath('combo-signals'),
    vaultAnchor: 'combo-signals',
  },
  market_tam: {
    label: 'Total market (TAM)',
    tip: 'Sum of obligated dollars in your NAICS filter — the addressable historical market size for sizing pipeline, executive briefs, and share calculations.',
    vaultPath: conceptVaultPath('market-tam'),
    vaultAnchor: 'market-tam',
  },
  market_momentum: {
    label: 'Market momentum',
    tip: 'Direction of obligated spend year-over-year in your NAICS slice — growing, flat, or declining. Informs whether to expand capture investment or hold steady.',
    vaultPath: conceptVaultPath('market-momentum'),
    vaultAnchor: 'market-momentum',
  },
  future_funding: {
    label: 'Future funding potential',
    tip: 'Obligated dollars on contracts whose performance period ends in the next 24–36 months — the recompete pool you can shape before follow-on competitions.',
    vaultPath: conceptVaultPath('future-funding'),
    vaultAnchor: 'future-funding',
  },
  follow_the_money: {
    label: 'Follow the money',
    tip: 'Recipient → agency → office dollar flows from USASpending. Shows who wins work, which buyers fund it, and which contracting offices execute — tighter focus than agency totals alone.',
    vaultPath: conceptVaultPath('follow-the-money'),
    vaultAnchor: 'follow-the-money',
  },
  sam_live_discovery: {
    label: 'Live SAM discovery',
    tip: 'Search SAM.gov for RFIs, Sources Sought, presolicitations, and open reqs — the live signal on top of USASpending history. Pair with expiring contracts to catch known cycles early.',
    vaultPath: conceptVaultPath('sam-live-discovery'),
    vaultAnchor: 'sam-live-discovery',
  },
  hot_agency_recompete: {
    label: 'Hot-agency recompetes',
    tip: 'Expiring obligated dollars at agencies in the hot quadrant (high volume + high value). Highest-leverage timing: shape before RFP at buyers that already spend heavily in your NAICS.',
    vaultPath: conceptVaultPath('hot-agency-recompete'),
    vaultAnchor: 'hot-agency-recompete',
  },
  match_lens: {
    label: 'Match lens (future)',
    tip: 'Vision pair: suitability (% of expiring work matching your BU capabilities) and synergy (% where another BU enables teaming). Activates when capability profiles live in vault.',
    vaultPath: conceptVaultPath('match-lens'),
    vaultAnchor: 'match-lens',
  },
  incumbent_holder: {
    label: 'Incumbent (current holder)',
    tip: 'The company that currently holds this contract — your most likely competitor on the follow-on, or a teammate if you are subbing today. USASpending recipient name on the expiring award.',
    vaultPath: conceptVaultPath('top-incumbent'),
    vaultAnchor: 'top-incumbent',
  },
  priority_score: {
    label: 'Priority score',
    tip: 'A 0–100+ ranking from stacked signals (hot buyer, top incumbent, timing, value, vault overlap). Higher = more reasons to invest capture time now. Tier (Prime/Advance/Monitor) is the plain-English bucket.',
    vaultPath: conceptVaultPath('combo-tier'),
    vaultAnchor: 'combo-tier',
  },
  your_tracking_status: {
    label: 'Your tracking status',
    tip: 'How this contract relates to your workspace — not a government status. “In vault” = competitor or agency you saved in Knowledge Vault. “SAM search saved” = you stored a SAM.gov keyword search in Pipeline to check for new RFIs and presolicitations. “Not tracked” = no vault entry or saved search yet.',
    vaultPath: conceptVaultPath('sam-live-discovery'),
    vaultAnchor: 'sam-live-discovery',
  },
  sam_search_saved: {
    label: 'SAM search saved',
    tip: 'You saved a SAM.gov search in Pipeline for this contract cycle. It is a bookmarked keyword search (agency + incumbent) so you can revisit SAM.gov for early notices — RFIs, Sources Sought, presolicitations — before the full RFP drops. Not an automatic email alert unless you set that up on SAM.gov.',
    vaultPath: conceptVaultPath('sam-live-discovery'),
    vaultAnchor: 'sam-live-discovery',
  },
}

export function getGlossaryTip(id: GlossaryId): string {
  return CAPTURE_GLOSSARY[id]?.tip ?? ''
}