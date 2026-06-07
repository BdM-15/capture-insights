import { useState, useEffect } from 'react'
import { 
  BarChart3, Target, Users, Truck, MapPin, Clock, 
  TrendingUp, RefreshCw, Search, Plus, Layers, MessageSquare, Settings, Wrench, Briefcase, BookOpen, X, Maximize2,
  Copy, FolderOpen, Trash2, Info, Eye
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, ScatterChart, Scatter, ReferenceLine, ZAxis } from 'recharts'
import Plot from 'react-plotly.js'

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

const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, desc: 'Core data views & insights' },
  { id: 'pipeline', label: 'Pipeline', icon: Briefcase, desc: 'Opportunities & pursuits tracker — future Ariadne Thread connection (milestone living packets)' },
  { id: 'vault', label: 'Knowledge Vault', icon: BookOpen, desc: 'LLM wiki / Karpathy notes — domain intel, personal observations, training, ontologies' },
  { id: 'tools', label: 'MCP Tools', icon: Wrench, desc: 'Using 1102tools/federal-contracting-mcps (sam-gov-mcp etc.) + direct fallbacks' },
  { id: 'skills', label: 'Skills', icon: Layers, desc: 'Capture skills & automations (future)' },
  { id: 'settings', label: 'Settings', icon: Settings, desc: 'NAICS defaults, theme, etc.' },
]

const DASHBOARD_TABS = [
  { id: 'market', label: 'Market Overview', icon: BarChart3 },
  { id: 'opportunities', label: 'Future Opportunities', icon: Clock },
  { id: 'agency', label: 'Agency Intelligence', icon: Users },
  { id: 'competitive', label: 'Competitive Analysis', icon: Target },
  { id: 'vehicles', label: 'Contract Vehicle Analysis', icon: Truck },
  { id: 'geo', label: 'Geographic Analysis', icon: MapPin },
  { id: 'combo', label: 'Combo Insights', icon: TrendingUp },
]

