import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { MetricCard } from '../ui/MetricCard'
import type {
  ConnectionTestResult,
  SettingsConnection,
  SettingsSnapshot,
  TestAllResult,
} from '../../utils/settingsConnections'

interface SettingsConnectionsPanelProps {
  health: string
  readiness: Record<string, unknown> | null
  onOpenMcpTools: () => void
}

function keyPill(conn: SettingsConnection) {
  if (!conn.key) return null
  if (!conn.key.required) {
    if (conn.key.configured) {
      return <span className="settings-key-pill is-ready">key set</span>
    }
    return <span className="settings-key-pill is-optional">optional</span>
  }
  if (conn.key.configured) {
    return <span className="settings-key-pill is-ready">key set</span>
  }
  return (
    <span className="settings-key-pill is-missing" title={`Set ${conn.key.env_var} in .env`}>
      needs {conn.key.env_var}
    </span>
  )
}

function resultBanner(result: ConnectionTestResult | undefined) {
  if (!result) return null
  const cls = result.ok ? 'settings-test-result is-ok' : 'settings-test-result is-fail'
  return (
    <div className={cls}>
      {result.ok ? (
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <div>
            <span>Handshake ok</span>
            {result.tool_count != null && (
              <span>
                {' '}
                · {result.tool_count} tool{result.tool_count === 1 ? '' : 's'}
              </span>
            )}
            {result.detail && <span className="text-text-500"> · {result.detail}</span>}
            {result.sample_tools && result.sample_tools.length > 0 && (
              <div className="text-text-500 mt-0.5 font-mono text-[10px]">
                {result.sample_tools.join(', ')}
              </div>
            )}
            {result.latency_ms != null && (
              <span className="text-text-500"> ({result.latency_ms}ms)</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <XCircle size={14} className="shrink-0 mt-0.5" />
          <span>{result.error || 'Connection failed'}</span>
        </div>
      )}
    </div>
  )
}

export function SettingsConnectionsPanel({
  health,
  readiness,
  onOpenMcpTools,
}: SettingsConnectionsPanelProps) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, ConnectionTestResult>>({})
  const [testAllRunning, setTestAllRunning] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/settings')
      if (res.ok) setSnapshot(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  async function testConnection(id: string) {
    setTesting((t) => ({ ...t, [id]: true }))
    try {
      const res = await fetch(`/settings/test/${encodeURIComponent(id)}`, { method: 'POST' })
      const data: ConnectionTestResult = res.ok ? await res.json() : { ok: false, id, error: `HTTP ${res.status}` }
      setResults((r) => ({ ...r, [id]: data }))
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { ok: false, id, error: e instanceof Error ? e.message : 'Request failed' },
      }))
    } finally {
      setTesting((t) => ({ ...t, [id]: false }))
    }
  }

  async function testAll() {
    setTestAllRunning(true)
    try {
      const res = await fetch('/settings/test-all', { method: 'POST' })
      if (!res.ok) return
      const data: TestAllResult = await res.json()
      const map: Record<string, ConnectionTestResult> = {}
      for (const r of data.results || []) {
        map[r.id] = r
      }
      setResults(map)
    } finally {
      setTestAllRunning(false)
    }
  }

  const connections = snapshot?.connections || []
  const core = connections.filter((c) => c.kind !== 'mcp')
  const mcps = connections.filter((c) => c.kind === 'mcp')
  const mcpPassed = Object.entries(results).filter(([id, r]) => id.startsWith('mcp:') && r.ok).length
  const keys = snapshot?.keys || {}

  return (
    <div className="page-sections">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
        <MetricCard
          label="Backend"
          value={health === 'live' ? 'Connected' : health === 'checking' ? '…' : 'Issue'}
          accent={health === 'live' ? 'lime' : 'amber'}
        />
        <MetricCard
          label="MCP SDK"
          value={snapshot?.mcp_sdk_available ? 'Ready' : 'Missing'}
          accent={snapshot?.mcp_sdk_available ? 'cyan' : 'amber'}
          tooltip="Python mcp package for stdio MCP clients"
        />
        <MetricCard
          label="Keys configured"
          value={`${Object.values(keys).filter(Boolean).length}/${Object.keys(keys).length}`}
          accent="purple"
          tooltip="SAM, BLS, DATA.GOV, xAI — values never shown here"
        />
        <MetricCard
          label="Live MCPs"
          value={snapshot?.enable_live_mcps ? 'On' : 'Off'}
          accent={snapshot?.enable_live_mcps ? 'lime' : 'amber'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button variant="soft" onClick={loadSettings} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh status
        </Button>
        <Button variant="soft" onClick={testAll} disabled={testAllRunning}>
          <Activity size={12} />
          {testAllRunning ? 'Testing all…' : 'Test all connections'}
        </Button>
        <Button variant="soft" onClick={onOpenMcpTools}>
          Open MCP Tools
        </Button>
      </div>

      {snapshot?.note && (
        <div className="text-[10px] text-text-500 mb-3">{snapshot.note}</div>
      )}

      <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">Core services</div>
      <div className="space-y-2 mb-4">
        {core.map((conn) => (
          <ConnectionRow
            key={conn.id}
            conn={conn}
            testing={!!testing[conn.id]}
            result={results[conn.id]}
            onTest={() => testConnection(conn.id)}
          />
        ))}
      </div>

      <div className="text-[10px] uppercase tracking-wider text-text-500 mb-1.5">
        Federal 1102 MCPs ({mcps.length})
      </div>
      <div className="text-[10px] text-text-500 mb-2">
        Spawn via uvx, handshake, and list tools — same path the co-pilot uses. No-key MCPs work out of the box;
        key-gated MCPs need .env values then a backend restart.
      </div>
      <div className="space-y-2">
        {mcps.map((conn) => (
          <ConnectionRow
            key={conn.id}
            conn={conn}
            testing={!!testing[conn.id]}
            result={results[conn.id]}
            onTest={() => testConnection(conn.id)}
          />
        ))}
      </div>

      {readiness && (
        <div className="text-[10px] text-text-500 mt-4 font-mono">
          Readiness: {(readiness as { status?: string }).status || 'unknown'}
          {(readiness as { mcp_tools_count?: number }).mcp_tools_count != null &&
            ` · ${(readiness as { mcp_tools_count?: number }).mcp_tools_count} SAM tools cached`}
          {mcpPassed > 0 && ` · ${mcpPassed} MCP test(s) passed this session`}
        </div>
      )}
    </div>
  )
}

function ConnectionRow({
  conn,
  testing,
  result,
  onTest,
}: {
  conn: SettingsConnection
  testing: boolean
  result?: ConnectionTestResult
  onTest: () => void
}) {
  const canTest = conn.testable !== false && (conn.ready !== false)
  const disabled = testing || !canTest

  return (
    <div className="settings-connection-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-text-primary">{conn.name}</span>
            {conn.kind === 'mcp' && conn.package && (
              <code className="text-[10px] text-neon-cyan font-mono">{conn.package}</code>
            )}
            {conn.integrated && (
              <span className="settings-key-pill is-integrated">integrated</span>
            )}
            {keyPill(conn)}
          </div>
          {conn.description && (
            <div className="text-[10px] text-text-500 leading-relaxed">{conn.description}</div>
          )}
        </div>
        <button
          type="button"
          className="action-btn flex items-center gap-1 px-2 py-1 text-[10px] shrink-0"
          onClick={onTest}
          disabled={disabled}
          title={
            !canTest && conn.missing_keys?.length
              ? `Set ${conn.missing_keys.join(', ')} first`
              : 'Spawn subprocess + handshake + tools/list'
          }
        >
          <Activity size={11} />
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {resultBanner(result)}
    </div>
  )
}