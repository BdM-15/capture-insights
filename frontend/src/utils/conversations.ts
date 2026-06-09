export type ModelProvider = 'fast' | 'ollama' | 'xai'

export interface ChatSuggestedAction {
  label: string
  action: string
  payload?: Record<string, unknown>
}

export interface ConversationMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source?: string
  model?: string
  run_id?: string
  skill_id?: string
  suggested_actions?: ChatSuggestedAction[]
  created_at?: string
}

export interface ConversationSummary {
  id: string
  title: string
  updated_at?: string
  created_at?: string
  model_provider: ModelProvider
  message_count: number
  preview?: string
}

export interface Conversation extends ConversationSummary {
  model_name?: string | null
  scope?: Record<string, unknown>
  messages: ConversationMessage[]
  linked_runs?: string[]
}

const PROVIDER_KEY = 'ci_chat_model_provider'
const ACTIVE_CONVERSATION_KEY = 'ci_active_conversation_id'

export function loadActiveConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONVERSATION_KEY)
  } catch {
    return null
  }
}

export function storeActiveConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
    else localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
  } catch {}
}

const CHAT_API_HINT =
  'Chat API unavailable — stop the old server and restart with .\\scripts\\start.ps1 (hard refresh after).'

async function parseJsonResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    if (text.trimStart().startsWith('<!')) {
      throw new Error(CHAT_API_HINT)
    }
    throw new Error(text.slice(0, 240) || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function providerLabel(p: ModelProvider): string {
  if (p === 'xai') return 'Cloud'
  if (p === 'ollama') return 'Local'
  return 'Fast'
}

export function loadStoredProvider(): ModelProvider {
  try {
    const v = localStorage.getItem(PROVIDER_KEY)
    if (v === 'ollama' || v === 'xai' || v === 'fast') return v
  } catch {}
  return 'fast'
}

export function storeProvider(p: ModelProvider) {
  try {
    localStorage.setItem(PROVIDER_KEY, p)
  } catch {}
}

export async function listConversations(limit = 30): Promise<ConversationSummary[]> {
  const res = await fetch(`/chat/conversations?limit=${limit}`)
  if (!res.ok) return []
  const data = await parseJsonResponse<{ conversations?: ConversationSummary[] }>(res)
  return data.conversations || []
}

export async function createConversation(
  scope?: Record<string, unknown>,
  model_provider: ModelProvider = 'fast',
): Promise<Conversation> {
  const res = await fetch('/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'New conversation', model_provider, scope }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || 'Failed to create conversation')
  }
  return parseJsonResponse<Conversation>(res)
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const res = await fetch(`/chat/conversations/${id}`)
  if (!res.ok) return null
  const data = await parseJsonResponse<Conversation & { error?: string }>(res)
  if (data.error) return null
  return data as Conversation
}

export async function patchConversation(
  id: string,
  patch: { title?: string; model_provider?: ModelProvider },
): Promise<Conversation | null> {
  const res = await fetch(`/chat/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return null
  return parseJsonResponse<Conversation>(res)
}

export async function deleteConversation(id: string): Promise<boolean> {
  const res = await fetch(`/chat/conversations/${id}`, { method: 'DELETE' })
  if (!res.ok) return false
  const data = await parseJsonResponse<{ ok?: boolean }>(res)
  return !!data.ok
}

export interface SendMessageContext {
  naics: string
  active_tab: string
  kpis?: Record<string, unknown> | null
  brain?: Record<string, unknown>[]
  pipeline?: Record<string, unknown>[]
  mcp_tools?: Record<string, unknown>[]
  model_provider?: ModelProvider
  continue_run_id?: string
  vault_excerpt?: string
  include_vault_excerpt?: boolean
}

export interface SendMessageOpts {
  regenerate?: boolean
  editMessageId?: string
  continueRunId?: string
  stream?: boolean
  signal?: AbortSignal
  onToken?: (text: string, fullText: string) => void
}

export async function sendConversationMessage(
  conversationId: string,
  message: string,
  ctx: SendMessageContext,
  opts?: SendMessageOpts,
): Promise<Record<string, unknown>> {
  if (opts?.stream) {
    return sendConversationMessageStream(conversationId, message, ctx, opts)
  }
  const res = await fetch(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      regenerate: opts?.regenerate ?? false,
      edit_message_id: opts?.editMessageId,
      continue_run_id: opts?.continueRunId ?? ctx.continue_run_id,
      ...ctx,
    }),
    signal: opts?.signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(err || 'send failed')
  }
  return parseJsonResponse<Record<string, unknown>>(res)
}

async function sendConversationMessageStream(
  conversationId: string,
  message: string,
  ctx: SendMessageContext,
  opts?: SendMessageOpts,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/chat/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      regenerate: opts?.regenerate ?? false,
      edit_message_id: opts?.editMessageId,
      continue_run_id: opts?.continueRunId ?? ctx.continue_run_id,
      ...ctx,
    }),
    signal: opts?.signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(err || 'stream failed')
  }
  if (!res.body) {
    throw new Error('stream body missing')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let donePayload: Record<string, unknown> | null = null

  const handleEvent = (block: string) => {
    const lines = block.split('\n')
    let event = 'message'
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) return
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      if (event === 'token') {
        const chunk = String(parsed.text || '')
        fullText += chunk
        opts?.onToken?.(chunk, fullText)
      } else if (event === 'error') {
        throw new Error(String(parsed.message || 'stream error'))
      } else if (event === 'done') {
        donePayload = parsed
      }
    } catch (err) {
      if (event === 'error') throw err
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      if (part.trim()) handleEvent(part)
    }
  }
  if (buffer.trim()) handleEvent(buffer)

  if (!donePayload) {
    throw new Error('stream ended without done event')
  }
  return donePayload
}

export async function appendConversationMessage(
  conversationId: string,
  msg: {
    role?: 'user' | 'assistant'
    content: string
    source?: string
    run_id?: string
    skill_id?: string
    suggested_actions?: ChatSuggestedAction[]
  },
): Promise<Conversation | null> {
  const res = await fetch(`/chat/conversations/${conversationId}/append`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  })
  if (!res.ok) return null
  const data = await parseJsonResponse<{ conversation?: Conversation }>(res)
  return data.conversation ?? null
}