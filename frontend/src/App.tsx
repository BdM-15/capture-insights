import { useState, useEffect } from 'react'
import { 
  BarChart3, Target, Clock, TrendingUp,
  RefreshCw, Plus, MessageSquare, Briefcase, BookOpen, X, Maximize2,
  Copy, FolderOpen, Trash2, Info, Eye, Layers, Wrench,
  GitBranch, PieChart, Crosshair, Lightbulb, Zap, Search, Radar, Users, MapPin,
  Settings, Sparkles, ClipboardList, UserCheck, Link2, Globe, Trophy, Handshake, Truck,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ScatterChart, Scatter, ReferenceLine, ZAxis } from 'recharts'
import Plot from 'react-plotly.js'
import { AppShell } from './components/shell/AppShell'
import type { HealthState } from './components/shell/Topbar'
import { MetricCard } from './components/ui/MetricCard'
import { StatChip } from './components/ui/StatChip'
import { TabBar } from './components/ui/TabBar'
import { Button } from './components/ui/Button'
import { EmptyState } from './components/ui/EmptyState'
import { Toast, type ToastState, type ToastTone } from './components/ui/Toast'
import { DataTable } from './components/lists/DataTable'
import { ReadinessStrip } from './components/opportunities/ReadinessStrip'
import { RecompeteRadarTable } from './components/opportunities/RecompeteRadarTable'
import { PursuitArtifactsList, type PursuitFolder } from './components/opportunities/PursuitArtifactsList'
import { DocumentPreviewPanel } from './components/shell/DocumentPreviewPanel'
import { SkillWorkspacePanel, type SkillWorkspaceState } from './components/opportunities/SkillWorkspacePanel'
import { EntryRow } from './components/lists/EntryRow'
import { BrainEntryCard } from './components/lists/BrainEntryCard'
import { AskCoPilotButton } from './components/ui/AskCoPilotButton'
import {
  NAV_GROUPS,
  DASHBOARD_TABS,
  VIEW_META,
  type SidebarId,
} from './constants/viewMeta'
import {
  CAPTURE_GLOSSARY,
  getGlossaryTip,
  GLOSSARY_VAULT_PATH,
  type GlossaryId,
} from './constants/captureGlossary'
import { CHART } from './constants/chartTheme'
import { CollapsibleSection } from './components/ui/CollapsibleSection'
import { FieldTip } from './components/ui/FieldTip'
import { SetAsideBarChart } from './components/charts/SetAsideBarChart'
import { RelationshipHeatmap } from './components/charts/RelationshipHeatmap'
import { AgencyNoteInline } from './components/lists/AgencyNoteInline'
import { McpServerCard, type McpServer } from './components/lists/McpServerCard'
import { SkillCard, type SkillEntry } from './components/lists/SkillCard'
import { normalizeSetAsideRows } from './utils/chartLabels'
import {
  buildRelationshipHeatmap,
  CUSTOMER_POSITION_META,
  getAgencyQuadrant,
  getCustomerPosition,
  getQualGate,
  QUAL_GATE_META,
  QUADRANT_META,
  summarizeAgencyFlows,
  type RelationshipRow,
} from './utils/agencyIntel'
import {
  CONCENTRATION_META,
  getCompeteStrategy,
  getCompetitorPosture,
  getConcentrationTier,
  POSTURE_META,
  recipientMatchesExpiring,
  STRATEGY_META,
  buildTeamingCandidatesFromFlows,
  buildTeamingDeepSearchPrompt,
  enrichTeamingCandidates,
  getSetAsideTeamingHint,
  parseTeamingApiResponse,
  summarizeRecipientFlows,
  TEAMING_FIT_META,
  TEAMING_MARKETING_STUBS,
  TEAMING_MCP_STUBS,
  TEAMING_TYPE_META,
  type CompetitorIntelRow,
  type TeamingCandidate,
} from './utils/competitiveIntel'
import {
  buildVehicleComboRows,
  buildVehicleStrategyPrompt,
  getVehicleConcentration,
  parseVehicleAnalysis,
  VEHICLE_ACCESS_META,
  VEHICLE_CONCENTRATION_META,
  AGENCY_SHAPE_GATE_META,
  buildFfpShapingPrompt,
  FFP_SHAPE_GATE_META,
  FFP_SHAPING_MCP_STUBS,
  parseFfpShapingRadar,
  PRESSURE_TIER_META,
  PRICING_BUCKET_META,
  VEHICLE_MCP_STUBS,
  VEHICLE_POSTURE_META,
  type AgencyPricingPressure,
  type FfpShapeTarget,
  type FfpShapingRadar,
  type VehicleAnalysisData,
  type VehicleComboRow,
} from './utils/vehicleIntel'
import {
  buildAgencyStateHeatmap,
  buildRegionalStrategyPrompt,
  buildStateScatterData,
  GEO_CONCENTRATION_META,
  GEO_MCP_STUBS,
  getStateMedians,
  parseGeographicAnalysis,
  PURSUIT_LENS_META,
  STATE_QUADRANT_META,
  type GeographicAnalysisData,
  type GeoStateRow,
} from './utils/geographicIntel'
import { GeoDeliveryMap } from './components/charts/GeoDeliveryMap'
import {
  buildClientComboInsights,
  buildComboBriefPrompt,
  buildComboScatterPoints,
  COMBO_MCP_STUBS,
  COMBO_SIGNAL_META,
  COMBO_TIER_META,
  enrichComboWithVault,
  parseComboInsights,
  type ComboInsightsData,
  type ComboMatch,
  type ComboSignal,
  type ComboTier,
} from './utils/comboIntel'
import {
  buildClientOpportunitiesIntel,
  parseOpportunitiesIntel,
  type OpportunitiesIntelData,
  type OpportunityRow,
  type WorkstationReadiness,
} from './utils/opportunitiesIntel'

// capture-insights React Frontend
// Per latest feedback:
// - Tab CONTEXT matters: +pipeline ONLY on Future Opportunities (and combo where opportunity-like).
//   On Competitive Analysis + Agency Intelligence: +Brain / +Wiki (add competitor/agency to accumulators).
//   Clicking +Brain on a new recipient seeds/append to wiki for that competitor — makes brain "smarter" (notes + citations from source data).
// - Floating chat is the HOLISTIC always-available co-pilot (no separate Chat sidebar page).
//   Make pane larger/resizable (drag left handle + maximize) so responses and context are useful.
// - Enrich every tab with synthesized "why this matters" insight callouts + workflow actions so content is actually useful for capture work (not just raw lists).
// Sidebar = high-level nav (Dashboard with internal tabs, separate Pipeline for pursuits, Knowledge Vault for the standalone LLM wiki/Karpathy brain, future MCPs/skills/settings).
// Per user: Pipeline connects to Ariadne Thread (milestone living packets for opportunities).
// Knowledge Vault is the foundational standalone knowledge base (domain intelligence, personal observations, Shipley/negotiation/training guidance, new BD intel, future ontologies & Theseus prompts). It is at least as important as the quantitative data insights.
// Theme + education persistence kept. Data foundation is live from DuckDB bulk. Small focused build.

interface KpiData {
  total_obligations_m: number
  total_actions: number
  avg_award_value_k: number
  unique_awards?: number
  active_contracts_approx: number
  expiring_24m: number
  expiring_36m?: number
  future_funding_potential_24m_m?: number
  future_funding_potential_36m_m?: number
  suitability_pct: number
  synergy_pct: number
  note?: string
}

interface MarketPotentialData {
  total_millions: number
  total_actions: number
  unique_competitors: number
  trend: string
  top_agencies: { agency: string | null; millions: number; actions: number }[]
  top_recipients: { name: string; millions: number }[]
  note?: string
}

interface FlowData {
  recipient: string
  agency: string
  office?: string
  actions: number
  millions: number
}

interface ChatSuggestedAction {
  action: string
  label: string
  payload?: Record<string, unknown>
}

interface ChatMessage {
  role: string
  content: string
  source?: string
  model?: string
  suggested_actions?: ChatSuggestedAction[]
}

interface IntensityData {
  agency: string
  award_count: number
  total_oblig: number
  avg_award: number
}

interface ExpiringData {
  award_key?: string
  recipient: string
  obligation: number
  end_date: string
  agency: string
}

