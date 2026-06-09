export interface KeyStatus {
  required?: boolean
  configured?: boolean
  env_var?: string
}

export interface SettingsConnection {
  id: string
  kind: 'data' | 'llm' | 'api' | 'mcp' | string
  name: string
  description?: string
  package?: string
  category?: string
  integrated?: boolean
  key?: KeyStatus | null
  missing_keys?: string[]
  ready?: boolean
  testable?: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  id: string
  name?: string
  error?: string
  detail?: string
  tool_count?: number
  sample_tools?: string[]
  latency_ms?: number
  missing_keys?: string[]
}

export interface SettingsSnapshot {
  version?: string
  env?: string
  enable_live_mcps?: boolean
  enable_ai_features?: boolean
  mcp_sdk_available?: boolean
  connections?: SettingsConnection[]
  keys?: Record<string, boolean>
  note?: string
  readiness?: Record<string, unknown>
}

export interface TestAllResult {
  ok: boolean
  tested: number
  passed: number
  failed: number
  results: ConnectionTestResult[]
}