export default function App() {
  const [naics, setNaics] = useState('561210')
  const [sidebar, setSidebar] = useState<'dashboard' | 'pipeline' | 'vault' | 'tools' | 'skills' | 'settings'>('dashboard')
  const [dashTab, setDashTab] = useState('market')
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [flows, setFlows] = useState<FlowData[]>([])
  const [intensity, setIntensity] = useState<IntensityData[]>([])
  const [expiring, setExpiring] = useState<ExpiringData[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [geo, setGeo] = useState<any[]>([])
  const [fyTrends, setFyTrends] = useState<any[]>([])
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

  async function loadData() {
    setLoading(true)
    setStatus('Fetching real bulk data from backend...')
    try {
      const q = `?naics=${naics}`
      const [k, f, i, e, v, g, tr, sa, trp, mp] = await Promise.all([
        fetch(`/data/kpis${q}`).then(r => r.json()),
        fetch(`/data/flows${q}&limit=6`).then(r => r.json()),
        fetch(`/data/agency-intensity${q}&limit=12`).then(r => r.json()),
        fetch(`/data/expiring${q}&months=36&limit=10`).then(r => r.json()),
        fetch(`/data/vehicles${q}`).then(r => r.json()),
        fetch(`/data/geo${q}&limit=8`).then(r => r.json()),
        fetch(`/data/fy-trends${q}`).then(r => r.json()),
        fetch(`/data/set-aside${q}`).then(r => r.json()),
        fetch(`/data/top-recipients${q}&limit=8`).then(r => r.json()),
        fetch(`/data/market_potential${q}`).then(r => r.json()),
      ])
      setKpis(k)
      setMarketPotential(mp)
      setFlows(f || [])
      setIntensity(i || [])
      setExpiring(e || [])
      setVehicles(v || [])
      setGeo(g || [])
      setFyTrends(tr || [])
      setSetAside(sa || [])
      setTopRecipients(trp || [])
      setStatus(`Live • ${naics} • ${new Date().toLocaleTimeString()} (data from bulk ingest; add more chunks for depth)`)
    } catch (err) {
      console.error(err)
      setStatus('Backend unreachable — run "uv run uvicorn backend.app.main:app --reload" in project root. Ingest with the command shown under the NAICS box (now supports simple --dir form).')
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [naics])

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
    // Helpful feedback in the always-on chat
    setChatHistory(h => [...h, { role: 'assistant', content: `Added to pipeline: ${item.recipient || item.agency || item.label || type}. Saved to data/user_accumulators.json on disk.` }])
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
  }

  // === Holistic chat with rich live context + suggested actions that can mutate state ===
  async function sendChat() {
    if (!chatInput.trim()) return
    const userMsg = { role: 'user', content: chatInput.trim() }
    const newHistory = [...chatHistory, userMsg]
    setChatHistory(newHistory)
    const userText = chatInput.trim()
    setChatInput('')

    // Build rich live context from the current dashboard + the persisted accumulators + MCP tool catalog.
    // The catalog tells the LLM what admin/MCP actions it can perform on the user's behalf (search SAM,
    // entity lookups, etc.). This is the core of the agentic design: LLM drives MCPs; user never does manually.
    const payload = {
      naics,
      active_tab: dashTab,
      kpis: kpis || null,
      brain: brain || [],
      pipeline: pipeline || [],
      message: userText,
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
        const setAsidePulse = setAside.slice(0, 4).map((s: any) => ({
          name: (s.set_aside || 'Unknown').replace(' SET ASIDE', '').slice(0, 22),
          millions: s.millions || 0,
        }))

        const MetricCard = ({ label, value, tooltip, accent, stub, valueClass }: { label: string; value: string; tooltip?: string; accent?: string; stub?: boolean; valueClass?: string }) => (
          <div className={`glass p-3 rounded-2xl border-b ${accent || 'border-[#00f0ff]/50'}`}>
            <div className="text-[9px] uppercase tracking-[1px] text-slate-400 flex items-center gap-1">
              {label} {stub && <span className="metric-stub">vision</span>}
              {tooltip && <span className="text-[#00f0ff] cursor-help" title={tooltip}>?</span>}
            </div>
            <div className={`mt-1 text-2xl md:text-3xl font-semibold tabular-nums tracking-tighter leading-none ${valueClass || 'text-[#00f0ff]'}`}>{value}</div>
          </div>
        )

        const fmtObl = (m: number) => m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(0)}M`
        const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
        const fmtAvg = (k: number) => `$${(k / 1000).toFixed(2)}M`

        return (
          <div className="space-y-4">
            {/* Pulse hero — 60-second market read for capture managers */}
            <div className="market-pulse-hero">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-[#e6ecff] flex items-center gap-2">
                    <BarChart3 size={18} className="text-[#00f0ff]" />
                    Market Pulse <span className="pill">NAICS {naics}</span>
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-1 max-w-2xl">
                    Your command view: total market size, momentum, where money flows, who dominates, and where to focus BD effort. Use the action cards below — then dive into Agency Intelligence for lead engagement.
                  </div>
                </div>
                <div className="text-right text-[10px] text-[#64748b] font-mono">
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
                  <div className="value text-[#ff2bd6] text-base">{marketPotential?.trend || '—'}</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Recompete Radar (24m)</div>
                  <div className="value">{fmtNum(kpis.expiring_24m || 0)} ending</div>
                </div>
              </div>
            </div>

            {/* Executive KPI row — original Data_Insights 7-card glance + vision stubs for global wiki matching */}
            <div>
              <div className="text-[9px] uppercase tracking-[1.5px] text-[#64748b] mb-1.5 px-0.5">Executive Summary — Glanceable for Capture Managers</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <MetricCard label="Total Obligations" value={fmtObl(kpis.total_obligations_m)} tooltip="TAM in your NAICS slice — size pipeline and executive briefs." valueClass="text-[#ffb020]" accent="border-[#ffb020]/50" />
                <MetricCard label="Total Actions" value={fmtNum(kpis.total_actions)} tooltip="Contract action volume — high count = active or fragmented market." />
                <MetricCard label="Avg Award Value" value={fmtAvg(kpis.avg_award_value_k)} tooltip="Typical deal size for bid/no-bid and team sizing." valueClass="text-[#00ff9c]" accent="border-[#00ff9c]/40" />
                <MetricCard label="Active (Approx)" value={fmtNum(kpis.active_contracts_approx)} tooltip="Awards with PoP still open — incumbent landscape signal." />
                <MetricCard label="Expiring (24m)" value={fmtNum(kpis.expiring_24m || 0)} tooltip="Recompete count in next 24 months — primary radar." valueClass="text-[#ff2bd6]" accent="border-[#ff2bd6]/50" />
                <MetricCard
                  label="Suitability"
                  value={`${kpis.suitability_pct}%`}
                  stub
                  valueClass="text-[#ffb020]"
                  accent="border-[#ffb020]/50"
                  tooltip="Vision stub: % of expiring work matching YOUR business unit capabilities. Will compare contract/agency requirements (from research + web profile building) against global wiki domain intel + company capabilities. Drives go/no-go."
                />
                <MetricCard
                  label="Synergy"
                  value={`${kpis.synergy_pct}%`}
                  stub
                  valueClass="text-[#ff2bd6]"
                  accent="border-[#ff2bd6]/50"
                  tooltip="Vision stub: % where OTHER business units' capabilities create a teaming/synergy play. Uses global wiki multi-BU capability map vs opportunity requirements."
                />
              </div>
            </div>

            {/* Future Funding Potential — recompete dollars at stake (original pulse metric) */}
            <div className="glass p-4 rounded-3xl border border-[#ff2bd6]/25 market-funding-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#ff2bd6] flex items-center gap-2">
                    <Clock size={15} /> Future Funding Potential
                  </div>
                  <div className="text-[10px] text-[#94a3b8] mt-1 max-w-xl">
                    Total obligated dollars on contracts ending soon — your addressable recompete pool. Chase these via Future Opportunities + SAM monitors before RFPs drop.
                  </div>
                </div>
                <button onClick={() => setDashTab('opportunities')} className="action-btn pipeline text-[10px]">Full recompete radar →</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div className="market-stat-chip">
                  <div className="label">24-Month Funding at Risk</div>
                  <div className="value text-[#ff2bd6]">{fmtObl(kpis.future_funding_potential_24m_m || 0)}</div>
                  <div className="text-[9px] text-[#64748b] mt-0.5">{fmtNum(kpis.expiring_24m || 0)} contracts</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">36-Month Funding at Risk</div>
                  <div className="value text-[#ff2bd6]">{fmtObl(kpis.future_funding_potential_36m_m || 0)}</div>
                  <div className="text-[9px] text-[#64748b] mt-0.5">{fmtNum(kpis.expiring_36m || 0)} contracts</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Hot-Agency Recompetes</div>
                  <div className="value">{fmtObl(hotRecompeteM)}</div>
                  <div className="text-[9px] text-[#64748b] mt-0.5">{hotRecompeteCount} in focus agencies</div>
                </div>
                <div className="market-stat-chip">
                  <div className="label">Match Lens (Future)</div>
                  <div className="value text-base text-[#ffb020]">{kpis.suitability_pct}% / {kpis.synergy_pct}%</div>
                  <div className="text-[9px] text-[#64748b] mt-0.5">suitability • synergy when wiki live</div>
                </div>
              </div>
            </div>

            {/* Capture workflow — what to do from this tab */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="market-action-card">
                <div className="title">1. Prioritize customers</div>
                <div className="body">{hotAgencyList.length} hot agencies (high volume + high value). These are your best BD engagement targets.</div>
                <div className="actions">
                  <button onClick={() => setDashTab('agency')} className="text-[10px] text-[#00f0ff] hover:underline">Agency Intelligence →</button>
                  <button onClick={() => hotAgencyList.slice(0, 3).forEach((a) => addToBrain(a, a.agency, 'agency'))} className="action-btn brain text-[10px]">+brain top 3</button>
                </div>
              </div>
              <div className="market-action-card">
                <div className="title">2. Track recompetes</div>
                <div className="body">{hotRecompeteCount} expiring awards in hot agencies (${hotRecompeteM.toFixed(1)}M). Start positioning before SAM notices drop.</div>
                <div className="actions">
                  <button onClick={() => setDashTab('opportunities')} className="text-[10px] text-[#00f0ff] hover:underline">Future Opportunities →</button>
                  {hotRecompeteCount > 0 && <button onClick={() => comboExpiring.slice(0, 2).forEach((e) => addToPipeline(e, 'expiring'))} className="action-btn pipeline text-[10px]">+pipeline top 2</button>}
                </div>
              </div>
              <div className="market-action-card">
                <div className="title">3. Map the competitive field</div>
                <div className="body">Top 3 primes hold {top3Pct}% of spend. Know who to team with, ghost, or displace.</div>
                <div className="actions">
                  <button onClick={() => setDashTab('competitive')} className="text-[10px] text-[#00f0ff] hover:underline">Competitive Analysis →</button>
                  <button onClick={() => topRecipients.slice(0, 3).forEach((r: any) => addToBrain({ recipient: r.recipient }, r.recipient, 'competitor'))} className="action-btn brain text-[10px]">+brain top 3</button>
                </div>
              </div>
            </div>

            {/* High-Intensity Agencies — original Data_Insights capture intensity table */}
            {intensityRanked.length > 0 && (
              <div className="glass p-4 rounded-3xl border border-[#ff2bd6]/20">
                <div className="text-sm font-semibold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Target size={15} className="text-[#ff2bd6]" /> High-Intensity Agencies (Capture Intensity)</span>
                  <button onClick={() => setDashTab('agency')} className="text-xs text-[#00f0ff] hover:underline">Agency Intelligence — engage leads →</button>
                </div>
                <div className="text-[10px] text-[#64748b] mb-2">
                  Agencies above median on both actions and obligations (pink ★) — prime BD engagement targets from the original Data_Insights pulse. +brain to accumulate; dive deeper in Agency Intelligence.
                </div>
                <div className="overflow-auto rounded-xl border border-[#1f2a44]">
                  <table className="w-full text-xs intensity-table">
                    <thead>
                      <tr className="text-[#64748b] text-left border-b border-[#1f2a44]">
                        <th className="p-2 font-medium">Agency</th>
                        <th className="p-2 font-medium tabular-nums">Actions</th>
                        <th className="p-2 font-medium tabular-nums">Obligations</th>
                        <th className="p-2 font-medium">Intensity</th>
                        <th className="p-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intensityRanked.map((a, idx) => {
                        const hot = isHotAgency(a)
                        return (
                          <tr key={idx} className={`border-b border-[#1f2a44]/60 hover:bg-[#0f1422]/80 ${hot ? 'intensity-row-hot' : ''}`}>
                            <td className="p-2 text-[#e6ecff] max-w-[200px] truncate" title={a.agency}>{a.agency}</td>
                            <td className="p-2 tabular-nums">{a.award_count?.toLocaleString()}</td>
                            <td className="p-2 tabular-nums text-[#00f0ff]">${((a.total_oblig || 0) / 1e6).toFixed(1)}M</td>
                            <td className="p-2">{hot ? <span className="text-[#ff2bd6] font-medium">★ Hot</span> : <span className="text-[#64748b]">—</span>}</td>
                            <td className="p-2 text-right">
                              <button onClick={() => addToBrain(a, a.agency, 'agency')} className="action-btn brain text-[10px]">+brain</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => hotAgencyList.slice(0, 5).forEach((a) => addToBrain(a, a.agency, 'agency'))} className="action-btn brain text-[10px]">+brain all hot agencies</button>
                  <button onClick={() => setDashTab('agency')} className="text-[10px] text-[#00f0ff] hover:underline">Open Agency Intelligence for engagement notes →</button>
                </div>
              </div>
            )}

            {/* Pulse visuals: Momentum + Focus (Intensity) + Flows (Sankey) — at a glance for C2 decisions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* FY Trends — momentum pulse */}
              <div className="glass p-5 rounded-3xl">
                <div className="text-sm font-semibold mb-2">FY Trajectory (Momentum)</div>
                {trendData.length > 1 ? (
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                        <XAxis dataKey="fy" stroke="#606080" />
                        <YAxis yAxisId="left" stroke="#00f0ff" />
                        <YAxis yAxisId="right" orientation="right" stroke="#ff2bd6" />
                        <Tooltip contentStyle={{ background: '#16161f', border: '1px solid #1f1f2e' }} />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="obligationsM" name="$M" stroke="#00f0ff" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="actions" name="Actions" stroke="#ff2bd6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="text-sm text-slate-400">Ingest more years for trend.</div>}
              </div>

              {/* Intensity on overview — the key pulse for "where to focus" capture resources */}
              <div className="glass p-5 rounded-3xl">
                <div className="text-sm font-semibold mb-2">Capture Intensity</div>
                {intensity.length ? (
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                        <CartesianGrid stroke="#1f1f2e" />
                        <XAxis 
                          type="number" 
                          dataKey="x" 
                          name="Actions" 
                          stroke="#606080" 
                          tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} 
                        />
                        <YAxis 
                          type="number" 
                          dataKey="y" 
                          name="Obligations" 
                          stroke="#606080" 
                          tickFormatter={(v) => {
                            if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`
                            if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`
                            if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`
                            return `$${v}`
                          }} 
                        />
                        <ZAxis type="number" dataKey="z" range={[35, 220]} />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ payload }) => {
                            if (!payload || !payload.length) return null
                            const d = payload[0].payload
                            return (
                              <div style={{ background: '#16161f', border: '1px solid #1f1f2e', padding: '6px 8px', fontSize: 11 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.name}</div>
                                <div>Actions: {d.x.toLocaleString()}</div>
                                <div>Obligations: ${(d.y / 1e6).toFixed(1)}M</div>
                              </div>
                            )
                          }}
                        />
                        <ReferenceLine x={medActions} stroke="#ff2bd6" strokeDasharray="3 3" />
                        <ReferenceLine y={medOblig} stroke="#00f0ff" strokeDasharray="3 3" />
                        <Scatter name="Agencies" data={intensityScatterData}>
                          {intensityScatterData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.isHot ? '#ff2bd6' : '#00f0ff'} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="text-sm text-slate-400">Need more agency data.</div>}
                <div className="text-[10px] text-[#606080] mt-1">Pink dots = hot quadrant (above median actions AND obligations). Size = avg award. Crosshairs = market median.</div>
                {hotAgencyList.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {hotAgencyList.slice(0, 4).map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[10px] py-0.5">
                        <span className="text-[#ff2bd6] truncate">{a.agency}</span>
                        <span className="text-[#64748b] shrink-0 ml-2">{a.award_count?.toLocaleString()} actions • ${((a.total_oblig || 0) / 1e6).toFixed(0)}M</span>
                        <button onClick={() => addToBrain(a, a.agency, 'agency')} className="text-[9px] text-[#00f0ff] hover:underline ml-2 shrink-0">+brain</button>
                      </div>
                    ))}
                    <button onClick={() => setDashTab('agency')} className="text-[10px] text-[#00f0ff] hover:underline">All agencies in Agency Intelligence →</button>
                  </div>
                )}
              </div>
            </div>

            {/* Follow the Money on overview — 3-level pulse (Recipient → Agency → Office). Click into Competitive for full table + larger view. */}
            <div className="glass p-5 rounded-3xl">
              <div className="text-sm font-semibold mb-2 flex items-center justify-between">
                Follow the Money (Recipient → Agency → Office)
                <button onClick={() => setDashTab('competitive')} className="text-xs text-[#00f0ff] hover:underline">Full table + deeper in Competitive →</button>
              </div>
              {sankeyData.length ? (
                <div style={{ width: '100%', height: 260 }}>
                  <Plot
                    data={sankeyData}
                    layout={{ font: { size: 10, color: '#e0e0ff' }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { t: 5, l: 5, r: 5, b: 5 } }}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              ) : <div className="text-sm text-slate-400">Flows appear with more data.</div>}
              {flows.length > 0 && (
                <div className="mt-2 text-[10px] text-[#606080]">
                  Top flow: <span className="text-white">{flows[0]?.recipient}</span> → {flows[0]?.agency} ({flows[0]?.office}) ${flows[0]?.millions}M
                  <button onClick={() => addToBrain(flows[0], flows[0].recipient, 'competitor')} className="ml-2 text-[#00f0ff] hover:underline">+brain</button>
                </div>
              )}
            </div>

            {/* Competitor share concentration — treemap (full width for readability on wide screens) */}
            <div className="glass p-5 rounded-3xl">
              <div className="text-sm font-semibold mb-2 flex items-baseline justify-between">
                Top Competitors by Market Share
                <span className="text-[10px] text-[#ff2bd6] font-mono tabular-nums">{top3Pct}% in top 3</span>
              </div>
              {topRecipients.length ? (
                <div style={{ width: '100%', height: 200 }}>
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
                      paper_bgcolor: 'rgba(0,0,0,0)',
                      plot_bgcolor: 'rgba(0,0,0,0)',
                    }}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              ) : <div className="text-sm text-slate-400">Load more data for competitor share treemap.</div>}
              <div className="text-[10px] text-[#606080] mt-1">If a few names dominate, relationship mapping + teaming strategy with (or against) them is high-leverage.</div>
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

            {/* How the work is bought — two separate pie charts (pricing + vehicles) for the overview pulse */}
            <div className="glass p-5 rounded-3xl">
              <div className="text-sm font-semibold mb-3">How the Work is Bought</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pricing pie */}
                <div>
                  <div className="text-xs font-medium text-[#606080] mb-1">Pricing Types (by $M)</div>
                  {pricingValues.length ? (
                    <div style={{ width: '100%', height: 220 }}>
                      <Plot
                        data={[{
                          type: 'pie',
                          labels: pricingLabels,
                          values: pricingValues,
                          textinfo: 'label+percent',
                          hovertemplate: '%{label}<br>$%{value}M (%{percent})<extra></extra>',
                          marker: { colors: ['#00f0ff', '#ff2bd6', '#39ff14', '#facc15', '#a78bfa', '#fb7185'] }
                        }]}
                        layout={{
                          margin: { t: 10, l: 5, r: 5, b: 0 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          showlegend: false
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[220px] flex items-center">No pricing data.</div>}
                </div>

                {/* Vehicles pie */}
                <div>
                  <div className="text-xs font-medium text-[#606080] mb-1">Contract Vehicles / IDV (by $M)</div>
                  {vehicleValues.length ? (
                    <div style={{ width: '100%', height: 220 }}>
                      <Plot
                        data={[{
                          type: 'pie',
                          labels: vehicleLabels,
                          values: vehicleValues,
                          textinfo: 'label+percent',
                          hovertemplate: '%{label}<br>$%{value}M (%{percent})<extra></extra>',
                          marker: { colors: ['#00f0ff', '#ff2bd6', '#39ff14', '#facc15', '#a78bfa', '#fb7185'] }
                        }]}
                        layout={{
                          margin: { t: 10, l: 5, r: 5, b: 0 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          showlegend: false
                        }}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  ) : <div className="text-sm text-slate-400 h-[220px] flex items-center">No vehicle data.</div>}
                </div>
              </div>
              <div className="text-[10px] text-[#606080] mt-2">
                See the Vehicles tab for full set-aside mix and detailed vehicle table.
              </div>
            </div>

            {/* Set-aside pulse + hot recompetes spotlight */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass p-4 rounded-3xl">
                <div className="text-sm font-semibold mb-2">Competition Mix (Set-Asides)</div>
                {setAsidePulse.length ? (
                  <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer>
                      <BarChart data={setAsidePulse} layout="vertical" margin={{ left: 4, right: 8 }}>
                        <XAxis type="number" stroke="#606080" tickFormatter={(v) => `$${v}M`} />
                        <YAxis dataKey="name" type="category" width={120} stroke="#606080" tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: '#16161f', border: '1px solid #1f1f2e', fontSize: 11 }} />
                        <Bar dataKey="millions" fill="#00f0ff" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="text-sm text-slate-400">Set-aside data loads with ingest.</div>}
                <button onClick={() => setDashTab('vehicles')} className="text-[10px] text-[#00f0ff] hover:underline mt-1">Full vehicle analysis →</button>
              </div>

              <div className="glass p-4 rounded-3xl border border-[#ff2bd6]/20">
                <div className="text-sm font-semibold mb-2 text-[#ff2bd6]">Hot Recompetes in Focus Agencies</div>
                {comboExpiring.length ? (
                  <div className="space-y-1.5">
                    {comboExpiring.slice(0, 4).map((e, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-[#1f2a44]/60">
                        <div className="min-w-0 truncate">
                          <span className="text-[#e6ecff]">{e.recipient}</span>
                          <span className="text-[#64748b]"> @ {e.agency}</span>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-[#00f0ff] tabular-nums">${((e.obligation || 0) / 1e6).toFixed(1)}M</span>
                          <button onClick={() => setDashTab('opportunities')} className="text-[9px] text-[#64748b] hover:text-[#00f0ff]">{e.end_date?.slice(0, 7)}</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setDashTab('opportunities')} className="action-btn pipeline text-[10px] mt-2">View all + create SAM monitors →</button>
                  </div>
                ) : (
                  <div className="text-xs text-[#64748b]">No expiring awards in hot agencies in current slice. Add brain entries or check Future Opportunities for full radar.</div>
                )}
              </div>
            </div>

            <div className="insight">
              <strong className="text-[#e6ecff]">What this tab tells you:</strong> Total market size, whether spend is growing or shrinking, which agencies and competitors matter, and how work is bought. This is your 60-second capture pulse before customer calls or pipeline reviews.
            </div>
            <div className="insight magenta">
              <strong className="text-[#e6ecff]">Act today:</strong> +brain hot agencies and top competitors from this view. They compound in Knowledge Vault and feed your co-pilot. Use Future Opportunities for expiring work and SAM monitors.
            </div>
            <div className="insight lime">
              <strong className="text-[#e6ecff]">Go deeper next:</strong> Agency Intelligence tab — engagement notes and lead development on the high-intensity customers surfaced above. (Next polish target.)
            </div>
            <div className="insight vault">
              <strong className="text-[#e6ecff]">Suitability &amp; Synergy (vision stubs):</strong> These KPIs will activate when global wiki domain intel + company capabilities are built. Suitability = does this contract/agency fit <em>your</em> BU? Synergy = can <em>other</em> BUs strengthen the pursuit? Future research/web-scraping profile building feeds the match.
            </div>
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
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-lg font-semibold text-[#ff2bd6]">Expiring / Recompete Radar (from USASpending history)</div>
                  <div className="text-xs text-slate-400">Current PoP end in next 36 months — {filteredExpiring.length} shown (of {expiring.length}). Use historical cycles to get ahead of SAM notices.</div>
                </div>
                <button onClick={() => addToPipeline({label:'expiring batch'}, 'expiring')} className="action-btn pipeline flex items-center gap-1 px-3 py-1 text-xs"><Plus size={13}/> Add visible batch to pipeline</button>
              </div>
              <div className="insight magenta">
                Why this matters: These are live recompete opportunities you can start positioning for today. Early engagement is the highest-leverage capture activity. Prioritize the ones in agencies where you already see high intensity or existing flows.
              </div>
              <div className="text-[10px] text-[#39ff14] mt-1">Buttons like "Create SAM monitor (smart)" activate the agent (LLM + MCP) to complete the task with smart params + citations. Chat co-pilot is great for questions and exploration.</div>
              <input
                value={oppSearch}
                onChange={(e) => setOppSearch(e.target.value)}
                placeholder="Filter by recipient or agency name..."
                className="mb-2 w-full bg-[#16161f] border border-[#1f1f2e] text-sm px-3 py-1.5 rounded"
              />
              <div className="glass rounded-3xl overflow-hidden text-sm">
                <table className="w-full"><tbody>
                  {filteredExpiring.slice(0,10).map((e: any, idx: number) => {
                    const isHot = hotAgencies.has(e.agency || '')
                    const inBrain = brain.some((b: any) => (b.name || '').toLowerCase().includes((e.recipient || '').toLowerCase().slice(0, 15)))
                    return (
                      <tr key={idx} className="border-b border-[#1f1f2e] hover:bg-[#16161f]">
                        <td className="p-3 font-mono text-xs">{e.end_date}</td>
                        <td className="p-3 truncate max-w-[200px]">{e.recipient || '—'}</td>
                        <td className="p-3 tabular-nums">${((e.obligation||0)/1e6).toFixed(1)}M</td>
                        <td className="p-3 text-[#00f0ff] text-xs">{(e.agency||'').slice(0,22)}</td>
                        <td className="p-3 text-xs">
                          {isHot && <span className="text-[#ff2bd6] mr-1">★ Hot</span>}
                          {inBrain && <span className="text-[#39ff14] mr-1">🧠 Brain</span>}
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <button onClick={() => addToPipeline(e,'expiring')} className="action-btn pipeline text-xs">+ pipeline</button>
                          <button 
                            onClick={() => {
                              setSamKeywords(e.agency || e.recipient || '')
                              setSamNoticeTypes('RFI,Sources Sought,Special Notice,Presolicitation')
                              // auto-trigger search for this cycle
                              searchSamLive()
                            }} 
                            className="text-xs text-[#00f0ff] hover:underline"
                          >
                            Search SAM for this
                          </button>
                          {/* Agentic button (per recentering): click activates LLM + optional MCP to create a *smart* sam-monitor
                              with good keywords/notice_types + rationale + citation back to this expiring award_key.
                              This is the primary "agent does the admin task" path; chat is for open questions. */}
                          <button
                            onClick={async () => {
                              try {
                                setLoading(true)
                                const res = await fetch('/user/actions/create-sam-monitor', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ item: e, naics, brain, use_llm: useSmartModel })
                                })
                                if (res.ok) {
                                  const data = await res.json()
                                  await syncAccumulators()
                                  setChatHistory(h => [...h, { role: 'assistant', content: `Agent created smart SAM monitor: ${data.entry?.title || 'monitor'}. ${data.rationale || ''} (saved to pipeline)` }])
                                } else {
                                  // fallback to the simple URL builder the old buttons used
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
                            className="text-xs text-[#39ff14] hover:underline"
                            title="Agent (LLM + MCP) builds smart keywords/notice types + rationale from this expiring item + your Brain, then saves the monitor"
                          >
                            Create SAM monitor (smart)
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody></table>
              </div>
              <div className="text-[10px] text-[#606080] mt-2">Click +pipeline on the ones that fit your capabilities or relationships. "Search SAM for this" prefills a live search for the actual notice/RFI on that cycle. These items accumulate in the separate Pipeline view (sidebar). Use +brain / + to Knowledge Vault from Competitive & Agency tabs for the standalone vault.</div>
            </div>

            {/* Live SAM layer — the "new + emerging" that complements historical recompete cycles */}
            <div>
              <div className="text-lg font-semibold text-[#00f0ff] mb-2">Live & Emerging from SAM.gov (new requirements + notices on known cycles)</div>
              <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
                <span className="text-[#606080] mr-1 self-center">Example prompts for the co-pilot (drives MCP for you):</span>
                <button onClick={() => { const p = 'Search SAM for live RFI/Sources Sought/Special Notice matching the agencies and recipients in my Brain and the expiring contracts. Then propose 2-3 to create monitors for and add to pipeline.'; setChatInput(p); setTimeout(() => sendChat(), 20); }} className="px-2 py-0.5 bg-[#1f1f2e] rounded hover:bg-[#00f0ff]/20 border border-[#00f0ff]/20">Search SAM for my Brain + expiring</button>
                <button onClick={() => { const p = 'Using my current hot agencies from intensity and Brain, find any new CSO/OTA or open solicitation on SAM and suggest monitors.'; setChatInput(p); setTimeout(() => sendChat(), 20); }} className="px-2 py-0.5 bg-[#1f1f2e] rounded hover:bg-[#00f0ff]/20 border border-[#00f0ff]/20">Find new work for hot agencies in Brain</button>
              </div>
              <div className="insight">
                USASpending tells you the historical cycles and who wins recurring work. SAM.gov is where the actual RFIs, Sources Sought, Special Notices, and eventual RFPs appear — plus brand new work (CSOs, OTAs, open solicitations, traditional FAR requirements with no prior history). Use the expiring list above to seed searches for "the known universe", then discover net-new.
                <span className="block mt-1 text-[#39ff14]">The co-pilot (chat) is the intended way to drive these searches and create monitors via MCP — tell it in natural language what you want researched/monitored. Manual controls here are escape hatches.</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  value={samKeywords}
                  onChange={(e) => setSamKeywords(e.target.value)}
                  placeholder="Keywords (agency, recipient, 'facilities support', etc.)"
                  className="flex-1 bg-[#16161f] border border-[#1f1f2e] text-sm px-3 py-1.5 rounded"
                />
                <input
                  value={samNoticeTypes}
                  onChange={(e) => setSamNoticeTypes(e.target.value)}
                  placeholder="Notice types (comma separated)"
                  className="w-72 bg-[#16161f] border border-[#1f1f2e] text-sm px-3 py-1.5 rounded"
                />
                <button onClick={searchSamLive} disabled={loading} className="px-4 py-1.5 rounded bg-[#00f0ff] text-black text-sm font-semibold">Search SAM</button>
                <button onClick={() => {
                  const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(samKeywords)}&naics=${naics}${samNoticeTypes ? '&noticeType=' + encodeURIComponent(samNoticeTypes) : ''}`
                  addToPipeline({ title: `SAM Monitor: ${samKeywords || 'custom'}`, agency: 'Custom', monitorUrl, notes: `Notice types: ${samNoticeTypes}` }, 'sam-monitor')
                }} className="px-3 py-1.5 text-sm border border-[#00f0ff]/50 rounded hover:bg-[#00f0ff]/10">Create custom monitor</button>
              </div>
              <div className="flex flex-wrap gap-1 mb-2 text-xs">
                {['RFI','Sources Sought','Special Notice','Presolicitation','Solicitation'].map(t => (
                  <button key={t} onClick={() => {
                    const current = samNoticeTypes.split(',').map(s=>s.trim()).filter(Boolean);
                    if (!current.includes(t)) setSamNoticeTypes([...current, t].join(','));
                  }} className="px-2 py-0.5 bg-[#1f1f2e] rounded hover:bg-[#00f0ff]/20">{t}</button>
                ))}
              </div>
              <div className="text-[10px] text-[#606080] mb-2">Tip: Primary path = tell the AI Co-pilot (e.g. "search SAM for hot agencies in my vault and expiring cycles, create monitors for relevant RFIs"). It will use available MCP tools under the hood and surface +pipeline actions. The controls below and "Search SAM for this" are manual escape hatches. (To enable richer live MCP: run `uvx sam-gov-mcp` in another terminal.)</div>
              <div className="glass rounded-3xl overflow-hidden text-sm">
                <table className="w-full"><tbody>
                  {samResults.length === 0 && <tr><td className="p-3 text-slate-400">No SAM results yet — enter keywords and search (requires SAM_API_KEY on backend for live data).</td></tr>}
                  {samResults.map((s: any, idx: number) => (
                    <tr key={idx} className="border-b border-[#1f1f2e] hover:bg-[#16161f]">
                      <td className="p-3 truncate max-w-[260px]">{s.title}</td>
                      <td className="p-3 text-xs text-[#a0a0c0]">{s.noticeType}</td>
                      <td className="p-3 text-xs">{s.responseDeadLine}</td>
                      <td className="p-3 text-xs text-[#00f0ff]">{(s.agency || '').slice(0,20)}</td>
                      <td className="p-3 text-[9px] text-[#606080]">{s._source ? (s._source.startsWith('mcp') ? 'via MCP' : 'direct API') : ''}</td>
                      <td className="p-3 text-right space-x-1">
                        {s.link && <a href={s.link} target="_blank" rel="noopener" className="text-xs text-[#00f0ff] hover:underline">sam.gov ↗</a>}
                        <button onClick={() => addToPipeline(s, 'sam-opp')} className="action-btn pipeline text-xs">+ pipeline</button>
                        <button 
                          onClick={async () => {
                            try {
                              setLoading(true)
                              const res = await fetch('/user/actions/create-sam-monitor', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ item: s, naics, brain, use_llm: useSmartModel })
                              })
                              if (res.ok) { const d = await res.json(); await syncAccumulators(); setChatHistory(h => [...h, { role: 'assistant', content: `Agent created smart monitor: ${d.entry?.title || s.title}` }]) }
                              else { /* fallback */ const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(samKeywords || s.title || '')}&naics=${naics}${samNoticeTypes ? '&noticeType=' + encodeURIComponent(samNoticeTypes) : ''}`; addToPipeline({ ...s, type: 'sam-monitor', monitorUrl, notes: `Monitor for: ${samKeywords || 'cycle'} | ${s.agency}` }, 'sam-monitor') }
                            } catch { const monitorUrl = `https://sam.gov/search/?index=opp&q=${encodeURIComponent(samKeywords || s.title || '')}&naics=${naics}${samNoticeTypes ? '&noticeType=' + encodeURIComponent(samNoticeTypes) : ''}`; addToPipeline({ ...s, type: 'sam-monitor', monitorUrl, notes: `Monitor for: ${samKeywords || 'cycle'} | ${s.agency}` }, 'sam-monitor') }
                            finally { setLoading(false) }
                          }}
                          className="text-xs text-[#39ff14] hover:underline"
                          title="Agent builds smart monitor params + rationale from this result + your Brain"
                        >
                          Create Monitor (smart)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
              <div className="text-[10px] text-[#606080] mt-2">Results via /mcp/sam (prefers MCP when available). Use the "Create SAM monitor (smart)" button (or on expiring rows) for agent-assisted monitors with LLM-chosen params + citations. Chat also works for open-ended discovery.</div>

              {/* My SAM Monitors - saved searches from Create Monitor */}
              <div className="mt-4">
                <div className="text-sm font-semibold mb-2">My SAM Monitors (saved searches)</div>
                {pipeline.filter((p: any) => p.type === 'sam-monitor').length === 0 ? (
                  <div className="text-xs text-slate-400">No monitors yet. Use "Create Monitor" on search results or expiring items to save recurring SAM searches.</div>
                ) : (
                  <div className="glass rounded-3xl overflow-hidden text-sm">
                    <table className="w-full"><tbody>
                      {pipeline.filter((p: any) => p.type === 'sam-monitor').map((m: any, i: number) => (
                        <tr key={i} className="border-b border-[#1f1f2e] hover:bg-[#16161f]">
                          <td className="p-3 truncate">{m.title || m.monitorUrl || 'SAM Monitor'}</td>
                          <td className="p-3 text-xs">{m.agency}</td>
                          <td className="p-3 text-right">
                            {m.monitorUrl && <a href={m.monitorUrl} target="_blank" className="text-xs text-[#00f0ff] hover:underline mr-2">Open in SAM ↗</a>}
                            <button onClick={() => removeFromPipeline(m.id || m.ts)} className="text-xs text-[#ff3b6b]">× remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                )}
              </div>

              {/* My Focus - ultra-light derived view on the *current* simple JSON Brain + native wiki excerpts (per plan).
                  Client-side intersections using brain + brainWiki + expiring + intensity + smart monitors.
                  This is the quick validation slice; now also peeks at the LLM-synthesized wiki .md excerpts for better matches.
                  Will get even richer as the full Obsidian/Karpathy wiki (global/, pursuits/, more synthesis) lands. */}
              <div className="mt-4">
                <div className="text-sm font-semibold mb-1">My Focus (lightweight intersections from your Brain + wiki excerpts + recent agent-created smart monitors + live data)</div>
                <div className="text-[10px] text-[#606080] mb-2">Ultra-light client-side view. Uses both the JSON accumulator and the native wiki .md excerpts (synthesized by LLM from USASpending signals + citations). Add +brain or create smart monitors to populate. Will become much more powerful with the full Obsidian/Karpathy LLM wiki (global seeds, per-pursuit folders, backlinks, etc.).</div>

                {/* Simple intersections - reuse existing state and logic patterns. Now also folds in brainWiki excerpts for matches. */}
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
                              <button onClick={() => addToPipeline(e, 'expiring-from-focus')} className="text-[#00f0ff] hover:underline">+ pipeline</button>
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
                              {m.monitorUrl && <a href={m.monitorUrl} target="_blank" className="text-[#00f0ff] hover:underline">open ↗</a>}
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
                              <button onClick={() => addToBrain(a, a.agency, 'agency')} className="text-[#39ff14] hover:underline">+ brain (already tracked)</button>
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
              </div>
            </div>
          </div>
        )
      }

      case 'agency': {
        // +BRAIN / +WIKI makes sense here. This is the deeper dive list behind the Intensity pulse you saw on Market Overview.
        // Intensity quadrant is intentionally the overview "where to focus" chart (quick pulse + command decision).
        return (
          <div className="space-y-4">
            <div className="text-lg font-semibold mb-1">Agency Intelligence — Deeper Dive</div>
            <div className="insight">
              See the Market Overview Intensity quadrant first for the quick pulse on hot agencies. This tab gives the full list + one-click +brain/wiki so you can accumulate the ones worth watching. Notes you add here compound in your Brain for chat context and future skills.
            </div>

            <div className="glass rounded-3xl overflow-hidden text-sm">
              <table className="w-full"><tbody>
                {intensity.slice(0,12).map((a,idx) => {
                  const isHot = (a.total_oblig || 0) > 5e6
                  return (
                    <tr key={idx} className="border-b border-[#1f1f2e] hover:bg-[#16161f]">
                      <td className="p-3">{a.agency} {isHot && <span className="text-[#ff2bd6] text-[10px]">★ hot</span>}</td>
                      <td className="p-3 tabular-nums">{a.award_count} actions</td>
                      <td className="p-3 tabular-nums">${((a.total_oblig||0)/1e6).toFixed(1)}M</td>
                      <td className="p-3 text-right">
                        <button onClick={() => addToBrain(a, a.agency, 'agency')} className="action-btn brain">+ brain / wiki</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody></table>
            </div>
            <div className="text-[10px] text-[#606080]">Use +brain on agencies where you see real volume or existing relationships. Your Brain becomes the living packet the chat and future tools read from.</div>
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
            line: { color: '#1f1f2e', width: 0.5 },
            label: sankeyNodes.map(n => n.label),
            color: '#00f0ff',
          },
          link: {
            source: sankeyLinks.map(l => l.source),
            target: sankeyLinks.map(l => l.target),
            value: sankeyLinks.map(l => l.value),
            color: 'rgba(0,240,255,0.3)',
          },
        }]

        return (
          <div className="space-y-4">
            <div className="text-lg font-semibold mb-1">Competitive Analysis — Follow the Money (Recipient → Agency → Office Deep Dive)</div>
            <div className="insight magenta">
              Quick 3-level pulse (down to specific Office) lives on Market Overview. This tab is for the full table + larger Sankey when you want to analyze a specific competitor-agency-office relationship or +brain names that matter.
            </div>

            {/* Sankey — detailed 3-level view here; compact pulse version lives on Overview. */}
            <div className="glass p-5 rounded-3xl">
              <div className="text-sm font-semibold mb-2">Follow the Money (Sankey — Detailed, 3 levels)</div>
              {flows.length ? (
                <div style={{ width: '100%', height: 380 }}>
                  <Plot
                    data={sankeyData}
                    layout={{
                      font: { size: 11, color: '#e0e0ff' },
                      paper_bgcolor: 'rgba(0,0,0,0)',
                      plot_bgcolor: 'rgba(0,0,0,0)',
                      margin: { t: 10, l: 10, r: 10, b: 10 },
                    }}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              ) : (
                <div className="text-sm text-slate-400">Flows will appear with more data.</div>
              )}
            </div>

            <div className="glass rounded-3xl overflow-hidden text-sm">
              <div className="px-3 pt-2 text-[10px] text-[#606080]">Recipient (Competitor) | Agency | Office | $M (actions) | +brain</div>
              <table className="w-full"><tbody>
                {flows.map((f,idx) => (
                  <tr key={idx} className="border-b border-[#1f1f2e] hover:bg-[#16161f]">
                    <td className="p-3 font-medium">{f.recipient}</td>
                    <td className="p-3 text-xs text-[#a0a0c0]">{f.agency}</td>
                    <td className="p-3 text-xs text-[#707080]">{(f as any).office || ''}</td>
                    <td className="p-3 tabular-nums">${f.millions}M <span className="text-[10px] text-[#606080]">({f.actions} actions)</span></td>
                    <td className="p-3 text-right">
                      <button onClick={() => addToBrain(f, f.recipient, 'competitor')} className="action-btn brain">+ brain / wiki</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )
      }

      case 'vehicles': {
        // Contract Vehicle Analysis tab owns deeper vehicle + competition mechanics (set-aside mix lives here per usage model).
        const setAsideData = setAside.slice(0, 10).map((s: any) => ({
          name: (s.set_aside || 'Unknown').slice(0, 28),
          millions: s.millions || 0,
          actions: s.actions || 0,
        }))
        return (
          <div className="space-y-4">
            <div className="text-lg font-semibold mb-2">Contract Vehicle & Pricing Breakdown</div>
            <div className="insight lime">
              This tells you the actual buying mechanisms in your NAICS. High volume on a particular IDIQ or FFP tells you which vehicles to chase or team through. Not every opportunity is a good +pipeline candidate — use this lens to decide capture strategy first.
            </div>
            <div className="glass rounded-3xl overflow-hidden text-sm">
              <table className="w-full"><tbody>
                {vehicles.slice(0,7).map((v,idx) => (
                  <tr key={idx} className="border-b border-[#1f1f2e]">
                    <td className="p-3">{v.pricing} / {v.vehicle}</td>
                    <td className="p-3">{v.actions} actions</td>
                    <td className="p-3 tabular-nums">${v.millions}M</td>
                    <td className="p-3 text-right text-xs text-[#606080]">vehicle intel</td>
                  </tr>
                ))}
              </tbody></table>
            </div>

            {/* Set-aside mix moved here: it's a contract vehicle / competition strategy item, not the top-level pulse. */}
            <div className="glass p-5 rounded-3xl">
              <div className="text-sm font-semibold mb-2">How the Work is Competed — Set-Aside Mix (by $)</div>
              {setAsideData.length ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={setAsideData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                      <XAxis type="number" stroke="#606080" />
                      <YAxis dataKey="name" type="category" width={160} stroke="#606080" />
                      <Tooltip contentStyle={{ background: '#16161f', border: '1px solid #1f1f2e' }} />
                      <Bar dataKey="millions" name="$ Millions" fill="#00f0ff">
                        {setAsideData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#ff2bd6' : '#00f0ff'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="text-sm text-slate-400">Set-aside breakdown loads with more ingest data.</div>}
              <div className="text-[11px] text-[#606080] mt-2">
                "NO SET ASIDE / FULL OPEN" dominant → expect prime-level competition or large IDIQs; plan for strong past performance emphasis or teaming. High small-business set-asides → look for JV / mentor-protégé or sub opportunities. This pairs with the vehicle table above to shape your bid strategy.
              </div>
            </div>
          </div>
        )
      }

      case 'geo': {
        return (
          <div>
            <div className="text-lg font-semibold mb-2">Geographic Concentration (Place of Performance)</div>
            <div className="insight">
              Where the actual work happens. Useful for deciding office footprint, regional teaming partners, and understanding customer concentration. Not usually a direct +pipeline or +brain item — more strategic context.
            </div>
            <div className="glass rounded-3xl overflow-hidden text-sm">
              <table className="w-full"><tbody>
                {geo.map((g,idx) => {
                  const w = Math.min(100, Math.round((g.millions / (geo[0]?.millions || 1)) * 100))
                  return (
                    <tr key={idx} className="border-b border-[#1f1f2e]">
                      <td className="p-3 w-12 font-mono">{g.state}</td>
                      <td className="p-3">{g.actions} actions, ${g.millions}M</td>
                      <td className="p-3"><div className="h-2 bg-[#00f0ff] rounded" style={{width: w + '%'}} /></td>
                    </tr>
                  )
                })}
              </tbody></table>
            </div>
          </div>
        )
      }

      case 'combo': {
        return (
          <div>
            <div className="text-lg font-semibold mb-1 text-[#39ff14]">Combo Insight: Expiring contracts inside High-Intensity ("hot") agencies</div>
            <div className="insight lime">
              This is the non-obvious high-value signal: recompetes where the buyer is already spending heavily in your space (both volume and dollars). These are the gaps most worth early capture investment. Add the right ones to pipeline. If the recipient is a player you need to understand, also +brain them from the competitive tab.
            </div>
            {comboExpiring.length ? (
              <div className="glass rounded-3xl overflow-hidden text-sm">
                <table className="w-full"><tbody>
                  {comboExpiring.slice(0,6).map((e,idx) => (
                    <tr key={idx} className="border-b border-[#1f1f2e]">
                      <td className="p-3 font-mono text-xs">{e.end_date}</td>
                      <td className="p-3 truncate">{e.recipient}</td>
                      <td className="p-3 tabular-nums">${((e.obligation||0)/1e6).toFixed(1)}M</td>
                      <td className="p-3 text-[#39ff14]">{(e.agency||'').slice(0,18)} ★</td>
                      <td className="p-3 text-right"><button onClick={() => addToPipeline(e,'combo')} className="action-btn pipeline">+ pipeline</button></td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            ) : <div className="text-sm text-slate-400">No overlaps in current slice. Ingest more chunks (your download is still producing zips) — this view becomes extremely powerful fast.</div>}
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
          {/* Internal tabs for the data sections — this is the "Dashboard Page" with tabs. Features are contextual per tab. */}
          <div className="flex flex-wrap gap-1 mb-4 border-b border-[#1f1f2e] pb-2">
            {DASHBOARD_TABS.map(t => {
              const Icon = t.icon
              const active = dashTab === t.id
              return (
                <button key={t.id} onClick={() => setDashTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-2xl text-sm transition ${active ? 'bg-[#00f0ff]/10 text-[#00f0ff] border-b-2 border-[#00f0ff]' : 'text-[#a0a0c0] hover:text-white hover:bg-[#16161f]'}`}>
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              )
            })}
          </div>

          <div className="glass p-4 rounded-3xl border border-[#1f1f2e]">
            {renderDashboardContent()}
          </div>
        </div>
      )
    }

    if (sidebar === 'pipeline') {
      // Dedicated Pipeline view — opportunities & pursuits only.
      // This is the tracker for things worth bidding/tracking. Future: primary connection point
      // to the full Ariadne Thread vision (milestone living packets for opportunities).
      return (
        <div className="space-y-3">
          <div className="island">
            <div className="section-head">
              <Briefcase size={15}/> Pipeline — Opportunities &amp; Pursuits <span className="count">{pipeline.length}</span>
            </div>
            <div className="text-xs text-[#64748b] mb-2">Living list of things you decided are worth tracking or bidding. Becomes the bridge to Ariadne Thread (milestone living packets). Distinct from the Knowledge Vault.</div>
            {pipeline.length === 0 && <div className="text-sm text-[#64748b]">Use the + pipeline buttons inside Future Opportunities and the Combo insight. Items persist on disk via the backend accumulator.</div>}
            {pipeline.map((p, i) => {
              const pid = p.id || p.ts
              return (
                <div key={i} className="entry flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div><span className="font-medium">{p.type}</span> — {p.recipient || p.agency || p.label || JSON.stringify(p).slice(0,70)}</div>
                    <div className="entry-meta">from {p.source || 'dashboard'} • NAICS {p.naics} • {new Date(p.ts).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => removeFromPipeline(pid)} className="text-[#fda4af] text-xs hover:underline shrink-0" title="Remove this pursuit from the accumulator (native files if any stay)">remove</button>
                </div>
              )
            })}
            {pipeline.length > 0 && (
              <button onClick={async () => { if (confirm('Clear all pipeline?')) { try { await fetch('/user/pipeline/clear', {method:'DELETE'}) } catch{}; await syncAccumulators() } }} className="action-btn pipeline mt-3" title="Clear the entire active pipeline list. Use when you want a fresh start on tracked opportunities. The Knowledge Vault is untouched.">
                Clear pipeline
              </button>
            )}
          </div>
          <div className="text-[10px] text-[#64748b] px-1">Pipeline and Knowledge Vault are intentionally separate. Pipeline = active pursuits. Vault = compounding domain intelligence + your observations (see sidebar).</div>
        </div>
      )
    }

    if (sidebar === 'vault') {
      // Dedicated Knowledge Vault — standalone Brain / LLM wiki / Karpathy foundation.
      // Purpose: domain intelligence + your observations + Shipley/negotiation/training + new BD intel.
      // Compounds as native .md files (Obsidian + Karpathy pattern). App + LLM seed from data with citations.
      // You enhance in Obsidian desktop. This + the data views = power foundation. Schema: data/knowledge/schema/capture-llm-wiki.md
      return (
        <div className="space-y-3">
          {/* 1. Narrative + access island — full width desc + root actions co-located (correct grouping) */}
          <div className="island vault">
            <div className="section-head vault">
              <BookOpen size={15}/> Knowledge Vault <span className="pill">LLM wiki • Karpathy notes</span>
              <span className="count">{brain.length} brain + {globalFiles.length} global</span>
            </div>
            <div className="text-sm text-[#c0c0d8] leading-snug">
              Standalone foundation for domain intelligence, personal observations, Shipley/negotiation/training guidance, new BD intel. Compounds as native .md (full Karpathy pattern — see schema/capture-llm-wiki.md). App seeds from data + citations. Enhance in Obsidian desktop (obsidian-skills for agents). Richer seeds from your recent ingest. Data + vault = power foundation.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#606080] font-mono">data/knowledge/</span>
              <button onClick={() => { try { navigator.clipboard.writeText('data/knowledge') } catch {} }} className="action-btn vault" title="Copy the vault root. In Obsidian: Open folder as vault → get graph, backlinks, search, and edit your education/ notes alongside LLM-synthesized entries while keeping all provenance.">
                <Copy size={13}/> Copy root (for Obsidian)
              </button>
              <button onClick={() => { try { navigator.clipboard.writeText('cd C:\\Users\\benma\\capture-insights\n# Open data/knowledge as vault in Obsidian desktop for full wiki + your Shipley notes') } catch {} }} className="action-btn vault" title="Copy the cd + open instructions. Run it, then point Obsidian at data/knowledge/. Unlocks rich editing of the real .md files (frontmatter, sections, education/, [[wikilinks]]) while the app continues seeding from USASpending.">
                <FolderOpen size={13}/> Open in Obsidian desktop
              </button>
              <span className="text-[10px] text-[#606080] ml-1">Education &amp; schema live inside the vault folder.</span>
            </div>
          </div>

          {/* 2. Seed island — separate purpose, contextual to loaded data views, rich titles */}
          {(intensity.length > 0 || expiring.length > 0) && (
            <div className="island">
              <div className="section-head">
                <Plus size={15}/> Seed from current views <span className="text-[10px] text-[#606080] normal-case">(live intensity / expiring → vault with citations. Compounds on re-add.)</span>
              </div>
              <div className="action-group">
                {intensity.length > 0 && (
                  <button onClick={() => {
                    const top = intensity.slice(0,3)
                    top.forEach(a => addToBrain({ ...a, notes: `seeded from intensity hot (vol ${a.award_count} oblig ${((a.total_oblig||0)/1e6).toFixed(1)}M)` }, a.agency, 'agency'))
                  }} className="action-btn vault" title="Take top 3 agencies from the Capture Intensity scatter (the hot quadrant ones). Creates or appends .md entry in brain/agencies/ with quadrant signal + obligation volume + direct citation back to the USASpending rows you just loaded.">
                    <Plus size={13}/> Ingest top 3 hot agencies
                  </button>
                )}
                {expiring.length > 0 && (
                  <button onClick={() => {
                    const vis = expiring.slice(0,3)
                    vis.forEach(e => addToBrain({ ...e, notes: `seeded from expiring radar (ends ${e.end_date} ${((e.obligation||0)/1e6).toFixed(1)}M)` }, e.recipient || e.agency, 'competitor'))
                  }} className="action-btn vault" title="Take top 3 expiring awards from the radar. Seeds brain/competitors/ or agencies/ with timing + dollar note + award_key citation. Perfect for early recompete positioning and SAM monitor ideas later.">
                    <Plus size={13}/> Ingest top 3 expiring
                  </button>
                )}
              </div>
              <div className="text-[10px] text-[#606080] mt-1.5">Pulls directly from whatever is loaded in the current NAICS slice. Your recent historical ingest makes these seeds higher signal. LLM later synthesizes full atomic notes per schema.</div>
            </div>
          )}

          {/* 3. Entries island — each is a clean .entry card, synthesized note prominent, copy full is obvious action, your overlay clear */}
          <div className="island">
            <div className="section-head">
              <Layers size={15}/> Entries — synthesized + your overlays
              {brain.length === 0 && <span className="text-[10px] text-[#606080] normal-case ml-2">(add via + brain/wiki buttons in Competitive or Agency tabs, or seed above)</span>}
            </div>
            {brain.length === 0 && <div className="text-xs text-[#64748b]">Nothing in the vault yet. The +brain buttons and seed actions above feed this. Re-adding the same name+type compounds citations and appends a fresh dated section.</div>}
            {brain.map((b, i) => {
              const bid = b.id || b.addedAt
              const wiki = brainWiki.find((w: any) => {
                const bn = (b.name || '').toLowerCase().slice(0,14)
                const wn = (w.name || '').toLowerCase().slice(0,14)
                return bn && wn && (bn.includes(wn) || wn.includes(bn))
              })
              const display = wiki ? (wiki.excerpt || wiki.content) : (b.notes || '')
              const wikiPath = wiki ? wiki.path : null
              return (
                <div key={i} className="entry">
                  <div className="entry-head">
                    <div>
                      <span className="entry-title">{b.name}</span>
                      <span className="entry-type">{b.type}</span>
                    </div>
                    <button onClick={() => removeFromBrain(bid)} className="text-[#fda4af] text-xs hover:underline" title="Remove this entry from the JSON accumulator (native .md on disk stays)">remove</button>
                  </div>
                  {wiki ? (
                    <div className="entry-body">
                      <div className="text-[#67e8f9] text-[10px] mb-0.5">SYNTHESIZED FROM USASPENDING + CITATIONS (see schema for exact sections)</div>
                      <div className="whitespace-pre-wrap text-[#c0c0d8]">{display}</div>
                      {wikiPath && (
                        <div className="mt-1.5 flex items-center gap-2 text-[9px] text-[#606080] font-mono">
                          {wikiPath}
                          <button onClick={() => { try { navigator.clipboard.writeText(display) } catch {} }} className="action-btn vault" title="Copy the full LLM-synthesized note (data signals + citations + any prior overlays) to clipboard. Paste into Obsidian, reports, or external tools. Provenance stays in the .md frontmatter and sections.">
                            <Copy size={12}/> Copy full synthesized
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="entry-body text-[#a8b4d0]">{display}</div>
                  )}
                  <div className="entry-meta">Citation: {b.citation}</div>
                  <div className="mt-2">
                    <div className="text-[9px] text-[#64748b] mb-0.5">Your overlay (appends to the native .md on save)</div>
                    <input
                      defaultValue={b.notes}
                      onBlur={(e) => updateBrainNote(bid, e.target.value)}
                      className="w-full bg-[#05070d] border border-[#1f2a44] text-xs rounded px-2 py-1 text-[#e6ecff]"
                      placeholder="Add Shipley angle, negotiation lever, new intel, ontology idea..."
                    />
                  </div>
                </div>
              )
            })}
            {brain.length > 0 && (
              <div className="mt-2">
                <button onClick={async () => {
                  if (confirm('Clear entire Knowledge Vault? Native .md files stay on disk until you delete them in Obsidian or Explorer. Education/ and schema/ are untouched.')) {
                    try { await fetch('/user/brain/clear', {method:'DELETE'}) } catch{}
                    await syncAccumulators()
                  }
                }} className="action-btn destructive" title="Wipes the in-app accumulator only. The real vault (.md files in data/knowledge/brain/) and your education notes remain. Use this when you want a clean slate in the UI while keeping the files.">
                  <Trash2 size={13}/> Clear entire Knowledge Vault (UI only)
                </button>
              </div>
            )}
          </div>

          {/* Global Wiki — foundational evergreen knowledge (browse/read/Obsidian). Cross-seed from dashboard data = future. */}
          <div className="island">
            <div className="section-head">
              <Layers size={15}/> Global Wiki <span className="text-[10px] text-[#606080] normal-case">({globalFiles.length} entries)</span>
            </div>
            <div className="text-[10px] text-[#64748b] mb-1">
              Evergreen capture knowledge (Shipley, domain intel, process guides) from the ariadne base. Browse and read here or in Obsidian at data/knowledge/global/. Separate from brain/ (data-tied entries) and from USASpending dashboard numbers.
            </div>
            <div className="action-group">
              <button onClick={async () => { await loadUserAccumulators() }} className="action-btn vault">
                Refresh Global List
              </button>
            </div>
            {globalFiles.length === 0 && (
              <div className="text-xs text-[#64748b] mt-1">No global files in UI state yet — click Refresh Global List (or restart app). Backend has 155+ from ariadne global_wiki + domain_intel.</div>
            )}
            {globalFiles.length > 0 && (
              <div className="mt-2 space-y-1 text-xs">
                {globalFiles.slice(0, 12).map((g, i) => (
                  <div key={i} className="py-1 px-2 border border-[#1f2a44] rounded bg-[#05070d]/50 flex items-start justify-between gap-2 hover:border-[#a78bfa]/60 transition-colors">
                    <div 
                      className="min-w-0 flex-1 cursor-pointer" 
                      onClick={() => setViewedWiki(g)}
                      title="Click to read the actual wiki content (synthesized sections, citations, observations) in the viewer below"
                    >
                      <div className="font-medium text-[#c0c0d8]">{g.name} <span className="text-[#606080]">({g.type || 'global'})</span></div>
                      <div className="text-[#a0a0c0] truncate">{(g.excerpt || '').slice(0, 160)}</div>
                      <div className="font-mono text-[9px] text-[#606080]">{g.path}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={() => setViewedWiki(g)} 
                        className="action-btn vault text-[10px]" 
                        title="Read the full content of this wiki page right here in the app (no need to switch to Obsidian for quick lookup)"
                      >
                        <Eye size={11}/> View
                      </button>
                      <button onClick={() => { try { navigator.clipboard.writeText(g.path || '') } catch {} }} className="action-btn vault text-[10px]" title="Copy path for Obsidian">
                        <Copy size={11}/> path
                      </button>
                    </div>
                  </div>
                ))}
                {globalFiles.length > 12 && <div className="text-[#606080] text-[10px]">+ {globalFiles.length - 12} more — open data/knowledge/global/ in Obsidian for full graph/search. Use View on any row to read the actual text in-app.</div>}
              </div>
            )}
            <div className="text-[9px] text-[#606080] mt-1">Ariadne knowledge under global/global_wiki + domain_intel. Edit in Obsidian; use brain/ for USASpending-seeded entries. Cross-seed from dashboard → global pages is a future feature.</div>

            {/* In-app Wiki Viewer: the main way to actually *read* the content without only copying paths.
                Click View on any global row (or native .md row below) → this appears with the real text (synthesized Key Signals, Citations & Sources, Personal Observations, full ariadne pages, etc.).
                "Load complete file" pulls the entire .md via the backend reader (list only ships a preview slice).
                This is the UI/UX bridge: app = fast discovery + data seeding + quick reads while you work; Obsidian = the full IDE for editing, graph, bases, wikilinks, plugins.
            */}
            {viewedWiki && (
              <div className="mt-3 island border border-[#a78bfa]/50">
                <div className="section-head flex items-center justify-between">
                  <div>
                    <Eye size={15}/> Viewing wiki page: <span className="text-[#c0c0d8]">{viewedWiki.name}</span>
                    <span className="text-[#606080] ml-1">({viewedWiki.type || 'wiki'})</span>
                  </div>
                  <button onClick={() => setViewedWiki(null)} className="text-xs px-2 py-0.5 border border-[#1f2a44] rounded hover:bg-[#16161f]">Close viewer</button>
                </div>
                <div className="text-[10px] font-mono text-[#606080] mb-1">{viewedWiki.path}</div>

                <div className="bg-[#05070d] border border-[#1f2a44] rounded p-3 max-h-[420px] overflow-auto text-[11px] leading-snug whitespace-pre-wrap text-[#d0d8f0]">
                  {(viewedWiki.content || viewedWiki.excerpt || '(no preview loaded — click Load complete file)')}
                </div>

                <div className="action-group mt-2">
                  <button 
                    onClick={() => { 
                      const txt = viewedWiki.content || viewedWiki.excerpt || ''; 
                      try { navigator.clipboard.writeText(txt) } catch {} 
                    }} 
                    className="action-btn vault text-[10px]"
                  >
                    Copy visible text
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        const r = await fetch(`/user/knowledge/read?path=${encodeURIComponent(viewedWiki.path)}`);
                        const d = await r.json();
                        if (d.ok && d.content) setViewedWiki({ ...viewedWiki, content: d.content });
                      } catch {}
                    }} 
                    className="action-btn vault text-[10px]"
                  >
                    Load complete file
                  </button>
                  <button 
                    onClick={() => { try { navigator.clipboard.writeText(viewedWiki.path || '') } catch {} }} 
                    className="action-btn vault text-[10px]"
                  >
                    Copy path
                  </button>
                  <button 
                    onClick={() => {
                      const help = `cd C:\\Users\\benma\\capture-insights\n# In Obsidian: Open folder as vault → data/knowledge\n# Then quick switcher or file tree to: ${viewedWiki.path}`;
                      try { navigator.clipboard.writeText(help) } catch {}
                    }} 
                    className="action-btn vault text-[10px]"
                    title="Copies a ready command + path hint so you can jump straight into full editing + graph in Obsidian"
                  >
                    Obsidian jump (copy)
                  </button>
                </div>
                <div className="text-[9px] text-[#606080] mt-1">
                  Reading here is for speed while you stay on the data + chat flow. For serious curation, [[wikilinks]], backlinks, canvas, daily notes on the wiki: use Obsidian pointed at the data/knowledge folder.
                </div>
              </div>
            )}
          </div>

          {/* Training data section (unsloth / future intelligent LLM curation) */}
          <div className="island">
            <div className="section-head">
              <BookOpen size={15}/> Training data (unsloth fine-tunes)
            </div>
            <div className="text-[10px] text-[#64748b]">
              High-signal datasets for local specialized agents live in <span className="font-mono">data/knowledge/training/datasets/</span> (JSONL convos ready for unsloth), examples/, prompts/.
              Schema defines the workflow: LLM proposes only valuable gaps (e.g. hot quadrant signals with no matching ariadne intel), you review/approve before append (human-in-loop, full provenance).
              No raw dump — only high-value. Buttons for "Suggest Valuable Training Examples" coming next (will use current global + brain + intensity data).
            </div>
            <div className="text-[9px] text-[#606080] mt-1">This saves frontier calls + gives focused capture agents. See schema/capture-llm-wiki.md "Training Data Collection".</div>
          </div>

          {/* Phase 3 maintenance island — button-driven vault chores (lint + index) so LLM/agent handles the schema work */}
          <div className="island">
            <div className="section-head">
              <Wrench size={15}/> Vault Maintenance (LLM/agent tasks)
            </div>
            <div className="text-[10px] text-[#64748b] mb-1">
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
              <div className="mt-2 text-xs border border-[#1f2a44] rounded p-2 bg-[#0a0e1a]">
                <div className="font-medium">Lint result: {lintReport.ok ? 'CLEAN' : 'ISSUES FOUND'} — {lintReport.summary}</div>
                {lintReport.legacy_dirs?.length > 0 && <div className="text-[#fda4af]">Legacy dirs: {lintReport.legacy_dirs.join(', ')}</div>}
                {lintReport.entries?.filter((e: any) => !e.ok).slice(0, 4).map((e: any, i: number) => (
                  <div key={i} className="text-[#fda4af] mt-0.5">{e.name} ({e.type}): {e.issues?.join('; ')}</div>
                ))}
                {lintReport.ok && <div className="text-[#67e8f9]">All native .md files follow the schema rules.</div>}
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
              <div className="mt-1 text-xs text-[#67e8f9]">Index catalog rebuilt ({indexStatus.bytes} bytes). Open data/knowledge/index.md in Obsidian to see the fresh list.</div>
            )}
            <div className="text-[9px] text-[#606080] mt-1">Run these before handing off to external agents or after big data seeds. Script in scripts/vault_maintain.py does the same for Obsidian-skills agents.</div>
          </div>

          {/* 4. Native on-disk island — source of truth, easy copy path for Obsidian */}
          {brainWiki.length > 0 && (
            <div className="island">
              <div className="section-head">
                <FolderOpen size={15}/> Native .md on disk — the real source of truth
              </div>
              <div className="text-[10px] text-[#64748b] mb-2">These files live in data/knowledge/brain/. Point Obsidian at data/knowledge/ for graph, backlinks, full editing of your education/ notes + the synthesized sections. App + LLM only append; you curate.</div>
              {brainWiki.slice(0,8).map((w, i) => (
                <div key={i} className="text-[11px] py-1 border-b border-[#1f2a44] last:border-none flex items-center justify-between gap-2 hover:border-[#a78bfa]/40">
                  <div 
                    className="min-w-0 flex-1 cursor-pointer" 
                    onClick={() => setViewedWiki(w)}
                    title="Click to read the actual wiki content in the in-app viewer"
                  >
                    <span className="font-medium">{w.name}</span> <span className="text-[#64748b]">({w.type})</span>
                    <div className="text-[#a0a0c0] truncate text-[10px]">{w.excerpt || w.content}</div>
                    <div className="font-mono text-[9px] text-[#606080]">{w.path}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => setViewedWiki(w)} 
                      className="action-btn vault text-[10px]" 
                      title="Read the full synthesized note + your overlays right in the UI"
                    >
                      <Eye size={11}/> View
                    </button>
                    <button onClick={() => { try { navigator.clipboard.writeText(w.path || '') } catch {} }} className="action-btn vault" title="Copy exact relative path to this .md. In Obsidian quick switcher or file open you can paste it to jump straight to the full synthesized note + your overlays.">
                      <Copy size={12}/> copy path
                    </button>
                  </div>
                </div>
              ))}
              {brainWiki.length > 8 && <div className="text-[10px] text-[#606080] mt-1">+ {brainWiki.length-8} more on disk</div>}
            </div>
          )}

          {/* 5. Light persistent guidance — clean, not smushed, points to the wiki education mechanism */}
          <div className="text-[10px] text-[#64748b] px-1 flex items-center gap-2">
            <Info size={13}/> Guidance, Shipley, negotiation, training notes, and new ontology ideas live in the vault's <span className="font-mono text-[#a5b4fc]">education/</span> folder + <span className="font-mono text-[#a5b4fc]">schema/capture-llm-wiki.md</span>. Hover titles + open in Obsidian for the full picture. (Clean, reusable pattern.)
          </div>
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
          <div className="glass p-5 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">MCP Tools</div>
                <div className="text-xs text-[#a0a0c0]">Battle-tested clients from https://github.com/1102tools/federal-contracting-mcps (we only consume, never implement servers ourselves).</div>
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
                <div className="mt-1 text-[10px] text-[#606080]">The catalog is attempted at startup (warmup). External sam-gov-mcp server enables the richest tool set.</div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {tools.map((t, idx) => (
                  <div key={idx} className="border border-[#1f1f2e] rounded p-2 bg-[#0a0e1a]">
                    <div className="font-medium text-[#00f0ff]">{t.name}</div>
                    {t.description && <div className="text-xs text-[#a0a0c0] mt-0.5">{t.description}</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 text-[11px] text-[#606080]">
              These tools are used automatically by the agent when you click contextual buttons (e.g. "Create SAM monitor (smart)" on an expiring row) or ask the floating co-pilot natural-language questions. The catalog is sent to the chat so suggestions stay grounded in what is actually available.
            </div>
            {mcpInfo.note && <div className="mt-2 text-[10px] text-[#ff2bd6]">{mcpInfo.note}</div>}
          </div>

          <div className="text-[10px] text-[#606080] px-1">
            Status is also visible in /health and the top status line. Warmup happens automatically when the backend starts.
          </div>
        </div>
      )
    }

    // Stubs for other future sidebars (skills, settings) — clean and honest
    return (
      <div className="glass p-8 rounded-3xl text-center">
        <div className="text-2xl mb-2">{SIDEBAR_ITEMS.find(s => s.id === sidebar)?.label}</div>
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

  return (
    <div className="min-h-screen bg-[#0a0a12] text-[#e0e0ff] font-sans">
      {/* Top command bar (Ariadne/Theseus inspired) */}
      <header className="h-14 border-b border-[#1f1f2e] bg-[#0a0a12]/95 backdrop-blur-xl fixed w-full z-50">
        <div className="w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#ff2bd6] flex items-center justify-center">
              <span className="text-black text-xl font-bold">CI</span>
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tighter text-[#00f0ff]">CAPTURE</span>
              <span className="text-2xl font-bold tracking-tighter text-white/70">INSIGHTS</span>
            </div>
            <span className="ml-2 px-2.5 py-0.5 text-[10px] font-mono border border-[#00f0ff]/30 text-[#00f0ff] rounded-full">REACT • CONTEXTUAL TABS + RESIZABLE CHAT</span>
          </div>

          <div className="flex-1 max-w-md mx-6">
            <div className="relative">
              <input 
                type="text" 
                value={naics} 
                onChange={e => setNaics(e.target.value)} 
                onKeyDown={handleNaicsKey}
                className="w-full bg-[#16161f] border border-[#1f1f2e] focus:border-[#00f0ff] text-sm placeholder-[#606080] pl-9 py-2 rounded-2xl focus:outline-none font-mono" 
                placeholder="NAICS (comma-separated OK)" 
              />
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#606080]" />
            </div>
            <div className="text-[9px] text-[#606080] mt-0.5 font-mono">
              Ingest more (full raw, dedup-only-new): uv run python scripts/ingest_historical.py --dir data/raw/10year_bulk/prime   (prime only). For subawards: --dir data/raw/10year_bulk/sub --sub
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleRefresh} 
              disabled={loading}
              className="px-4 py-1.5 rounded-2xl bg-white text-black font-semibold text-sm flex items-center gap-2 hover:bg-[#e0e0ff] transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={toggleChat} className="px-3 py-1.5 rounded-2xl border border-[#00f0ff]/40 text-xs flex items-center gap-1 hover:bg-[#16161f]">
              <MessageSquare className="w-3.5 h-3.5" /> {showChat ? 'Hide' : 'Show'} Chat
            </button>
          </div>
        </div>
      </header>

      <div className="w-full px-6 pt-16 pb-6 flex gap-5">
        {/* LEFT SIDEBAR — high-level navigation (NO chat page — chat is the floating/resizable pane) */}
        <aside className="w-60 shrink-0">
          <div className="sticky top-16">
            <div className="text-xs uppercase tracking-[1.5px] text-[#606080] mb-2 px-3">NAVIGATION</div>
            <div className="space-y-1">
              {SIDEBAR_ITEMS.map(item => {
                const Icon = item.icon
                const isActive = sidebar === item.id
                return (
                  <button 
                    key={item.id} 
                    onClick={() => setSidebar(item.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-sm transition ${isActive ? 'bg-[#00f0ff]/10 text-[#00f0ff] border-l-3 border-[#00f0ff]' : 'hover:bg-[#16161f] text-[#c0c0d8]'}`}
                  >
                    <Icon className="w-4 h-4" />
                    <div className="leading-tight">
                      <div>{item.label}</div>
                      <div className="text-[10px] text-[#606080]">{item.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 px-3 text-[10px] leading-snug text-[#606080]">
              Pipeline = opportunities you chose to track.<br />
              Brain = competitors &amp; agencies you are accumulating intel on (makes the wiki smarter).<br />
              Both are now saved to data/user_accumulators.json on disk (real persistence, survives everything).
            </div>
            <div className="mt-4 px-3">
              <button onClick={toggleChat} className="text-xs px-3 py-1 rounded border border-[#00f0ff]/30 hover:bg-[#16161f] w-full">Toggle floating chat (always available)</button>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#606080]">{SIDEBAR_ITEMS.find(s => s.id === sidebar)?.label}</div>
              <div className="text-2xl font-semibold tracking-tight">
                {sidebar === 'dashboard' ? 'Real Bulk Data Explorer — Contextual Actions' : SIDEBAR_ITEMS.find(s => s.id === sidebar)?.label}
              </div>
              {sidebar === 'vault' && <div className="text-[10px] text-[#a78bfa] mt-0.5">The foundational knowledge vault (separate from Pipeline). Native .md files in data/knowledge/ are the source of truth.</div>}
            </div>
            <div className="text-xs text-[#606080]">{contextHeader}</div>
          </div>

          <div className="mb-4">
            <span className="px-3 py-1 rounded-full text-xs bg-[#16161f] text-[#00f0ff] border border-[#00f0ff]/30">{status}</span>
          </div>

          {renderMain()}
        </main>
      </div>

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
              <MessageSquare className="w-4 h-4 text-[#00f0ff]" />
              <div className="font-semibold text-[#00f0ff]">AI Co-pilot</div>
              <span className="text-[9px] text-[#606080]">(always on • context-aware)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setUseSmartModel(!useSmartModel)}
                className={`text-[10px] px-2 py-0.5 rounded border ${useSmartModel ? 'bg-[#00f0ff] text-black border-[#00f0ff]' : 'border-[#00f0ff]/30 text-[#606080] hover:text-white hover:border-[#00f0ff]/60'}`}
                title={useSmartModel ? "Using local LLM (slower but more natural). Click to use fast context path." : "Fast context path (instant, data-grounded + action chips). Click to try local LLM for smarter answers."}
              >
                {useSmartModel ? 'Smart model' : 'Fast context'}
              </button>
              <button onClick={maximizeChat} className="p-1 hover:bg-[#16161f] rounded" title="Toggle larger size for long responses">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setShowChat(false)} className="p-1 hover:bg-[#16161f] rounded"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="chat-messages space-y-2">
            {chatHistory.map((m, idx) => (
              <div key={idx} className={m.role === 'user' ? 'text-right' : ''}>
                <div className={`chat-msg ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  {m.content}
                  {m.role === 'assistant' && (m.source || m.model) && (
                    <div className="text-[9px] text-[#606080] mt-1 opacity-70">
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
              placeholder="Tell the co-pilot what to do (e.g. search SAM for my brain items, create monitors, find overlaps... it drives MCPs)"
              className="flex-1 bg-[#0a0e1a] border border-[#1f1f2e] rounded-lg px-3 py-1.5 text-xs focus:border-[#00f0ff] focus:outline-none"
            />
            <button onClick={sendChat} className="px-4 rounded-lg bg-[#00f0ff] text-black text-xs font-semibold">Send</button>
          </div>

          <div className="px-3 py-1 text-[9px] text-[#606080] border-t border-[#1f1f2e] flex-shrink-0">
            Live context: {contextHeader}
          </div>
        </div>
      )}

      {/* Floating toggle when chat is closed */}
      {!showChat && (
        <button
          onClick={toggleChat}
          className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-full bg-[#00f0ff] text-black font-semibold text-sm flex items-center gap-2 shadow-lg hover:bg-[#38ecff] transition"
          title="Open the always-available AI co-pilot (sees current tab, filters, pipeline, brain)"
        >
          <MessageSquare className="w-4 h-4" /> AI Co-pilot <span className="text-[10px] opacity-70">(always on)</span>
        </button>
      )}
    </div>
  )
}