export default function App() {
  const [naics, setNaics] = useState('561210')
  const [sidebar, setSidebar] = useState<SidebarId>('dashboard')
  const [health, setHealth] = useState<HealthState>('checking')
  const [dashTab, setDashTab] = useState('market')
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [flows, setFlows] = useState<FlowData[]>([])
  const [intensity, setIntensity] = useState<IntensityData[]>([])
  const [expiring, setExpiring] = useState<ExpiringData[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [vehicleAnalysis, setVehicleAnalysis] = useState<VehicleAnalysisData | null>(null)
  const [ffpShaping, setFfpShaping] = useState<FfpShapingRadar | null>(null)
  const [geo, setGeo] = useState<any[]>([])
  const [geographicAnalysis, setGeographicAnalysis] = useState<GeographicAnalysisData | null>(null)
  const [comboInsights, setComboInsights] = useState<ComboInsightsData | null>(null)
  const [opportunitiesIntel, setOpportunitiesIntel] = useState<OpportunitiesIntelData | null>(null)
  const [readiness, setReadiness] = useState<WorkstationReadiness | null>(null)
  const [fyTrends, setFyTrends] = useState<any[]>([])
  const [futureTrajectory, setFutureTrajectory] = useState<any[]>([])
  const [setAside, setSetAside] = useState<any[]>([])
  const [topRecipients, setTopRecipients] = useState<any[]>([])
  const [marketPotential, setMarketPotential] = useState<MarketPotentialData | null>(null)
  const [oppSearch, setOppSearch] = useState('')
  const [oppTierFilter, setOppTierFilter] = useState<'all' | ComboTier>('all')
  const [oppExpandedKey, setOppExpandedKey] = useState<string | null>(null)
  const [skillWorkspace, setSkillWorkspace] = useState<SkillWorkspaceState | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceUseLlm, setWorkspaceUseLlm] = useState(false)
  const [agencySearch, setAgencySearch] = useState('')
  const [competitorSearch, setCompetitorSearch] = useState('')
  const [teamingTarget, setTeamingTarget] = useState('')
  const [teamingSearch, setTeamingSearch] = useState('')
  const [teamingCapabilityGap, setTeamingCapabilityGap] = useState('')
  const [teamingRaw, setTeamingRaw] = useState<unknown>(null)
  const [skillsCatalog, setSkillsCatalog] = useState<{
    skill_count?: number
    partial_count?: number
    active_count?: number
    federal_1102?: SkillEntry[]
    theseus_capture?: SkillEntry[]
    marketing?: SkillEntry[]
  }>({})
  const [agencyRelationships, setAgencyRelationships] = useState<RelationshipRow[]>([])
  const [samKeywords, setSamKeywords] = useState('')
  const [samNoticeTypes, setSamNoticeTypes] = useState('RFI,Sources Sought,Special Notice,Presolicitation')
  const [samResults, setSamResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Ready — backend running + data ingested. Use the ingest command under the NAICS box (simple --dir form available).')
  const [pipeline, setPipeline] = useState<any[]>([])
  const [brain, setBrain] = useState<any[]>([])  // Competitor / agency wiki accumulator — seeds "brain" that gets smarter
  const [brainWiki, setBrainWiki] = useState<any[]>([])  // Native .md wiki files (Obsidian/Karpathy foundation) for richer view
  const [globalFiles, setGlobalFiles] = useState<any[]>([])  // Global wiki .md for cross-cutting (post phase3 global + data integration)
  // In-app wiki viewer state: lets you read the actual content (synthesized sections, citations, personal obs, ariadne pages)
  // without having to copy-path and switch to Obsidian every time. Primary deep work stays in Obsidian (graph/backlinks).
  // Click View on any global or native .md row -> this opens a focused reader with full(ish) text + copy actions.
  const [viewedWiki, setViewedWiki] = useState<any>(null)
  const [pursuitFolders, setPursuitFolders] = useState<PursuitFolder[]>([])
  const [vaultAudit, setVaultAudit] = useState<{ ok: boolean; message: string; pursuit_slugs?: string[] } | null>(null)


  // Phase 3 vault maintenance (lint + index). These are the exact schema chores you want the LLM/agent to run for you.
  // Buttons below let you trigger them from inside the app instead of terminal.
  const [lintReport, setLintReport] = useState<any>(null)
  const [indexStatus, setIndexStatus] = useState<any>(null)
  const [vaultMaintLoading, setVaultMaintLoading] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = (message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone })
  }

  async function loadKnowledgeDoc(
    relPath: string,
    title: string | undefined,
    target: 'vault' | 'artifacts',
    options?: { closeWorkspace?: boolean; navigate?: boolean },
  ) {
    if (options?.closeWorkspace) {
      setSkillWorkspace(null)
    }
    if (options?.navigate !== false) {
      setSidebar(target)
    }
    const normPath = relPath.replace(/\\/g, '/')
    try {
      const r = await fetch(`/user/knowledge/read?path=${encodeURIComponent(normPath)}`)
      if (r.ok) {
        const d = await r.json()
        const contentPath = (d.path || normPath).replace(/\\/g, '/')
        if (d.ok && d.content) {
          setViewedWiki({
            name: title || contentPath.split('/').pop() || 'Document',
            path: contentPath,
            content: d.content,
            excerpt: d.content.slice(0, 600),
          })
          return true
        }
      }
      showToast('File not found — run the skill again from Workspace', 'error')
    } catch {
      showToast('Could not load file', 'error')
    }
    return false
  }

  async function reloadPreviewDoc() {
    if (!viewedWiki?.path) return
    try {
      const r = await fetch(`/user/knowledge/read?path=${encodeURIComponent(viewedWiki.path.replace(/\\/g, '/'))}`)
      const d = await r.json()
      if (d.ok && d.content) {
        setViewedWiki({
          ...viewedWiki,
          content: d.content,
          path: (d.path || viewedWiki.path).replace(/\\/g, '/'),
        })
      }
    } catch {
      showToast('Reload failed', 'error')
    }
  }

  /** Open pursuit skill outputs (pursuits/<slug>/) in side preview panel. */
  async function openArtifactPath(artifactPath: string, title?: string, options?: { closeWorkspace?: boolean; navigate?: boolean }) {
    return loadKnowledgeDoc(artifactPath, title, 'artifacts', options)
  }

  /** Open curated vault page in side preview panel. */
  async function openVaultPreview(vaultPath: string, title?: string, options?: { navigate?: boolean }) {
    return loadKnowledgeDoc(vaultPath, title, 'vault', options)
  }

  /** Open atomic concept page in side preview (Knowledge Vault context). */
  async function openGlossaryInVault(termId: GlossaryId) {
    const entry = CAPTURE_GLOSSARY[termId]
    if (!entry) return
    const ok = await openVaultPreview(entry.vaultPath, entry.vaultTitle || entry.label)
    if (!ok) {
      showToast('Concept page not found — run: python scripts/seed_capture_concepts.py', 'error')
    }
  }

  // Real on-disk persistence via backend (data/user_accumulators.json).
  // This replaces the earlier pure localStorage slice. Adds/deletes/notes now go through the server
  // so the brain/wiki compounds reliably and is the durable source for future features (search by competitor, chat context, skills, etc.).
  async function deletePursuitFolder(slug: string) {
    if (!confirm(`Delete pursuits/${slug}/ from disk?\n\nGlobal wiki and brain entries are not touched.`)) return
    try {
      const res = await fetch(`/user/pursuits/${encodeURIComponent(slug)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        if (skillWorkspace?.slug === slug) setSkillWorkspace(null)
        await loadUserAccumulators()
        showToast(`Removed pursuit folder ${slug}`, 'success')
      } else {
        showToast(data.error || 'Delete failed', 'error')
      }
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  async function loadUserAccumulators() {
    try {
      const res = await fetch('/user/accumulators')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.pipeline)) setPipeline(data.pipeline)
        if (Array.isArray(data.brain)) setBrain(data.brain)
      }
    } catch {}
    // Load native wiki .md list (the Obsidian/Karpathy LLM wiki foundation)
    try {
      const wres = await fetch('/user/brain/wiki')
      if (wres.ok) {
        const wdata = await wres.json()
        if (Array.isArray(wdata.wiki_files)) setBrainWiki(wdata.wiki_files)
      }
    } catch {}
    // Load global wiki list (cross-cutting, integrated with data insights)
    try {
      const gres = await fetch('/user/global/list')
      if (gres.ok) {
        const gdata = await gres.json()
        if (Array.isArray(gdata.global_files)) setGlobalFiles(gdata.global_files)
      }
    } catch {}
    // Pursuit workspace outputs (pursuits/ — never mixed into global/)
    try {
      const pres = await fetch('/user/pursuits/list')
      if (pres.ok) {
        const pdata = await pres.json()
        if (Array.isArray(pdata.pursuits)) setPursuitFolders(pdata.pursuits)
      }
    } catch {}
    try {
      const ares = await fetch('/user/vault/audit')
      if (ares.ok) setVaultAudit(await ares.json())
    } catch {}
    // Last-resort fallback for very old browser state
    try {
      const p = localStorage.getItem('ci_pipeline')
      if (p) setPipeline(JSON.parse(p))
      const b = localStorage.getItem('ci_brain')
      if (b) setBrain(JSON.parse(b))
    } catch {}
  }

  useEffect(() => { loadUserAccumulators() }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  // Fetch MCP tool catalog (populated by app warmup in lifespan).
  // Used both for the dedicated "MCP Tools" sidebar (visibility/education) and passed to /chat so the co-pilot knows what agentic actions (buttons + chat) can drive.
  // User never calls these manually — buttons like "Create SAM monitor (smart)" and the chat use them under the hood.
  async function loadMcpTools(refresh = false) {
    try {
      const q = refresh ? '?refresh=1' : ''
      const res = await fetch(`/mcp/tools${q}`)
      if (res.ok) {
        const data = await res.json()
        setMcpInfo({
          tools: Array.isArray(data.tools) ? data.tools : [],
          servers: Array.isArray(data.servers) ? data.servers : [],
          server_count: data.server_count,
          online_count: data.online_count,
          mcp_available: data.mcp_available,
          note: data.note,
          how_to_enable: data.how_to_enable,
        })
      }
    } catch {}
  }
  useEffect(() => { loadMcpTools() }, [])

  async function loadSkillsCatalog() {
    try {
      const res = await fetch('/skills/catalog')
      if (res.ok) {
        const data = await res.json()
        setSkillsCatalog(data)
      }
    } catch {}
  }
  useEffect(() => { loadSkillsCatalog() }, [])

  useEffect(() => {
    const target = teamingTarget || topRecipients[0]?.recipient
    if (!target) {
      setTeamingRaw(null)
      return
    }
    let cancelled = false
    const gapQ = teamingCapabilityGap.trim()
      ? `&gap=${encodeURIComponent(teamingCapabilityGap.trim())}`
      : ''
    fetch(`/data/teaming-candidates?naics=${encodeURIComponent(naics)}&target=${encodeURIComponent(target)}&limit=15${gapQ}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setTeamingRaw(data)
      })
      .catch(() => {
        if (!cancelled) setTeamingRaw(null)
      })
    return () => { cancelled = true }
  }, [naics, teamingTarget, teamingCapabilityGap, topRecipients])

  // Call after mutations so React state matches the JSON file on disk
  async function syncAccumulators() {
    await loadUserAccumulators()
  }

  // Phase 3: vault maintenance helpers. These are the schema-defined chores (lint structure, rebuild catalog).
  // You trigger via buttons so the system/LLM does the work. No manual CLI needed.
  async function runVaultLint() {
    setVaultMaintLoading(true)
    try {
      const res = await fetch('/user/brain/lint')
      if (res.ok) {
        const data = await res.json()
        setLintReport(data)
      }
    } catch {}
    setVaultMaintLoading(false)
  }

  async function rebuildVaultIndex() {
    setVaultMaintLoading(true)
    try {
      const res = await fetch('/user/brain/rebuild-index', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setIndexStatus(data)
        // refresh the native wiki list so counts/entries stay fresh
        await loadUserAccumulators()
      }
    } catch {}
    setVaultMaintLoading(false)
  }

  // Holistic floating chat (always on, no separate sidebar page). Resizable for useful long responses.
  // Start collapsed per user request — user opens the co-pilot when they want the always-available helper.
  const [showChat, setShowChat] = useState(false)
  const [chatWidth, setChatWidth] = useState(380)
  const [isResizing, setIsResizing] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Co-pilot ready (sees your NAICS, tab, KPIs, Pipeline, and Knowledge Vault from disk, and MCP tools).\n\nFor quick admin tasks (e.g. smart SAM monitor from an expiring contract) use the buttons in the views — they activate the agent (LLM + MCP) with context and citations. Chat is excellent for open questions, overlaps, "what should I watch", or natural language exploration. Use Smart for local LLM or Fast for instant.' }
  ])
  const [useSmartModel, setUseSmartModel] = useState(false)  // opt into local LLM (qwen3.5:9b etc.) for more natural answers; default is fast deterministic path using your exact persisted data + suggested action chips
  // MCP info for the dedicated sidebar view + for feeding the chat co-pilot (catalog of what the agent can drive)
  const [mcpInfo, setMcpInfo] = useState<{
    tools: any[]
    servers?: McpServer[]
    server_count?: number
    online_count?: number
    mcp_available?: boolean
    note?: string
    how_to_enable?: string
  }>({ tools: [], servers: [] })

  async function fetchJson(path: string) {
    const r = await fetch(path)
    if (!r.ok) throw new Error(`${r.status} ${path}`)
    const ct = r.headers.get('content-type') || ''
    if (path.startsWith('/data/') && !ct.includes('application/json')) {
      throw new Error(`Non-JSON from ${path} — restart with .\\scripts\\start.ps1`)
    }
    return r.json()
  }

  async function loadData() {
    setLoading(true)
    setStatus('Fetching real bulk data from backend...')
    const q = `?naics=${naics}`
    const endpoints: { key: string; path: string; required?: boolean }[] = [
      { key: 'kpis', path: `/data/kpis${q}`, required: true },
      { key: 'flows', path: `/data/flows${q}&limit=40` },
      { key: 'agencyRelationships', path: `/data/agency-relationships${q}&limit=120` },
      { key: 'intensity', path: `/data/agency-intensity${q}&limit=20` },
      { key: 'expiring', path: `/data/expiring${q}&months=36&limit=40` },
      { key: 'vehicles', path: `/data/vehicles${q}` },
      { key: 'vehicleAnalysis', path: `/data/vehicle-analysis${q}` },
      { key: 'ffpShaping', path: `/data/ffp-shaping-radar${q}&months=36&limit=15` },
      { key: 'geo', path: `/data/geo${q}&limit=8` },
      { key: 'geographicAnalysis', path: `/data/geographic-analysis${q}&state_limit=15&agency_state_limit=48&months=36` },
      { key: 'comboInsights', path: `/data/combo-insights${q}&months=36&limit=40` },
      { key: 'fyTrends', path: `/data/fy-trends${q}` },
      { key: 'futureTrajectory', path: `/data/future-trajectory${q}&months=60` },
      { key: 'setAside', path: `/data/set-aside${q}` },
      { key: 'topRecipients', path: `/data/top-recipients${q}&limit=15` },
      { key: 'marketPotential', path: `/data/market_potential${q}` },
    ]
    const settled = await Promise.allSettled(endpoints.map((e) => fetchJson(e.path)))
    const data: Record<string, unknown> = {}
    const failures: string[] = []
    settled.forEach((result, idx) => {
      const { key, required } = endpoints[idx]
      if (result.status === 'fulfilled') {
        data[key] = result.value
      } else {
        failures.push(`${key}: ${result.reason?.message || result.reason}`)
        if (required) data._requiredFailed = true
      }
    })

    if (data._requiredFailed || !data.kpis) {
      console.error('Dashboard data load failed:', failures)
      const locked = failures.some((f) => /500|locked|cannot access/i.test(f))
      setStatus(
        locked
          ? 'Database busy (ingest may be running) — wait a moment and hit Refresh, or restart with .\\scripts\\start.ps1'
          : 'Backend unreachable — run .\\scripts\\start.ps1 from project root (open http://127.0.0.1:8000, not the Vite dev port).',
      )
      setLoading(false)
      return
    }

    setKpis(data.kpis as KpiData)
    setMarketPotential((data.marketPotential as MarketPotentialData) || null)
    setFlows((data.flows as FlowData[]) || [])
    setAgencyRelationships(Array.isArray(data.agencyRelationships) ? data.agencyRelationships as RelationshipRow[] : [])
    setIntensity((data.intensity as IntensityData[]) || [])
    setExpiring((data.expiring as ExpiringData[]) || [])
    setVehicles((data.vehicles as any[]) || [])
    setVehicleAnalysis(parseVehicleAnalysis(data.vehicleAnalysis))
    setFfpShaping(parseFfpShapingRadar(data.ffpShaping))
    setGeo((data.geo as any[]) || [])
    setGeographicAnalysis(parseGeographicAnalysis(data.geographicAnalysis))
    setComboInsights(parseComboInsights(data.comboInsights))
    setFyTrends((data.fyTrends as any[]) || [])
    setFutureTrajectory(Array.isArray(data.futureTrajectory) ? data.futureTrajectory as any[] : [])
    setSetAside((data.setAside as any[]) || [])
    setTopRecipients((data.topRecipients as any[]) || [])
    const partial = failures.length ? ` • ${failures.length} optional endpoint(s) skipped` : ''
    setStatus(`Live • ${naics} • ${new Date().toLocaleTimeString()}${partial}`)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [naics])

  useEffect(() => {
    let cancelled = false
    async function loadOpportunitiesIntel() {
      try {
        const brainParam = encodeURIComponent(
          JSON.stringify(brain.map((b: { name?: string }) => ({ name: b.name }))),
        )
        const path = `/data/opportunities-intel?naics=${naics}&months=36&limit=40&proactive_sam=1&brain=${brainParam}`
        const data = await fetchJson(path)
        if (!cancelled) setOpportunitiesIntel(parseOpportunitiesIntel(data))
      } catch {
        if (!cancelled) setOpportunitiesIntel(null)
      }
    }
    loadOpportunitiesIntel()
    return () => { cancelled = true }
  }, [naics, brain, pipeline])

  useEffect(() => {
    let cancelled = false
    async function checkHealth() {
      try {
        const [healthRes, readyRes] = await Promise.all([
          fetch('/health'),
          fetch('/ready'),
        ])
        if (!cancelled) {
          setHealth(healthRes.ok ? 'live' : 'degraded')
          if (readyRes.ok) {
            setReadiness(await readyRes.json())
          }
        }
      } catch {
        if (!cancelled) setHealth('down')
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const handleRefresh = () => loadData()
  const handleNaicsKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') loadData() }

  async function openSkillWorkspace(row: OpportunityRow) {
    setWorkspaceLoading(true)
    try {
      const res = await fetch('/user/pursuit/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: row, naics, brain }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!res.ok || !ct.includes('application/json')) {
        const stale = res.status === 404 || res.status === 405
        showToast(
          stale
            ? 'Workspace needs a backend restart — close the server and run .\\scripts\\start.ps1, then hard refresh this page'
            : `Workspace unavailable (${res.status})`,
          'error',
        )
        return
      }
      const data = await res.json()
      setSkillWorkspace({
        row: (data.row as OpportunityRow) || row,
        slug: data.slug,
        briefPath: data.brief_path,
        briefExists: !!data.brief_exists,
        skills: data.skills || [],
        artifacts: data.artifacts || [],
      })
    } catch {
      showToast('Workspace unreachable — run .\\scripts\\start.ps1 from the project folder', 'error')
    } finally {
      setWorkspaceLoading(false)
    }
  }

  async function scaffoldPursuitBrief(overwrite = false) {
    if (!skillWorkspace) return
    setWorkspaceLoading(true)
    try {
      const path = overwrite ? '/user/pursuit/run-skill' : '/user/pursuit/scaffold-brief'
      const body = overwrite
        ? { skill_id: 'capture-brief', item: skillWorkspace.row, naics, brain, use_llm: workspaceUseLlm }
        : { item: skillWorkspace.row, naics, brain }
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        setSkillWorkspace((w) => w && {
          ...w,
          briefExists: true,
          artifacts: data.artifacts || w.artifacts,
          lastIntel: data.intel_sources ? {
            sam: data.intel_sources.sam,
            sam_hits: data.intel_sources.sam_hits,
            usaspending_rels: data.intel_sources.usaspending_rels,
            used_llm: data.used_llm,
          } : w.lastIntel,
        })
        await loadUserAccumulators()
        const scaffoldMsg = overwrite
          ? (workspaceUseLlm ? 'Capture brief enriched in vault' : 'Capture brief refreshed from USASpending')
          : 'Capture brief created in vault'
        showToast(scaffoldMsg, 'success')
      } else {
        showToast(data.error || 'Brief failed', 'error')
      }
    } catch {
      showToast('Brief action failed', 'error')
    } finally {
      setWorkspaceLoading(false)
    }
  }

  async function runPursuitSkill(skillId: string) {
    if (!skillWorkspace) return
    setWorkspaceLoading(true)
    try {
      const res = await fetch('/user/pursuit/run-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: skillId,
          item: skillWorkspace.row,
          naics,
          brain,
          use_llm: workspaceUseLlm && (skillId === 'capture-brief' || skillId === 'competitive-battlecard'),
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        showToast(data.error || 'Skill failed', 'error')
        return
      }
      const intel = data.intel_sources || {}
      const patchWorkspace = (w: SkillWorkspaceState) => ({
        ...w,
        briefExists: skillId === 'capture-brief' ? true : w.briefExists,
        artifacts: data.artifacts || w.artifacts,
        lastIntel: {
          sam: intel.sam,
          sam_hits: intel.sam_hits,
          usaspending_rels: intel.usaspending_rels ?? intel.usaspending_flows,
          used_llm: data.used_llm,
        },
      })
      if (skillId === 'sam-monitor-builder') {
        await syncAccumulators()
        await loadUserAccumulators()
        setSkillWorkspace((w) => w && patchWorkspace(w))
        showToast('SAM monitor saved to Pipeline + vault', 'success')
      } else if (
        skillId === 'capture-brief'
        || skillId === 'sam-scan'
        || skillId === 'competitive-snapshot'
        || skillId === 'competitive-battlecard'
      ) {
        await loadUserAccumulators()
      }
      if (skillId === 'capture-brief') {
        setSkillWorkspace((w) => w && patchWorkspace(w))
        const verb = data.used_llm ? 'enriched' : 'updated'
        const llmNote = data.used_llm ? ' · LLM narrative added' : ''
        showToast(`Capture brief ${verb}${llmNote} · SAM: ${intel.sam_hits ?? 0} hits`, 'success')
      } else if (skillId === 'sam-scan') {
        setSkillWorkspace((w) => w && patchWorkspace(w))
        showToast(`SAM scan saved · ${intel.sam_hits ?? 0} notice(s) via ${intel.sam || 'API'}`, 'success')
      } else if (skillId === 'competitive-snapshot') {
        setSkillWorkspace((w) => w && patchWorkspace(w))
        showToast(`Competitive snapshot saved · ${intel.usaspending_rels ?? 0} relationships`, 'success')
      } else if (skillId === 'competitive-battlecard') {
        setSkillWorkspace((w) => w && patchWorkspace(w))
        const llmNote = data.used_llm ? ' · LLM angles added' : ''
        const strat = data.strategy ? ` · ${data.strategy}` : ''
        showToast(`Battlecard saved${strat}${llmNote}`, 'success')
      }
    } catch {
      showToast('Skill run failed', 'error')
    } finally {
      setWorkspaceLoading(false)
    }
  }

  async function searchSamLive() {
    setLoading(true)
    try {
      const q = `?naics=${naics}&keywords=${encodeURIComponent(samKeywords)}&notice_types=${encodeURIComponent(samNoticeTypes)}&limit=8`
      const res = await fetch(`/mcp/sam/opportunities${q}`)
      const data = await res.json()
      setSamResults(Array.isArray(data) ? data : [])
    } catch (e) {
      setSamResults([{ title: 'SAM search failed (check backend logs / SAM_API_KEY)', agency: 'See /mcp/sam/opportunities', link: '' }])
    }
    setLoading(false)
  }

  // === Context-aware actions (the core of "features must make sense per tab") ===
  async function addToPipeline(item: any, type: string = 'opportunity') {
    const entry = { 
      ...item, 
      type, 
      ts: new Date().toISOString(), 
      naics,
      source: dashTab 
    }
    try {
      await fetch('/user/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })
    } catch {}
    await syncAccumulators()
    const label = item.recipient || item.agency || item.label || type
    showToast(`Added to pipeline: ${label}`, 'success')
    setChatHistory(h => [...h, { role: 'assistant', content: `Added to pipeline: ${label}. Saved to data/user_accumulators.json on disk.` }])
  }

  async function addToBrain(item: any, competitorKey: string, type: string = 'competitor') {
    // This is the "+wiki / +brain" equivalent. Clicking accumulates for this competitor/agency.
    // The backend does the compounding (same name+type -> append notes/citations).
    // Future: this will trigger MCP research (sam.gov profile, usaspending more, web intel) or local LLM wiki append.
    const name = competitorKey || item.recipient || item.agency || item.name || 'Unknown'
    const entry = {
      name,
      type,
      sourceTab: dashTab,
      notes: `Added from ${dashTab}. ${item.agency ? 'Via agency intensity/flow.' : ''} ${item.millions ? '$' + item.millions + 'M flow.' : ''}`,
      citation: `NAICS ${naics} • source: ${dashTab} • key:${item.award_key || item.recipient || item.agency || ''} • ${new Date().toISOString().slice(0,10)}`,
      addedAt: new Date().toISOString(),
      raw: item
    }
    try {
      await fetch('/user/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })
    } catch {}
    await syncAccumulators()
    showToast(`Brain updated: ${name}`, 'success')
    setChatHistory(h => [...h, { role: 'assistant', content: `Added/updated "${name}" in Brain / Wiki. Saved to data/user_accumulators.json. The entry compounds when you re-add the same name.` }])
  }

  async function removeFromPipeline(id: string) {
    try {
      await fetch('/user/pipeline', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
    } catch {}
    await syncAccumulators()
    showToast('Removed from pipeline', 'info')
  }

  async function removeFromBrain(id: string) {
    try {
      await fetch('/user/brain', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
    } catch {}
    await syncAccumulators()
    showToast('Removed from brain', 'info')
  }

  async function updateBrainNote(id: string, newNotes: string) {
    try {
      await fetch('/user/brain/note', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes: newNotes })
      })
    } catch {}
    await syncAccumulators()
    showToast('Note saved to vault', 'success')
  }

  function findEntityBrainEntry(name: string, type: 'agency' | 'competitor' | 'office') {
    const n = name.toLowerCase()
    return brain.find((b: any) => {
      if (b.type !== type) return false
      const bn = (b.name || '').toLowerCase()
      return bn === n || bn.includes(n.slice(0, 18)) || n.includes(bn.slice(0, 18))
    })
  }

  const findAgencyBrainEntry = (agencyName: string) => findEntityBrainEntry(agencyName, 'agency')
  const findCompetitorBrainEntry = (recipientName: string) => findEntityBrainEntry(recipientName, 'competitor')

  function navigateToAgencyOpportunities(agencyName: string) {
    setOppSearch(agencyName)
    setDashTab('opportunities')
    showToast(`Filtering recompetes for ${agencyName.slice(0, 28)}…`, 'info')
  }

  async function saveAgencyInlineNote(agencyName: string, notes: string, agencyRow?: any) {
    const existing = findAgencyBrainEntry(agencyName)
    if (existing?.id) {
      await updateBrainNote(existing.id, notes)
      return
    }
    if (!notes.trim()) return
    const entry = {
      name: agencyName,
      type: 'agency',
      sourceTab: 'agency',
      notes,
      citation: `NAICS ${naics} • source: agency-intel • inline note • ${new Date().toISOString().slice(0, 10)}`,
      addedAt: new Date().toISOString(),
      raw: agencyRow || { agency: agencyName },
    }
    try {
      await fetch('/user/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
    } catch {}
    await syncAccumulators()
    showToast(`Note saved for ${agencyName.slice(0, 24)}`, 'success')
  }

  function navigateToCompetitorOpportunities(recipientName: string) {
    setOppSearch(recipientName)
    setDashTab('opportunities')
    showToast(`Filtering recompetes for ${recipientName.slice(0, 28)}…`, 'info')
  }

  async function saveCompetitorInlineNote(recipientName: string, notes: string, row?: any) {
    const existing = findCompetitorBrainEntry(recipientName)
    if (existing?.id) {
      await updateBrainNote(existing.id, notes)
      return
    }
    if (!notes.trim()) return
    const entry = {
      name: recipientName,
      type: 'competitor',
      sourceTab: 'competitive',
      notes,
      citation: `NAICS ${naics} • source: competitive-intel • inline note • ${new Date().toISOString().slice(0, 10)}`,
      addedAt: new Date().toISOString(),
      raw: row || { recipient: recipientName },
    }
    try {
      await fetch('/user/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
    } catch {}
    await syncAccumulators()
    showToast(`Note saved for ${recipientName.slice(0, 24)}`, 'success')
  }

  // === Holistic chat with rich live context + suggested actions that can mutate state ===
  function askCoPilot(prompt: string, autoSend = false) {
    setShowChat(true)
    setChatInput(prompt)
    if (autoSend) {
      setTimeout(() => {
        void sendChatMessage(prompt)
        setChatInput('')
      }, 40)
    }
  }

  async function sendChatMessage(userText: string) {
    const text = userText.trim()
    if (!text) return
    const userMsg = { role: 'user', content: text }
    const newHistory = [...chatHistory, userMsg]
    setChatHistory(newHistory)

    // Build rich live context from the current dashboard + the persisted accumulators + MCP tool catalog.
    // The catalog tells the LLM what admin/MCP actions it can perform on the user's behalf (search SAM,
    // entity lookups, etc.). This is the core of the agentic design: LLM drives MCPs; user never does manually.
    const payload = {
      naics,
      active_tab: dashTab,
      kpis: kpis || null,
      brain: brain || [],
      pipeline: pipeline || [],
      message: text,
      use_llm: useSmartModel,
      mcp_tools: mcpInfo.tools || [],
    }

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        const assistantContent = data.response || '(no response)'
        const actions = data.suggested_actions || []
        const src = data.source || null
        const modelUsed = (data.context_used && data.context_used.model) || null
        setTimeout(() => {
          setChatHistory(prev => [...prev, { role: 'assistant', content: assistantContent, suggested_actions: actions, source: src, model: modelUsed }])
        }, 150)
        return
      }
    } catch (e) {
      // fall through to local fallback
    }

    // Local fallback (if backend chat not available) — still better than nothing
    const ctx = `NAICS=${naics} | activeTab=${dashTab} | pipeline=${pipeline.length} | brain=${brain.length}`
    const fallback = `With current context: ${ctx}\n\n(Backend /chat not reachable right now. The real endpoint returns grounded analysis using your actual saved Brain and Pipeline items. Restart the backend if needed.)`
    setTimeout(() => {
      setChatHistory(prev => [...prev, { role: 'assistant', content: fallback, source: 'local-fallback' }])
    }, 150)
  }

  async function sendChat() {
    const text = chatInput.trim()
    if (!text) return
    setChatInput('')
    await sendChatMessage(text)
  }

  // Allow chat to drive actions (for the "suggested actions" in responses)
  function applySuggestedAction(action: string, _payload?: unknown) {
    if (action === 'brain-top-flows') {
      flows.slice(0, 4).forEach(f => addToBrain(f, f.recipient, 'competitor'))
    }
    if (action === 'pipeline-expiring') {
      expiring.slice(0, 3).forEach(e => addToPipeline(e, 'expiring'))
    }
    if (action === 'brain-hot-agencies') {
      intensity.slice(0, 4).forEach(a => addToBrain(a, a.agency, 'agency'))
    }
  }

  // New handler for structured actions coming from the backend /chat response
  function handleChatSuggestedAction(action: any) {
    const { action: type, payload } = action || {}
    if (type === 'add_to_brain' && payload?.name) {
      // Create a minimal item the addToBrain expects
      addToBrain({ recipient: payload.name }, payload.name, payload.type || 'competitor')
    } else if (type === 'add_to_pipeline' && payload) {
      addToPipeline(payload, payload.type || 'from_chat')
    } else if (type === 'navigate') {
      if (payload?.view === 'pipeline' || payload?.tab === 'pipeline') {
        setSidebar('pipeline')
      } else if (payload?.tab) {
        setDashTab(payload.tab)
        setSidebar('dashboard')
      }
    } else if (type === 'log_note') {
      // For now just echo in chat; later we can persist notes against items
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Note logged: ${payload?.note || 'user request'}` }])
    } else if (type === 'mcp_search_sam') {
      // This is the key agentic trigger: instead of user filling the SAM form or clicking manual buttons,
      // the chat suggested action (or user just types) causes the LLM + backend router to drive the MCP search.
      // We synthesize a natural prompt that the router will catch and execute search_sam_opportunities_mcp.
      const reason = payload?.reason || 'current scope'
      const kws = payload?.keywords || ''
      const prompt = `Search SAM for live opportunities (RFI, Sources Sought, Special Notice, Presolicitation) matching my Brain and expiring contracts. Keywords: ${kws}. Reason: ${reason}. Then suggest which ones to create monitors for and add to pipeline.`
      // Reuse send path by setting input + calling (keeps history clean)
      setChatInput(prompt)
      // fire after paint
      setTimeout(() => { sendChat() }, 30)
    } else {
      // Fallback: just show the action
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Action requested: ${type} ${JSON.stringify(payload || {})}` }])
    }
  }

  // Combo logic (expiring + intensity) — expiring work in high-intensity agencies
  const medIntensityActions = intensity.length ? intensity.reduce((s, x) => s + (x.award_count || 0), 0) / intensity.length : 0
  const medIntensityOblig = intensity.length ? intensity.reduce((s, x) => s + (x.total_oblig || 0), 0) / intensity.length : 0
  const isHotAgency = (a: IntensityData) => (a.total_oblig || 0) > medIntensityOblig && (a.award_count || 0) > medIntensityActions
  const hotAgencyList = intensity.filter(isHotAgency)
  const hotAgencies = new Set(hotAgencyList.map(x => x.agency))
  const comboExpiring = expiring.filter(e => hotAgencies.has(e.agency || ''))

  // Pulse stats used across overview cards + some action teasers in market/vehicles
  const hotRecompeteM = comboExpiring.reduce((s: number, e: any) => s + ((e.obligation || 0) / 1e6), 0)
  const hotRecompeteCount = comboExpiring.length

  function renderDashboardContent() {
    if (!kpis) return <div className="p-8 text-center text-sm text-slate-400">Loading data from your bulk ingest (safe to ingest more while this runs)...</div>

    switch (dashTab) {
      case 'market': {
        // Market Overview — Command & Control pulse for capture managers.
        // Scan TAM → momentum → focus agencies → money flows → concentration → next actions.

        const trendData = fyTrends.map((t: any) => ({
          fy: 'FY' + t.fy,
          obligationsM: t.millions || 0,
          actions: t.actions || 0,
        }))
        const futureTrendData = futureTrajectory.map((t: any) => ({
          fy: t.fy || `FY${t.year}`,
          obligationsM: t.millions || 0,
          actions: t.actions || 0,
        }))
        const fySpan = trendData.length >= 2
          ? `${trendData[0].fy}–${trendData[trendData.length - 1].fy}`
          : trendData.length === 1 ? trendData[0].fy : 'limited history'

        const sankeyNodes: any[] = []
        const sankeyNodeMap = new Map<string, number>()
        const sankeyLinks: any[] = []
        flows.forEach((f: any) => {
          const r = f.recipient || 'Unknown Recipient'
          const a = f.agency || 'Unknown Agency'
          const o = f.office || 'Unspecified Office'
          const rk = `R:${r}`
          const ak = `A:${a}`
          const ok = `O:${o}`
          if (!sankeyNodeMap.has(rk)) { sankeyNodeMap.set(rk, sankeyNodes.length); sankeyNodes.push({ label: r }) }
          if (!sankeyNodeMap.has(ak)) { sankeyNodeMap.set(ak, sankeyNodes.length); sankeyNodes.push({ label: a }) }
          if (!sankeyNodeMap.has(ok)) { sankeyNodeMap.set(ok, sankeyNodes.length); sankeyNodes.push({ label: o }) }
          sankeyLinks.push({ source: sankeyNodeMap.get(rk)!, target: sankeyNodeMap.get(ak)!, value: f.millions || 0 })
          sankeyLinks.push({ source: sankeyNodeMap.get(ak)!, target: sankeyNodeMap.get(ok)!, value: f.millions || 0 })
        })
        const sankeyData = flows.length ? [{
          type: 'sankey',
          orientation: 'h',
          node: { pad: 10, thickness: 16, line: { color: '#1f1f2e', width: 0.5 }, label: sankeyNodes.map(n => n.label), color: '#00f0ff' },
          link: { source: sankeyLinks.map(l => l.source), target: sankeyLinks.map(l => l.target), value: sankeyLinks.map(l => l.value), color: 'rgba(0,240,255,0.28)' },
        }] : []

        const medActions = medIntensityActions
        const medOblig = medIntensityOblig
        const intensityScatterData = intensity.map((a) => ({
          x: a.award_count || 0,
          y: a.total_oblig || 0,
          z: Math.max(35, Math.min(220, (a.avg_award || 0) / 15000)),
          name: a.agency,
          isHot: isHotAgency(a),
        }))

        const totalM = kpis.total_obligations_m || 1
        const top3M = topRecipients.slice(0, 3).reduce((s: number, r: any) => s + (r.millions || 0), 0)
        const top3Pct = Math.round((top3M / totalM) * 100)
        const intensityRanked = [...intensity].sort((a, b) => {
          const aHot = isHotAgency(a) ? 1 : 0
          const bHot = isHotAgency(b) ? 1 : 0
          if (bHot !== aHot) return bHot - aHot
          return (b.total_oblig || 0) - (a.total_oblig || 0)
        })

        const pricingAgg: Record<string, number> = {}
        const vehicleAgg: Record<string, number> = {}
        vehicles.forEach((v: any) => {
          const pr = v.pricing || 'Unknown Pricing'
          pricingAgg[pr] = (pricingAgg[pr] || 0) + (v.millions || 0)
          const ve = v.vehicle || 'Unknown Vehicle'
          vehicleAgg[ve] = (vehicleAgg[ve] || 0) + (v.millions || 0)
        })
        const pricingLabels = Object.keys(pricingAgg)
        const pricingValues = Object.values(pricingAgg)
        const vehicleLabels = Object.keys(vehicleAgg)
        const vehicleValues = Object.values(vehicleAgg)
        const setAsidePulse = normalizeSetAsideRows(setAside, 5)

        const fmtObl = (m: number) => m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(0)}M`
        const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
        const fmtAvg = (k: number) => `$${(k / 1000).toFixed(2)}M`

        return (
          <div className="page-sections">
            <CollapsibleSection
              title="Market Pulse"
              subtitle={`NAICS ${naics} · ${fySpan}`}
              icon={BarChart3}
              accent="cyan"
              defaultOpen
              titleGlossaryId="market_tam"
              onGlossaryLearn={openGlossaryInVault}
            >
            <div className="market-pulse-hero border-0 bg-transparent p-0 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-text-primary flex items-center gap-2">
                    <BarChart3 size={18} className="text-neon-cyan" />
                    Market Pulse <span className="pill">NAICS {naics}</span>
                  </div>
                  <div className="text-xs text-text-400 mt-1 max-w-2xl">
                    Your command view: total market size, momentum, where money flows, who dominates, and where to focus BD effort. Use the action cards below — then dive into Agency Intelligence for lead engagement.
                  </div>
                </div>
                <div className="text-right text-[10px] text-text-500 font-mono">
                  <div>FY span: {fySpan}</div>
                  <div>{kpis.total_actions?.toLocaleString()} actions in slice</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <StatChip
                  label="Total Market (TAM)"
                  termId="market_tam"
                  onLearnMore={openGlossaryInVault}
                  value={fmtObl(kpis.total_obligations_m)}
                />
                <StatChip
                  label="Competitive Field"
                  termId="market_concentration"
                  onLearnMore={openGlossaryInVault}
                  value={`${(marketPotential?.unique_competitors || 0).toLocaleString()} primes`}
                />
                <StatChip
                  label="Momentum"
                  termId="market_momentum"
                  onLearnMore={openGlossaryInVault}
                  value={marketPotential?.trend || '—'}
                  valueClassName="text-neon-magenta text-base"
                />
                <StatChip
                  label="Recompete Radar (24m)"
                  termId="recompete_radar"
                  onLearnMore={openGlossaryInVault}
                  value={`${fmtNum(kpis.expiring_24m || 0)} ending`}
                />
              </div>
            </div>

            {/* Executive KPI row — original Data_Insights 7-card glance + vision stubs for global wiki matching */}
            <div>
              <div className="text-[9px] uppercase tracking-[1.5px] text-text-500 mb-1.5 px-0.5">Executive Summary — Glanceable for Capture Managers</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <MetricCard label="Total Obligations" value={fmtObl(kpis.total_obligations_m)} glossaryId="market_tam" onGlossaryLearn={openGlossaryInVault} accent="amber" />
                <MetricCard label="Total Actions" value={fmtNum(kpis.total_actions)} glossaryId="capture_intensity" onGlossaryLearn={openGlossaryInVault} accent="cyan" />
                <MetricCard label="Avg Award Value" value={fmtAvg(kpis.avg_award_value_k)} glossaryId="market_tam" onGlossaryLearn={openGlossaryInVault} accent="lime" />
                <MetricCard label="Active (Approx)" value={fmtNum(kpis.active_contracts_approx)} glossaryId="recompete_radar" onGlossaryLearn={openGlossaryInVault} accent="cyan" />
                <MetricCard label="Expiring (24m)" value={fmtNum(kpis.expiring_24m || 0)} glossaryId="recompete_radar" onGlossaryLearn={openGlossaryInVault} accent="magenta" />
                <MetricCard
                  label="Suitability"
                  value={`${kpis.suitability_pct}%`}
                  stub
                  accent="amber"
                  glossaryId="suitability_stub"
                  onGlossaryLearn={openGlossaryInVault}
                />
                <MetricCard
                  label="Synergy"
                  value={`${kpis.synergy_pct}%`}
                  stub
                  accent="magenta"
                  glossaryId="synergy_stub"
                  onGlossaryLearn={openGlossaryInVault}
                />
              </div>
            </div>

            {/* Future Funding Potential — recompete dollars at stake (original pulse metric) */}
            <div className="glass p-4 rounded-3xl border border-[#ff2bd6]/25 market-funding-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neon-magenta flex items-center gap-2">
                    <Clock size={15} />
                    <FieldTip termId="future_funding" label="Future Funding Potential" onLearnMore={openGlossaryInVault} />
                  </div>
                  <div className="text-[10px] text-text-400 mt-1 max-w-xl">
                    Total obligated dollars on contracts ending soon — your addressable recompete pool. Chase these via Future Opportunities + SAM monitors before RFPs drop.
                  </div>
                </div>
                <button onClick={() => setDashTab('opportunities')} className="action-btn pipeline text-[10px]">Full recompete radar →</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <StatChip
                  label="24-Month Funding at Risk"
                  termId="future_funding"
                  onLearnMore={openGlossaryInVault}
                  value={fmtObl(kpis.future_funding_potential_24m_m || 0)}
                  valueClassName="text-neon-magenta"
                  sublabel={`${fmtNum(kpis.expiring_24m || 0)} contracts`}
                />
                <StatChip
                  label="36-Month Funding at Risk"
                  termId="future_funding"
                  onLearnMore={openGlossaryInVault}
                  value={fmtObl(kpis.future_funding_potential_36m_m || 0)}
                  valueClassName="text-neon-magenta"
                  sublabel={`${fmtNum(kpis.expiring_36m || 0)} contracts`}
                />
                <StatChip
                  label="Hot-Agency Recompetes"
                  termId="hot_agency_recompete"
                  onLearnMore={openGlossaryInVault}
                  value={fmtObl(hotRecompeteM)}
                  sublabel={`${hotRecompeteCount} in focus agencies`}
                />
                <StatChip
                  label="Match Lens (Future)"
                  termId="match_lens"
                  onLearnMore={openGlossaryInVault}
                  value={`${kpis.suitability_pct}% / ${kpis.synergy_pct}%`}
                  valueClassName="text-base text-neon-amber"
                  sublabel="suitability • synergy when wiki live"
                />
              </div>
            </div>
            </CollapsibleSection>

            <CollapsibleSection title="Capture Actions" subtitle="What to do from this view" icon={Zap} accent="amber" defaultOpen>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="market-action-card">
                <div className="title">1. Prioritize customers</div>
                <div className="body">{hotAgencyList.length} hot agencies (high volume + high value). These are your best BD engagement targets.</div>
                <div className="actions">
                  <button onClick={() => setDashTab('agency')} className="text-[10px] text-neon-cyan hover:underline">Agency Intelligence →</button>
                  <button onClick={() => hotAgencyList.slice(0, 3).forEach((a) => addToBrain(a, a.agency, 'agency'))} className="action-btn brain text-[10px]">+brain top 3</button>
                </div>
              </div>
              <div className="market-action-card">
                <div className="title">2. Track recompetes</div>
                <div className="body">{hotRecompeteCount} expiring awards in hot agencies (${hotRecompeteM.toFixed(1)}M). Start positioning before SAM notices drop.</div>
                <div className="actions">
                  <button onClick={() => setDashTab('opportunities')} className="text-[10px] text-neon-cyan hover:underline">Future Opportunities →</button>
                  {hotRecompeteCount > 0 && <button onClick={() => comboExpiring.slice(0, 2).forEach((e) => addToPipeline(e, 'expiring'))} className="action-btn pipeline text-[10px]">+pipeline top 2</button>}
                </div>
              </div>
              <div className="market-action-card">
                <div className="title">3. Map the competitive field</div>
                <div className="body">Top 3 primes hold {top3Pct}% of spend. Know who to team with, ghost, or displace.</div>
                <div className="actions">
                  <button onClick={() => setDashTab('competitive')} className="text-[10px] text-neon-cyan hover:underline">Competitive Analysis →</button>
                  <button onClick={() => topRecipients.slice(0, 3).forEach((r: any) => addToBrain({ recipient: r.recipient }, r.recipient, 'competitor'))} className="action-btn brain text-[10px]">+brain top 3</button>
                </div>
              </div>
            </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Trends & Capture Focus"
              subtitle="Spend history · recompete trajectory · intensity"
              icon={TrendingUp}
              accent="cyan"
              defaultOpen
              titleGlossaryId="capture_intensity"
              onGlossaryLearn={openGlossaryInVault}
            >
            <div className="market-chart-grid space-y-4">
              <div className="text-[9px] uppercase tracking-[1.5px] text-text-500 px-0.5">Market Trends &amp; Capture Focus</div>

              {/* Row 1: Historical spend (left) | Future trajectory (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="chart-panel surface-accent-cyan">
                  <div className="chart-panel-title cyan">Historical Spend &amp; Actions</div>
                  <div className="chart-panel-sub">FY obligation totals and action volume from loaded USASpending bulk history.</div>
                  {trendData.length > 0 ? (
                    <div className="chart-module" style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} />
                          <XAxis dataKey="fy" stroke={CHART.axisStroke} tick={CHART.axisTickSm} />
                          <YAxis yAxisId="left" stroke={CHART.colors.cyan} tick={CHART.axisTickSm} width={42} />
                          <YAxis yAxisId="right" orientation="right" stroke={CHART.colors.magenta} tick={CHART.axisTickSm} width={42} />
                          <Tooltip contentStyle={CHART.tooltipStyle} />
                          <Legend wrapperStyle={{ ...CHART.legendStyle, paddingTop: 4 }} />
                          <Line yAxisId="left" type="monotone" dataKey="obligationsM" name="$M Obligations" stroke={CHART.colors.cyan} strokeWidth={2} dot={{ r: 3 }} />
                          <Line yAxisId="right" type="monotone" dataKey="actions" name="Actions" stroke={CHART.colors.magenta} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[240px] flex items-center justify-center">Need FY history in bulk data.</div>}
                </div>

                <div className="chart-panel surface-accent-magenta">
                  <div className="chart-panel-title magenta">
                    <FieldTip termId="future_funding" label="Future Trajectory (Recurring Recompete)" onLearnMore={openGlossaryInVault} />
                  </div>
                  <div className="chart-panel-sub">Assumes requirements recur — obligated $ on contracts ending each year = addressable future funding pool.</div>
                  {futureTrendData.length > 0 ? (
                    <div className="chart-module" style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={futureTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} />
                          <XAxis dataKey="fy" stroke={CHART.axisStroke} tick={CHART.axisTickSm} />
                          <YAxis yAxisId="left" stroke={CHART.colors.magenta} tick={CHART.axisTickSm} width={42} />
                          <YAxis yAxisId="right" orientation="right" stroke={CHART.colors.amber} tick={CHART.axisTickSm} width={42} />
                          <Tooltip contentStyle={CHART.tooltipStyle} />
                          <Legend wrapperStyle={{ ...CHART.legendStyle, paddingTop: 4 }} />
                          <Line yAxisId="left" type="monotone" dataKey="obligationsM" name="$M at Recompete" stroke={CHART.colors.magenta} strokeWidth={2} dot={{ r: 4 }} />
                          <Line yAxisId="right" type="monotone" dataKey="actions" name="Contracts Ending" stroke={CHART.colors.amber} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[240px] flex items-center justify-center">No forward PoP end dates in current slice.</div>}
                  <button onClick={() => setDashTab('opportunities')} className="text-[10px] text-neon-magenta hover:underline mt-1">Drill into recompete list →</button>
                </div>
              </div>

              {/* Row 2: Capture intensity scatter (left) | High-intensity agency table (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="chart-panel surface-accent-lime">
                  <div className="chart-panel-title magenta">
                    <FieldTip termId="capture_intensity" label="Capture Intensity" onLearnMore={openGlossaryInVault} />
                  </div>
                  <div className="chart-panel-sub">Agencies by volume vs. value — upper-right (pink) = high-intensity BD targets.</div>
                  {intensity.length ? (
                    <div style={{ width: '100%', height: 280 }}>
                      <ResponsiveContainer>
                        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                          <CartesianGrid stroke={CHART.gridStroke} />
                          <XAxis type="number" dataKey="x" name="Actions" stroke={CHART.axisStroke} tick={CHART.axisTickSm}
                            tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                          <YAxis type="number" dataKey="y" name="Obligations" stroke={CHART.axisStroke} tick={CHART.axisTickSm}
                            tickFormatter={(v) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${v}`} />
                          <ZAxis type="number" dataKey="z" range={[40, 200]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                            if (!payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div className="chart-tooltip">
                                <div style={{ fontWeight: 600 }}>{d.name}</div>
                                <div>Actions: {d.x.toLocaleString()}</div>
                                <div>Obligations: ${(d.y / 1e6).toFixed(1)}M</div>
                                {d.isHot && <div className="text-neon-magenta">★ Hot intensity</div>}
                              </div>
                            )
                          }} />
                          <ReferenceLine x={medActions} stroke={CHART.colors.magenta} strokeDasharray="3 3" />
                          <ReferenceLine y={medOblig} stroke={CHART.colors.cyan} strokeDasharray="3 3" />
                          <Scatter data={intensityScatterData}>
                            {intensityScatterData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.isHot ? CHART.colors.magenta : CHART.colors.cyan} />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[280px] flex items-center justify-center">Need agency data.</div>}
                </div>

                <div className="chart-panel surface-accent-magenta min-h-[320px]">
                  <div className="chart-panel-title magenta">
                    <span className="flex items-center gap-2"><Target size={14} /> Top Agencies (Intensity Score)</span>
                    <button onClick={() => setDashTab('agency')} className="text-[10px] text-neon-cyan hover:underline">Agency Intel →</button>
                  </div>
                  <div className="chart-panel-sub">Ranked by capture intensity — hot (★) agencies first, then by obligations.</div>
                  <DataTable
                    className="flex-1 max-h-[320px]"
                    minHeight="280px"
                    emptyMessage="No agency intensity data."
                    data={intensityRanked}
                    rowKey={(a) => a.agency}
                    rowClassName={(a) => isHotAgency(a) ? 'intensity-row-hot' : ''}
                    onGlossaryLearn={openGlossaryInVault}
                    columns={[
                      {
                        key: 'agency',
                        header: 'Agency',
                        render: (a) => (
                          <span className="text-text-primary max-w-[140px] truncate block" title={a.agency}>{a.agency}</span>
                        ),
                      },
                      {
                        key: 'actions',
                        header: 'Act.',
                        cellClassName: 'tabular-nums text-text-400',
                        render: (a) => a.award_count?.toLocaleString(),
                      },
                      {
                        key: 'oblig',
                        header: '$M',
                        cellClassName: 'tabular-nums text-neon-cyan',
                        render: (a) => ((a.total_oblig || 0) / 1e6).toFixed(1),
                      },
                      {
                        key: 'hot',
                        header: '★',
                        headerTip: 'hot_agency',
                        align: 'center',
                        render: (a) => isHotAgency(a)
                          ? <span className="text-neon-magenta">★</span>
                          : <span className="text-text-500">—</span>,
                      },
                      {
                        key: 'cta',
                        header: '',
                        align: 'right',
                        render: (a) => (
                          <button onClick={() => addToBrain(a, a.agency, 'agency')} className="action-btn brain text-[9px] px-1">+brain</button>
                        ),
                      },
                    ]}
                  />
                  {hotAgencyList.length > 0 && (
                    <button onClick={() => hotAgencyList.forEach((a) => addToBrain(a, a.agency, 'agency'))} className="action-btn brain text-[10px] mt-2 self-start">+brain all ★ hot agencies</button>
                  )}
                </div>
              </div>
            </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Money Flows & Share"
              subtitle="Sankey · competitor concentration"
              icon={GitBranch}
              accent="magenta"
              defaultOpen={false}
              titleGlossaryId="follow_the_money"
              onGlossaryLearn={openGlossaryInVault}
            >
            <div className="space-y-4">
            <div className="chart-panel surface-accent-cyan">
              <div className="chart-panel-title cyan">
                <FieldTip termId="follow_the_money" label="Follow the Money (Recipient → Agency → Office)" onLearnMore={openGlossaryInVault} />
                <button onClick={() => setDashTab('competitive')} className="text-[10px] font-normal text-neon-cyan hover:underline">Full table →</button>
              </div>
              {sankeyData.length ? (
                <div className="chart-panel-plot" style={{ height: 260 }}>
                  <Plot
                    data={sankeyData}
                    layout={{ font: { size: 10, color: CHART.fontColor }, paper_bgcolor: CHART.transparent, plot_bgcolor: CHART.transparent, margin: { t: 5, l: 5, r: 5, b: 5 } }}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              ) : <div className="text-sm text-slate-400">Flows appear with more data.</div>}
              {flows.length > 0 && (
                <div className="mt-2 text-[10px] text-text-500">
                  Top flow: <span className="text-white">{flows[0]?.recipient}</span> → {flows[0]?.agency} ({flows[0]?.office}) ${flows[0]?.millions}M
                  <button onClick={() => addToBrain(flows[0], flows[0].recipient, 'competitor')} className="ml-2 text-neon-cyan hover:underline">+brain</button>
                </div>
              )}
            </div>

            <div className="chart-panel surface-accent-magenta">
              <div className="chart-panel-title magenta">
                <FieldTip termId="market_concentration" label="Top Competitors by Market Share" onLearnMore={openGlossaryInVault} />
                <span className="text-[10px] font-mono tabular-nums font-normal">{top3Pct}% in top 3</span>
              </div>
              {topRecipients.length ? (
                <div className="chart-panel-plot" style={{ height: 200 }}>
                  <Plot
                    data={[{
                      type: 'treemap',
                      labels: topRecipients.map((r: any) => (r.recipient || '').slice(0, 26)),
                      values: topRecipients.map((r: any) => r.millions || 0),
                      parents: Array(topRecipients.length).fill(''),
                      textinfo: 'label+value',
                      hovertemplate: '%{label}<br>$%{value}M<extra></extra>',
                    }]}
                    layout={{
                      margin: { t: 2, l: 2, r: 2, b: 2 },
                      paper_bgcolor: CHART.transparent,
                      plot_bgcolor: 'rgba(0,0,0,0)',
                      font: { size: 9, color: CHART.fontColor },
                      uniformtext: { minsize: 8, mode: 'hide' },
                    }}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              ) : <div className="text-sm text-slate-400">Load more data for competitor share treemap.</div>}
              <div className="text-[10px] text-text-500 mt-1">If a few names dominate, relationship mapping + teaming strategy with (or against) them is high-leverage.</div>
              <div className="mt-2">
                <button 
                  onClick={() => {
                    topRecipients.slice(0,3).forEach((r: any) => addToBrain({recipient: r.recipient}, r.recipient, 'competitor'))
                  }} 
                  className="text-[10px] action-btn brain px-2 py-0.5"
                >
                  +brain top 3 from this view
                </button>
              </div>
            </div>
            </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="How Work is Bought"
              subtitle="Pricing types · contract vehicles"
              icon={PieChart}
              accent="lime"
              defaultOpen={false}
              titleGlossaryId="buying_posture"
              onGlossaryLearn={openGlossaryInVault}
            >
            <div className="chart-panel surface-accent-lime border-0 shadow-none p-0 bg-transparent">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pricing pie */}
                <div>
                  <div className="text-xs font-medium text-text-500 mb-1">
                    <FieldTip termId="pricing_bucket" label="Pricing Types (by $M)" showLearnLink={false} />
                  </div>
                  {pricingValues.length ? (
                    <div className="chart-panel-plot" style={{ height: 220 }}>
                      <Plot
                        data={[{
                          type: 'pie',
                          labels: pricingLabels,
                          values: pricingValues,
                          textinfo: 'percent',
                          textposition: 'inside',
                          insidetextorientation: 'radial',
                          textfont: { size: 9, color: CHART.fontColor },
                          hovertemplate: '%{label}<br>$%{value}M (%{percent})<extra></extra>',
                          marker: { colors: ['#00f0ff', '#ff2bd6', '#39ff14', '#facc15', '#a78bfa', '#fb7185'] }
                        }]}
                        layout={{
                          margin: { t: 8, l: 4, r: 4, b: 4 },
                          paper_bgcolor: CHART.transparent,
                          showlegend: true,
                          legend: { font: { size: 9, color: CHART.fontColor }, orientation: 'h', y: -0.05 },
                          font: { size: 9, color: CHART.fontColor },
                          uniformtext: { minsize: 8, mode: 'hide' },
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[220px] flex items-center">No pricing data.</div>}
                </div>

                {/* Vehicles pie */}
                <div>
                  <div className="text-xs font-medium text-text-500 mb-1">
                    <FieldTip termId="idiq_task_order" label="Contract Vehicles / IDV (by $M)" showLearnLink={false} />
                  </div>
                  {vehicleValues.length ? (
                    <div className="chart-panel-plot" style={{ height: 220 }}>
                      <Plot
                        data={[{
                          type: 'pie',
                          labels: vehicleLabels.map((l: string) => l.length > 22 ? `${l.slice(0, 21)}…` : l),
                          values: vehicleValues,
                          textinfo: 'percent',
                          textposition: 'inside',
                          insidetextorientation: 'radial',
                          textfont: { size: 9, color: CHART.fontColor },
                          hovertemplate: '%{label}<br>$%{value}M (%{percent})<extra></extra>',
                          marker: { colors: ['#00f0ff', '#ff2bd6', '#39ff14', '#facc15', '#a78bfa', '#fb7185'] }
                        }]}
                        layout={{
                          margin: { t: 8, l: 4, r: 4, b: 4 },
                          paper_bgcolor: CHART.transparent,
                          showlegend: true,
                          legend: { font: { size: 9, color: CHART.fontColor }, orientation: 'h', y: -0.05 },
                          font: { size: 9, color: CHART.fontColor },
                          uniformtext: { minsize: 8, mode: 'hide' },
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[220px] flex items-center">No vehicle data.</div>}
                </div>
              </div>
              <div className="text-[10px] text-text-500 mt-2">
                See the Vehicles tab for full set-aside mix and detailed vehicle table.
              </div>
            </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Competition & Recompetes"
              subtitle="Set-aside mix · hot agency expirations"
              icon={Crosshair}
              accent="magenta"
              defaultOpen
              titleGlossaryId="set_aside_mix"
              onGlossaryLearn={openGlossaryInVault}
            >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="chart-panel surface-accent-cyan min-w-0">
                <div className="chart-panel-title cyan">
                  <FieldTip termId="set_aside_mix" label="Competition Mix (Set-Asides)" onLearnMore={openGlossaryInVault} />
                </div>
                <div className="chart-panel-sub">Top set-aside categories by obligated dollars — compact labels, hover for full text.</div>
                <SetAsideBarChart data={setAsidePulse} compact />
                <button onClick={() => setDashTab('vehicles')} className="text-[10px] text-neon-cyan hover:underline mt-2">Full vehicle analysis →</button>
              </div>

              <div className="chart-panel surface-accent-magenta min-w-0">
                <div className="chart-panel-title magenta">
                  <FieldTip termId="recompete_radar" label="Hot Recompetes in Focus Agencies" onLearnMore={openGlossaryInVault} />
                </div>
                <div className="chart-panel-sub">Expiring awards in high-intensity customer agencies.</div>
                {comboExpiring.length ? (
                  <div className="space-y-1.5">
                    {comboExpiring.slice(0, 4).map((e, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-edge/60">
                        <div className="min-w-0 truncate">
                          <span className="text-text-primary">{e.recipient}</span>
                          <span className="text-text-500"> @ {e.agency}</span>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-neon-cyan tabular-nums">${((e.obligation || 0) / 1e6).toFixed(1)}M</span>
                          <button onClick={() => setDashTab('opportunities')} className="text-[9px] text-text-500 hover:text-neon-cyan">{e.end_date?.slice(0, 7)}</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setDashTab('opportunities')} className="action-btn pipeline text-[10px] mt-2">View all + create SAM monitors →</button>
                  </div>
                ) : (
                  <div className="text-xs text-text-500">No expiring awards in hot agencies in current slice. Add brain entries or check Future Opportunities for full radar.</div>
                )}
              </div>
            </div>
            </CollapsibleSection>

            <CollapsibleSection title="Capture Guidance" subtitle="How to use this tab" icon={Lightbulb} accent="none" defaultOpen={false}>
            <div className="space-y-2">
            <div className="insight">
              <strong className="text-text-primary">What this tab tells you:</strong> Total market size, whether spend is growing or shrinking, which agencies and competitors matter, and how work is bought. This is your 60-second capture pulse before customer calls or pipeline reviews.
            </div>
            <div className="insight magenta">
              <strong className="text-text-primary">Act today:</strong> +brain hot agencies and top competitors from this view. They compound in Knowledge Vault and feed your co-pilot. Use Future Opportunities for expiring work and SAM monitors.
            </div>
            <div className="insight lime">
              <strong className="text-text-primary">Go deeper next:</strong> Agency Intelligence tab — engagement notes and lead development on the high-intensity customers surfaced above. (Next polish target.)
            </div>
            <div className="insight vault">
              <strong className="text-text-primary">Suitability &amp; Synergy (vision stubs):</strong> These KPIs will activate when global wiki domain intel + company capabilities are built. Suitability = does this contract/agency fit <em>your</em> BU? Synergy = can <em>other</em> BUs strengthen the pursuit? Future research/web-scraping profile building feeds the match.
            </div>
            </div>
            </CollapsibleSection>
          </div>
        )
      }

      case 'opportunities': {
        const anchorStateCodes = (geographicAnalysis?.map_states || []).slice(0, 5).map((s) => s.state)
        const resolvedOpp = (opportunitiesIntel?.rows?.length
          ? opportunitiesIntel
          : buildClientOpportunitiesIntel({
              expiring,
              intensity,
              topRecipients,
              anchorStates: anchorStateCodes,
              pipeline,
              brainNames: brain.map((b: { name?: string }) => b.name || ''),
            }))
        const oppRows = resolvedOpp.rows || []
        const oppSummary = resolvedOpp.summary || {}
        const oppFromFallback = !opportunitiesIntel?.rows?.length && oppRows.length > 0
        const oppRowKey = (e: OpportunityRow, i: number) =>
          e.award_key || `${e.recipient}-${e.end_date}-${i}`
        const filteredOpp = oppRows.filter((e: OpportunityRow) => {
          const matchesSearch =
            !oppSearch ||
            (e.recipient || '').toLowerCase().includes(oppSearch.toLowerCase()) ||
            (e.agency || '').toLowerCase().includes(oppSearch.toLowerCase())
          const matchesTier = oppTierFilter === 'all' || e.combo_tier === oppTierFilter
          return matchesSearch && matchesTier
        })
        const samMonitorCount = pipeline.filter((p: { type?: string }) => p.type === 'sam-monitor').length
        const tierFilters: { id: 'all' | ComboTier; label: string; hint: string }[] = [
          { id: 'all', label: 'All', hint: 'Show every ranked contract' },
          { id: 'prime', label: 'Prime', hint: COMBO_TIER_META.prime.hint },
          { id: 'advance', label: 'Advance', hint: COMBO_TIER_META.advance.hint },
          { id: 'monitor', label: 'Monitor', hint: COMBO_TIER_META.monitor.hint },
        ]
        return (
          <div className="page-sections">
            <ReadinessStrip readiness={readiness} />

            <div className="opp-summary-grid">
              <MetricCard
                label="Contracts ranked"
                value={String(oppSummary.row_count ?? filteredOpp.length)}
                accent="magenta"
                glossaryId="recompete_radar"
                onGlossaryLearn={openGlossaryInVault}
              />
              <MetricCard
                label="At hot buyers"
                value={String(oppSummary.hot_agency_count ?? 0)}
                accent="magenta"
                glossaryId="hot_agency"
                onGlossaryLearn={openGlossaryInVault}
              />
              <MetricCard
                label="In your vault"
                value={String(oppSummary.brain_overlap ?? 0)}
                accent="lime"
                glossaryId="customer_position"
                onGlossaryLearn={openGlossaryInVault}
              />
              <MetricCard
                label="Hot, no SAM search"
                value={String(oppSummary.no_monitor_hot ?? 0)}
                accent="amber"
                glossaryId="sam_search_saved"
                onGlossaryLearn={openGlossaryInVault}
              />
              <MetricCard
                label="Top-priority $"
                value={`$${Number(oppSummary.prime_millions ?? 0).toFixed(1)}M`}
                accent="cyan"
                glossaryId="combo_tier"
                onGlossaryLearn={openGlossaryInVault}
              />
            </div>

            <CollapsibleSection
              title="Recompete Radar"
              subtitle={`${filteredOpp.length} shown · ${oppRows.length} scored · 36mo horizon`}
              icon={Radar}
              accent="magenta"
              defaultOpen
              titleGlossaryId="recompete_radar"
              onGlossaryLearn={openGlossaryInVault}
              badge={
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToPipeline({ label: 'expiring batch' }, 'expiring') }}
                  className="action-btn pipeline flex items-center gap-1 px-2 py-0.5 text-[10px] shrink-0"
                >
                  <Plus size={12} /> Batch
                </button>
              }
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  value={oppSearch}
                  onChange={(e) => setOppSearch(e.target.value)}
                  placeholder="Filter recipient or agency…"
                  className="input-field flex-1 min-w-[180px]"
                />
                <div className="flex flex-wrap gap-1">
                  {tierFilters.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.hint}
                      onClick={() => setOppTierFilter(t.id)}
                      className={`filter-pill ${oppTierFilter === t.id ? 'filter-pill-active' : ''}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {(oppSearch || oppTierFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setOppSearch(''); setOppTierFilter('all') }}
                    className="pill text-[10px] text-neon-cyan hover:border-neon-cyan/50"
                  >
                    Clear
                  </button>
                )}
              </div>
              {(resolvedOpp.meta?.proactive_sam?.enabled || oppFromFallback) && (
                <div className={`text-[10px] mb-2 ${oppFromFallback ? 'text-neon-amber' : 'text-text-500'}`}>
                  {resolvedOpp.meta?.proactive_sam?.enabled
                    ? `Live SAM hits on top ${resolvedOpp.meta.proactive_sam.rows_targeted} rows.`
                    : resolvedOpp.meta?.scoring_note}
                </div>
              )}
              {filteredOpp.length === 0 ? (
                <div className="chart-module-empty">No recompetes match your filter.</div>
              ) : (
                <RecompeteRadarTable
                  rows={filteredOpp.slice(0, 12)}
                  expandedKey={oppExpandedKey}
                  rowKey={oppRowKey}
                  isHotAgency={(agency) => hotAgencies.has(agency)}
                  onToggleExpand={(key) => setOppExpandedKey(oppExpandedKey === key ? null : key)}
                  onTrack={(e) => addToPipeline(e, 'expiring')}
                  onOpenWorkspace={openSkillWorkspace}
                  onGlossaryLearn={openGlossaryInVault}
                  renderExpandedActions={(e) => (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            setLoading(true)
                            const res = await fetch('/user/actions/create-sam-monitor', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ item: e, naics, brain, use_llm: false }),
                            })
                            if (res.ok) {
                              const data = await res.json()
                              await syncAccumulators()
                              showToast(`Monitor: ${data.entry?.title || 'created'}`, 'success')
                            }
                          } finally {
                            setLoading(false)
                          }
                        }}
                        className="action-btn pipeline text-xs"
                      >
                        + Save SAM search
                      </button>
                      <button
                        onClick={() => {
                          setSamKeywords(e.suggested_sam_keywords || e.agency || e.recipient || '')
                          setSamNoticeTypes(e.suggested_notice_types || 'RFI,Sources Sought,Special Notice,Presolicitation')
                          searchSamLive()
                        }}
                        className="action-btn ghost text-xs"
                      >
                        Search SAM.gov
                      </button>
                      <AskCoPilotButton
                        prompt={`Scored recompete (${e.tier_label || e.combo_tier}, score ${e.display_score}): ${e.recipient || 'unknown'} at ${e.agency || 'unknown'} ends ${e.end_date} ($${(e.obligation_millions ?? 0).toFixed(1)}M). What capture moves should I prioritize?`}
                        onAsk={askCoPilot}
                      />
                      {e.pursuit_brief_path && (
                        <button
                          onClick={() => openArtifactPath(e.pursuit_brief_path!, e.pursuit_slug)}
                          className="action-btn ghost text-xs"
                        >
                          Open vault brief
                        </button>
                      )}
                    </>
                  )}
                />
              )}
              <div className="text-[10px] text-text-500 mt-2">
                Hover <strong className="text-text-primary">+ Track</strong> for what Pipeline means.
                <strong className="text-text-primary"> Workspace</strong> opens pursuit skills and vault briefs for one row.
                Click <strong className="text-text-primary">+N more reasons</strong> to see every ranking signal.
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="How scoring works"
              subtitle="Deterministic ranking · no LLM required"
              icon={Lightbulb}
              accent="none"
              defaultOpen={false}
              titleGlossaryId="combo_tier"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight magenta mb-2">
                Rows rank by USASpending intersections (hot agency, incumbent, timing, value). Brain overlap and existing monitors adjust priority. SAM monitors seed from agency + incumbent without an API call.
              </div>
              {(resolvedOpp.meta?.scoring_note) && (
                <div className={`text-[10px] ${oppFromFallback ? 'text-neon-amber' : 'text-text-500'}`}>
                  {resolvedOpp.meta.scoring_note}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Live SAM Discovery"
              subtitle="RFIs · Sources Sought · emerging work"
              icon={Search}
              accent="cyan"
              defaultOpen={false}
              titleGlossaryId="sam_live_discovery"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
                <span className="text-text-500 mr-1 self-center">Example prompts for the co-pilot (drives MCP for you):</span>
                <button type="button" onClick={() => askCoPilot('Search SAM for live RFI/Sources Sought/Special Notice matching the agencies and recipients in my Brain and the expiring contracts. Then propose 2-3 to create monitors for and add to pipeline.', true)} className="filter-pill">Search SAM for my Brain + expiring</button>
                <button type="button" onClick={() => askCoPilot('Using my current hot agencies from intensity and Brain, find any new CSO/OTA or open solicitation on SAM and suggest monitors.', true)} className="filter-pill">Find new work for hot agencies</button>
              </div>
              <div className="insight">
                USASpending tells you the historical cycles and who wins recurring work. SAM.gov is where the actual RFIs, Sources Sought, Special Notices, and eventual RFPs appear — plus brand new work (CSOs, OTAs, open solicitations, traditional FAR requirements with no prior history). Use the expiring list above to seed searches for "the known universe", then discover net-new.
                <span className="block mt-1 text-neon-lime">The co-pilot (chat) is the intended way to drive these searches and create monitors via MCP — tell it in natural language what you want researched/monitored. Manual controls here are escape hatches.</span>
              </div>
              <div className="flex gap-2 mb-2 flex-wrap">
                <input
                  value={samKeywords}
                  onChange={(e) => setSamKeywords(e.target.value)}
                  placeholder="Keywords (agency, recipient, facilities support…)"
                  className="input-field flex-1 min-w-[200px]"
                />
                <input
                  value={samNoticeTypes}
                  onChange={(e) => setSamNoticeTypes(e.target.value)}
                  placeholder="Notice types (comma separated)"
                  className="input-field w-72"
                />
                <Button variant="primary" onClick={searchSamLive} disabled={loading}>Search SAM</Button>
                <Button variant="soft" onClick={() => {
                  const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(samKeywords)}&naics=${naics}${samNoticeTypes ? '&noticeType=' + encodeURIComponent(samNoticeTypes) : ''}`
                  addToPipeline({ title: `SAM Monitor: ${samKeywords || 'custom'}`, agency: 'Custom', monitorUrl, notes: `Notice types: ${samNoticeTypes}` }, 'sam-monitor')
                }}>Create custom monitor</Button>
              </div>
              <div className="flex flex-wrap gap-1 mb-2 text-xs">
                {['RFI','Sources Sought','Special Notice','Presolicitation','Solicitation'].map(t => (
                  <button key={t} type="button" onClick={() => {
                    const current = samNoticeTypes.split(',').map(s=>s.trim()).filter(Boolean);
                    if (!current.includes(t)) setSamNoticeTypes([...current, t].join(','));
                  }} className="filter-pill">{t}</button>
                ))}
              </div>
              <div className="text-[10px] text-text-500 mb-2">Tip: Primary path = tell the AI Co-pilot (e.g. "search SAM for hot agencies in my vault and expiring cycles, create monitors for relevant RFIs"). It will use available MCP tools under the hood and surface +pipeline actions. The controls below and "Search SAM for this" are manual escape hatches. (To enable richer live MCP: run `uvx sam-gov-mcp` in another terminal.)</div>
              <DataTable
                data={samResults}
                rowKey={(s: any, i) => s.noticeId || s.title || i}
                emptyMessage="No SAM results yet — enter keywords and search (requires SAM_API_KEY on backend)."
                columns={[
                  {
                    key: 'title',
                    header: 'Notice',
                    render: (s: any) => <span className="truncate max-w-[220px] block" title={s.title}>{s.title}</span>,
                  },
                  { key: 'type', header: 'Type', cellClassName: 'text-text-400 text-xs', render: (s: any) => s.noticeType || '—' },
                  { key: 'deadline', header: 'Due', cellClassName: 'text-xs', render: (s: any) => s.responseDeadLine || '—' },
                  { key: 'agency', header: 'Agency', cellClassName: 'text-neon-cyan text-xs', render: (s: any) => (s.agency || '').slice(0, 20) },
                  {
                    key: 'source',
                    header: 'Src',
                    cellClassName: 'text-[9px] text-text-500',
                    render: (s: any) => (s._source?.startsWith('mcp') ? 'MCP' : s._source ? 'API' : ''),
                  },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (s: any) => (
                      <div className="row-actions">
                        {s.link && (
                          <a href={s.link} target="_blank" rel="noopener" className="text-xs text-neon-cyan hover:underline">
                            sam.gov ↗
                          </a>
                        )}
                        <button onClick={() => addToPipeline(s, 'sam-opp')} className="action-btn pipeline text-xs">+ pipeline</button>
                        <AskCoPilotButton
                          prompt={`Evaluate this SAM notice for NAICS ${naics}: "${s.title}" (${s.noticeType || 'unknown type'}) at ${s.agency || 'unknown agency'}. Fit, risks, and next capture steps?`}
                          onAsk={askCoPilot}
                        />
                        <button
                          onClick={async () => {
                            try {
                              setLoading(true)
                              const res = await fetch('/user/actions/create-sam-monitor', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ item: s, naics, brain, use_llm: useSmartModel }),
                              })
                              if (res.ok) {
                                const d = await res.json()
                                await syncAccumulators()
                                showToast(`Monitor created: ${d.entry?.title || s.title}`, 'success')
                              } else {
                                const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(samKeywords || s.title || '')}&naics=${naics}${samNoticeTypes ? '&noticeType=' + encodeURIComponent(samNoticeTypes) : ''}`
                                addToPipeline({ ...s, type: 'sam-monitor', monitorUrl, notes: `Monitor for: ${samKeywords || 'cycle'} | ${s.agency}` }, 'sam-monitor')
                              }
                            } catch {
                              const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(samKeywords || s.title || '')}&naics=${naics}${samNoticeTypes ? '&noticeType=' + encodeURIComponent(samNoticeTypes) : ''}`
                              addToPipeline({ ...s, type: 'sam-monitor', monitorUrl, notes: `Monitor for: ${samKeywords || 'cycle'} | ${s.agency}` }, 'sam-monitor')
                            } finally {
                              setLoading(false)
                            }
                          }}
                          className="action-btn pipeline text-xs"
                          title="Agent builds smart monitor from this result + Brain"
                        >
                          Monitor
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
              <div className="text-[10px] text-text-500 mt-2">Results via /mcp/sam (MCP when available). Chat also works for open-ended discovery.</div>
            </CollapsibleSection>

            <CollapsibleSection
              title="SAM Monitors"
              subtitle="Saved searches from smart monitor creation"
              icon={Clock}
              accent="magenta"
              defaultOpen={samMonitorCount > 0}
              badge={samMonitorCount > 0 ? <span className="pill text-[10px]">{samMonitorCount}</span> : undefined}
            >
                <DataTable
                  data={pipeline.filter((p: any) => p.type === 'sam-monitor')}
                  rowKey={(m: any) => m.id || m.ts}
                  emptyMessage="No monitors yet — create from SAM results or expiring rows."
                  columns={[
                    {
                      key: 'title',
                      header: 'Monitor',
                      render: (m: any) => m.title || m.monitorUrl || 'SAM Monitor',
                    },
                    { key: 'agency', header: 'Agency', cellClassName: 'text-xs text-text-400', render: (m: any) => m.agency || '—' },
                    {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      render: (m: any) => (
                        <div className="row-actions">
                          {m.monitorUrl && (
                            <a href={m.monitorUrl} target="_blank" rel="noopener" className="text-xs text-neon-cyan hover:underline">
                              Open SAM ↗
                            </a>
                          )}
                          <button onClick={() => removeFromPipeline(m.id || m.ts)} className="action-btn destructive text-xs">
                            remove
                          </button>
                        </div>
                      ),
                    },
                  ]}
                />
            </CollapsibleSection>

            <CollapsibleSection title="My Focus" subtitle="Brain · wiki · monitors · hot agencies" icon={Eye} accent="lime" defaultOpen={false}>
                <div className="text-[10px] text-text-500 mb-2">Client-side intersections from Brain, wiki excerpts, monitors, and loaded data.</div>
                {(() => {
                  const brainLower = brain.map((b: any) => (b.name || '').toLowerCase().slice(0, 15));
                  // Also pull keywords from the native wiki .md excerpts (the synthesized content) so My Focus benefits from the foundation we just built.
                  const wikiLower = (brainWiki || []).flatMap((w: any) => [
                    (w.name || '').toLowerCase().slice(0, 15),
                    (w.excerpt || w.content || '').toLowerCase().slice(0, 60)
                  ]).filter(Boolean);

                  const allBrain = [...brainLower, ...wikiLower];

                  const brainMatchedExpiring = expiring.filter((e: any) => {
                    const r = (e.recipient || '').toLowerCase().slice(0,15);
                    const a = (e.agency || '').toLowerCase().slice(0,15);
                    return allBrain.some((bl: string) => r.includes(bl) || a.includes(bl) || bl.includes(r) || bl.includes(a));
                  }).slice(0,4);

                  const smartMonitors = pipeline.filter((p: any) => p.type === 'sam-monitor');
                  const monitorOverlaps = smartMonitors.filter((m: any) => {
                    const mName = (m.agency || m.title || '').toLowerCase().slice(0,15);
                    return allBrain.some((bl: string) => mName.includes(bl) || bl.includes(mName)) ||
                           hotAgencies.has(m.agency || '') ||
                           expiring.some((e: any) => (e.agency || '').toLowerCase().includes(mName));
                  }).slice(0,3);

                  const brainHotAgencies = intensity.filter((a: any) => {
                    const name = (a.agency || '').toLowerCase().slice(0,15);
                    return allBrain.some((bl: string) => name.includes(bl) || bl.includes(name));
                  }).slice(0,3);

                  return (
                    <div className="space-y-2 text-xs">
                      {brainMatchedExpiring.length > 0 && (
                        <div>
                          <div className="font-medium mb-0.5">Expiring that match your Brain / wiki:</div>
                          {brainMatchedExpiring.map((e: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 pl-2">
                              <span>{e.recipient || '—'} @ {e.agency} (ends {e.end_date})</span>
                              <button onClick={() => addToPipeline(e, 'expiring-from-focus')} className="text-neon-cyan hover:underline">+ pipeline</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {monitorOverlaps.length > 0 && (
                        <div>
                          <div className="font-medium mb-0.5">Your smart monitors overlapping Brain / wiki / hot / expiring:</div>
                          {monitorOverlaps.map((m: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 pl-2">
                              <span>{m.title || m.agency}</span>
                              {m.monitorUrl && <a href={m.monitorUrl} target="_blank" className="text-neon-cyan hover:underline">open ↗</a>}
                            </div>
                          ))}
                        </div>
                      )}
                      {brainHotAgencies.length > 0 && (
                        <div>
                          <div className="font-medium mb-0.5">Hot agencies already in your Brain / wiki:</div>
                          {brainHotAgencies.map((a: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 pl-2">
                              <span>{a.agency} — {a.award_count} actions, ${(a.total_oblig||0)/1e6}M</span>
                              <button onClick={() => addToBrain(a, a.agency, 'agency')} className="text-neon-lime hover:underline">+ brain (already tracked)</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {brainMatchedExpiring.length === 0 && monitorOverlaps.length === 0 && brainHotAgencies.length === 0 && (
                        <div className="text-slate-400">Add a few items to Brain (or create smart monitors) to see intersections here. The view also uses your wiki .md excerpts now.</div>
                      )}
                    </div>
                  );
                })()}
            </CollapsibleSection>
          </div>
        )
      }

      case 'agency': {
        const agencyMedians = { actions: medIntensityActions, oblig: medIntensityOblig }
        const totalAgencyOblig = intensity.reduce((s, a) => s + (a.total_oblig || 0), 0) || 1
        const agencyFlowByAgency = summarizeAgencyFlows(flows)
        const brainAgencyNames = new Set(
          brain.filter((b: any) => b.type === 'agency').map((b: any) => (b.name || '').toLowerCase()),
        )
        const isAgencyInBrain = (name: string) => {
          const n = name.toLowerCase()
          return brainAgencyNames.has(n) || brain.some((b: any) => {
            const bn = (b.name || '').toLowerCase()
            return bn && (bn.includes(n.slice(0, 18)) || n.includes(bn.slice(0, 18)))
          })
        }
        const recompetesByAgency = new Map<string, { count: number; millions: number }>()
        expiring.forEach((e: any) => {
          const ag = e.agency || ''
          if (!ag) return
          const cur = recompetesByAgency.get(ag) || { count: 0, millions: 0 }
          cur.count += 1
          cur.millions += (e.obligation || 0) / 1e6
          recompetesByAgency.set(ag, cur)
        })
        const agencyIntelRows = intensity.map((a) => {
          const quadrant = getAgencyQuadrant(a.award_count || 0, a.total_oblig || 0, agencyMedians)
          const inBrain = isAgencyInBrain(a.agency)
          const recomp = recompetesByAgency.get(a.agency) || { count: 0, millions: 0 }
          const flow = agencyFlowByAgency.get(a.agency)
          const sharePct = Math.round(((a.total_oblig || 0) / totalAgencyOblig) * 100)
          const qualGate = getQualGate({
            isHot: quadrant === 'hot',
            inBrain,
            recompeteCount: recomp.count,
            sharePct,
          })
          const position = getCustomerPosition(inBrain, recomp.count, quadrant === 'hot')
          return { ...a, quadrant, inBrain, recomp, flow, sharePct, qualGate, position }
        })
        const filteredAgencyRows = agencyIntelRows.filter((a) =>
          !agencySearch || a.agency.toLowerCase().includes(agencySearch.toLowerCase()),
        )
        const trackedCount = agencyIntelRows.filter((a) => a.inBrain).length
        const agencyScatterData = intensity.map((a) => ({
          x: a.award_count || 0,
          y: a.total_oblig || 0,
          z: Math.max(35, Math.min(220, (a.avg_award || 0) / 15000)),
          name: a.agency,
          isHot: isHotAgency(a),
        }))
        const topAgencyShare = agencyIntelRows[0]?.sharePct ?? 0
        const relationshipSource: RelationshipRow[] = agencyRelationships.length
          ? agencyRelationships
          : flows.map((f) => ({
              agency: f.agency,
              recipient: f.recipient,
              actions: f.actions,
              millions: f.millions,
            }))
        const relationshipHeatmap = buildRelationshipHeatmap(relationshipSource)
        const marketingSkillStubs = [
          { id: 'value-propositions', label: 'Value propositions', note: 'Outcome-led hooks per agency mission' },
          { id: 'positioning', label: 'Positioning', note: 'Differentiation vs incumbents at this buyer' },
          { id: 'messaging', label: 'Messaging', note: 'Talk tracks for KO / program office' },
          { id: 'customer-research', label: 'Customer research', note: 'Pain points, budget drivers, timing' },
          { id: 'competitor-analysis', label: 'Competitor profiling', note: 'Strengths, vehicles, teaming posture' },
          { id: 'sales-enablement', label: 'Sales enablement', note: 'Battlecards, objection handling' },
          { id: 'pricing', label: 'Pricing', note: 'Rate realism + competitive price-to-win' },
          { id: 'cro', label: 'CRO', note: 'Capture funnel moves that advance position' },
        ]
        const mcpResearchStubs = [
          { label: 'Agency org map', mcp: 'SAM.gov', status: 'Ready' },
          { label: 'Bill payer vs KO office', mcp: 'USASpending.gov', status: 'Catalog' },
          { label: 'Subordinate offices', mcp: 'SAM.gov', status: 'Ready' },
          { label: 'Incumbent deep dive', mcp: 'USASpending.gov', status: 'Catalog' },
        ]

        return (
          <div className="page-sections">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
              <MetricCard label="Hot agencies" value={String(hotAgencyList.length)} accent="magenta" glossaryId="hot_agency" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="In vault" value={String(trackedCount)} accent="purple" glossaryId="customer_position" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Hot recompetes" value={String(comboExpiring.length)} accent="lime" glossaryId="hot_agency_recompete" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Top agency share" value={`${topAgencyShare}%`} accent="cyan" glossaryId="market_concentration" onGlossaryLearn={openGlossaryInVault} />
            </div>

            <CollapsibleSection
              title="Relationship Heatmap"
              subtitle="Agency × competitor · award count strength"
              icon={Target}
              accent="magenta"
              defaultOpen={relationshipHeatmap.agencies.length > 0}
              titleGlossaryId="relationship_heatmap"
              onGlossaryLearn={openGlossaryInVault}
              badge={relationshipHeatmap.maxActions > 1 ? (
                <span className="pill text-[10px]">max {relationshipHeatmap.maxActions} awards</span>
              ) : undefined}
            >
              <div className="insight magenta mb-3">
                Darker cells = more awards between buyer and prime — a proxy for entrenched relationships. Use before teaming or price-to-win decisions.
              </div>
              <RelationshipHeatmap
                model={relationshipHeatmap}
                onAgencyClick={navigateToAgencyOpportunities}
                onCellClick={(agency, recipient, actions) => {
                  addToBrain(
                    { agency, recipient, actions, notes: `${actions} awards at ${agency}` },
                    recipient,
                    'competitor',
                  )
                }}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Capture Intensity"
              subtitle="Volume vs value · median quadrants"
              icon={Crosshair}
              accent="cyan"
              defaultOpen
              titleGlossaryId="capture_intensity"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight mb-3">
                Original Data Insights scatter: agencies above <strong className="text-text-primary">both</strong> median action count and median obligations = dedicated BD targets. Pink dots = hot quadrant.
              </div>
              <div className="chart-panel surface-accent-lime border-0 shadow-none p-0 bg-transparent min-w-0">
                {intensity.length ? (
                  <div className="chart-module" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                        <CartesianGrid stroke={CHART.gridStroke} />
                        <XAxis type="number" dataKey="x" name="Actions" stroke={CHART.axisStroke} tick={CHART.axisTickSm}
                          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                        <YAxis type="number" dataKey="y" name="Obligations" stroke={CHART.axisStroke} tick={CHART.axisTickSm} width={48}
                          tickFormatter={(v) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v}`} />
                        <ZAxis type="number" dataKey="z" range={[40, 200]} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                          if (!payload?.length) return null
                          const d = payload[0].payload
                          return (
                            <div className="chart-tooltip">
                              <div style={{ fontWeight: 600 }}>{d.name}</div>
                              <div>Actions: {d.x.toLocaleString()}</div>
                              <div>Obligations: ${(d.y / 1e6).toFixed(1)}M</div>
                              {d.isHot && <div className="text-neon-magenta">★ Hot</div>}
                            </div>
                          )
                        }} />
                        <ReferenceLine x={medIntensityActions} stroke={CHART.colors.magenta} strokeDasharray="3 3" />
                        <ReferenceLine y={medIntensityOblig} stroke={CHART.colors.cyan} strokeDasharray="3 3" />
                        <Scatter data={agencyScatterData}>
                          {agencyScatterData.map((entry, index) => (
                            <Cell key={`agency-scatter-${index}`} fill={entry.isHot ? CHART.colors.magenta : CHART.colors.cyan} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="chart-module-empty">Need agency data in current NAICS slice.</div>
                )}
                <div className="text-[10px] text-text-500 mt-2">Magenta/cyan reference lines = medians. Bubble size ≈ avg award.</div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Agency Rankings"
              subtitle={`${filteredAgencyRows.length} agencies · qualify & engage`}
              icon={Users}
              accent="cyan"
              defaultOpen
              titleGlossaryId="qual_gate"
              onGlossaryLearn={openGlossaryInVault}
              badge={hotAgencyList.length > 0 ? <span className="pill text-[10px]">{hotAgencyList.length} hot</span> : undefined}
            >
              <input
                value={agencySearch}
                onChange={(e) => setAgencySearch(e.target.value)}
                placeholder="Filter agencies…"
                className="input-field mb-2 w-full max-w-md"
              />
              <DataTable
                data={filteredAgencyRows}
                rowKey={(a) => a.agency}
                rowClassName={(a) => a.quadrant === 'hot' ? 'intensity-row-hot' : ''}
                emptyMessage="No agencies match filter."
                onGlossaryLearn={openGlossaryInVault}
                columns={[
                  {
                    key: 'agency',
                    header: 'Agency',
                    cellClassName: 'max-w-[160px]',
                    render: (a) => (
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => navigateToAgencyOpportunities(a.agency)}
                            className="truncate text-left text-neon-cyan hover:underline"
                            title={`Filter Future Opportunities for ${a.agency}`}
                          >
                            {a.agency}
                          </button>
                          {a.inBrain && <span className="text-neon-lime text-[9px] shrink-0">🧠</span>}
                          <button
                            type="button"
                            onClick={() => navigateToAgencyOpportunities(a.agency)}
                            className="text-text-500 hover:text-neon-cyan shrink-0"
                            title="Link filter → Future Opportunities"
                          >
                            <Link2 size={10} />
                          </button>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'quadrant',
                    header: 'Quad',
                    headerTip: 'hot_agency',
                    cellClassName: 'whitespace-nowrap text-[10px]',
                    render: (a) => (
                      <span className={QUADRANT_META[a.quadrant].tone} title={QUADRANT_META[a.quadrant].label}>
                        {QUADRANT_META[a.quadrant].short}{a.quadrant === 'hot' ? ' ★' : ''}
                      </span>
                    ),
                  },
                  {
                    key: 'gate',
                    header: 'Gate',
                    headerTip: 'qual_gate',
                    cellClassName: 'whitespace-nowrap text-[10px]',
                    render: (a) => (
                      <span className={QUAL_GATE_META[a.qualGate].tone} title={getGlossaryTip('qual_gate')}>
                        {QUAL_GATE_META[a.qualGate].label}
                      </span>
                    ),
                  },
                  {
                    key: 'stats',
                    header: 'Vol',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (a) => `${a.award_count?.toLocaleString()} · $${((a.total_oblig || 0) / 1e6).toFixed(1)}M`,
                  },
                  {
                    key: 'recomp',
                    header: 'Recomp',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (a) => a.recomp.count > 0
                      ? <span className="text-neon-magenta">{a.recomp.count}</span>
                      : <span className="text-text-500">—</span>,
                  },
                  {
                    key: 'incumbent',
                    header: 'Top winner',
                    cellClassName: 'max-w-[120px] truncate text-[10px] text-text-400',
                    render: (a) => a.flow
                      ? <span title={a.flow.topRecipient}>{a.flow.topRecipient.slice(0, 16)}</span>
                      : '—',
                  },
                  {
                    key: 'notes',
                    header: 'Notes',
                    cellClassName: 'min-w-[140px] max-w-[200px]',
                    render: (a) => (
                      <AgencyNoteInline
                        value={(findAgencyBrainEntry(a.agency)?.notes as string) || ''}
                        onSave={(notes) => saveAgencyInlineNote(a.agency, notes, a)}
                      />
                    ),
                  },
                  {
                    key: 'cta',
                    header: '',
                    align: 'right',
                    render: (a) => (
                      <div className="row-actions">
                        <button onClick={() => addToBrain(a, a.agency, 'agency')} className="action-btn brain text-xs">+ brain</button>
                        <AskCoPilotButton
                          prompt={`Shipley-style capture plan for ${a.agency}: ${a.award_count} actions, $${((a.total_oblig || 0) / 1e6).toFixed(1)}M in NAICS ${naics}. ${a.recomp.count} recompetes. Top incumbent: ${a.flow?.topRecipient || 'unknown'}. Customer position: ${CUSTOMER_POSITION_META[a.position].label}. What customer interface moves and win strategy themes should I pursue in the next 30 days?`}
                          label="Plan"
                          onAsk={askCoPilot}
                        />
                      </div>
                    ),
                  },
                ]}
              />
              {hotAgencyList.length > 0 && (
                <button
                  onClick={() => hotAgencyList.slice(0, 5).forEach((a) => addToBrain(a, a.agency, 'agency'))}
                  className="action-btn brain text-[10px] mt-2"
                >
                  +brain all ★ hot agencies
                </button>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Customer Engagement"
              subtitle="Shipley · unknown → favored"
              icon={UserCheck}
              accent="purple"
              defaultOpen={hotAgencyList.length > 0}
              titleGlossaryId="customer_position"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight vault mb-3">
                <strong className="text-text-primary">Shipley principle:</strong> influence the customer early — progress from unknown to favored using customer assessment, competitive intel, and data (not gut feel). Qualify early &amp; often at decision gates.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                {(Object.keys(CUSTOMER_POSITION_META) as Array<keyof typeof CUSTOMER_POSITION_META>).map((key) => {
                  const count = agencyIntelRows.filter((a) => a.position === key).length
                  return (
                    <div key={key} className="market-stat-chip">
                      <div className="label">{CUSTOMER_POSITION_META[key].label}</div>
                      <div className="value text-base">{count}</div>
                      <div className="text-[9px] text-text-500 mt-0.5 leading-snug">{CUSTOMER_POSITION_META[key].shipley}</div>
                    </div>
                  )
                })}
              </div>
              {hotAgencyList.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-500">Hot agency next steps</div>
                  {hotAgencyList.slice(0, 4).map((a) => {
                    const row = agencyIntelRows.find((r) => r.agency === a.agency)
                    const q = row ? QUADRANT_META[row.quadrant] : QUADRANT_META.hot
                    return (
                      <div key={a.agency} className="tool-card">
                        <div className="tool-card-name truncate" title={a.agency}>{a.agency}</div>
                        <div className="tool-card-desc">{q.shipleyHint}</div>
                        {row && row.recomp.count > 0 && (
                          <div className="text-[10px] text-neon-magenta mt-1">{row.recomp.count} recompetes · ${row.recomp.millions.toFixed(1)}M at risk</div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {!row?.inBrain && (
                            <button onClick={() => addToBrain(a, a.agency, 'agency')} className="action-btn brain text-[10px]">+brain (move to known)</button>
                          )}
                          <button onClick={() => navigateToAgencyOpportunities(a.agency)} className="text-[10px] text-neon-cyan hover:underline">Recompetes at agency →</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-xs text-text-500">No hot-quadrant agencies in this slice yet. Ingest more bulk data or widen NAICS.</div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Hot Agency Recompetes"
              subtitle="Combo signal · expiring at hot buyers"
              icon={Clock}
              accent="magenta"
              defaultOpen={comboExpiring.length > 0}
              titleGlossaryId="recompete_radar"
              onGlossaryLearn={openGlossaryInVault}
              badge={comboExpiring.length > 0 ? <span className="pill text-[10px]">{comboExpiring.length}</span> : undefined}
            >
              <div className="insight magenta mb-3">
                Highest-leverage timing: recompetes where the buyer already spends heavily in your NAICS. Shipley: qualify on customer assessment + competitive intel before advancing.
              </div>
              {comboExpiring.length ? (
                <DataTable
                  data={comboExpiring.slice(0, 8)}
                  rowKey={(e, i) => e.award_key || `${e.recipient}-${e.end_date}-${i}`}
                  rowClassName={() => 'intensity-row-hot'}
                  columns={[
                    { key: 'agency', header: 'Agency', cellClassName: 'text-neon-cyan text-xs max-w-[140px] truncate', render: (e) => <span title={e.agency}>{e.agency}</span> },
                    { key: 'recipient', header: 'Incumbent', cellClassName: 'max-w-[140px] truncate', render: (e) => <span title={e.recipient}>{e.recipient || '—'}</span> },
                    { key: 'end', header: 'Ends', cellClassName: 'font-mono text-xs whitespace-nowrap', render: (e) => e.end_date?.slice(0, 10) },
                    { key: 'oblig', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (e) => `$${((e.obligation || 0) / 1e6).toFixed(1)}M` },
                    {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      render: (e) => (
                        <div className="row-actions">
                          <button onClick={() => addToPipeline(e, 'agency-recompete')} className="action-btn pipeline text-xs">+ pipeline</button>
                          <button onClick={() => addToBrain({ recipient: e.recipient, agency: e.agency }, e.recipient, 'competitor')} className="action-btn brain text-xs">+ brain</button>
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No hot-agency recompetes"
                  description="Combo matches expiring contracts at high-intensity agencies. Check Future Opportunities for full radar."
                  accent="magenta"
                  actions={<Button variant="soft" onClick={() => setDashTab('opportunities')}>Future Opportunities</Button>}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Agency Profile Builder"
              subtitle="Marketing skills · 1102 MCPs · web research → vault"
              icon={Globe}
              accent="purple"
              defaultOpen={false}
            >
              <div className="insight vault mb-3">
                Stub workspace for deepening agency knowledge: bill payer vs contracting office, subordinate offices, and capture-ready messaging. Skills from{' '}
                <a href="https://github.com/coreyhaines31/marketingskills" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">
                  marketingskills
                </a>
                {' '}plus{' '}
                <a href="https://github.com/1102tools/federal-contracting-mcps" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">
                  federal-contracting-mcps
                </a>
                {' '}will run via co-pilot and Skills — outputs land in Knowledge Vault.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                {[
                  { role: 'Bill payer', hint: 'Funding agency / appropriation owner' },
                  { role: 'Contracting office', hint: 'KO / CS / PCO that signs' },
                  { role: 'Subordinate offices', hint: 'Program elements & end users' },
                ].map((office) => (
                  <div key={office.role} className="market-stat-chip">
                    <div className="label">{office.role}</div>
                    <div className="value text-sm text-text-500">—</div>
                    <div className="text-[9px] text-text-500 mt-0.5">{office.hint}</div>
                  </div>
                ))}
              </div>

              {(hotAgencyList[0] || agencyIntelRows[0]) && (
                <div className="tool-card mb-3">
                  <div className="tool-card-name truncate">
                    Profile target: {(hotAgencyList[0] || agencyIntelRows[0]).agency}
                  </div>
                  <div className="tool-card-desc">
                    Run a research pass to map offices, incumbents, and messaging angles — then +brain to compound in vault.
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <AskCoPilotButton
                      prompt={`Build an agency profile for ${(hotAgencyList[0] || agencyIntelRows[0]).agency} in NAICS ${naics}: identify likely bill payer vs contracting office vs subordinate program offices, top incumbents, and 3 customer-interface moves. Use vault + USASpending context; cite sources.`}
                      label="Research profile"
                      onAsk={askCoPilot}
                    />
                    <button
                      type="button"
                      onClick={() => addToBrain(hotAgencyList[0] || agencyIntelRows[0], (hotAgencyList[0] || agencyIntelRows[0]).agency, 'agency')}
                      className="action-btn brain text-[10px]"
                    >
                      + brain target
                    </button>
                    <button type="button" onClick={() => setSidebar('skills')} className="text-[10px] text-neon-cyan hover:underline">
                      Skills roadmap →
                    </button>
                  </div>
                </div>
              )}

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">Marketing skills (vendored roadmap)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {marketingSkillStubs.map((skill) => (
                  <div key={skill.id} className="profile-skill-chip">
                    <div className="profile-skill-chip-name">{skill.label}</div>
                    <div className="profile-skill-chip-meta">{skill.note}</div>
                    <button
                      type="button"
                      onClick={() => askCoPilot(
                        `Using ${skill.label} framing for ${(hotAgencyList[0] || agencyIntelRows[0] || { agency: 'top agency' }).agency} (NAICS ${naics}): draft capture-ready bullets I can paste into vault. Ground in our data slice + competitive intel.`,
                      )}
                      className="text-[9px] text-neon-cyan hover:underline text-left mt-auto"
                    >
                      Draft via co-pilot →
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">Federal 1102 MCP research</div>
              <div className="space-y-2">
                {mcpResearchStubs.map((stub) => (
                  <div key={stub.label} className="tool-card flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="tool-card-name">{stub.label}</div>
                      <div className="tool-card-desc">Via <span className="text-neon-cyan">{stub.mcp}</span> MCP</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`pill text-[9px] ${stub.status === 'Ready' ? 'text-neon-lime border-neon-lime/40' : stub.status === 'Catalog' ? 'text-text-500' : ''}`}>
                        {stub.status}
                      </span>
                      <AskCoPilotButton
                        prompt={`${stub.label} for ${(hotAgencyList[0] || agencyIntelRows[0] || { agency: 'priority agency' }).agency} in NAICS ${naics}. Use available MCP tools and web research; structure output for vault: offices, citations, open questions.`}
                        label="Stub run"
                        onAsk={askCoPilot}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Who Wins Here"
              subtitle="Top incumbents by agency · flow view"
              icon={ClipboardList}
              accent="cyan"
              defaultOpen={false}
              titleGlossaryId="follow_the_money"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="chart-panel-sub mb-2">
                Follow-the-money at agency level — who dominates spend with each buyer (pairs with Competitive Analysis Sankey).
              </div>
              <DataTable
                data={hotAgencyList.length ? hotAgencyList : agencyIntelRows.slice(0, 6)}
                rowKey={(a) => a.agency}
                emptyMessage="No flow data."
                columns={[
                  {
                    key: 'agency',
                    header: 'Agency',
                    cellClassName: 'max-w-[160px] truncate',
                    render: (a) => (
                      <button
                        type="button"
                        onClick={() => navigateToAgencyOpportunities(a.agency)}
                        className="text-neon-cyan hover:underline truncate max-w-full text-left"
                        title={`Filter recompetes for ${a.agency}`}
                      >
                        {a.agency}
                      </button>
                    ),
                  },
                  {
                    key: 'winner',
                    header: 'Top recipient',
                    render: (a) => {
                      const f = agencyFlowByAgency.get(a.agency)
                      return f ? <span className="truncate block max-w-[160px]" title={f.topRecipient}>{f.topRecipient}</span> : '—'
                    },
                  },
                  {
                    key: 'flowm',
                    header: '$M flow',
                    cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap',
                    render: (a) => {
                      const f = agencyFlowByAgency.get(a.agency)
                      return f ? `$${f.topMillions}M` : '—'
                    },
                  },
                  {
                    key: 'primes',
                    header: 'Primes',
                    cellClassName: 'tabular-nums text-text-400',
                    render: (a) => agencyFlowByAgency.get(a.agency)?.flowCount ?? '—',
                  },
                  {
                    key: 'cta',
                    header: '',
                    align: 'right',
                    render: () => (
                      <button onClick={() => setDashTab('competitive')} className="text-[10px] text-neon-cyan hover:underline">Flows →</button>
                    ),
                  },
                ]}
              />
            </CollapsibleSection>
          </div>
        )
      }

      case 'competitive': {
        const totalMarketM = kpis.total_obligations_m || 1
        const top3M = topRecipients.slice(0, 3).reduce((s: number, r: any) => s + (r.millions || 0), 0)
        const top3Pct = Math.round((top3M / totalMarketM) * 100)
        const concentration = getConcentrationTier(top3Pct)
        const recipientFlowByRecipient = summarizeRecipientFlows(flows)
        const isCompetitorInBrain = (name: string) => !!findCompetitorBrainEntry(name)

        const recompetesByRecipient = new Map<string, { count: number; millions: number }>()
        expiring.forEach((e: any) => {
          const rec = e.recipient || ''
          if (!rec) return
          topRecipients.forEach((tr: any) => {
            const trName = tr.recipient || ''
            if (!recipientMatchesExpiring(trName, rec)) return
            const key = trName
            const cur = recompetesByRecipient.get(key) || { count: 0, millions: 0 }
            cur.count += 1
            cur.millions += (e.obligation || 0) / 1e6
            recompetesByRecipient.set(key, cur)
          })
        })

        const competitorRows: CompetitorIntelRow[] = topRecipients.map((r: any) => {
          const recipient = r.recipient || 'Unknown'
          const flow = recipientFlowByRecipient.get(recipient)
          const sharePct = Math.round(((r.millions || 0) / totalMarketM) * 100)
          const recomp = recompetesByRecipient.get(recipient) || { count: 0, millions: 0 }
          const inBrain = isCompetitorInBrain(recipient)
          const posture = getCompetitorPosture({
            sharePct,
            agencyCount: flow?.agencyCount ?? 0,
            recompeteCount: recomp.count,
          })
          const strategy = getCompeteStrategy(posture, sharePct, inBrain)
          return { ...r, recipient, flow, sharePct, recomp, inBrain, posture, strategy } as CompetitorIntelRow
        })
        const filteredCompetitorRows = competitorRows.filter((r) =>
          !competitorSearch || r.recipient.toLowerCase().includes(competitorSearch.toLowerCase()),
        )
        const trackedCompetitors = competitorRows.filter((r) => r.inBrain).length
        const incumbentRecompetes = expiring.filter((e: any) =>
          topRecipients.some((tr: any) => recipientMatchesExpiring(tr.recipient || '', e.recipient || '')),
        )
        const relationshipSource: RelationshipRow[] = agencyRelationships.length
          ? agencyRelationships
          : flows.map((f) => ({
              agency: f.agency,
              recipient: f.recipient,
              actions: f.actions,
              millions: f.millions,
            }))
        const relationshipHeatmap = buildRelationshipHeatmap(relationshipSource)

        const sankeyNodes: any[] = []
        const sankeyNodeMap = new Map<string, number>()
        const sankeyLinks: any[] = []
        flows.forEach((f: any) => {
          const r = f.recipient || 'Unknown Recipient'
          const a = f.agency || 'Unknown Agency'
          const o = f.office || 'Unspecified Office'
          const rk = `R:${r}`
          const ak = `A:${a}`
          const ok = `O:${o}`
          if (!sankeyNodeMap.has(rk)) {
            sankeyNodeMap.set(rk, sankeyNodes.length)
            sankeyNodes.push({ label: r })
          }
          if (!sankeyNodeMap.has(ak)) {
            sankeyNodeMap.set(ak, sankeyNodes.length)
            sankeyNodes.push({ label: a })
          }
          if (!sankeyNodeMap.has(ok)) {
            sankeyNodeMap.set(ok, sankeyNodes.length)
            sankeyNodes.push({ label: o })
          }
          sankeyLinks.push({ source: sankeyNodeMap.get(rk)!, target: sankeyNodeMap.get(ak)!, value: f.millions || 0 })
          sankeyLinks.push({ source: sankeyNodeMap.get(ak)!, target: sankeyNodeMap.get(ok)!, value: f.millions || 0 })
        })
        const sankeyData = [{
          type: 'sankey',
          orientation: 'h',
          node: {
            pad: 15,
            thickness: 20,
            line: { color: CHART.sankeyNodeLine, width: 0.5 },
            label: sankeyNodes.map(n => n.label),
            color: CHART.colors.cyan,
          },
          link: {
            source: sankeyLinks.map(l => l.source),
            target: sankeyLinks.map(l => l.target),
            value: sankeyLinks.map(l => l.value),
            color: CHART.sankeyLink,
          },
        }]

        const defaultTeamingTarget = competitorRows.find((r) => r.strategy === 'displace' || r.strategy === 'team')?.recipient
          || competitorRows[0]?.recipient
          || ''
        const activeTeamingTarget = teamingTarget || defaultTeamingTarget
        const topRecipientNames = topRecipients.map((r: any) => r.recipient || '')
        const teamingParsed = teamingRaw ? parseTeamingApiResponse(teamingRaw) : null
        const teamingFromApi = (() => {
          if (teamingParsed) {
            const enriched = enrichTeamingCandidates(teamingParsed, topRecipientNames)
            if (enriched.length) return enriched
          }
          return buildTeamingCandidatesFromFlows(activeTeamingTarget, flows, topRecipientNames).candidates
        })()
        const teamingBulk = teamingFromApi.filter((t) => t.candidateType === 'adjacent_prime')
        const teamingSubs = teamingFromApi.filter((t) => t.candidateType === 'subcontractor')
        const filterTeaming = (rows: TeamingCandidate[]) => rows.filter((t) =>
          !teamingSearch || t.recipient.toLowerCase().includes(teamingSearch.toLowerCase()),
        )
        const filteredTeamingBulk = filterTeaming(teamingBulk)
        const filteredTeamingSubs = filterTeaming(teamingSubs)
        const filteredTeaming = filterTeaming(teamingFromApi)
        const teamingMeta = teamingParsed?.meta || {}
        const teamingStrongCount = filteredTeaming.filter((t) => t.fit === 'strong').length
        const teamingPromisingCount = filteredTeaming.filter((t) => t.fit === 'promising').length
        const setAsideTeaming = getSetAsideTeamingHint(setAside)
        const teamingDeepPrompt = buildTeamingDeepSearchPrompt({
          target: activeTeamingTarget,
          naics,
          gap: teamingCapabilityGap,
          smallBizPct: setAsideTeaming.smallBizPct,
          metaNote: teamingMeta.note,
        })
        const theseusSkills = skillsCatalog.theseus_capture || []
        const federal1102Skills = skillsCatalog.federal_1102 || []

        return (
          <div className="page-sections">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
              <MetricCard label="Top 3 share" value={`${top3Pct}%`} accent="magenta" glossaryId="market_concentration" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="In vault" value={String(trackedCompetitors)} accent="purple" glossaryId="customer_position" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Primes in slice" value={String(topRecipients.length)} accent="cyan" glossaryId="competitor_posture" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Incumbent recompetes" value={String(incumbentRecompetes.length)} accent="lime" glossaryId="recompete_radar" onGlossaryLearn={openGlossaryInVault} />
            </div>

            <CollapsibleSection
              title="Market Concentration"
              subtitle={`${CONCENTRATION_META[concentration].label} · treemap`}
              icon={Trophy}
              accent="magenta"
              defaultOpen
              titleGlossaryId="market_concentration"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className={`insight mb-3 ${concentration === 'high' ? 'magenta' : ''}`}>
                <span className={CONCENTRATION_META[concentration].tone}>{CONCENTRATION_META[concentration].label}</span>
                {' — '}{CONCENTRATION_META[concentration].hint}
              </div>
              <div className="chart-panel surface-accent-magenta border-0 shadow-none p-0 bg-transparent min-w-0">
                {topRecipients.length ? (
                  <div className="chart-panel-plot" style={{ height: 240 }}>
                    <Plot
                      data={[{
                        type: 'treemap',
                        labels: topRecipients.map((r: any) => (r.recipient || '').slice(0, 28)),
                        values: topRecipients.map((r: any) => r.millions || 0),
                        parents: Array(topRecipients.length).fill(''),
                        textinfo: 'label+value',
                        hovertemplate: '%{label}<br>$%{value}M<extra></extra>',
                      }]}
                      layout={{
                        margin: { t: 4, l: 4, r: 4, b: 4 },
                        paper_bgcolor: CHART.transparent,
                        plot_bgcolor: CHART.transparent,
                        font: { size: 9, color: CHART.fontColor },
                        uniformtext: { minsize: 8, mode: 'hide' },
                      }}
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false }}
                    />
                  </div>
                ) : (
                  <div className="chart-module-empty">Load more data for competitor share.</div>
                )}
              </div>
              {topRecipients.length > 0 && (
                <button
                  onClick={() => topRecipients.slice(0, 5).forEach((r: any) => addToBrain(r, r.recipient, 'competitor'))}
                  className="action-btn brain text-[10px] mt-2"
                >
                  +brain top 5 primes
                </button>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Competitor Rankings"
              subtitle={`${filteredCompetitorRows.length} primes · posture & strategy`}
              icon={Target}
              accent="magenta"
              defaultOpen
              titleGlossaryId="competitor_posture"
              onGlossaryLearn={openGlossaryInVault}
              badge={top3Pct >= 30 ? <span className="pill text-[10px]">{top3Pct}% top 3</span> : undefined}
            >
              <input
                value={competitorSearch}
                onChange={(e) => setCompetitorSearch(e.target.value)}
                placeholder="Filter competitors…"
                className="input-field mb-2 w-full max-w-md"
              />
              <DataTable
                data={filteredCompetitorRows}
                rowKey={(r) => r.recipient}
                emptyMessage="No competitors match filter."
                onGlossaryLearn={openGlossaryInVault}
                columns={[
                  {
                    key: 'recipient',
                    header: 'Prime',
                    cellClassName: 'max-w-[150px]',
                    render: (r) => (
                      <div className="flex items-center gap-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => navigateToCompetitorOpportunities(r.recipient)}
                          className="truncate text-left text-neon-cyan hover:underline"
                          title={`Filter recompetes for ${r.recipient}`}
                        >
                          {r.recipient}
                        </button>
                        {r.inBrain && <span className="text-neon-lime text-[9px] shrink-0">🧠</span>}
                        <button
                          type="button"
                          onClick={() => navigateToCompetitorOpportunities(r.recipient)}
                          className="text-text-500 hover:text-neon-cyan shrink-0"
                          title="Link filter → Future Opportunities"
                        >
                          <Link2 size={10} />
                        </button>
                      </div>
                    ),
                  },
                  {
                    key: 'share',
                    header: 'Share',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (r) => (
                      <span className={r.sharePct >= 15 ? 'text-neon-magenta' : ''}>{r.sharePct}%</span>
                    ),
                  },
                  {
                    key: 'posture',
                    header: 'Posture',
                    headerTip: 'competitor_posture',
                    cellClassName: 'text-[10px] whitespace-nowrap',
                    render: (r) => (
                      <span className={POSTURE_META[r.posture].tone} title={POSTURE_META[r.posture].strategy}>
                        {POSTURE_META[r.posture].label}
                      </span>
                    ),
                  },
                  {
                    key: 'strategy',
                    header: 'Lens',
                    headerTip: 'strategy_lens',
                    cellClassName: 'text-[10px] whitespace-nowrap',
                    render: (r) => (
                      <span className={STRATEGY_META[r.strategy].tone} title={getGlossaryTip('strategy_lens')}>
                        {STRATEGY_META[r.strategy].label}
                      </span>
                    ),
                  },
                  {
                    key: 'stats',
                    header: '$M',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (r) => `${r.millions}M · ${r.actions?.toLocaleString() || '—'} act`,
                  },
                  {
                    key: 'agencies',
                    header: 'Agencies',
                    cellClassName: 'text-[10px] text-text-400 max-w-[90px] truncate',
                    render: (r) => r.flow
                      ? <span title={r.flow.topAgency}>{r.flow.agencyCount} · {r.flow.topAgency.slice(0, 12)}</span>
                      : '—',
                  },
                  {
                    key: 'recomp',
                    header: 'Recomp',
                    cellClassName: 'tabular-nums text-xs',
                    render: (r) => r.recomp.count > 0
                      ? <span className="text-neon-magenta">{r.recomp.count}</span>
                      : <span className="text-text-500">—</span>,
                  },
                  {
                    key: 'notes',
                    header: 'Notes',
                    cellClassName: 'min-w-[120px] max-w-[180px]',
                    render: (r) => (
                      <AgencyNoteInline
                        value={(findCompetitorBrainEntry(r.recipient)?.notes as string) || ''}
                        placeholder="Teaming angle, weaknesses, ghost notes…"
                        onSave={(notes) => saveCompetitorInlineNote(r.recipient, notes, r)}
                      />
                    ),
                  },
                  {
                    key: 'cta',
                    header: '',
                    align: 'right',
                    render: (r) => (
                      <div className="row-actions">
                        <button onClick={() => addToBrain(r, r.recipient, 'competitor')} className="action-btn brain text-xs">+ brain</button>
                        <AskCoPilotButton
                          prompt={`Competitive brief for ${r.recipient}: ${r.sharePct}% market share, $${r.millions}M, ${r.actions} actions in NAICS ${naics}. Posture: ${POSTURE_META[r.posture].label}. Top agency: ${r.flow?.topAgency || 'unknown'}. ${r.recomp.count} recompetes. Strategy lens: ${STRATEGY_META[r.strategy].label}. What discriminators and teaming/ghost moves should I pursue?`}
                          label="Brief"
                          onAsk={askCoPilot}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Gap-Fill Teaming"
              subtitle="Adjacent vendors · subs · MCP + web research"
              icon={Handshake}
              accent="lime"
              titleGlossaryId="gap_fill_teaming"
              onGlossaryLearn={openGlossaryInVault}
              defaultOpen={filteredTeaming.length > 0 || teamingMeta.research_recommended === true}
              badge={filteredTeaming.length > 0 ? (
                <span className="pill text-[10px]">
                  {teamingStrongCount} strong · {teamingPromisingCount} promising
                </span>
              ) : undefined}
            >
              <div className="insight lime mb-3">
                Teaming partners are <strong className="text-text-primary">not</strong> top competitors — look for adjacent vendors and subs who fill a capability gap against your displacement target. Bulk overlap below is a weak signal; strong fits usually need USASpending + SAM.gov MCP passes and web/marketing research. Set-aside: {setAsideTeaming.smallBizPct}% SB-weighted — {setAsideTeaming.hint}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label className="text-[10px] text-text-500 shrink-0">Displace target</label>
                <select
                  value={activeTeamingTarget}
                  onChange={(e) => setTeamingTarget(e.target.value)}
                  className="input-field text-xs max-w-md flex-1 min-w-[200px]"
                >
                  {competitorRows.slice(0, 10).map((r) => (
                    <option key={r.recipient} value={r.recipient}>
                      {r.recipient.slice(0, 48)} ({r.sharePct}% · {STRATEGY_META[r.strategy].label})
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={teamingCapabilityGap}
                onChange={(e) => setTeamingCapabilityGap(e.target.value)}
                placeholder="Capability gap we need filled (e.g. cleared staff, regional O&M, cyber ATO)…"
                className="input-field mb-2 w-full max-w-2xl"
              />
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <AskCoPilotButton
                  prompt={teamingDeepPrompt}
                  label="Full research pipeline"
                  onAsk={askCoPilot}
                />
                <button type="button" onClick={() => setSidebar('skills')} className="text-[10px] text-neon-cyan hover:underline">
                  Teaming Finder skill →
                </button>
                {teamingMeta.excluded_top_primes ? (
                  <span className="text-[9px] text-text-500">
                    Excluded top {teamingMeta.excluded_top_primes} market primes + target
                  </span>
                ) : null}
              </div>
              {teamingMeta.note && (
                <div className="text-[10px] text-text-400 mb-3 border-l-2 border-neon-lime/30 pl-2">
                  {teamingMeta.note}
                </div>
              )}

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">
                Research pipeline — MCP + marketing skills
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {TEAMING_MARKETING_STUBS.map((skill) => (
                  <div key={skill.id} className="profile-skill-chip">
                    <div className="profile-skill-chip-name">{skill.label}</div>
                    <div className="profile-skill-chip-meta">{skill.note}</div>
                    <button
                      type="button"
                      onClick={() => askCoPilot(skill.prompt({
                        target: activeTeamingTarget,
                        naics,
                        gap: teamingCapabilityGap,
                        smallBizPct: setAsideTeaming.smallBizPct,
                      }))}
                      className="text-[9px] text-neon-cyan hover:underline text-left mt-auto"
                    >
                      Run via co-pilot →
                    </button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 mb-4">
                {TEAMING_MCP_STUBS.map((stub) => (
                  <div key={stub.label} className="tool-card flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="tool-card-name">{stub.label}</div>
                      <div className="tool-card-desc">Via <span className="text-neon-cyan">{stub.mcp}</span> MCP</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`pill text-[9px] ${stub.status === 'Ready' ? 'text-neon-lime border-neon-lime/40' : 'text-text-500'}`}>
                        {stub.status}
                      </span>
                      <AskCoPilotButton
                        prompt={`${stub.label} for gap-fill teaming vs ${activeTeamingTarget} in NAICS ${naics}. Gap: ${teamingCapabilityGap || 'TBD'}. Find adjacent vendors/subs — exclude top market primes. Use ${stub.mcp} MCP. Cite sources.`}
                        label="Query"
                        onAsk={askCoPilot}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <input
                value={teamingSearch}
                onChange={(e) => setTeamingSearch(e.target.value)}
                placeholder="Filter bulk-signal candidates…"
                className="input-field mb-2 w-full max-w-md"
              />

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">
                Bulk signal — award overlap (weak)
                {teamingMeta.subaward_data === false && (
                  <span className="normal-case text-text-500 ml-1">· no FFATA subaward bulk loaded</span>
                )}
              </div>
              {filteredTeamingSubs.length > 0 && (
                <>
                  <div className="text-[10px] text-neon-cyan mb-1">Subs / FFATA ({filteredTeamingSubs.length})</div>
                  <DataTable
                    data={filteredTeamingSubs}
                    rowKey={(t) => `sub-${t.recipient}`}
                    emptyMessage="No subs match filter."
                    columns={[
                      {
                        key: 'recipient',
                        header: 'Sub',
                        cellClassName: 'max-w-[140px]',
                        render: (t: TeamingCandidate) => (
                          <div className="min-w-0">
                            <span className="truncate block" title={t.recipient}>{t.recipient}</span>
                            {t.underPrime && (
                              <span className="text-[9px] text-text-500 truncate block" title={t.underPrime}>
                                under {t.underPrime.slice(0, 24)}
                              </span>
                            )}
                          </div>
                        ),
                      },
                      {
                        key: 'fit',
                        header: 'Fit',
                        cellClassName: 'text-[10px] whitespace-nowrap',
                        render: (t: TeamingCandidate) => (
                          <span className={TEAMING_FIT_META[t.fit].tone}>{TEAMING_FIT_META[t.fit].label}</span>
                        ),
                      },
                      {
                        key: 'why',
                        header: 'Why',
                        cellClassName: 'text-[9px] text-text-400 max-w-[160px]',
                        render: (t: TeamingCandidate) => (
                          <span title={t.fitReason}>{t.fitReason.slice(0, 48)}{t.fitReason.length > 48 ? '…' : ''}</span>
                        ),
                      },
                      {
                        key: 'millions',
                        header: '$M sub',
                        cellClassName: 'tabular-nums text-neon-cyan text-xs',
                        render: (t: TeamingCandidate) => `$${t.sharedMillions}M`,
                      },
                      {
                        key: 'cta',
                        header: '',
                        align: 'right',
                        render: (t: TeamingCandidate) => (
                          <div className="row-actions">
                            <button
                              onClick={() => addToBrain(
                                {
                                  recipient: t.recipient,
                                  agency: t.sampleAgency,
                                  notes: `Sub teaming candidate vs ${activeTeamingTarget}: ${t.fitReason}`,
                                },
                                t.recipient,
                                'competitor',
                              )}
                              className="action-btn brain text-[10px]"
                            >
                              +brain
                            </button>
                            <AskCoPilotButton
                              prompt={`Vet sub ${t.recipient} (under ${t.underPrime || 'unknown prime'}) as gap-fill teammate to displace ${activeTeamingTarget} in NAICS ${naics}. Gap: ${teamingCapabilityGap || 'TBD'}. Team vs ghost?`}
                              label="Vet"
                              onAsk={askCoPilot}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                </>
              )}
              {filteredTeamingBulk.length ? (
                <DataTable
                  data={filteredTeamingBulk}
                  rowKey={(t) => `adj-${t.recipient}`}
                  emptyMessage="No adjacent vendors match filter."
                  onGlossaryLearn={openGlossaryInVault}
                  columns={[
                    {
                      key: 'recipient',
                      header: 'Adjacent vendor',
                      cellClassName: 'max-w-[140px]',
                      render: (t: TeamingCandidate) => (
                        <div className="min-w-0">
                          <span className="truncate block" title={t.recipient}>{t.recipient}</span>
                          {t.niche && <span className="text-[9px] text-neon-lime">niche · ≤3% share</span>}
                        </div>
                      ),
                    },
                    {
                      key: 'type',
                      header: 'Type',
                      cellClassName: 'text-[9px] whitespace-nowrap',
                      render: (t: TeamingCandidate) => TEAMING_TYPE_META[t.candidateType].label,
                    },
                    {
                      key: 'fit',
                      header: 'Fit',
                      headerTip: 'teaming_fit',
                      cellClassName: 'text-[10px] whitespace-nowrap',
                      render: (t: TeamingCandidate) => (
                        <span className={TEAMING_FIT_META[t.fit].tone} title={t.fitReason}>
                          {TEAMING_FIT_META[t.fit].label}
                        </span>
                      ),
                    },
                    {
                      key: 'why',
                      header: 'Why',
                      cellClassName: 'text-[9px] text-text-400 max-w-[140px]',
                      render: (t: TeamingCandidate) => (
                        <span title={t.fitReason}>{t.fitReason.slice(0, 40)}{t.fitReason.length > 40 ? '…' : ''}</span>
                      ),
                    },
                    {
                      key: 'share',
                      header: 'Share',
                      cellClassName: 'tabular-nums text-xs',
                      render: (t: TeamingCandidate) => (
                        t.marketSharePct != null ? `${t.marketSharePct}%` : '—'
                      ),
                    },
                    {
                      key: 'agencies',
                      header: 'Buyers',
                      headerTip: 'shared_buyers',
                      cellClassName: 'tabular-nums text-xs',
                      render: (t: TeamingCandidate) => t.sharedAgencies,
                    },
                    {
                      key: 'millions',
                      header: '$M overlap',
                      cellClassName: 'tabular-nums text-neon-cyan text-xs',
                      render: (t: TeamingCandidate) => `$${t.sharedMillions}M`,
                    },
                    {
                      key: 'cta',
                      header: '',
                      align: 'right',
                      render: (t: TeamingCandidate) => (
                        <div className="row-actions">
                          <button
                            onClick={() => addToBrain(
                              {
                                recipient: t.recipient,
                                agency: t.sampleAgency,
                                notes: `Gap-fill teammate vs ${activeTeamingTarget}: ${t.fitReason}`,
                              },
                              t.recipient,
                              'competitor',
                            )}
                            className="action-btn brain text-[10px]"
                          >
                            +brain
                          </button>
                          <AskCoPilotButton
                            prompt={`Evaluate gap-fill fit: ${t.recipient} (${t.marketSharePct ?? '?'}% market share) as teammate to displace ${activeTeamingTarget} in NAICS ${naics}. ${t.sharedAgencies} shared buyers, $${t.sharedMillions}M overlap. Gap: ${teamingCapabilityGap || 'TBD'}. Team vs ghost vs pass?`}
                            label="Vet"
                            onAsk={askCoPilot}
                          />
                        </div>
                      ),
                    },
                  ]}
                />
              ) : !filteredTeamingSubs.length ? (
                <EmptyState
                  icon={Handshake}
                  title="No bulk-signal teammates"
                  description="Top competitors are excluded by design. Define a capability gap and run the research pipeline — MCP + web passes surface adjacent vendors and subs bulk data misses."
                  accent="lime"
                  actions={
                    <AskCoPilotButton
                      prompt={teamingDeepPrompt}
                      label="Run research pipeline"
                      onAsk={askCoPilot}
                    />
                  }
                />
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection
              title="Relationship Heatmap"
              subtitle="Buyer × prime · award count strength"
              icon={Crosshair}
              accent="cyan"
              defaultOpen={relationshipHeatmap.recipients.length > 0}
              titleGlossaryId="relationship_heatmap"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight cyan mb-3">
                Same signal as Agency Intel — read from the competitor side. Darker cells = entrenched buyer relationships to team around or displace.
              </div>
              <RelationshipHeatmap
                model={relationshipHeatmap}
                onAgencyClick={navigateToAgencyOpportunities}
                onCellClick={(agency, recipient, actions) => {
                  addToBrain(
                    { agency, recipient, actions, notes: `${actions} awards — ${recipient} at ${agency}` },
                    recipient,
                    'competitor',
                  )
                }}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Money Flows"
              subtitle={`Recipient → agency → office · ${flows.length} flows`}
              icon={GitBranch}
              accent="cyan"
              defaultOpen={flows.length > 0}
              titleGlossaryId="follow_the_money"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight magenta mb-3">
                Original Data Insights “Follow the Money” — trace who gets paid, through which agency and contracting office. Office-level = KO/PCO concentration.
              </div>
              <div className="chart-panel surface-accent-cyan border-0 shadow-none p-0 bg-transparent min-w-0">
                {flows.length ? (
                  <div className="chart-panel-plot" style={{ height: 360 }}>
                    <Plot
                      data={sankeyData}
                      layout={{
                        font: { size: 9, color: CHART.fontColor },
                        paper_bgcolor: CHART.transparent,
                        plot_bgcolor: CHART.transparent,
                        margin: { t: 8, l: 8, r: 8, b: 8 },
                      }}
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false }}
                    />
                  </div>
                ) : (
                  <div className="chart-module-empty">Flows will appear with more data.</div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Flow Detail"
              subtitle="Recipient → agency → office · vault actions"
              icon={GitBranch}
              accent="magenta"
              defaultOpen
            >
              <DataTable
                data={flows}
                rowKey={(f) => `${f.recipient}-${f.agency}-${f.office ?? ''}`}
                emptyMessage="Flows will appear with more bulk data ingested."
                columns={[
                  {
                    key: 'recipient',
                    header: 'Recipient',
                    cellClassName: 'max-w-[140px]',
                    render: (f) => (
                      <button
                        type="button"
                        onClick={() => navigateToCompetitorOpportunities(f.recipient)}
                        className="font-medium text-neon-cyan hover:underline truncate block text-left max-w-full"
                        title={f.recipient}
                      >
                        {f.recipient}
                      </button>
                    ),
                  },
                  {
                    key: 'agency',
                    header: 'Agency',
                    cellClassName: 'text-text-400 text-xs max-w-[120px] truncate',
                    render: (f) => (
                      <button
                        type="button"
                        onClick={() => navigateToAgencyOpportunities(f.agency)}
                        className="hover:text-neon-cyan truncate max-w-full text-left"
                        title={f.agency}
                      >
                        {f.agency}
                      </button>
                    ),
                  },
                  {
                    key: 'office',
                    header: 'Office',
                    cellClassName: 'text-text-500 text-xs max-w-[110px] truncate',
                    render: (f) => <span title={f.office}>{f.office || '—'}</span>,
                  },
                  {
                    key: 'value',
                    header: '$M',
                    cellClassName: 'tabular-nums whitespace-nowrap text-xs',
                    render: (f) => (
                      <>
                        ${f.millions}M <span className="text-[10px] text-text-500">({f.actions})</span>
                      </>
                    ),
                  },
                  {
                    key: 'cta',
                    header: '',
                    align: 'right',
                    render: (f) => (
                      <div className="row-actions">
                        <button onClick={() => addToBrain(f, f.recipient, 'competitor')} className="action-btn brain text-[10px]">+prime</button>
                        {f.office && f.office !== '(Unspecified Office)' && (
                          <button
                            onClick={() => addToBrain({ ...f, office: f.office }, f.office!, 'office')}
                            className="action-btn brain text-[10px]"
                          >
                            +office
                          </button>
                        )}
                        <button onClick={() => addToBrain({ agency: f.agency }, f.agency, 'agency')} className="action-btn brain text-[10px]">+agency</button>
                        <AskCoPilotButton
                          prompt={`Flow analysis: ${f.recipient} receives $${f.millions}M (${f.actions} actions) via ${f.agency}${f.office ? ` / ${f.office}` : ''} in NAICS ${naics}. Teaming, ghost, or displacement angle?`}
                          label="Brief"
                          onAsk={askCoPilot}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Incumbent Recompetes"
              subtitle="Top primes · expiring contracts"
              icon={Clock}
              accent="lime"
              defaultOpen={incumbentRecompetes.length > 0}
              badge={incumbentRecompetes.length > 0 ? <span className="pill text-[10px]">{incumbentRecompetes.length}</span> : undefined}
            >
              <div className="insight lime mb-3">
                Expiring work held by market leaders — highest-leverage displacement or teaming timing. Link through to Future Opportunities for full radar.
              </div>
              {incumbentRecompetes.length ? (
                <DataTable
                  data={incumbentRecompetes.slice(0, 8)}
                  rowKey={(e, i) => e.award_key || `${e.recipient}-${e.end_date}-${i}`}
                  columns={[
                    {
                      key: 'recipient',
                      header: 'Incumbent',
                      cellClassName: 'max-w-[140px] truncate',
                      render: (e) => (
                        <button
                          type="button"
                          onClick={() => navigateToCompetitorOpportunities(e.recipient)}
                          className="text-neon-cyan hover:underline truncate max-w-full text-left"
                        >
                          {e.recipient}
                        </button>
                      ),
                    },
                    { key: 'agency', header: 'Agency', cellClassName: 'text-xs max-w-[120px] truncate', render: (e) => <span title={e.agency}>{e.agency}</span> },
                    { key: 'end', header: 'Ends', cellClassName: 'font-mono text-xs', render: (e) => e.end_date?.slice(0, 10) },
                    { key: 'oblig', header: '$M', cellClassName: 'tabular-nums text-neon-cyan', render: (e) => `$${((e.obligation || 0) / 1e6).toFixed(1)}M` },
                    {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      render: (e) => (
                        <div className="row-actions">
                          <button onClick={() => addToPipeline(e, 'incumbent-recompete')} className="action-btn pipeline text-xs">+ pipeline</button>
                          <button onClick={() => addToBrain(e, e.recipient, 'competitor')} className="action-btn brain text-xs">+ brain</button>
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No top-prime recompetes in slice"
                  description="When expiring contracts match ranked competitors, they surface here for displacement planning."
                  accent="lime"
                  actions={<Button variant="soft" onClick={() => setDashTab('opportunities')}>Future Opportunities</Button>}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Skills & MCP Pairing"
              subtitle="1102 + Theseus · data vs deliverables"
              icon={Sparkles}
              accent="purple"
              defaultOpen={false}
            >
              <div className="insight vault mb-3">
                <a href="https://github.com/1102tools/federal-contracting-mcps" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">MCPs</a>
                {' '}fetch data;{' '}
                <a href="https://github.com/1102tools/federal-contracting-skills" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">1102 skills</a>
                {' '}+ Theseus capture skills orchestrate deliverables (PTW, RFP reverse engineer, IGCE, SOW/PWS). Vendored and adapted in this workspace.
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">Theseus capture (partial / planned)</div>
              <div className="space-y-2 mb-3">
                {(theseusSkills.filter((s) => ['teaming-finder', 'price-to-win', 'rfp-reverse-engineer', 'competitive-battlecard'].includes(s.id))).map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    naics={naics}
                    contextHint={`Competitive tab · target ${activeTeamingTarget || competitorRows[0]?.recipient || 'incumbent'}`}
                    onAsk={askCoPilot}
                    onOpenMcp={() => setSidebar('tools')}
                  />
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">1102 acquisition skills (catalog)</div>
              <div className="space-y-2 mb-2">
                {federal1102Skills.slice(0, 3).map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    naics={naics}
                    onAsk={askCoPilot}
                    onOpenMcp={() => setSidebar('tools')}
                  />
                ))}
              </div>
              <button type="button" onClick={() => setSidebar('skills')} className="text-[10px] text-neon-cyan hover:underline">
                Full skills library →
              </button>
            </CollapsibleSection>
          </div>
        )
      }

      case 'vehicles': {
        const setAsideRows = normalizeSetAsideRows(setAside, 10)
        const va = vehicleAnalysis
        const vSummary = va?.summary || {}
        const posture = (vSummary.posture || 'mixed') as keyof typeof VEHICLE_POSTURE_META
        const concentration = getVehicleConcentration(vSummary.top3_vehicle_pct || 0)
        const comboRows = va
          ? buildVehicleComboRows(va.combinations, vSummary.total_millions || 0, vSummary.idv_pct || 0)
          : vehicles.map((v: any) => ({
              pricing: v.pricing || 'Unknown',
              vehicle: v.vehicle || 'Unknown',
              actions: v.actions || 0,
              millions: v.millions || 0,
              sharePct: 0,
              accessLens: 'monitor' as const,
            }))
        const setAsideVehicle = getSetAsideTeamingHint(setAside)
        const vehicleStrategyPrompt = buildVehicleStrategyPrompt({
          naics,
          summary: vSummary,
          topCombo: comboRows[0],
          smallBizPct: setAsideVehicle.smallBizPct,
        })
        const ffp = ffpShaping
        const ffpSummary = ffp?.summary || {}
        const ffpAgencyPressure = ffp?.agency_pressure || []
        const ffpShapeTargets = ffp?.shape_targets || []
        const ffpShapeNow = ffpShapeTargets.filter((t) => t.shape_gate === 'shape_now')
        const ffpShapingPrompt = buildFfpShapingPrompt({
          naics,
          summary: ffpSummary,
          target: ffpShapeNow[0],
          agency: ffpAgencyPressure[0],
        })

        return (
          <div className="page-sections">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
              <MetricCard label="IDIQ / TO share" value={`${vSummary.idv_pct ?? '—'}%`} accent="cyan" glossaryId="idiq_task_order" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Top vehicle" value={(vSummary.top_vehicle || '—').slice(0, 22)} accent="lime" glossaryId="buying_posture" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Top pricing" value={(vSummary.top_pricing || '—').slice(0, 22)} accent="amber" glossaryId="pricing_bucket" onGlossaryLearn={openGlossaryInVault} />
              <MetricCard label="Top 3 vehicles" value={`${vSummary.top3_vehicle_pct ?? '—'}%`} accent="magenta" glossaryId="top3_vehicle_share" onGlossaryLearn={openGlossaryInVault} />
            </div>

            <CollapsibleSection
              title="Buying Posture"
              subtitle={VEHICLE_POSTURE_META[posture].label}
              icon={Layers}
              accent="lime"
              defaultOpen
              titleGlossaryId="buying_posture"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight lime mb-3">
                <span className={VEHICLE_POSTURE_META[posture].tone}>{VEHICLE_POSTURE_META[posture].label}</span>
                {' — '}{VEHICLE_POSTURE_META[posture].hint}
                {' '}
                <span className={VEHICLE_CONCENTRATION_META[concentration].tone}>
                  {VEHICLE_CONCENTRATION_META[concentration].label}
                </span>
                {' — '}{VEHICLE_CONCENTRATION_META[concentration].hint}
              </div>
              <div className="flex flex-wrap gap-2">
                <AskCoPilotButton
                  prompt={vehicleStrategyPrompt}
                  label="Vehicle strategy brief"
                  onAsk={askCoPilot}
                />
                <button type="button" onClick={() => setSidebar('skills')} className="text-[10px] text-neon-cyan hover:underline">
                  PTW / CALC+ skills →
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Vehicle & Pricing Mix"
              subtitle={`${va?.by_idv.length || 0} vehicles · ${va?.by_pricing.length || 0} pricing types`}
              icon={PieChart}
              accent="lime"
              defaultOpen={!!va?.by_idv.length}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="chart-panel surface-accent-lime border-0 shadow-none p-0 bg-transparent min-w-0">
                  <div className="text-xs font-medium text-text-500 mb-1">Contract vehicles / IDV (by $M)</div>
                  {va?.by_idv.length ? (
                    <div className="chart-panel-plot" style={{ height: 240 }}>
                      <Plot
                        data={[{
                          type: 'bar',
                          orientation: 'h',
                          y: (va?.by_idv || []).map((v) => (v.vehicle || '').slice(0, 28)).reverse(),
                          x: (va?.by_idv || []).map((v) => v.millions).reverse(),
                          marker: { color: CHART.colors.lime },
                          hovertemplate: '%{y}<br>$%{x}M<extra></extra>',
                        }]}
                        layout={{
                          margin: { t: 4, l: 120, r: 12, b: 24 },
                          paper_bgcolor: CHART.transparent,
                          plot_bgcolor: CHART.transparent,
                          font: { size: 9, color: CHART.fontColor },
                          xaxis: { title: '$M' },
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  ) : (
                    <div className="chart-module-empty">No vehicle type data in slice.</div>
                  )}
                </div>
                <div className="chart-panel surface-accent-amber border-0 shadow-none p-0 bg-transparent min-w-0">
                  <div className="text-xs font-medium text-text-500 mb-1">Pricing types (by $M)</div>
                  {va?.by_pricing.length ? (
                    <div className="chart-panel-plot" style={{ height: 240 }}>
                      <Plot
                        data={[{
                          type: 'pie',
                          labels: va.by_pricing.map((p) => (p.pricing || '').slice(0, 24)),
                          values: va.by_pricing.map((p) => p.millions),
                          textinfo: 'label+percent',
                          hovertemplate: '%{label}<br>$%{value}M<extra></extra>',
                        }]}
                        layout={{
                          margin: { t: 4, l: 4, r: 4, b: 4 },
                          paper_bgcolor: CHART.transparent,
                          plot_bgcolor: CHART.transparent,
                          font: { size: 9, color: CHART.fontColor },
                          showlegend: false,
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  ) : (
                    <div className="chart-module-empty">No pricing data in slice.</div>
                  )}
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Buying Mechanism Rankings"
              subtitle={`${comboRows.length} pricing × vehicle combos`}
              icon={Truck}
              accent="lime"
              defaultOpen
            >
              <div className="insight mb-3">
                Each row is how work is actually bought — pricing plus vehicle. Hover column headers for plain-language definitions; click <strong className="text-text-primary">vault</strong> for deeper education in Knowledge Vault.
              </div>
              <DataTable
                data={comboRows}
                rowKey={(v, i) => `${v.pricing}-${v.vehicle}-${i}`}
                emptyMessage="Vehicle breakdown loads with more ingest data."
                onGlossaryLearn={openGlossaryInVault}
                columns={[
                  {
                    key: 'combo',
                    header: 'Pricing / Vehicle',
                    cellClassName: 'max-w-[180px]',
                    render: (v: VehicleComboRow) => (
                      <span title={`${v.pricing} / ${v.vehicle}`} className="truncate block">
                        {v.pricing} / {v.vehicle}
                      </span>
                    ),
                  },
                  {
                    key: 'share',
                    header: 'Share',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (v: VehicleComboRow) => (
                      <span className={v.sharePct >= 15 ? 'text-neon-magenta' : ''}>{v.sharePct}%</span>
                    ),
                  },
                    {
                      key: 'lens',
                      header: 'Access lens',
                      headerTip: 'access_lens',
                      cellClassName: 'text-[10px] whitespace-nowrap',
                      render: (v: VehicleComboRow) => (
                        <span className={VEHICLE_ACCESS_META[v.accessLens].tone}>
                          {VEHICLE_ACCESS_META[v.accessLens].label}
                        </span>
                      ),
                    },
                  {
                    key: 'stats',
                    header: 'Volume',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (v: VehicleComboRow) => `$${v.millions}M · ${v.actions?.toLocaleString() || '—'} act`,
                  },
                  {
                    key: 'cta',
                    header: '',
                    align: 'right',
                    render: (v: VehicleComboRow) => (
                      <AskCoPilotButton
                        prompt={`Vehicle capture angle: ${v.pricing} / ${v.vehicle} is ${v.sharePct}% of NAICS ${naics} spend. Access lens: ${VEHICLE_ACCESS_META[v.accessLens].label}. Who holds this vehicle, should we prime/team/ghost, and what schedule or on-ramp paths exist? Use USASpending + SAM + GSA CALC+ context.`}
                        label="Brief"
                        onAsk={askCoPilot}
                      />
                    ),
                  },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Vehicle Holders"
              subtitle="Who owns access on dominant vehicles"
              icon={Users}
              accent="cyan"
              defaultOpen={(va?.vehicle_holders.length || 0) > 0}
              titleGlossaryId="vehicle_holder"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight cyan mb-3">
                Top recipients on each dominant vehicle — teaming targets if you lack schedule position, or competitive intel if you are displacing.
              </div>
              {va?.vehicle_holders.length ? (
                <DataTable
                  data={va.vehicle_holders}
                  rowKey={(h) => `${h.vehicle}-${h.recipient}`}
                  emptyMessage="No holder data."
                  columns={[
                    {
                      key: 'vehicle',
                      header: 'Vehicle',
                      cellClassName: 'max-w-[120px] truncate text-[10px]',
                      render: (h) => <span title={h.vehicle}>{h.vehicle.slice(0, 22)}</span>,
                    },
                    {
                      key: 'recipient',
                      header: 'Holder',
                      cellClassName: 'max-w-[150px]',
                      render: (h) => (
                        <button
                          type="button"
                          onClick={() => navigateToCompetitorOpportunities(h.recipient)}
                          className="truncate text-left text-neon-cyan hover:underline"
                          title={h.recipient}
                        >
                          {h.recipient}
                        </button>
                      ),
                    },
                    {
                      key: 'share',
                      header: 'On vehicle',
                      cellClassName: 'tabular-nums text-xs',
                      render: (h) => `${h.holderSharePct}%`,
                    },
                    {
                      key: 'millions',
                      header: '$M',
                      cellClassName: 'tabular-nums text-neon-cyan text-xs',
                      render: (h) => `$${h.millions}M`,
                    },
                    {
                      key: 'cta',
                      header: '',
                      align: 'right',
                      render: (h) => (
                        <div className="row-actions">
                          <button
                            onClick={() => addToBrain(
                              { recipient: h.recipient, notes: `Vehicle holder on ${h.vehicle}: $${h.millions}M (${h.holderSharePct}% of vehicle)` },
                              h.recipient,
                              'competitor',
                            )}
                            className="action-btn brain text-[10px]"
                          >
                            +brain
                          </button>
                          <AskCoPilotButton
                            prompt={`Vehicle holder intel: ${h.recipient} holds ${h.holderSharePct}% of ${h.vehicle} spend in NAICS ${naics} ($${h.millions}M). Team vs displace vs ghost?`}
                            label="Angle"
                            onAsk={askCoPilot}
                          />
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No holder rollup yet"
                  description="Load more bulk data or run a co-pilot vehicle search via USASpending MCP."
                  accent="cyan"
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Agency Buying Preferences"
              subtitle="How top buyers procure work"
              icon={Briefcase}
              accent="cyan"
              defaultOpen={(va?.by_agency.length || 0) > 0}
            >
              <div className="insight mb-3">
                Dominant vehicle per agency — tailor capture: some buyers route everything through IDIQs, others issue standalone definitives.
              </div>
              {va?.by_agency.length ? (
                <DataTable
                  data={va.by_agency}
                  rowKey={(a) => a.agency}
                  emptyMessage="No agency vehicle data."
                  columns={[
                    {
                      key: 'agency',
                      header: 'Agency',
                      cellClassName: 'max-w-[150px]',
                      render: (a) => (
                        <button
                          type="button"
                          onClick={() => navigateToAgencyOpportunities(a.agency)}
                          className="truncate text-left text-neon-cyan hover:underline"
                          title={a.agency}
                        >
                          {a.agency}
                        </button>
                      ),
                    },
                    {
                      key: 'vehicle',
                      header: 'Top vehicle',
                      cellClassName: 'text-[10px] max-w-[140px] truncate',
                      render: (a) => <span title={a.top_vehicle}>{a.top_vehicle}</span>,
                    },
                    {
                      key: 'millions',
                      header: 'Agency $M',
                      cellClassName: 'tabular-nums text-xs',
                      render: (a) => `$${a.agency_millions}M`,
                    },
                    {
                      key: 'vehicle_m',
                      header: 'Vehicle $M',
                      cellClassName: 'tabular-nums text-neon-cyan text-xs',
                      render: (a) => `$${a.top_vehicle_millions}M`,
                    },
                    {
                      key: 'cta',
                      header: '',
                      align: 'right',
                      render: (a) => (
                        <AskCoPilotButton
                          prompt={`Agency vehicle preference: ${a.agency} buys primarily via ${a.top_vehicle} ($${a.top_vehicle_millions}M of $${a.agency_millions}M in NAICS ${naics}). Capture implications and holder map?`}
                          label="Brief"
                          onAsk={askCoPilot}
                        />
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState icon={Briefcase} title="No agency vehicle split" description="Agency rollup appears as more award data loads." accent="cyan" />
              )}
            </CollapsibleSection>

            {va?.by_extent_competed.length ? (
              <CollapsibleSection
                title="Extent Competed"
                subtitle="Full & open vs limited competition"
                icon={Crosshair}
                accent="amber"
                defaultOpen={false}
              >
                <DataTable
                  data={va.by_extent_competed}
                  rowKey={(e) => e.extent_competed}
                  emptyMessage=""
                  columns={[
                    { key: 'extent', header: 'Extent', cellClassName: 'max-w-[200px] truncate', render: (e) => <span title={e.extent_competed}>{e.extent_competed}</span> },
                    { key: 'millions', header: '$M', cellClassName: 'tabular-nums text-neon-cyan text-xs', render: (e) => `$${e.millions}M` },
                    { key: 'actions', header: 'Actions', cellClassName: 'tabular-nums text-xs', render: (e) => e.actions?.toLocaleString() },
                  ]}
                />
              </CollapsibleSection>
            ) : null}

            <CollapsibleSection
              title="Vehicle Access Builder"
              subtitle="1102 MCPs · schedule research → vault"
              icon={Globe}
              accent="purple"
              defaultOpen={false}
            >
              <div className="insight vault mb-3">
                Deep vehicle intel often needs schedule holder lookup (SAM.gov), labor rate sanity (GSA CALC+), and award history (USASpending) — run via co-pilot; outputs land in Knowledge Vault.
              </div>
              <div className="space-y-2 mb-4">
                {VEHICLE_MCP_STUBS.map((stub) => (
                  <div key={stub.label} className="tool-card flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="tool-card-name">{stub.label}</div>
                      <div className="tool-card-desc">Via <span className="text-neon-cyan">{stub.mcp}</span> MCP</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`pill text-[9px] ${stub.status === 'Ready' ? 'text-neon-lime border-neon-lime/40' : 'text-text-500'}`}>
                        {stub.status}
                      </span>
                      <AskCoPilotButton
                        prompt={`${stub.label} for NAICS ${naics}. Dominant vehicle: ${vSummary.top_vehicle || 'TBD'}. ${vehicleStrategyPrompt}`}
                        label="Query"
                        onAsk={askCoPilot}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setSidebar('tools')} className="text-[10px] text-neon-cyan hover:underline">
                MCP Tools catalog →
              </button>
            </CollapsibleSection>

            <CollapsibleSection
              title="FFP / Performance Shaping Radar"
              subtitle="Non-fixed pricing pressure · expiring shape targets"
              icon={Sparkles}
              accent="amber"
              defaultOpen={ffpShapeNow.length > 0 || (ffpSummary.agencies_high_pressure || 0) > 0}
              titleGlossaryId="ffp_shaping_radar"
              onGlossaryLearn={openGlossaryInVault}
              badge={ffpShapeNow.length > 0 ? (
                <span className="pill text-[10px]">{ffpShapeNow.length} shape now</span>
              ) : undefined}
            >
              <div className="insight amber mb-3">
                {ffp?.meta.policy_note || 'EO signal: agencies pushed toward firm-fixed and performance-based buying.'}
                {' '}
                <a
                  href={ffp?.meta.eo_reference || 'https://www.whitehouse.gov/presidential-actions/2026/04/promoting-efficiency-accountability-and-performance-in-federal-contracting/'}
                  target="_blank"
                  rel="noopener"
                  className="text-neon-cyan hover:underline"
                >
                  EO reference →
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="market-stat-chip" title={getGlossaryTip('non_fixed_pricing')}>
                  <div className="label">Non-fixed market</div>
                  <div className="value text-neon-amber">{ffpSummary.market_non_fixed_pct ?? '—'}%</div>
                </div>
                <div className="market-stat-chip" title={getGlossaryTip('pricing_bucket')}>
                  <div className="label">Cost-type</div>
                  <div className="value">{ffpSummary.market_cost_reimbursement_pct ?? '—'}%</div>
                </div>
                <div className="market-stat-chip" title={getGlossaryTip('pricing_bucket')}>
                  <div className="label">T&M / LH</div>
                  <div className="value">{ffpSummary.market_time_materials_pct ?? '—'}%</div>
                </div>
                <div className="market-stat-chip" title={getGlossaryTip('firm_fixed_pricing')}>
                  <div className="label">Firm fixed</div>
                  <div className="value text-neon-lime">{ffpSummary.market_firm_fixed_pct ?? '—'}%</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <AskCoPilotButton
                  prompt={ffpShapingPrompt}
                  label="Shaping strategy brief"
                  onAsk={askCoPilot}
                />
                <button type="button" onClick={() => setSidebar('skills')} className="text-[10px] text-neon-cyan hover:underline">
                  IGCE FFP skill →
                </button>
              </div>

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">
                Agency non-fixed pricing pressure
              </div>
              {ffpAgencyPressure.length ? (
                <DataTable
                  data={ffpAgencyPressure}
                  rowKey={(a) => a.agency}
                  emptyMessage=""
                  onGlossaryLearn={openGlossaryInVault}
                  columns={[
                    {
                      key: 'agency',
                      header: 'Agency',
                      cellClassName: 'max-w-[140px]',
                      render: (a: AgencyPricingPressure) => (
                        <button
                          type="button"
                          onClick={() => navigateToAgencyOpportunities(a.agency)}
                          className="truncate text-left text-neon-cyan hover:underline"
                          title={a.agency}
                        >
                          {a.agency}
                        </button>
                      ),
                    },
                    {
                      key: 'non_fixed',
                      header: 'Non-fixed',
                      headerTip: 'non_fixed_pricing',
                      cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                      render: (a: AgencyPricingPressure) => (
                        <span className={a.non_fixed_pct >= 45 ? 'text-neon-magenta' : ''}>{a.non_fixed_pct}%</span>
                      ),
                    },
                    {
                      key: 'pressure',
                      header: 'Pressure',
                      headerTip: 'pressure_tier',
                      cellClassName: 'text-[10px] whitespace-nowrap',
                      render: (a: AgencyPricingPressure) => (
                        <span className={PRESSURE_TIER_META[a.pressure_tier].tone}>
                          {PRESSURE_TIER_META[a.pressure_tier].label}
                        </span>
                      ),
                    },
                    {
                      key: 'gate',
                      header: 'Gate',
                      headerTip: 'agency_shape_gate',
                      cellClassName: 'text-[10px] whitespace-nowrap',
                      render: (a: AgencyPricingPressure) => (
                        <span className={AGENCY_SHAPE_GATE_META[a.shape_gate].tone}>
                          {AGENCY_SHAPE_GATE_META[a.shape_gate].label}
                        </span>
                      ),
                    },
                    {
                      key: 'flex',
                      header: 'Dominant flex type',
                      headerTip: 'dominant_flex_pricing',
                      cellClassName: 'text-[9px] text-text-400 max-w-[120px] truncate',
                      render: (a: AgencyPricingPressure) => (
                        <span title={a.dominant_non_fixed_pricing || getGlossaryTip('dominant_flex_pricing')}>
                          {(a.dominant_non_fixed_pricing || '—').slice(0, 20)}
                        </span>
                      ),
                    },
                    {
                      key: 'exp',
                      header: 'Exp. non-fixed',
                      headerTip: 'non_fixed_pricing',
                      cellClassName: 'tabular-nums text-xs',
                      render: (a: AgencyPricingPressure) => a.expiring_non_fixed_count || '—',
                    },
                    {
                      key: 'cta',
                      header: '',
                      align: 'right',
                      render: (a: AgencyPricingPressure) => (
                        <AskCoPilotButton
                          prompt={buildFfpShapingPrompt({ naics, summary: ffpSummary, agency: a })}
                          label="Brief"
                          onAsk={askCoPilot}
                        />
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState icon={Sparkles} title="No agency pressure data" description="Loads with bulk pricing fields in ingest." accent="amber" />
              )}

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5 mt-4">
                Shape-now targets — non-fixed expiring work
              </div>
              {ffpShapeTargets.length ? (
                <DataTable
                  data={ffpShapeTargets}
                  rowKey={(t) => t.award_key || `${t.recipient}-${t.end_date}`}
                  emptyMessage=""
                  onGlossaryLearn={openGlossaryInVault}
                  columns={[
                    {
                      key: 'gate',
                      header: 'Gate',
                      headerTip: 'shape_gate',
                      cellClassName: 'text-[10px] whitespace-nowrap',
                      render: (t: FfpShapeTarget) => (
                        <span className={FFP_SHAPE_GATE_META[t.shape_gate].tone} title={t.shape_reason}>
                          {FFP_SHAPE_GATE_META[t.shape_gate].label}
                        </span>
                      ),
                    },
                    {
                      key: 'recipient',
                      header: 'Incumbent',
                      cellClassName: 'max-w-[130px]',
                      render: (t: FfpShapeTarget) => (
                        <button
                          type="button"
                          onClick={() => navigateToCompetitorOpportunities(t.recipient)}
                          className="truncate text-left text-neon-cyan hover:underline"
                          title={t.recipient}
                        >
                          {t.recipient}
                        </button>
                      ),
                    },
                    {
                      key: 'agency',
                      header: 'Agency',
                      cellClassName: 'text-[10px] max-w-[110px] truncate',
                      render: (t: FfpShapeTarget) => (
                        <button
                          type="button"
                          onClick={() => navigateToAgencyOpportunities(t.agency)}
                          className="hover:text-neon-cyan truncate max-w-full text-left"
                          title={t.agency}
                        >
                          {t.agency.slice(0, 18)}
                        </button>
                      ),
                    },
                    {
                      key: 'pricing',
                      header: 'Pricing',
                      headerTip: 'pricing_bucket',
                      cellClassName: 'text-[9px] max-w-[100px]',
                      render: (t: FfpShapeTarget) => (
                        <span title={`${t.pricing} — ${t.shape_reason}`}>
                          <span className={PRICING_BUCKET_META[t.pricing_bucket]?.tone || ''}>
                            {PRICING_BUCKET_META[t.pricing_bucket]?.label || t.pricing_bucket}
                          </span>
                        </span>
                      ),
                    },
                    {
                      key: 'end',
                      header: 'Ends',
                      cellClassName: 'tabular-nums text-[10px] whitespace-nowrap',
                      render: (t: FfpShapeTarget) => t.end_date?.slice(0, 10) || '—',
                    },
                    {
                      key: 'oblig',
                      header: '$M',
                      cellClassName: 'tabular-nums text-neon-cyan text-xs',
                      render: (t: FfpShapeTarget) => `$${t.obligation_millions}M`,
                    },
                    {
                      key: 'cta',
                      header: '',
                      align: 'right',
                      render: (t: FfpShapeTarget) => (
                        <div className="row-actions">
                          <button
                            onClick={() => addToPipeline(
                              {
                                ...t,
                                title: `Shape: ${t.recipient} (${t.pricing})`,
                                notes: t.shape_reason,
                              },
                              'ffp-shaping',
                            )}
                            className="action-btn pipeline text-[10px]"
                          >
                            +pipeline
                          </button>
                          <AskCoPilotButton
                            prompt={buildFfpShapingPrompt({ naics, summary: ffpSummary, target: t })}
                            label="Shape"
                            onAsk={askCoPilot}
                          />
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={Target}
                  title="No non-fixed expiring targets"
                  description="Firm-fixed recompetes are excluded. Expand ingest years or check agencies with lower flexible-pricing share."
                  accent="amber"
                  actions={
                    <AskCoPilotButton
                      prompt={`SAM.gov scan for pre-RFP shaping opportunities (RFI, Sources Sought) in NAICS ${naics} where agencies may shift toward firm-fixed or performance-based pricing. ${ffpShapingPrompt}`}
                      label="SAM pre-RFP scan"
                      onAsk={askCoPilot}
                    />
                  }
                />
              )}

              <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5 mt-4">
                Shaping research pipeline
              </div>
              <div className="space-y-2">
                {FFP_SHAPING_MCP_STUBS.map((stub) => (
                  <div key={stub.label} className="tool-card flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="tool-card-name">{stub.label}</div>
                      <div className="tool-card-desc">Via <span className="text-neon-cyan">{stub.mcp}</span> MCP</div>
                    </div>
                    <AskCoPilotButton
                      prompt={`${stub.label} for FFP shaping in NAICS ${naics}. Focus agencies with high non-fixed pricing and expiring flexible contracts. ${ffpShapingPrompt}`}
                      label="Run"
                      onAsk={askCoPilot}
                    />
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Set-Aside Mix"
              subtitle="How work is competed · by obligated $"
              icon={Crosshair}
              accent="magenta"
              defaultOpen
              titleGlossaryId="set_aside_mix"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="chart-panel surface-accent-magenta border-0 shadow-none p-0 bg-transparent min-w-0">
                <div className="chart-panel-sub mb-3">
                  Dominant full-and-open spend → prime-level competition. High small-business share ({setAsideVehicle.smallBizPct}%) → teaming / sub opportunities. {setAsideVehicle.hint}
                </div>
                <SetAsideBarChart data={setAsideRows} />
                {setAsideRows.length > 0 && (
                  <DataTable
                    className="mt-3"
                    data={setAsideRows}
                    rowKey={(s) => s.fullName}
                    emptyMessage=""
                    columns={[
                      { key: 'type', header: 'Set-Aside', cellClassName: 'max-w-[180px] truncate text-text-primary', render: (s) => <span title={s.fullName}>{s.name}</span> },
                      { key: 'millions', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (s) => `$${s.millions}M` },
                      { key: 'actions', header: 'Actions', cellClassName: 'tabular-nums text-text-400 whitespace-nowrap', render: (s) => s.actions?.toLocaleString() ?? '—' },
                    ]}
                  />
                )}
              </div>
            </CollapsibleSection>
          </div>
        )
      }

      case 'geo': {
        const ga = geographicAnalysis
        const gSummary = ga?.summary || {}
        const geoPosture = (gSummary.posture || 'moderate') as keyof typeof GEO_CONCENTRATION_META
        const geoStates = ga?.by_state || geo.map((g: any, i: number) => ({
          state: g.state,
          actions: g.actions || 0,
          millions: g.millions || 0,
          share_pct: 0,
          avg_award_k: 0,
          quadrant: 'watch' as const,
          pursuit_lens: i < 2 ? 'anchor' as const : 'monitor' as const,
          expiring_count: 0,
          expiring_millions: 0,
        })) as GeoStateRow[]
        const mapStates = ga?.map_states?.length
          ? ga.map_states
          : geoStates.map((s) => ({
              state: s.state,
              actions: s.actions,
              millions: s.millions,
              share_pct: s.share_pct,
            }))
        const stateScatterData = buildStateScatterData(mapStates)
        const stateMedians = getStateMedians(mapStates)
        const medStateActions = stateMedians.actions
        const medStateMillions = stateMedians.millions * 1e6
        const agencyStateHeatmap = buildAgencyStateHeatmap(ga?.agency_state_pairs || [], 6, 10)
        const anchorStates = geoStates.filter((s) => s.pursuit_lens === 'anchor' || s.pursuit_lens === 'target')
        const expiringByState = ga?.expiring_by_state || []
        const agencyStatePairs = ga?.agency_state_pairs || []
        const recompeteBarStates = geoStates.slice(0, 8).filter((s) => s.millions > 0)
        const regionalPrompt = buildRegionalStrategyPrompt({
          naics,
          summary: gSummary,
          topState: geoStates[0],
          expiringState: expiringByState[0],
        })

        return (
          <div className="page-sections">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
              <MetricCard
                label="Top delivery state"
                value={gSummary.top_state || geoStates[0]?.state || '—'}
                accent="cyan"
                tooltip={getGlossaryTip('place_of_performance')}
              />
              <MetricCard
                label="Top 3 state share"
                value={`${gSummary.top3_state_pct ?? '—'}%`}
                accent="magenta"
                tooltip={getGlossaryTip('geo_concentration')}
              />
              <MetricCard
                label="States in slice"
                value={String(gSummary.state_count ?? (geoStates.length || '—'))}
                accent="lime"
                tooltip={getGlossaryTip('place_of_performance')}
              />
              <MetricCard
                label="Expiring (36m)"
                value={`${gSummary.expiring_state_count ?? expiringByState.length} st · $${gSummary.expiring_millions ?? '—'}M`}
                accent="amber"
                tooltip={getGlossaryTip('recompete_radar')}
              />
            </div>

            <CollapsibleSection
              title="Regional Posture"
              subtitle={GEO_CONCENTRATION_META[geoPosture].label}
              icon={MapPin}
              accent="cyan"
              defaultOpen
              titleGlossaryId="geo_concentration"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight cyan mb-3">
                <span className={GEO_CONCENTRATION_META[geoPosture].tone}>
                  {GEO_CONCENTRATION_META[geoPosture].label}
                </span>
                {' — '}{GEO_CONCENTRATION_META[geoPosture].hint}
                {ga?.meta?.data_note && (
                  <span className="block mt-2 text-text-500 text-[10px]">{ga.meta.data_note}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <AskCoPilotButton
                  prompt={regionalPrompt}
                  label="Regional strategy brief"
                  onAsk={askCoPilot}
                />
                <button type="button" onClick={() => setDashTab('competitive')} className="text-[10px] text-neon-cyan hover:underline">
                  Map regional incumbents →
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Regional Views"
              subtitle="Map · intensity scatter · where dollars land"
              icon={Layers}
              accent="cyan"
              defaultOpen
              titleGlossaryId="place_of_performance"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight mb-3">
                USASpending <strong className="text-text-primary">place of performance</strong> — darker cyan = more obligated $. Scatter uses the same quadrant logic as Agency Intelligence (hot = above both medians). SAM.gov live reqs will layer on top by PoP filters later.
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="chart-panel surface-accent-cyan border-0 shadow-none p-3 bg-transparent min-w-0">
                  <div className="text-xs font-medium text-text-500 mb-1">Delivery concentration map</div>
                  <GeoDeliveryMap states={mapStates} />
                  <div className="text-[10px] text-text-500 mt-1">Hover states for $M share. Empty states = no awards in NAICS slice.</div>
                </div>
                <div className="chart-panel surface-accent-lime border-0 shadow-none p-3 bg-transparent min-w-0">
                  <div className="text-xs font-medium text-text-500 mb-1">State intensity (volume vs value)</div>
                  {stateScatterData.length ? (
                    <div className="chart-module" style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                          <CartesianGrid stroke={CHART.gridStroke} />
                          <XAxis
                            type="number"
                            dataKey="x"
                            name="Actions"
                            stroke={CHART.axisStroke}
                            tick={CHART.axisTickSm}
                            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            name="Obligations"
                            stroke={CHART.axisStroke}
                            tick={CHART.axisTickSm}
                            width={48}
                            tickFormatter={(v) =>
                              v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v}`
                            }
                          />
                          <ZAxis type="number" dataKey="z" range={[48, 220]} />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ payload }) => {
                              if (!payload?.length) return null
                              const d = payload[0].payload
                              return (
                                <div className="chart-tooltip">
                                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                                  <div>Actions: {d.x.toLocaleString()}</div>
                                  <div>Obligations: ${d.millions}M ({d.sharePct}%)</div>
                                  {d.isHot && <div className="text-neon-magenta">★ Hot state</div>}
                                </div>
                              )
                            }}
                          />
                          <ReferenceLine x={medStateActions} stroke={CHART.colors.magenta} strokeDasharray="3 3" />
                          <ReferenceLine y={medStateMillions} stroke={CHART.colors.cyan} strokeDasharray="3 3" />
                          <Scatter data={stateScatterData}>
                            {stateScatterData.map((entry, index) => (
                              <Cell
                                key={`state-scatter-${index}`}
                                fill={
                                  entry.quadrant === 'hot'
                                    ? CHART.colors.magenta
                                    : entry.quadrant === 'high_value'
                                      ? CHART.colors.cyan
                                      : entry.quadrant === 'high_volume'
                                        ? CHART.colors.lime
                                        : '#64748b'
                                }
                              />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="chart-module-empty">Need state data in current NAICS slice.</div>
                  )}
                  <div className="text-[10px] text-text-500 mt-2">
                    Magenta = hot · Cyan = high $ · Lime = high volume · Gray = watch. Reference lines = medians.
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Delivery State Rankings"
              subtitle={`${geoStates.length} top states · detail table`}
              icon={BarChart3}
              accent="cyan"
              defaultOpen={false}
              titleGlossaryId="place_of_performance"
              onGlossaryLearn={openGlossaryInVault}
            >
              <DataTable
                data={geoStates}
                rowKey={(g) => g.state}
                emptyMessage="No geographic data in current slice."
                onGlossaryLearn={openGlossaryInVault}
                columns={[
                  {
                    key: 'state',
                    header: 'St',
                    cellClassName: 'font-mono w-10 whitespace-nowrap',
                    render: (g) => g.state,
                  },
                  {
                    key: 'share',
                    header: 'Share',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (g) => (
                      <span className={g.share_pct >= 12 ? 'text-neon-magenta' : ''}>{g.share_pct}%</span>
                    ),
                  },
                  {
                    key: 'quadrant',
                    header: 'Quadrant',
                    headerTip: 'state_quadrant',
                    cellClassName: 'text-[10px] whitespace-nowrap',
                    render: (g) => (
                      <span className={STATE_QUADRANT_META[g.quadrant]?.tone || ''}>
                        {STATE_QUADRANT_META[g.quadrant]?.short || g.quadrant}
                      </span>
                    ),
                  },
                  {
                    key: 'lens',
                    header: 'Pursuit lens',
                    headerTip: 'pursuit_lens',
                    cellClassName: 'text-[10px] whitespace-nowrap',
                    render: (g) => (
                      <span className={PURSUIT_LENS_META[g.pursuit_lens]?.tone || ''}>
                        {PURSUIT_LENS_META[g.pursuit_lens]?.label || g.pursuit_lens}
                      </span>
                    ),
                  },
                  {
                    key: 'buyer',
                    header: 'Top buyer',
                    cellClassName: 'max-w-[120px] truncate text-xs',
                    render: (g) => <span title={g.top_agency || ''}>{(g.top_agency || '—').slice(0, 18)}</span>,
                  },
                  {
                    key: 'incumbent',
                    header: 'Top incumbent',
                    cellClassName: 'max-w-[120px] truncate text-xs',
                    render: (g) => <span title={g.top_recipient || ''}>{(g.top_recipient || '—').slice(0, 18)}</span>,
                  },
                  {
                    key: 'expiring',
                    header: 'Expiring',
                    cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                    render: (g) => (
                      g.expiring_count > 0
                        ? <span className="text-neon-amber">{g.expiring_count} · ${g.expiring_millions}M</span>
                        : '—'
                    ),
                  },
                  {
                    key: 'stats',
                    header: 'Volume',
                    cellClassName: 'tabular-nums whitespace-nowrap text-xs',
                    render: (g) => `${g.actions.toLocaleString()} act · $${g.millions}M`,
                  },
                ]}
              />
            </CollapsibleSection>

            {anchorStates.length > 0 && (
              <CollapsibleSection
                title="Anchor & Target States"
                subtitle={`${anchorStates.length} priority geographies`}
                icon={Crosshair}
                accent="magenta"
                defaultOpen
                titleGlossaryId="pursuit_lens"
                onGlossaryLearn={openGlossaryInVault}
              >
                <div className="insight magenta mb-3">
                  {anchorStates.slice(0, 3).map((s) => (
                    <span key={s.state} className="block text-[11px] mb-1">
                      <strong className="text-text-primary">{s.state}</strong>
                      {' — '}{PURSUIT_LENS_META[s.pursuit_lens].strategy}
                    </span>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {agencyStatePairs.length > 0 && (
              <CollapsibleSection
                title="Buyer × Delivery Geography"
                subtitle="Heatmap + top agency–state flows"
                icon={Users}
                accent="lime"
                defaultOpen={!!agencyStateHeatmap.agencies.length}
              >
                <div className="insight mb-3">
                  Agencies rarely spend evenly nationwide — darker cells show where a buyer concentrates delivery dollars (USASpending PoP). Use to align regional BD with the customer you are shaping.
                </div>
                <RelationshipHeatmap
                  model={agencyStateHeatmap}
                  onAgencyClick={(agency) => {
                    setDashTab('agency')
                    setAgencySearch(agency.slice(0, 24))
                  }}
                  onCellClick={(agency, state, actions) => {
                    askCoPilot(
                      `Regional capture for ${agency} with place of performance ${state} in NAICS ${naics}. ${actions} historical actions in slice. Map incumbents, teaming, and SAM reqs by PoP.`,
                    )
                  }}
                />
                <DataTable
                  className="mt-3"
                  data={agencyStatePairs.slice(0, 12)}
                  rowKey={(r, i) => `${r.agency}-${r.state}-${i}`}
                  emptyMessage=""
                  columns={[
                    { key: 'agency', header: 'Agency', cellClassName: 'max-w-[160px] truncate', render: (r) => <span title={r.agency}>{(r.agency || '').slice(0, 24)}</span> },
                    { key: 'state', header: 'St', cellClassName: 'font-mono w-10', render: (r) => r.state },
                    { key: 'millions', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (r) => `$${r.millions}M` },
                    { key: 'actions', header: 'Actions', cellClassName: 'tabular-nums text-text-400 whitespace-nowrap', render: (r) => r.actions?.toLocaleString() ?? '—' },
                  ]}
                />
              </CollapsibleSection>
            )}

            {expiringByState.length > 0 && (
              <CollapsibleSection
                title="Recompete Geography"
                subtitle={`${expiringByState.length} states · next ${ga?.meta?.months_ahead || 36} months`}
                icon={Clock}
                accent="amber"
                defaultOpen
                titleGlossaryId="recompete_radar"
                onGlossaryLearn={openGlossaryInVault}
              >
                <div className="insight amber mb-3">
                  Expiring awards by <strong className="text-text-primary">place of performance</strong> — where delivery teams and regional primes matter on follow-on work. Cross-check incumbents on Competitive Analysis.
                </div>
                {recompeteBarStates.length > 0 && (
                  <div className="chart-panel surface-accent-amber border-0 shadow-none p-0 bg-transparent min-w-0 mb-3">
                    <div className="text-xs font-medium text-text-500 mb-1">Total vs expiring $M (top states)</div>
                    <div className="chart-panel-plot" style={{ height: 220 }}>
                      <Plot
                        data={[
                          {
                            type: 'bar',
                            name: 'Total PoP $',
                            x: recompeteBarStates.map((s) => s.state),
                            y: recompeteBarStates.map((s) => s.millions),
                            marker: { color: CHART.colors.cyan },
                            hovertemplate: '%{x}<br>Total $%{y}M<extra></extra>',
                          },
                          {
                            type: 'bar',
                            name: 'Expiring $',
                            x: recompeteBarStates.map((s) => s.state),
                            y: recompeteBarStates.map((s) => s.expiring_millions),
                            marker: { color: CHART.colors.amber },
                            hovertemplate: '%{x}<br>Expiring $%{y}M<extra></extra>',
                          },
                        ]}
                        layout={{
                          barmode: 'group',
                          margin: { t: 8, l: 40, r: 8, b: 28 },
                          paper_bgcolor: CHART.transparent,
                          plot_bgcolor: CHART.transparent,
                          font: { size: 9, color: CHART.fontColor },
                          yaxis: { title: '$M' },
                          legend: { orientation: 'h', y: 1.12, font: { size: 9 } },
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  </div>
                )}
                <DataTable
                  data={expiringByState}
                  rowKey={(r) => r.state}
                  emptyMessage=""
                  columns={[
                    { key: 'state', header: 'St', cellClassName: 'font-mono w-10', render: (r) => r.state },
                    { key: 'count', header: 'Awards', cellClassName: 'tabular-nums whitespace-nowrap', render: (r) => r.expiring_count },
                    { key: 'millions', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (r) => `$${r.expiring_millions}M` },
                    { key: 'nearest', header: 'Nearest end', cellClassName: 'font-mono text-xs whitespace-nowrap', render: (r) => r.nearest_end?.slice(0, 10) || '—' },
                    {
                      key: 'cta',
                      header: '',
                      align: 'right',
                      render: (r) => (
                        <button
                          type="button"
                          className="text-[10px] text-neon-lime hover:underline"
                          onClick={() => {
                            setDashTab('opportunities')
                            askCoPilot(`Surface expiring NAICS ${naics} awards with place of performance ${r.state}. Map incumbents and regional teaming options.`)
                          }}
                        >
                          +pipeline scan
                        </button>
                      ),
                    },
                  ]}
                />
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="Regional Research (MCP)"
              subtitle="Data pulls for PoP and teaming"
              icon={Globe}
              accent="cyan"
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GEO_MCP_STUBS.map((stub) => (
                  <div key={stub.label} className="surface p-2 rounded-lg border border-border-800/60">
                    <div className="text-[11px] text-text-primary">{stub.label}</div>
                    <div className="text-[10px] text-text-500">{stub.mcp} · {stub.status}</div>
                    <AskCoPilotButton
                      prompt={`${stub.label} for NAICS ${naics} regional analysis. Top states: ${geoStates.slice(0, 5).map((s) => s.state).join(', ')}. ${regionalPrompt}`}
                      label="Run"
                      onAsk={askCoPilot}
                    />
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )
      }

      case 'combo': {
        const isInVault = (name: string) =>
          !!findCompetitorBrainEntry(name) || !!findEntityBrainEntry(name, 'agency')
        const anchorStateCodes = (geographicAnalysis?.map_states || []).slice(0, 5).map((s) => s.state)
        const resolvedCombo = (comboInsights?.matches?.length
          ? comboInsights
          : buildClientComboInsights({
              expiring,
              intensity,
              topRecipients,
              anchorStates: anchorStateCodes,
            }))
        const comboMatches = enrichComboWithVault(resolvedCombo.matches || [], isInVault)
        const comboSummary = resolvedCombo.summary || {}
        const signalMix = resolvedCombo.signal_mix || []
        const tierCounts = resolvedCombo.tier_counts || {}
        const comboFromFallback = !comboInsights?.matches?.length && comboMatches.length > 0
        const comboScatter = buildComboScatterPoints(comboMatches)
        const tierBarData = (['prime', 'advance', 'monitor', 'track'] as const).map((t) => ({
          tier: t,
          count: tierCounts[t] || 0,
          label: COMBO_TIER_META[t].label,
        }))
        const fallbackRows = comboExpiring.slice(0, 6)

        return (
          <div className="page-sections">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
              <MetricCard
                label="Combo matches"
                value={String(comboSummary.match_count ?? (comboMatches.length || fallbackRows.length))}
                accent="lime"
                tooltip={getGlossaryTip('combo_signal')}
              />
              <MetricCard
                label="Prime targets"
                value={String(comboSummary.prime_count ?? tierCounts.prime ?? 0)}
                accent="magenta"
                tooltip={getGlossaryTip('combo_tier')}
              />
              <MetricCard
                label="Hot buyer overlap"
                value={String(comboSummary.hot_agency_overlap ?? hotRecompeteCount)}
                accent="cyan"
                tooltip={getGlossaryTip('hot_agency')}
              />
              <MetricCard
                label="Prime $ (loaded)"
                value={`$${comboSummary.prime_millions ?? hotRecompeteM.toFixed(1)}M`}
                accent="amber"
                tooltip={getGlossaryTip('recompete_radar')}
              />
            </div>

            <CollapsibleSection
              title="Intersection Logic"
              subtitle="How combo scoring works"
              icon={Lightbulb}
              accent="lime"
              defaultOpen
              titleGlossaryId="combo_tier"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight lime mb-3">
                Combo stacks <strong className="text-text-primary">real intersections</strong> from tabs you already use — expiring timing + hot agency + top incumbent + anchor PoP + flexible pricing. Vault entries add a +10 boost. Not a suitability score (that needs capability profile).
              </div>
              {(resolvedCombo.meta?.scoring_note) && (
                <div className={`text-[10px] mb-2 ${comboFromFallback ? 'text-neon-amber' : 'text-text-500'}`}>
                  {resolvedCombo.meta.scoring_note}
                  {comboFromFallback && ' Hit Refresh after restarting the backend for the full scored endpoint.'}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {(['hot_agency', 'top_incumbent', 'anchor_pop', 'near_term', 'flex_pricing', 'high_value', 'vault_tracked'] as ComboSignal[]).map((sig) => (
                  <span key={sig} className={`pill text-[10px] ${COMBO_SIGNAL_META[sig].tone}`}>
                    {COMBO_SIGNAL_META[sig].label}
                  </span>
                ))}
              </div>
            </CollapsibleSection>

            {comboMatches.length > 0 && (
              <CollapsibleSection
                title="Signal & Priority Views"
                subtitle="Mix · timing vs value scatter"
                icon={Crosshair}
                accent="lime"
                defaultOpen
              >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="chart-panel surface-accent-lime border-0 shadow-none p-3 bg-transparent min-w-0">
                    <div className="text-xs font-medium text-text-500 mb-1">Signal frequency (loaded matches)</div>
                    {signalMix.length ? (
                      <div className="chart-panel-plot" style={{ height: Math.max(160, signalMix.length * 24) }}>
                        <Plot
                          data={[{
                            type: 'bar',
                            orientation: 'h',
                            y: signalMix.map((s) => COMBO_SIGNAL_META[s.signal as ComboSignal]?.short || s.signal).reverse(),
                            x: signalMix.map((s) => s.count).reverse(),
                            marker: { color: CHART.colors.lime },
                            hovertemplate: '%{y}<br>%{x} matches<extra></extra>',
                          }]}
                          layout={{
                            margin: { t: 4, l: 88, r: 12, b: 24 },
                            paper_bgcolor: CHART.transparent,
                            plot_bgcolor: CHART.transparent,
                            font: { size: 9, color: CHART.fontColor },
                            xaxis: { title: 'Matches' },
                          }}
                          style={{ width: '100%', height: '100%' }}
                          config={{ displayModeBar: false }}
                        />
                      </div>
                    ) : (
                      <div className="chart-module-empty">No signal mix yet.</div>
                    )}
                  </div>
                  <div className="chart-panel surface-accent-magenta border-0 shadow-none p-3 bg-transparent min-w-0">
                    <div className="text-xs font-medium text-text-500 mb-1">Priority matrix — months to end vs $M</div>
                    {comboScatter.length ? (
                      <div className="chart-panel-plot" style={{ height: 260 }}>
                        <Plot
                          data={(['prime', 'advance', 'monitor', 'track'] as const).map((tier) => ({
                            type: 'scatter',
                            mode: 'markers',
                            name: COMBO_TIER_META[tier].label,
                            x: comboScatter.filter((p) => p.tier === tier).map((p) => p.x),
                            y: comboScatter.filter((p) => p.tier === tier).map((p) => p.y),
                            text: comboScatter.filter((p) => p.tier === tier).map((p) => p.name),
                            marker: {
                              size: comboScatter.filter((p) => p.tier === tier).map((p) => p.z / 12),
                              color:
                                tier === 'prime' ? CHART.colors.magenta
                                  : tier === 'advance' ? CHART.colors.cyan
                                    : tier === 'monitor' ? CHART.colors.amber
                                      : '#64748b',
                              opacity: 0.85,
                            },
                            hovertemplate: '%{text}<br>%{x}mo · $%{y}M<extra></extra>',
                          }))}
                          layout={{
                            margin: { t: 8, l: 44, r: 8, b: 32 },
                            paper_bgcolor: CHART.transparent,
                            plot_bgcolor: CHART.transparent,
                            font: { size: 9, color: CHART.fontColor },
                            xaxis: { title: 'Months to end', autorange: 'reversed' },
                            yaxis: { title: '$M' },
                            legend: { orientation: 'h', y: 1.15, font: { size: 9 } },
                          }}
                          style={{ width: '100%', height: '100%' }}
                          config={{ displayModeBar: false }}
                        />
                      </div>
                    ) : (
                      <div className="chart-module-empty">No combo matches to plot.</div>
                    )}
                    <div className="text-[10px] text-text-500 mt-1">Left = sooner. Larger bubble ≈ higher combo score.</div>
                  </div>
                </div>
                {tierBarData.some((t) => t.count > 0) && (
                  <div className="chart-panel surface-accent-cyan border-0 shadow-none p-0 bg-transparent min-w-0 mt-3">
                    <div className="text-xs font-medium text-text-500 mb-1">Matches by combo tier</div>
                    <div className="chart-panel-plot" style={{ height: 140 }}>
                      <Plot
                        data={[{
                          type: 'bar',
                          x: tierBarData.map((t) => t.label),
                          y: tierBarData.map((t) => t.count),
                          marker: {
                            color: [CHART.colors.magenta, CHART.colors.cyan, CHART.colors.amber, '#64748b'],
                          },
                          hovertemplate: '%{x}<br>%{y} matches<extra></extra>',
                        }]}
                        layout={{
                          margin: { t: 8, l: 36, r: 8, b: 40 },
                          paper_bgcolor: CHART.transparent,
                          plot_bgcolor: CHART.transparent,
                          font: { size: 9, color: CHART.fontColor },
                          yaxis: { title: 'Count' },
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="Ranked Combo Matches"
              subtitle="Scored intersections · pipeline-ready"
              icon={TrendingUp}
              accent="lime"
              defaultOpen
              badge={comboMatches.length > 0 ? <span className="pill text-[10px]">{comboMatches.length}</span> : undefined}
              titleGlossaryId="combo_tier"
              onGlossaryLearn={openGlossaryInVault}
            >
              <div className="insight lime mb-3">
                Highest-leverage crosses — expiring work where buyer intensity, incumbent position, geography, and timing align. +pipeline primes; +brain competitors for vault compounding.
              </div>
              {comboMatches.length ? (
                <>
                  <DataTable
                    data={comboMatches}
                    rowKey={(e, i) => e.award_key || `${e.recipient}-${e.end_date}-${i}`}
                    rowClassName={(e) => (e.combo_tier === 'prime' ? 'intensity-row-hot' : '')}
                    onGlossaryLearn={openGlossaryInVault}
                    columns={[
                      {
                        key: 'tier',
                        header: 'Tier',
                        headerTip: 'combo_tier',
                        cellClassName: 'text-[10px] whitespace-nowrap',
                        render: (e: ComboMatch) => (
                          <span className={COMBO_TIER_META[e.combo_tier].tone}>
                            {COMBO_TIER_META[e.combo_tier].label}
                          </span>
                        ),
                      },
                      {
                        key: 'score',
                        header: 'Score',
                        cellClassName: 'tabular-nums text-xs whitespace-nowrap',
                        render: (e: ComboMatch) => (
                          <span className={(e.display_score ?? e.combo_score) >= 55 ? 'text-neon-magenta' : ''}>
                            {e.display_score ?? e.combo_score}
                          </span>
                        ),
                      },
                      {
                        key: 'signals',
                        header: 'Signals',
                        headerTip: 'combo_signal',
                        cellClassName: 'max-w-[140px]',
                        render: (e: ComboMatch) => (
                          <div className="flex flex-wrap gap-0.5">
                            {e.signals.slice(0, 4).map((s) => (
                              <span key={s} className={`pill text-[9px] ${COMBO_SIGNAL_META[s]?.tone || ''}`}>
                                {COMBO_SIGNAL_META[s]?.short || s}
                              </span>
                            ))}
                          </div>
                        ),
                      },
                      { key: 'end', header: 'Ends', cellClassName: 'font-mono text-xs whitespace-nowrap', render: (e: ComboMatch) => `${e.months_to_end}m · ${e.end_date?.slice(0, 10) || '—'}` },
                      { key: 'recipient', header: 'Incumbent', cellClassName: 'max-w-[130px] truncate', render: (e: ComboMatch) => <span title={e.recipient}>{(e.recipient || '').slice(0, 18)}</span> },
                      { key: 'agency', header: 'Buyer', cellClassName: 'text-xs max-w-[120px] truncate', render: (e: ComboMatch) => <span title={e.agency}>{(e.agency || '').slice(0, 16)}</span> },
                      { key: 'pop', header: 'PoP', cellClassName: 'font-mono text-xs w-8', render: (e: ComboMatch) => e.pop_state || '—' },
                      { key: 'oblig', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (e: ComboMatch) => `$${e.obligation_millions}M` },
                      {
                        key: 'actions',
                        header: '',
                        align: 'right',
                        render: (e: ComboMatch) => (
                          <div className="row-actions">
                            <button onClick={() => addToPipeline(e, 'combo')} className="action-btn pipeline text-xs">+ pipeline</button>
                            <button onClick={() => addToBrain(e, e.recipient, 'competitor')} className="action-btn brain text-xs">+ brain</button>
                            <AskCoPilotButton prompt={buildComboBriefPrompt(e, naics)} onAsk={askCoPilot} />
                          </div>
                        ),
                      },
                    ]}
                  />
                  <button
                    onClick={() => comboMatches.filter((e) => e.combo_tier === 'prime' || e.combo_tier === 'advance').slice(0, 5).forEach((e) => addToPipeline(e, 'combo'))}
                    className="action-btn pipeline text-[10px] mt-2"
                  >
                    +pipeline prime & advance (top 5)
                  </button>
                </>
              ) : fallbackRows.length ? (
                <DataTable
                  data={fallbackRows}
                  rowKey={(e, i) => e.award_key || `${e.recipient}-${e.end_date}-${i}`}
                  rowClassName={() => 'intensity-row-hot'}
                  columns={[
                    { key: 'end', header: 'Ends', cellClassName: 'font-mono text-xs whitespace-nowrap', render: (e) => e.end_date?.slice(0, 10) },
                    { key: 'recipient', header: 'Recipient', cellClassName: 'max-w-[160px] truncate', render: (e) => <span title={e.recipient}>{e.recipient || '—'}</span> },
                    { key: 'oblig', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (e) => `$${((e.obligation || 0) / 1e6).toFixed(1)}M` },
                    { key: 'agency', header: 'Agency', cellClassName: 'text-neon-lime text-xs max-w-[140px] truncate', render: (e) => <span title={e.agency}>{(e.agency || '').slice(0, 20)} ★</span> },
                    {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      render: (e) => (
                        <button onClick={() => addToPipeline(e, 'combo')} className="action-btn pipeline text-xs">+ pipeline</button>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No combo matches yet"
                  description="Needs expiring contracts in your NAICS slice intersecting hot agencies. Ingest more years or widen the months window."
                  accent="lime"
                  actions={
                    <Button variant="soft" onClick={() => setDashTab('opportunities')}>Future Opportunities</Button>
                  }
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Combo Research (MCP)"
              subtitle="Turn intersections into capture actions"
              icon={Globe}
              accent="cyan"
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {COMBO_MCP_STUBS.map((stub) => (
                  <div key={stub.label} className="surface p-2 rounded-lg border border-border-800/60">
                    <div className="text-[11px] text-text-primary">{stub.label}</div>
                    <div className="text-[10px] text-text-500">{stub.mcp} · {stub.status}</div>
                    <AskCoPilotButton
                      prompt={`${stub.label} for NAICS ${naics} combo targets. Prime matches: ${comboMatches.filter((m) => m.combo_tier === 'prime').slice(0, 3).map((m) => `${m.recipient}/${m.agency}`).join('; ') || 'none loaded'}.`}
                      label="Run"
                      onAsk={askCoPilot}
                    />
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )
      }

      default:
        return null
    }
  }

  function renderMain() {
    if (sidebar === 'dashboard') {
      return (
        <div>
          <TabBar
            tabs={DASHBOARD_TABS}
            activeId={dashTab}
            onChange={(id) => setDashTab(id)}
          />
          <div className="surface surface-hover rounded-2xl">
            {renderDashboardContent()}
          </div>
        </div>
      )
    }

    if (sidebar === 'pipeline') {
      return (
        <div className="page-sections">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
            <MetricCard label="Pipeline" value={String(pipeline.length)} accent="magenta" tooltip="Active pursuits you chose to track" />
            <MetricCard label="Expiring (loaded)" value={String(expiring.length)} accent="magenta" tooltip="From current NAICS slice on dashboard" />
            <MetricCard label="Brain entries" value={String(brain.length)} accent="purple" />
            <MetricCard
              label="Market size"
              value={kpis ? `$${kpis.total_obligations_m}M` : '—'}
              accent="amber"
              tooltip="Total obligations in current NAICS filter"
            />
          </div>

          <CollapsibleSection
            title="Pursuits"
            subtitle="Active opportunities you chose to track"
            icon={Briefcase}
            accent="magenta"
            defaultOpen
            badge={pipeline.length > 0 ? <span className="pill text-[10px]">{pipeline.length}</span> : undefined}
          >
            <div className="text-xs text-text-500 mb-2">Distinct from Knowledge Vault — this is your bid/watch list.</div>
            {pipeline.length === 0 && (
              <EmptyState
                icon={Briefcase}
                title="No pursuits tracked yet"
                description="Use + pipeline on Future Opportunities, expiring contracts, or SAM results. Items persist to disk automatically."
                accent="magenta"
                actions={
                  <>
                    <Button variant="pipeline" onClick={() => { setSidebar('dashboard'); setDashTab('opportunities') }}>
                      <Clock className="w-3.5 h-3.5" /> Future Opportunities
                    </Button>
                    <Button variant="soft" onClick={() => { setSidebar('dashboard'); setDashTab('combo') }}>
                      Combo Insights
                    </Button>
                  </>
                }
              />
            )}
            {pipeline.map((p, i) => {
              const pid = p.id || p.ts
              return (
                <div key={i} className="entry flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div><span className="font-medium">{p.type}</span> — {p.recipient || p.agency || p.label || JSON.stringify(p).slice(0,70)}</div>
                    <div className="entry-meta">from {p.source || 'dashboard'} • NAICS {p.naics} • {new Date(p.ts).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => removeFromPipeline(pid)} className="text-neon-red/80 text-xs hover:underline shrink-0" title="Remove this pursuit from the accumulator (native files if any stay)">remove</button>
                </div>
              )
            })}
            {pipeline.length > 0 && (
              <button onClick={async () => { if (confirm('Clear all pipeline?')) { try { await fetch('/user/pipeline/clear', {method:'DELETE'}) } catch{}; await syncAccumulators() } }} className="action-btn pipeline mt-3" title="Clear the entire active pipeline list. Use when you want a fresh start on tracked opportunities. The Knowledge Vault is untouched.">
                Clear pipeline
              </button>
            )}
          </CollapsibleSection>
        </div>
      )
    }

    if (sidebar === 'artifacts') {
      return (
        <div className="page-sections">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
            <MetricCard label="Pursuit folders" value={String(pursuitFolders.length)} accent="magenta" tooltip="Skill outputs under data/knowledge/pursuits/" />
            <MetricCard label="Global wiki clean" value={vaultAudit?.ok ? 'Yes' : vaultAudit ? 'Check' : '—'} accent={vaultAudit?.ok ? 'lime' : 'amber'} tooltip="Pursuit files must not appear in global/" />
            <MetricCard label="Pipeline" value={String(pipeline.length)} accent="magenta" tooltip="Tracked pursuits and SAM monitors" />
            <MetricCard label="NAICS slice" value={naics} accent="cyan" tooltip="Current dashboard filter" />
          </div>

          <div className="insight magenta mb-3">
            <strong className="text-text-primary">Skill-generated drafts</strong> — not the curated Knowledge Vault. Click <strong className="text-text-primary">Open</strong> to preview in the side panel (same pattern as Workspace). Richer deliverables come as skills and agents mature.
          </div>

          {vaultAudit && (
            <div className={`text-[10px] mb-3 surface p-2 rounded-lg ${vaultAudit.ok ? 'text-neon-lime' : 'text-neon-amber'}`}>
              {vaultAudit.message}
              {(vaultAudit.pursuit_slugs?.length ?? 0) > 0 && (
                <span className="text-text-500"> · On disk: {vaultAudit.pursuit_slugs!.join(', ')}</span>
              )}
            </div>
          )}

          <CollapsibleSection
            title="Pursuit artifacts"
            subtitle="From Future Opportunities → Workspace skills"
            icon={FolderOpen}
            accent="magenta"
            defaultOpen
            badge={pursuitFolders.length > 0 ? <span className="pill text-[10px]">{pursuitFolders.length}</span> : undefined}
          >
            <div className="flex flex-wrap gap-2 mb-2">
              <button onClick={async () => { await loadUserAccumulators() }} className="action-btn vault text-xs">
                Refresh
              </button>
              <button type="button" onClick={() => { setSidebar('dashboard'); setDashTab('opportunities') }} className="action-btn pipeline text-xs">
                Open Future Opportunities
              </button>
            </div>
            <PursuitArtifactsList
              pursuits={pursuitFolders}
              onOpen={(path, title) => openArtifactPath(path, title)}
              onDelete={deletePursuitFolder}
              emptyMessage="No artifacts yet — open Workspace on a recompete row and run a skill (Capture Brief, SAM Scan, Battlecard, etc.)."
            />
          </CollapsibleSection>
        </div>
      )
    }

    if (sidebar === 'vault') {
      return (
        <div className="page-sections">
          <div className="insight purple mb-3">
            <strong className="text-text-primary">Foundational curated knowledge</strong> — global wiki concepts, brain entries (competitors, agencies), and glossary education. Skill-generated pursuit drafts live under <button type="button" onClick={() => setSidebar('artifacts')} className="text-neon-cyan hover:underline">Artifacts</button>, not here.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
            <MetricCard label="Brain entries" value={String(brain.length)} accent="purple" tooltip="Data-tied accumulator entries" />
            <MetricCard label="Global wiki" value={String(globalFiles.length)} accent="purple" tooltip="Evergreen capture knowledge pages" />
            <MetricCard label="Native .md" value={String(brainWiki.length)} accent="purple" tooltip="Synthesized files on disk in brain/" />
            <MetricCard label="NAICS slice" value={naics} accent="cyan" tooltip="Current dashboard filter feeding seeds" />
          </div>

          <CollapsibleSection
            title="Capture Insights Glossary"
            subtitle="Plain-language definitions for app labels & signals"
            icon={Lightbulb}
            accent="amber"
            defaultOpen
          >
            <div className="insight amber mb-3">
              Every glossaried label in the dashboard has an info icon (hover for quick tip) and a <strong className="text-text-primary">vault</strong> link for deeper education. This page is the canonical reference.
            </div>
            <button
              type="button"
              onClick={() => openGlossaryInVault('ffp_shaping_radar')}
              className="action-btn vault text-[10px]"
            >
              <BookOpen size={12} /> Open glossary in reader
            </button>
            <span className="text-[10px] text-text-500 ml-2 font-mono">{GLOSSARY_VAULT_PATH}</span>
          </CollapsibleSection>

          <CollapsibleSection
            title="Vault Access"
            subtitle="data/knowledge · Obsidian · schema"
            icon={BookOpen}
            accent="purple"
            defaultOpen={false}
          >
            <div className="text-sm text-text-300 leading-snug mb-3">
              Domain intel, observations, and capture guidance as native .md. App seeds from USASpending with citations — curate in Obsidian for graph, backlinks, and full editing.
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-text-500 font-mono">data/knowledge/</span>
              <button onClick={() => { try { navigator.clipboard.writeText('data/knowledge') } catch {} }} className="action-btn vault" title="Copy vault root for Obsidian">
                <Copy size={13}/> Copy root
              </button>
              <button onClick={() => { try { navigator.clipboard.writeText('cd C:\\Users\\benma\\capture-insights\n# Open data/knowledge as vault in Obsidian desktop for full wiki + your Shipley notes') } catch {} }} className="action-btn vault" title="Copy open instructions for Obsidian">
                <FolderOpen size={13}/> Obsidian setup
              </button>
            </div>
            <div className="text-[10px] text-text-500 mt-2 flex items-center gap-1.5">
              <Info size={12} className="shrink-0" />
              Shipley, negotiation, and training notes live in <span className="font-mono text-accent-purple">education/</span> — schema in <span className="font-mono text-accent-purple">schema/capture-llm-wiki.md</span>
            </div>
          </CollapsibleSection>

          {(intensity.length > 0 || expiring.length > 0) && (
            <CollapsibleSection
              title="Seed from Dashboard"
              subtitle="Pull hot agencies or expiring rows into vault"
              icon={Plus}
              accent="cyan"
              defaultOpen={false}
            >
              <div className="action-group">
                {intensity.length > 0 && (
                  <button onClick={() => {
                    const top = intensity.slice(0, 3)
                    top.forEach(a => addToBrain({ ...a, notes: `seeded from intensity hot (vol ${a.award_count} oblig ${((a.total_oblig || 0) / 1e6).toFixed(1)}M)` }, a.agency, 'agency'))
                  }} className="action-btn vault" title="Seed top 3 agencies from intensity with citations">
                    <Plus size={13}/> Top 3 agencies
                  </button>
                )}
                {expiring.length > 0 && (
                  <button onClick={() => {
                    const vis = expiring.slice(0, 3)
                    vis.forEach(e => addToBrain({ ...e, notes: `seeded from expiring radar (ends ${e.end_date} ${((e.obligation || 0) / 1e6).toFixed(1)}M)` }, e.recipient || e.agency, 'competitor'))
                  }} className="action-btn vault" title="Seed top 3 expiring awards with citations">
                    <Plus size={13}/> Top 3 expiring
                  </button>
                )}
              </div>
              <div className="text-[10px] text-text-500 mt-2">Uses the current NAICS slice. LLM synthesizes full atomic notes per schema on disk.</div>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Brain Entries"
            subtitle="Synthesized notes + your overlays"
            icon={Layers}
            accent="purple"
            defaultOpen
            badge={brain.length > 0 ? <span className="pill text-[10px]">{brain.length}</span> : undefined}
          >
            {brain.length === 0 && (
              <EmptyState
                icon={BookOpen}
                title="Vault is empty"
                description="Add competitors and agencies via +brain on Competitive or Agency tabs, or seed from hot agencies / expiring contracts above."
                accent="purple"
                actions={
                  <>
                    <Button variant="vault" onClick={() => { setSidebar('dashboard'); setDashTab('competitive') }}>
                      Competitive Analysis
                    </Button>
                    <Button variant="vault" onClick={() => { setSidebar('dashboard'); setDashTab('agency') }}>
                      Agency Intelligence
                    </Button>
                  </>
                }
              />
            )}
            {brain.map((b, i) => {
              const bid = b.id || b.addedAt
              const wiki = brainWiki.find((w: any) => {
                const bn = (b.name || '').toLowerCase().slice(0,14)
                const wn = (w.name || '').toLowerCase().slice(0,14)
                return bn && wn && (bn.includes(wn) || wn.includes(bn))
              })
              const display = wiki ? (wiki.excerpt || wiki.content) : (b.notes || '')
              return (
                <BrainEntryCard
                  key={i}
                  name={b.name}
                  type={b.type}
                  citation={b.citation ? `Citation: ${b.citation}` : undefined}
                  display={display}
                  wikiPath={wiki?.path}
                  hasWiki={!!wiki}
                  overlayValue={b.notes}
                  onRemove={() => removeFromBrain(bid)}
                  onOverlayBlur={(v) => updateBrainNote(bid, v)}
                  onAsk={askCoPilot}
                />
              )
            })}
            {brain.length > 0 && (
              <button onClick={async () => {
                if (confirm('Clear entire Knowledge Vault? Native .md files stay on disk until you delete them in Obsidian or Explorer. Education/ and schema/ are untouched.')) {
                  try { await fetch('/user/brain/clear', { method: 'DELETE' }) } catch {}
                  await syncAccumulators()
                }
              }} className="action-btn destructive mt-2" title="Clears in-app accumulator only — .md files on disk remain">
                <Trash2 size={13}/> Clear vault (UI only)
              </button>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Global Wiki"
            subtitle="Evergreen capture knowledge · ariadne base"
            icon={BookOpen}
            accent="purple"
            defaultOpen={false}
            badge={globalFiles.length > 0 ? <span className="pill text-[10px]">{globalFiles.length}</span> : undefined}
          >
            <div className="text-[10px] text-text-500 mb-2">
              Shipley, domain intel, and process guides at data/knowledge/global/. Separate from brain/ (data-tied entries).
            </div>
            <button onClick={async () => { await loadUserAccumulators() }} className="action-btn vault text-xs mb-2">
              Refresh list
            </button>
            {globalFiles.length === 0 && (
              <div className="text-xs text-text-500">No global files in UI — click Refresh (backend has 155+ from ariadne).</div>
            )}
            {globalFiles.length > 0 && (
              <div className="text-xs min-w-0">
                {globalFiles.slice(0, 12).map((g, i) => (
                  <EntryRow
                    key={i}
                    title={g.name}
                    type={g.type || 'global'}
                    excerpt={(g.excerpt || '').slice(0, 160)}
                    path={g.path}
                    onClick={() => openVaultPreview(g.path, g.name, { navigate: false })}
                    actions={
                      <>
                        <button onClick={() => openVaultPreview(g.path, g.name, { navigate: false })} className="action-btn vault text-[10px]">
                          <Eye size={11}/> View
                        </button>
                        <button onClick={() => { try { navigator.clipboard.writeText(g.path || '') } catch {} }} className="action-btn vault text-[10px]">
                          <Copy size={11}/> path
                        </button>
                      </>
                    }
                  />
                ))}
                {globalFiles.length > 12 && (
                  <div className="text-text-500 text-[10px] mt-1">+ {globalFiles.length - 12} more in Obsidian at data/knowledge/global/</div>
                )}
              </div>
            )}
          </CollapsibleSection>

          {brainWiki.length > 0 && (
            <CollapsibleSection
              title="Native .md on Disk"
              subtitle="brain/ source of truth"
              icon={FolderOpen}
              accent="purple"
              defaultOpen={false}
              badge={<span className="pill text-[10px]">{brainWiki.length}</span>}
            >
              <div className="text-[10px] text-text-500 mb-2">Synthesized files in data/knowledge/brain/. App + LLM append; you curate in Obsidian.</div>
              {brainWiki.slice(0, 8).map((w, i) => (
                <EntryRow
                  key={i}
                  title={w.name}
                  type={w.type}
                  excerpt={(w.excerpt || w.content || '').slice(0, 160)}
                  path={w.path}
                  onClick={() => openVaultPreview(w.path, w.name, { navigate: false })}
                  actions={
                    <>
                      <button onClick={() => openVaultPreview(w.path, w.name, { navigate: false })} className="action-btn vault text-[10px]">
                        <Eye size={11}/> View
                      </button>
                      <button onClick={() => { try { navigator.clipboard.writeText(w.path || '') } catch {} }} className="action-btn vault text-[10px]">
                        <Copy size={12}/> path
                      </button>
                    </>
                  }
                />
              ))}
              {brainWiki.length > 8 && <div className="text-[10px] text-text-500 mt-1">+ {brainWiki.length - 8} more on disk</div>}
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Vault Maintenance"
            subtitle="Lint · index · LLM schema fixes"
            icon={Wrench}
            accent="purple"
            defaultOpen={false}
          >
            <div className="text-[10px] text-text-500 mb-1">
              Stats: {brainWiki.length} native .md files on disk | {brain.length} brain entries. 
              These run the exact lint + catalog tasks defined in the schema. You click once — the system/LLM does the work (no terminal, no --lint flags). 
              Click lint to see problems → click fix, LLM auto-appends the missing sections per schema (Key Signals, Citations, Open Questions, Personal Observations, etc.).
            </div>
            <div className="action-group">
              <button onClick={runVaultLint} disabled={vaultMaintLoading} className="action-btn vault">
                Run Lint (check .md structure)
              </button>
              <button onClick={rebuildVaultIndex} disabled={vaultMaintLoading} className="action-btn vault">
                Rebuild Index Catalog
              </button>
            </div>
            {lintReport && (
              <div className="mt-2 text-xs border border-edge rounded p-2 bg-ink-900">
                <div className="font-medium">Lint result: {lintReport.ok ? 'CLEAN' : 'ISSUES FOUND'} — {lintReport.summary}</div>
                {lintReport.legacy_dirs?.length > 0 && <div className="text-neon-red/80">Legacy dirs: {lintReport.legacy_dirs.join(', ')}</div>}
                {lintReport.entries?.filter((e: any) => !e.ok).slice(0, 4).map((e: any, i: number) => (
                  <div key={i} className="text-neon-red/80 mt-0.5">{e.name} ({e.type}): {e.issues?.join('; ')}</div>
                ))}
                {lintReport.ok && <div className="text-neon-cyan">All native .md files follow the schema rules.</div>}
                {!lintReport.ok && (
                  <button
                    onClick={async () => {
                      setVaultMaintLoading(true)
                      try {
                        const res = await fetch('/user/brain/fix', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lint_report: lintReport })
                        })
                        if (res.ok) {
                          const data = await res.json()
                          // re-lint to show the improvement (LLM did the appends)
                          await runVaultLint()
                          // optional: surface what happened
                          alert(data.message || 'LLM applied schema fixes to the .md files.')
                        }
                      } catch {}
                      setVaultMaintLoading(false)
                    }}
                    disabled={vaultMaintLoading}
                    className="action-btn vault mt-1"
                    title="LLM reads the lint issues + schema, then appends the exact missing sections (Key Signals, Citations, Open Questions, Personal Observations, etc.) to the native .md files on disk. This is the admin work you want the agent to own."
                  >
                    LLM Fix These Issues (auto-append per schema)
                  </button>
                )}
              </div>
            )}
            {indexStatus && (
              <div className="mt-1 text-xs text-neon-cyan">Index catalog rebuilt ({indexStatus.bytes} bytes). Open data/knowledge/index.md in Obsidian to see the fresh list.</div>
            )}
            <div className="text-[9px] text-text-500 mt-1">Run before agent handoff or after big data seeds.</div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Training Data"
            subtitle="unsloth fine-tunes · future curation"
            icon={BookOpen}
            accent="none"
            defaultOpen={false}
          >
            <div className="text-[10px] text-text-500">
              High-signal datasets in <span className="font-mono">data/knowledge/training/datasets/</span> (JSONL for unsloth), examples/, prompts/.
              LLM proposes valuable gaps — you review before append (human-in-loop).
            </div>
            <div className="text-[9px] text-text-500 mt-1">See schema/capture-llm-wiki.md — Training Data Collection.</div>
          </CollapsibleSection>
        </div>
      )
    }

    if (sidebar === 'tools') {
      const servers = mcpInfo.servers || []
      const onlineCount = mcpInfo.online_count ?? servers.filter((s) => s.status === 'online').length
      const procurement = servers.filter((s) => s.category === 'procurement')
      const regulatory = servers.filter((s) => s.category === 'regulatory')
      return (
        <div className="page-sections">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
            <MetricCard label="1102 MCPs" value={String(mcpInfo.server_count ?? (servers.length || 8))} accent="magenta" tooltip="Eight federal-contracting MCP servers from 1102tools" />
            <MetricCard label="Online now" value={String(onlineCount)} accent={onlineCount > 0 ? 'lime' : 'amber'} tooltip="MCPs with live discovered endpoints" />
            <MetricCard label="Backend" value={health === 'live' ? 'Healthy' : health === 'checking' ? '…' : 'Issue'} accent={health === 'live' ? 'cyan' : 'amber'} />
            <MetricCard label="Chat context" value={useSmartModel ? 'Smart' : 'Fast'} accent="purple" tooltip="Model path used by co-pilot actions" />
          </div>

          <CollapsibleSection
            title="Federal MCP Servers"
            subtitle="1102tools · pick by data need, not endpoint"
            icon={Wrench}
            accent="magenta"
            defaultOpen
            badge={
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); loadMcpTools(true) }}
                className="action-btn flex items-center gap-1 px-2 py-0.5 text-[10px] shrink-0"
              >
                <RefreshCw size={11} /> Refresh
              </button>
            }
          >
            <div className="text-[10px] text-text-500 mb-3">
              Eight MCPs from{' '}
              <a href="https://github.com/1102tools/federal-contracting-mcps" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">
                federal-contracting-mcps
              </a>
              . Need contract history → USASpending. Need SAM notices → SAM.gov. Co-pilot and buttons pick endpoints; expand any MCP to see tools for awareness.
            </div>
            {servers.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="MCP catalog loading…"
                description={mcpInfo.how_to_enable || mcpInfo.note || 'Catalog lists all eight 1102 MCPs. SAM.gov endpoints appear when the server is reachable.'}
                accent="magenta"
              />
            ) : (
              <>
                {procurement.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">Procurement data</div>
                    <div className="space-y-2 min-w-0">
                      {procurement.map((s) => <McpServerCard key={s.id} server={s} />)}
                    </div>
                  </div>
                )}
                {regulatory.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">Regulatory & policy</div>
                    <div className="space-y-2 min-w-0">
                      {regulatory.map((s) => <McpServerCard key={s.id} server={s} />)}
                    </div>
                  </div>
                )}
              </>
            )}
            {mcpInfo.note && <div className="text-[10px] text-text-500 mt-2">{mcpInfo.note}</div>}
          </CollapsibleSection>

          <CollapsibleSection
            title="How Agents Use MCPs"
            subtitle="Buttons · co-pilot · suggested actions"
            icon={MessageSquare}
            accent="magenta"
            defaultOpen={false}
          >
            <div className="insight mb-2">
              You choose the <strong className="text-text-primary">MCP</strong> by intent (SAM data, spend data, FAR text). The co-pilot selects the right tool inside that MCP. Contextual buttons and chat never expect you to know endpoint names.
            </div>
            <div className="text-[10px] text-text-500">SAM.gov is integrated today; other MCPs show as catalog until wired. Direct API fallbacks still work for core SAM search.</div>
          </CollapsibleSection>
        </div>
      )
    }

    if (sidebar === 'skills') {
      const federal1102 = skillsCatalog.federal_1102 || []
      const theseusCapture = skillsCatalog.theseus_capture || []
      const marketing = skillsCatalog.marketing || []
      const partialCount = skillsCatalog.partial_count ?? theseusCapture.filter((s) => s.status === 'partial').length
      return (
        <div className="page-sections">
          <div className="insight mb-3">
            Skill catalog and co-pilot stubs. Pursuit outputs from Workspace land in{' '}
            <button type="button" onClick={() => setSidebar('artifacts')} className="text-neon-cyan hover:underline">Artifacts</button>
            {' '}— curated knowledge stays in{' '}
            <button type="button" onClick={() => setSidebar('vault')} className="text-neon-cyan hover:underline">Knowledge Vault</button>.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
            <MetricCard label="Skills catalog" value={String(skillsCatalog.skill_count ?? (federal1102.length + theseusCapture.length + marketing.length))} accent="magenta" tooltip="1102 + Theseus + marketing stubs" />
            <MetricCard label="1102 official" value={String(federal1102.length)} accent="cyan" tooltip="federal-contracting-skills orchestration" />
            <MetricCard label="Theseus capture" value={String(theseusCapture.length)} accent="lime" tooltip="Vendored + modified for capture manager" />
            <MetricCard label="Live partial" value={String(partialCount)} accent="amber" tooltip="Behaviors stubbed via co-pilot + dashboard buttons" />
          </div>

          <CollapsibleSection
            title="How Skills Pair With MCPs"
            subtitle="Deliverables · not raw API calls"
            icon={Lightbulb}
            accent="none"
            defaultOpen
          >
            <div className="insight mb-2">
              Eight{' '}
              <button type="button" onClick={() => setSidebar('tools')} className="text-neon-cyan hover:underline">1102 MCPs</button>
              {' '}supply deterministic data. Skills orchestrate that data into acquisition and capture deliverables — IGCE, SOW/PWS, PTW, teaming search, RFP reverse engineering.
            </div>
            <div className="text-[10px] text-text-500">
              Stub run invokes co-pilot today; full skill runner will register parameters, citations, and rerun from chat. Sources:{' '}
              <a href="https://github.com/1102tools/federal-contracting-skills" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">federal-contracting-skills</a>
              ,{' '}
              <a href="https://github.com/coreyhaines31/marketingskills" target="_blank" rel="noopener" className="text-neon-cyan hover:underline">marketingskills</a>
              , Theseus workspace adaptations.
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Theseus Capture Skills"
            subtitle="BD / capture manager · vendored + modified"
            icon={Target}
            accent="lime"
            defaultOpen
          >
            <div className="space-y-2">
              {theseusCapture.length ? theseusCapture.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  naics={naics}
                  onAsk={askCoPilot}
                  onOpenMcp={() => setSidebar('tools')}
                />
              )) : (
                <div className="text-xs text-text-500">Loading catalog…</div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="1102 Acquisition Skills"
            subtitle="federal-contracting-skills · IGCE · SOW/PWS · OT"
            icon={Layers}
            accent="cyan"
            defaultOpen={false}
          >
            <div className="space-y-2">
              {federal1102.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  naics={naics}
                  onAsk={askCoPilot}
                  onOpenMcp={() => setSidebar('tools')}
                />
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Marketing Skills"
            subtitle="coreyhaines31/marketingskills · stubs"
            icon={Sparkles}
            accent="purple"
            defaultOpen={false}
          >
            <div className="space-y-2">
              {marketing.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  naics={naics}
                  onAsk={askCoPilot}
                />
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Roadmap"
            subtitle="Skill runner · parameters · vault output"
            icon={Lightbulb}
            accent="none"
            defaultOpen={false}
          >
            <div className="text-[10px] text-text-500 leading-relaxed">
              Next: register skills with NAICS + vault context, wire Teaming Finder and PTW to USASpending MCP, import 1102 SKILL.md files into workspace agents, and emit structured outputs to Knowledge Vault pursuits/.
            </div>
          </CollapsibleSection>
        </div>
      )
    }

    if (sidebar === 'settings') {
      return (
        <div className="page-sections">
          <CollapsibleSection
            title="Workspace"
            subtitle="NAICS filter · backend health"
            icon={Settings}
            accent="lime"
            defaultOpen
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <div className="market-stat-chip">
                <div className="label">Default NAICS</div>
                <div className="value text-base font-mono">{naics}</div>
                <div className="text-[9px] text-text-500 mt-0.5">Change via topbar — applies across dashboard data</div>
              </div>
              <div className="market-stat-chip">
                <div className="label">Backend</div>
                <div className={`value text-base ${health === 'live' ? 'text-neon-lime' : 'text-neon-amber'}`}>
                  {health === 'live' ? 'Connected' : health === 'checking' ? 'Checking…' : 'Unreachable'}
                </div>
                <div className="text-[9px] text-text-500 mt-0.5">Restart via scripts/start.ps1 if needed</div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Agent & Chat"
            subtitle="Co-pilot model path"
            icon={MessageSquare}
            accent="purple"
            defaultOpen
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-text-primary">Response path</div>
                <div className="text-[10px] text-text-500 mt-0.5">
                  Fast = deterministic context from your data. Smart = local LLM when configured.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseSmartModel(!useSmartModel)}
                className={`chat-model-toggle ${useSmartModel ? 'is-active' : ''}`}
              >
                {useSmartModel ? 'Smart model' : 'Fast context'}
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Integrations"
            subtitle="MCP · SAM.gov API"
            icon={Wrench}
            accent="magenta"
            defaultOpen={false}
          >
            <div className="space-y-2 text-[10px] text-text-500">
              <p>
                <span className="text-text-400">MCP:</span>{' '}
                {mcpInfo.mcp_available ? 'At least one 1102 MCP online (SAM.gov).' : (mcpInfo.how_to_enable || 'Eight MCPs in catalog; SAM.gov warms at startup.')}
              </p>
              <p>
                <span className="text-text-400">SAM live search:</span> Set SAM_API_KEY on the backend for direct API results when MCP is unavailable.
              </p>
              {mcpInfo.note && <p className="text-neon-magenta">{mcpInfo.note}</p>}
            </div>
            <Button variant="soft" className="mt-3" onClick={() => setSidebar('tools')}>
              Open MCP Tools
            </Button>
          </CollapsibleSection>

          <CollapsibleSection
            title="Appearance"
            subtitle="Theme · density · typography"
            icon={Eye}
            accent="none"
            defaultOpen={false}
          >
            <EmptyState
              icon={Settings}
              title="Theme settings coming soon"
              description="Shell tokens are unified today. Per-user theme presets and compact density modes will land here."
              accent="lime"
            />
          </CollapsibleSection>
        </div>
      )
    }

    return null
  }

  // === Resizable chat pane logic (makes the always-on chat actually useful for longer responses + context) ===
  // Drag the left edge of the chat pane to resize width. "Maximize" button makes it substantially larger.
  function startResize(e: React.MouseEvent) {
    setIsResizing(true)
    e.preventDefault()
  }

  useEffect(() => {
    if (!isResizing) return
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(300, Math.min(820, window.innerWidth - ev.clientX))
      setChatWidth(newW)
    }
    const onUp = () => setIsResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing])

  const toggleChat = () => setShowChat(v => !v)
  const maximizeChat = () => setChatWidth(w => (w > 600 ? 380 : 680))

  const contextHeader = `NAICS ${naics} | ${dashTab} | ${kpis ? kpis.total_obligations_m + 'M' : ''} | exp:${expiring.length} int:${intensity.length} fl:${flows.length} | pipe:${pipeline.length} brain:${brain.length}`

  const viewContext = {
    naics,
    dashTab,
    obligationsM: kpis?.total_obligations_m,
    pipelineCount: pipeline.length,
    brainCount: brain.length,
    expiringCount: expiring.length,
    artifactCount: pursuitFolders.length,
  }

  return (
    <>
      <AppShell
        naics={naics}
        onNaicsChange={setNaics}
        onNaicsKeyDown={handleNaicsKey}
        onRefresh={handleRefresh}
        loading={loading}
        showChat={showChat}
        onToggleChat={toggleChat}
        health={health}
        pipelineCount={pipeline.length}
        brainCount={brain.length}
        sidebar={sidebar}
        onSidebarChange={setSidebar}
        navGroups={NAV_GROUPS}
        viewMeta={VIEW_META[sidebar]}
        viewContext={viewContext}
        status={status}
      >
        {renderMain()}
      </AppShell>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {viewedWiki && (
        <DocumentPreviewPanel
          doc={viewedWiki}
          stackWithWorkspace={!!skillWorkspace}
          onClose={() => setViewedWiki(null)}
          onReload={reloadPreviewDoc}
        />
      )}

      {skillWorkspace && (
        <SkillWorkspacePanel
          workspace={skillWorkspace}
          loading={workspaceLoading}
          useLlm={workspaceUseLlm}
          onUseLlmChange={setWorkspaceUseLlm}
          onClose={() => setSkillWorkspace(null)}
          onScaffoldBrief={() => scaffoldPursuitBrief(!!skillWorkspace.briefExists)}
          onRunSkill={runPursuitSkill}
          onOpenVault={() => openArtifactPath(skillWorkspace.briefPath, skillWorkspace.slug, { navigate: false })}
          onOpenArtifact={(path, label) => openArtifactPath(path, label, { navigate: false })}
          onTrack={() => {
            addToPipeline(skillWorkspace.row, 'expiring')
            showToast('Added to Pipeline', 'success')
          }}
        />
      )}

      {/* FLOATING / RESIZABLE CHAT PANE — the holistic always-on co-pilot.
          No separate chat page in sidebar. Drag the left handle or use maximize to make it large and useful for real responses.
          Injects live context from whatever tab + accumulators you are looking at. */}
      {showChat && (
        <div 
          className="chat-pane fixed top-14 bottom-0 right-0 z-[60] flex flex-col overflow-hidden rounded-l-3xl" 
          style={{ width: chatWidth }}
        >
          {/* Drag handle on the left edge */}
          <div 
            className={`resize-handle ${isResizing ? 'active' : ''}`} 
            onMouseDown={startResize}
            title="Drag to resize chat width"
          />

          <div className="chat-header">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-neon-cyan" />
              <div className="chat-header-title">AI Co-pilot</div>
              <span className="chat-header-meta">(always on • context-aware)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUseSmartModel(!useSmartModel)}
                className={`chat-model-toggle ${useSmartModel ? 'is-active' : ''}`}
                title={useSmartModel ? 'Using local LLM. Click for fast context path.' : 'Fast context path. Click to try local LLM.'}
              >
                {useSmartModel ? 'Smart model' : 'Fast context'}
              </button>
              <button type="button" onClick={maximizeChat} className="chat-icon-btn" title="Toggle larger size">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setShowChat(false)} className="chat-icon-btn"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="chat-messages space-y-2">
            {chatHistory.map((m, idx) => (
              <div key={idx} className={m.role === 'user' ? 'text-right' : ''}>
                <div className={`chat-msg ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  {m.content}
                  {m.role === 'assistant' && (m.source || m.model) && (
                    <div className="chat-msg-meta">
                      {m.source}{m.model ? ` • ${m.model}` : ''}
                    </div>
                  )}
                </div>
                {/* Structured suggested actions from the backend (preferred) */}
                {m.role === 'assistant' && m.suggested_actions && m.suggested_actions.length > 0 && (
                  <div className="text-right mt-1">
                    {m.suggested_actions.map((a, aIdx) => (
                      <span
                        key={aIdx}
                        className="chat-suggest"
                        onClick={() => handleChatSuggestedAction(a)}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                )}
                {/* Legacy string-based chips for older messages / fallback content */}
                {m.role === 'assistant' && !m.suggested_actions && m.content.toLowerCase().includes('top') && m.content.toLowerCase().includes('flow') && (
                  <div className="text-right">
                    <span className="chat-suggest" onClick={() => applySuggestedAction('brain-top-flows')}>Add top flows to brain now</span>
                  </div>
                )}
                {m.role === 'assistant' && !m.suggested_actions && m.content.toLowerCase().includes('expir') && (
                  <div className="text-right">
                    <span className="chat-suggest" onClick={() => applySuggestedAction('pipeline-expiring')}>Add some expiring to pipeline</span>
                  </div>
                )}
                {m.role === 'assistant' && !m.suggested_actions && (m.content.toLowerCase().includes('hot') || m.content.toLowerCase().includes('agency')) && (
                  <div className="text-right">
                    <span className="chat-suggest" onClick={() => applySuggestedAction('brain-hot-agencies')}>Add top hot agencies to brain</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="chat-input-row">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
              placeholder="Ask the co-pilot — search SAM, create monitors, find overlaps…"
              className="input-field"
            />
            <button type="button" onClick={sendChat} className="chat-send-btn">Send</button>
          </div>

          <div className="chat-context-bar">
            Live context: {contextHeader}
          </div>
        </div>
      )}

      {/* Floating toggle when chat is closed */}
      {!showChat && (
        <button
          type="button"
          onClick={toggleChat}
          className="chat-fab"
          title="Open the always-available AI co-pilot (sees current tab, filters, pipeline, brain)"
        >
          <MessageSquare className="w-4 h-4" /> AI Co-pilot <span className="text-[10px] opacity-70">(always on)</span>
        </button>
      )}
    </>
  )
}
