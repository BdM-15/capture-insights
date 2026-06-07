import { useState, useEffect } from 'react'
import { 
  BarChart3, Target, Clock, TrendingUp,
  RefreshCw, Plus, MessageSquare, Briefcase, BookOpen, X, Maximize2,
  Copy, FolderOpen, Trash2, Info, Eye, Layers, Wrench,
  GitBranch, PieChart, Crosshair, Lightbulb, Zap, Search, Radar, Users, MapPin,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ScatterChart, Scatter, ReferenceLine, ZAxis } from 'recharts'
import Plot from 'react-plotly.js'
import { AppShell } from './components/shell/AppShell'
import type { HealthState } from './components/shell/Topbar'
import { MetricCard } from './components/ui/MetricCard'
import { TabBar } from './components/ui/TabBar'
import { Button } from './components/ui/Button'
import { EmptyState } from './components/ui/EmptyState'
import { Toast, type ToastState, type ToastTone } from './components/ui/Toast'
import { DataTable } from './components/lists/DataTable'
import { EntryRow } from './components/lists/EntryRow'
import { BrainEntryCard } from './components/lists/BrainEntryCard'
import { AskCoPilotButton } from './components/ui/AskCoPilotButton'
import {
  NAV_GROUPS,
  DASHBOARD_TABS,
  VIEW_META,
  type SidebarId,
} from './constants/viewMeta'
import { CHART } from './constants/chartTheme'
import { CollapsibleSection } from './components/ui/CollapsibleSection'
import { SetAsideBarChart } from './components/charts/SetAsideBarChart'
import { normalizeSetAsideRows } from './utils/chartLabels'

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
  const [geo, setGeo] = useState<any[]>([])
  const [fyTrends, setFyTrends] = useState<any[]>([])
  const [futureTrajectory, setFutureTrajectory] = useState<any[]>([])
  const [setAside, setSetAside] = useState<any[]>([])
  const [topRecipients, setTopRecipients] = useState<any[]>([])
  const [marketPotential, setMarketPotential] = useState<MarketPotentialData | null>(null)
  const [oppSearch, setOppSearch] = useState('')
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
  // Phase 3 vault maintenance (lint + index). These are the exact schema chores you want the LLM/agent to run for you.
  // Buttons below let you trigger them from inside the app instead of terminal.
  const [lintReport, setLintReport] = useState<any>(null)
  const [indexStatus, setIndexStatus] = useState<any>(null)
  const [vaultMaintLoading, setVaultMaintLoading] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = (message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone })
  }

  // Real on-disk persistence via backend (data/user_accumulators.json).
  // This replaces the earlier pure localStorage slice. Adds/deletes/notes now go through the server
  // so the brain/wiki compounds reliably and is the durable source for future features (search by competitor, chat context, skills, etc.).
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
          mcp_available: data.mcp_available,
          note: data.note,
          how_to_enable: data.how_to_enable,
        })
      }
    } catch {}
  }
  useEffect(() => { loadMcpTools() }, [])

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
  const [mcpInfo, setMcpInfo] = useState<{tools: any[], mcp_available?: boolean, note?: string, how_to_enable?: string}>({ tools: [] })

  async function fetchJson(path: string) {
    const r = await fetch(path)
    if (!r.ok) throw new Error(`${r.status} ${path}`)
    return r.json()
  }

  async function loadData() {
    setLoading(true)
    setStatus('Fetching real bulk data from backend...')
    const q = `?naics=${naics}`
    const endpoints: { key: string; path: string; required?: boolean }[] = [
      { key: 'kpis', path: `/data/kpis${q}`, required: true },
      { key: 'flows', path: `/data/flows${q}&limit=6` },
      { key: 'intensity', path: `/data/agency-intensity${q}&limit=12` },
      { key: 'expiring', path: `/data/expiring${q}&months=36&limit=10` },
      { key: 'vehicles', path: `/data/vehicles${q}` },
      { key: 'geo', path: `/data/geo${q}&limit=8` },
      { key: 'fyTrends', path: `/data/fy-trends${q}` },
      { key: 'futureTrajectory', path: `/data/future-trajectory${q}&months=60` },
      { key: 'setAside', path: `/data/set-aside${q}` },
      { key: 'topRecipients', path: `/data/top-recipients${q}&limit=8` },
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
      setStatus('Backend unreachable — run .\\scripts\\start.ps1 from project root (or open http://127.0.0.1:8000 after backend starts).')
      setLoading(false)
      return
    }

    setKpis(data.kpis as KpiData)
    setMarketPotential((data.marketPotential as MarketPotentialData) || null)
    setFlows((data.flows as FlowData[]) || [])
    setIntensity((data.intensity as IntensityData[]) || [])
    setExpiring((data.expiring as ExpiringData[]) || [])
    setVehicles((data.vehicles as any[]) || [])
    setGeo((data.geo as any[]) || [])
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
    async function checkHealth() {
      try {
        const r = await fetch('/health')
        if (!cancelled) setHealth(r.ok ? 'live' : 'degraded')
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
            <CollapsibleSection title="Market Pulse" subtitle={`NAICS ${naics} · ${fySpan}`} icon={BarChart3} accent="cyan" defaultOpen>
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
                <div className="market-stat-chip">
                  <div className="label">Total Market (TAM)</div>
                  <div className="value">{fmtObl(kpis.total_obligations_m)}</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Competitive Field</div>
                  <div className="value">{(marketPotential?.unique_competitors || 0).toLocaleString()} primes</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Momentum</div>
                  <div className="value text-neon-magenta text-base">{marketPotential?.trend || '—'}</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Recompete Radar (24m)</div>
                  <div className="value">{fmtNum(kpis.expiring_24m || 0)} ending</div>
                </div>
              </div>
            </div>

            {/* Executive KPI row — original Data_Insights 7-card glance + vision stubs for global wiki matching */}
            <div>
              <div className="text-[9px] uppercase tracking-[1.5px] text-text-500 mb-1.5 px-0.5">Executive Summary — Glanceable for Capture Managers</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <MetricCard label="Total Obligations" value={fmtObl(kpis.total_obligations_m)} tooltip="TAM in your NAICS slice — size pipeline and executive briefs." accent="amber" />
                <MetricCard label="Total Actions" value={fmtNum(kpis.total_actions)} tooltip="Contract action volume — high count = active or fragmented market." accent="cyan" />
                <MetricCard label="Avg Award Value" value={fmtAvg(kpis.avg_award_value_k)} tooltip="Typical deal size for bid/no-bid and team sizing." accent="lime" />
                <MetricCard label="Active (Approx)" value={fmtNum(kpis.active_contracts_approx)} tooltip="Awards with PoP still open — incumbent landscape signal." accent="cyan" />
                <MetricCard label="Expiring (24m)" value={fmtNum(kpis.expiring_24m || 0)} tooltip="Recompete count in next 24 months — primary radar." accent="magenta" />
                <MetricCard
                  label="Suitability"
                  value={`${kpis.suitability_pct}%`}
                  stub
                  accent="amber"
                  tooltip="Vision stub: % of expiring work matching YOUR business unit capabilities. Will compare contract/agency requirements (from research + web profile building) against global wiki domain intel + company capabilities. Drives go/no-go."
                />
                <MetricCard
                  label="Synergy"
                  value={`${kpis.synergy_pct}%`}
                  stub
                  accent="magenta"
                  tooltip="Vision stub: % where OTHER business units' capabilities create a teaming/synergy play. Uses global wiki multi-BU capability map vs opportunity requirements."
                />
              </div>
            </div>

            {/* Future Funding Potential — recompete dollars at stake (original pulse metric) */}
            <div className="glass p-4 rounded-3xl border border-[#ff2bd6]/25 market-funding-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neon-magenta flex items-center gap-2">
                    <Clock size={15} /> Future Funding Potential
                  </div>
                  <div className="text-[10px] text-text-400 mt-1 max-w-xl">
                    Total obligated dollars on contracts ending soon — your addressable recompete pool. Chase these via Future Opportunities + SAM monitors before RFPs drop.
                  </div>
                </div>
                <button onClick={() => setDashTab('opportunities')} className="action-btn pipeline text-[10px]">Full recompete radar →</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div className="market-stat-chip">
                  <div className="label">24-Month Funding at Risk</div>
                  <div className="value text-neon-magenta">{fmtObl(kpis.future_funding_potential_24m_m || 0)}</div>
                  <div className="text-[9px] text-text-500 mt-0.5">{fmtNum(kpis.expiring_24m || 0)} contracts</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">36-Month Funding at Risk</div>
                  <div className="value text-neon-magenta">{fmtObl(kpis.future_funding_potential_36m_m || 0)}</div>
                  <div className="text-[9px] text-text-500 mt-0.5">{fmtNum(kpis.expiring_36m || 0)} contracts</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Hot-Agency Recompetes</div>
                  <div className="value">{fmtObl(hotRecompeteM)}</div>
                  <div className="text-[9px] text-text-500 mt-0.5">{hotRecompeteCount} in focus agencies</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Match Lens (Future)</div>
                  <div className="value text-base text-neon-amber">{kpis.suitability_pct}% / {kpis.synergy_pct}%</div>
                  <div className="text-[9px] text-text-500 mt-0.5">suitability • synergy when wiki live</div>
                </div>
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

            <CollapsibleSection title="Trends & Capture Focus" subtitle="Spend history · recompete trajectory · intensity" icon={TrendingUp} accent="cyan" defaultOpen>
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
                  <div className="chart-panel-title magenta">Future Trajectory (Recurring Recompete)</div>
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
                  <div className="chart-panel-title magenta">Capture Intensity</div>
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

            <CollapsibleSection title="Money Flows & Share" subtitle="Sankey · competitor concentration" icon={GitBranch} accent="magenta" defaultOpen={false}>
            <div className="space-y-4">
            <div className="chart-panel surface-accent-cyan">
              <div className="chart-panel-title cyan">
                <span>Follow the Money (Recipient → Agency → Office)</span>
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
                <span>Top Competitors by Market Share</span>
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

            <CollapsibleSection title="How Work is Bought" subtitle="Pricing types · contract vehicles" icon={PieChart} accent="lime" defaultOpen={false}>
            <div className="chart-panel surface-accent-lime border-0 shadow-none p-0 bg-transparent">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pricing pie */}
                <div>
                  <div className="text-xs font-medium text-text-500 mb-1">Pricing Types (by $M)</div>
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
                  <div className="text-xs font-medium text-text-500 mb-1">Contract Vehicles / IDV (by $M)</div>
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

            <CollapsibleSection title="Competition & Recompetes" subtitle="Set-aside mix · hot agency expirations" icon={Crosshair} accent="magenta" defaultOpen>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="chart-panel surface-accent-cyan min-w-0">
                <div className="chart-panel-title cyan">Competition Mix (Set-Asides)</div>
                <div className="chart-panel-sub">Top set-aside categories by obligated dollars — compact labels, hover for full text.</div>
                <SetAsideBarChart data={setAsidePulse} compact />
                <button onClick={() => setDashTab('vehicles')} className="text-[10px] text-neon-cyan hover:underline mt-2">Full vehicle analysis →</button>
              </div>

              <div className="chart-panel surface-accent-magenta min-w-0">
                <div className="chart-panel-title magenta">Hot Recompetes in Focus Agencies</div>
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
        // +PIPELINE only makes sense here (future opportunities / recompetes)
        // Enhanced with client-side filter + cross-refs to intensity/brain + SAM live discovery.
        const filteredExpiring = expiring.filter((e: any) =>
          !oppSearch ||
          (e.recipient || '').toLowerCase().includes(oppSearch.toLowerCase()) ||
          (e.agency || '').toLowerCase().includes(oppSearch.toLowerCase())
        )
        const samMonitorCount = pipeline.filter((p: any) => p.type === 'sam-monitor').length
        return (
          <div className="page-sections">
            <CollapsibleSection
              title="Recompete Radar"
              subtitle={`${filteredExpiring.length} of ${expiring.length} · PoP ends in 36 months`}
              icon={Radar}
              accent="magenta"
              defaultOpen
              badge={
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToPipeline({ label: 'expiring batch' }, 'expiring') }}
                  className="action-btn pipeline flex items-center gap-1 px-2 py-0.5 text-[10px] shrink-0"
                >
                  <Plus size={12} /> Batch
                </button>
              }
            >
              <div className="insight magenta mb-3">
                Live recompete opportunities you can position for today. Prioritize rows in hot agencies or ones already in your Brain.
              </div>
              <div className="text-[10px] text-neon-lime mb-2">Monitor (smart) uses the agent (LLM + MCP) with citations. Co-pilot works for open-ended questions.</div>
              <input
                value={oppSearch}
                onChange={(e) => setOppSearch(e.target.value)}
                placeholder="Filter by recipient or agency name..."
                className="input-field mb-2 w-full"
              />
              <DataTable
                data={filteredExpiring.slice(0, 10)}
                rowKey={(e: any, i) => e.award_key || `${e.recipient}-${e.end_date}-${i}`}
                rowClassName={(e: any) => hotAgencies.has(e.agency || '') ? 'intensity-row-hot' : ''}
                emptyMessage="No expiring awards in current slice."
                columns={[
                  {
                    key: 'end',
                    header: 'Ends',
                    cellClassName: 'font-mono text-xs',
                    render: (e: any) => e.end_date,
                  },
                  {
                    key: 'recipient',
                    header: 'Recipient',
                    render: (e: any) => (
                      <span className="truncate max-w-[180px] block" title={e.recipient}>
                        {e.recipient || '—'}
                        {e.award_key && <span className="cite-chip ml-1">{String(e.award_key).slice(0, 12)}</span>}
                      </span>
                    ),
                  },
                  {
                    key: 'oblig',
                    header: '$M',
                    cellClassName: 'tabular-nums text-neon-cyan',
                    render: (e: any) => `$${((e.obligation || 0) / 1e6).toFixed(1)}M`,
                  },
                  {
                    key: 'agency',
                    header: 'Agency',
                    cellClassName: 'text-neon-cyan text-xs',
                    render: (e: any) => (e.agency || '').slice(0, 22),
                  },
                  {
                    key: 'flags',
                    header: 'Flags',
                    render: (e: any) => {
                      const isHot = hotAgencies.has(e.agency || '')
                      const inBrain = brain.some((b: any) => (b.name || '').toLowerCase().includes((e.recipient || '').toLowerCase().slice(0, 15)))
                      return (
                        <span className="text-xs">
                          {isHot && <span className="text-neon-magenta mr-1">★ Hot</span>}
                          {inBrain && <span className="text-neon-lime mr-1">🧠 Brain</span>}
                        </span>
                      )
                    },
                  },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (e: any) => (
                      <div className="row-actions">
                        <button onClick={() => addToPipeline(e, 'expiring')} className="action-btn pipeline text-xs">+ pipeline</button>
                        <AskCoPilotButton
                          prompt={`This contract expires ${e.end_date}: ${e.recipient || 'unknown'} at ${e.agency || 'unknown agency'} for $${((e.obligation || 0) / 1e6).toFixed(1)}M. What SAM notices should I watch, who is the likely incumbent, and what capture moves make sense now?`}
                          onAsk={askCoPilot}
                        />
                        <button
                          onClick={() => {
                            setSamKeywords(e.agency || e.recipient || '')
                            setSamNoticeTypes('RFI,Sources Sought,Special Notice,Presolicitation')
                            searchSamLive()
                          }}
                          className="action-btn ghost text-xs"
                        >
                          Search SAM
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              setLoading(true)
                              const res = await fetch('/user/actions/create-sam-monitor', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ item: e, naics, brain, use_llm: useSmartModel }),
                              })
                              if (res.ok) {
                                const data = await res.json()
                                await syncAccumulators()
                                showToast(`SAM monitor created: ${data.entry?.title || 'monitor'}`, 'success')
                                setChatHistory(h => [...h, { role: 'assistant', content: `Agent created smart SAM monitor: ${data.entry?.title || 'monitor'}. ${data.rationale || ''}` }])
                              } else {
                                const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(e.agency || e.recipient || '')}&naics=${naics}`
                                addToPipeline({ ...e, title: `SAM Monitor: ${e.agency || e.recipient}`, monitorUrl, type: 'sam-monitor' }, 'sam-monitor')
                              }
                            } catch {
                              const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(e.agency || e.recipient || '')}&naics=${naics}`
                              addToPipeline({ ...e, title: `SAM Monitor: ${e.agency || e.recipient}`, monitorUrl, type: 'sam-monitor' }, 'sam-monitor')
                            } finally {
                              setLoading(false)
                            }
                          }}
                          className="action-btn pipeline text-xs"
                          title="Agent builds smart monitor params from this row + your Brain"
                        >
                          Monitor (smart)
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
              <div className="text-[10px] text-text-500 mt-2">+pipeline adds to the Pipeline sidebar. Search SAM prefills live lookup for that cycle.</div>
            </CollapsibleSection>

            <CollapsibleSection title="Live SAM Discovery" subtitle="RFIs · Sources Sought · emerging work" icon={Search} accent="cyan" defaultOpen>
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
        const agencyRows = intensity.slice(0, 12)
        return (
          <div className="page-sections">
            <CollapsibleSection
              title="Agency Rankings"
              subtitle={`${agencyRows.length} agencies · NAICS ${naics}`}
              icon={Users}
              accent="cyan"
              defaultOpen
              badge={hotAgencyList.length > 0 ? <span className="pill text-[10px]">{hotAgencyList.length} hot</span> : undefined}
            >
              <div className="insight mb-3">
                Full list behind the Market Overview intensity chart. +brain agencies worth watching — notes compound in Knowledge Vault for chat and skills.
              </div>
              <DataTable
                data={agencyRows}
                rowKey={(a) => a.agency}
                rowClassName={(a) => isHotAgency(a) ? 'intensity-row-hot' : ''}
                emptyMessage="No agency data in current NAICS slice."
                columns={[
                  {
                    key: 'agency',
                    header: 'Agency',
                    cellClassName: 'max-w-[200px]',
                    render: (a) => (
                      <span className="truncate block" title={a.agency}>
                        {a.agency}
                        {isHotAgency(a) && <span className="text-neon-magenta text-[10px] ml-1">★</span>}
                      </span>
                    ),
                  },
                  {
                    key: 'actions',
                    header: 'Act.',
                    cellClassName: 'tabular-nums text-text-400 whitespace-nowrap',
                    render: (a) => a.award_count?.toLocaleString(),
                  },
                  {
                    key: 'oblig',
                    header: '$M',
                    cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap',
                    render: (a) => `$${((a.total_oblig || 0) / 1e6).toFixed(1)}M`,
                  },
                  {
                    key: 'cta',
                    header: '',
                    align: 'right',
                    render: (a) => (
                      <div className="row-actions">
                        <button onClick={() => addToBrain(a, a.agency, 'agency')} className="action-btn brain text-xs">+ brain</button>
                        <AskCoPilotButton
                          prompt={`What capture approach should I take for ${a.agency}? They have ${a.award_count} actions and $${((a.total_oblig || 0) / 1e6).toFixed(1)}M in my NAICS slice.`}
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
          </div>
        )
      }

      case 'competitive': {
        // +BRAIN / +WIKI here. Sankey pulse (3-level Follow the Money) is on Overview; this tab is the deep table + larger visual + actions.
        // Prepare 3-level Sankey data from flows (Recipient → Agency → Office) — scoped block.
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

        return (
          <div className="page-sections">
            <CollapsibleSection
              title="Money Flows"
              subtitle={`Recipient → agency → office · ${flows.length} flows`}
              icon={GitBranch}
              accent="cyan"
              defaultOpen
            >
              <div className="insight magenta mb-3">
                Deeper Sankey than Market Overview — trace who gets paid, through which agency and office. +brain competitors that matter.
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
              subtitle="Sortable relationships · +brain competitors"
              icon={Target}
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
                    cellClassName: 'max-w-[160px]',
                    render: (f) => <span className="font-medium text-text-primary truncate block" title={f.recipient}>{f.recipient}</span>,
                  },
                  {
                    key: 'agency',
                    header: 'Agency',
                    cellClassName: 'text-text-400 text-xs max-w-[140px] truncate',
                    render: (f) => <span title={f.agency}>{f.agency}</span>,
                  },
                  {
                    key: 'office',
                    header: 'Office',
                    cellClassName: 'text-text-500 text-xs max-w-[120px] truncate',
                    render: (f) => <span title={f.office}>{f.office || '—'}</span>,
                  },
                  {
                    key: 'value',
                    header: '$M',
                    cellClassName: 'tabular-nums whitespace-nowrap',
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
                        <button onClick={() => addToBrain(f, f.recipient, 'competitor')} className="action-btn brain text-xs">+ brain</button>
                        <AskCoPilotButton
                          prompt={`Draft a competitive brief angle for ${f.recipient} at ${f.agency}${f.office ? ` (${f.office})` : ''} — $${f.millions}M across ${f.actions} actions in NAICS ${naics}.`}
                          label="Brief"
                          onAsk={askCoPilot}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </CollapsibleSection>
          </div>
        )
      }

      case 'vehicles': {
        const setAsideRows = normalizeSetAsideRows(setAside, 10)
        return (
          <div className="page-sections">
            <CollapsibleSection title="Contract Vehicles & Pricing" subtitle={`NAICS ${naics} · buying mechanisms`} icon={Layers} accent="lime" defaultOpen>
              <div className="insight lime mb-3">
                This tells you the actual buying mechanisms in your NAICS. High volume on a particular IDIQ or FFP tells you which vehicles to chase or team through. Not every opportunity is a good +pipeline candidate — use this lens to decide capture strategy first.
              </div>
              <DataTable
                data={vehicles.slice(0, 7)}
                rowKey={(v, i) => `${v.pricing}-${v.vehicle}-${i}`}
                emptyMessage="Vehicle breakdown loads with more ingest data."
                columns={[
                  { key: 'vehicle', header: 'Vehicle / Pricing', cellClassName: 'max-w-[200px] truncate', render: (v) => <span title={`${v.pricing} / ${v.vehicle}`}>{v.pricing} / {v.vehicle}</span> },
                  { key: 'actions', header: 'Actions', cellClassName: 'tabular-nums whitespace-nowrap', render: (v) => `${v.actions} actions` },
                  { key: 'millions', header: '$M', cellClassName: 'tabular-nums text-neon-cyan whitespace-nowrap', render: (v) => `$${v.millions}M` },
                  { key: 'note', header: '', align: 'right', cellClassName: 'text-[10px] text-text-500', render: () => 'vehicle intel' },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Set-Aside Mix" subtitle="How work is competed · by obligated $" icon={Crosshair} accent="magenta" defaultOpen>
              <div className="chart-panel surface-accent-magenta border-0 shadow-none p-0 bg-transparent min-w-0">
                <div className="chart-panel-sub mb-3">
                  Dominant full-and-open spend → prime-level competition. High small-business share → teaming / sub opportunities.
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
        return (
          <div className="page-sections">
            <CollapsibleSection
              title="Place of Performance"
              subtitle={`${geo.length} states · concentration by obligated $`}
              icon={MapPin}
              accent="cyan"
              defaultOpen
            >
              <div className="insight mb-3">
                Where work actually happens — office footprint, regional teaming, and customer concentration. Strategic context, not a pipeline action list.
              </div>
              <DataTable
                data={geo}
                rowKey={(g) => g.state}
                emptyMessage="No geographic data in current slice."
                columns={[
                  {
                    key: 'state',
                    header: 'St',
                    cellClassName: 'font-mono w-10 whitespace-nowrap',
                    render: (g) => g.state,
                  },
                  {
                    key: 'stats',
                    header: 'Volume',
                    cellClassName: 'tabular-nums whitespace-nowrap text-xs',
                    render: (g) => `${g.actions} act · $${g.millions}M`,
                  },
                  {
                    key: 'bar',
                    header: 'Share',
                    cellClassName: 'min-w-[120px]',
                    render: (g) => {
                      const w = Math.min(100, Math.round((g.millions / (geo[0]?.millions || 1)) * 100))
                      return <div className="geo-bar max-w-full" style={{ width: `${w}%` }} title={`${w}% of top state`} />
                    },
                  },
                ]}
              />
            </CollapsibleSection>
          </div>
        )
      }

      case 'combo': {
        const comboRows = comboExpiring.slice(0, 6)
        return (
          <div className="page-sections">
            <CollapsibleSection
              title="Hot Recompetes"
              subtitle="Expiring work in high-intensity agencies"
              icon={TrendingUp}
              accent="lime"
              defaultOpen
              badge={comboRows.length > 0 ? <span className="pill text-[10px]">{comboRows.length} matches</span> : undefined}
            >
              <div className="insight lime mb-3">
                Highest-leverage early signal — recompetes where the buyer already spends heavily in your NAICS. +pipeline now; map competitors on Competitive Analysis.
              </div>
              {comboRows.length ? (
                <>
                  <DataTable
                    data={comboRows}
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
                          <div className="row-actions">
                            <button onClick={() => addToPipeline(e, 'combo')} className="action-btn pipeline text-xs">+ pipeline</button>
                            <AskCoPilotButton
                              prompt={`Hot-agency recompete: ${e.recipient} at ${e.agency} ends ${e.end_date} ($${((e.obligation || 0) / 1e6).toFixed(1)}M). Why is this high-value and what should I do in the next 30 days?`}
                              onAsk={askCoPilot}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                  <button
                    onClick={() => comboRows.forEach((e) => addToPipeline(e, 'combo'))}
                    className="action-btn pipeline text-[10px] mt-2"
                  >
                    +pipeline all visible
                  </button>
                </>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No hot-agency overlaps yet"
                  description="Combo matches expiring contracts in high-intensity agencies. Ingest more bulk data or add brain entries to unlock intersections."
                  accent="lime"
                  actions={
                    <Button variant="soft" onClick={() => { setSidebar('dashboard'); setDashTab('market') }}>Back to Market Overview</Button>
                  }
                />
              )}
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

    if (sidebar === 'vault') {
      return (
        <div className="page-sections">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
            <MetricCard label="Brain entries" value={String(brain.length)} accent="purple" tooltip="Data-tied accumulator entries" />
            <MetricCard label="Global wiki" value={String(globalFiles.length)} accent="purple" tooltip="Evergreen capture knowledge pages" />
            <MetricCard label="Native .md" value={String(brainWiki.length)} accent="purple" tooltip="Synthesized files on disk in brain/" />
            <MetricCard label="NAICS slice" value={naics} accent="cyan" tooltip="Current dashboard filter feeding seeds" />
          </div>

          <CollapsibleSection
            title="Vault Access"
            subtitle="data/knowledge · Obsidian · schema"
            icon={BookOpen}
            accent="purple"
            defaultOpen
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

          {viewedWiki && (
            <CollapsibleSection
              title={viewedWiki.name || 'Wiki page'}
              subtitle={viewedWiki.path || 'In-app reader'}
              icon={Eye}
              accent="purple"
              defaultOpen
              badge={
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewedWiki(null) }}
                  className="text-[10px] px-2 py-0.5 border border-edge rounded hover:bg-ink-card shrink-0"
                >
                  Close
                </button>
              }
            >
              <div className="wiki-viewer-body">
                {(viewedWiki.content || viewedWiki.excerpt || '(no preview — click Load complete file)')}
              </div>
              <div className="action-group mt-2">
                <button
                  onClick={() => {
                    const txt = viewedWiki.content || viewedWiki.excerpt || ''
                    try { navigator.clipboard.writeText(txt) } catch {}
                  }}
                  className="action-btn vault text-[10px]"
                >
                  Copy text
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`/user/knowledge/read?path=${encodeURIComponent(viewedWiki.path)}`)
                      const d = await r.json()
                      if (d.ok && d.content) setViewedWiki({ ...viewedWiki, content: d.content })
                    } catch {}
                  }}
                  className="action-btn vault text-[10px]"
                >
                  Load complete file
                </button>
                <button onClick={() => { try { navigator.clipboard.writeText(viewedWiki.path || '') } catch {} }} className="action-btn vault text-[10px]">
                  Copy path
                </button>
                <button
                  onClick={() => {
                    const help = `cd C:\\Users\\benma\\capture-insights\n# In Obsidian: Open folder as vault → data/knowledge\n# Then quick switcher or file tree to: ${viewedWiki.path}`
                    try { navigator.clipboard.writeText(help) } catch {}
                  }}
                  className="action-btn vault text-[10px]"
                >
                  Obsidian jump
                </button>
              </div>
            </CollapsibleSection>
          )}

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
                    onClick={() => setViewedWiki(g)}
                    actions={
                      <>
                        <button onClick={() => setViewedWiki(g)} className="action-btn vault text-[10px]">
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
                  onClick={() => setViewedWiki(w)}
                  actions={
                    <>
                      <button onClick={() => setViewedWiki(w)} className="action-btn vault text-[10px]">
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
      // Dedicated MCP Tools view — educational + status, not for manual calling.
      // The catalog is populated by the app's warmup at startup (see lifespan).
      // These tools power the agent: "Create SAM monitor (smart)" button (and future ones) + the chat co-pilot.
      // Per the design: the LLM/agent drives them; you as the user never use MCPs or uvx directly.
      const tools = mcpInfo.tools || []
      return (
        <div className="space-y-4">
          <div className="surface surface-hover rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold h1-gradient">MCP Tools</div>
                <div className="text-xs text-text-400">Battle-tested clients from https://github.com/1102tools/federal-contracting-mcps (we only consume, never implement servers ourselves).</div>
              </div>
              <button
                onClick={() => loadMcpTools(true)}
                className="action-btn"
              >
                <RefreshCw size={12}/> Refresh catalog
              </button>
            </div>

            {tools.length === 0 ? (
              <div className="text-sm text-slate-400">
                No tools discovered yet (app will use direct API fallbacks for SAM etc.).
                <div className="mt-2 text-[11px]">{mcpInfo.how_to_enable || mcpInfo.note || ''}</div>
                <div className="mt-1 text-[10px] text-text-500">The catalog is attempted at startup (warmup). External sam-gov-mcp server enables the richest tool set.</div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {tools.map((t, idx) => (
                  <div key={idx} className="border border-edge rounded p-2 bg-ink-900">
                    <div className="font-medium text-neon-cyan">{t.name}</div>
                    {t.description && <div className="text-xs text-text-400 mt-0.5">{t.description}</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 text-[11px] text-text-500">
              These tools are used automatically by the agent when you click contextual buttons (e.g. "Create SAM monitor (smart)" on an expiring row) or ask the floating co-pilot natural-language questions. The catalog is sent to the chat so suggestions stay grounded in what is actually available.
            </div>
            {mcpInfo.note && <div className="mt-2 text-[10px] text-neon-magenta">{mcpInfo.note}</div>}
          </div>

          <div className="text-[10px] text-text-500 px-1">
            Status is also visible in /health and the top status line. Warmup happens automatically when the backend starts.
          </div>
        </div>
      )
    }

    // Stubs for other future sidebars (skills, settings) — clean and honest
    return (
      <div className="surface surface-hover rounded-2xl p-8 text-center">
        <div className="text-2xl mb-2 h1-gradient">{VIEW_META[sidebar].title}</div>
        <div className="text-sm text-slate-400">Placeholder for later (full grounded chat/agent with citations over the DuckDB, skills like huashu-design for artifacts, profile settings, etc.).<br/>Right now the priority is the data foundation + contextual Dashboard tabs + the two distinct accumulators (Pipeline for pursuits; Knowledge Vault as the standalone LLM wiki/Karpathy foundation) + the always-available resizable chat + button-driven agentic actions. Exactly as discussed.</div>
      </div>
    )
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
