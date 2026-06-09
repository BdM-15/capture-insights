import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  History,
  Loader2,
  Maximize2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { ChatRunCard } from './ChatRunCard'
import { renderMarkdownToHtml } from '../../utils/renderMarkdown'
import { invokeSkill } from '../../utils/skillInvoke'
import {
  appendConversationMessage,
  createConversation,
  deleteConversation,
  loadActiveConversationId,
  loadConversation,
  listConversations,
  patchConversation,
  providerLabel,
  sendConversationMessage,
  storeActiveConversationId,
  storeProvider,
  type ChatSuggestedAction,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type ModelProvider,
} from '../../utils/conversations'

const WELCOME =
  'Co-pilot ready — sees your NAICS, tab, KPIs, Pipeline, Knowledge Vault, and MCP tools.\n\n' +
  'Use **Fast** for instant grounded answers from your data. **Local** uses Ollama. **Cloud** uses your configured frontier API key in Settings.\n\n' +
  'Ask open questions, search SAM, run skills, or use action chips on responses.'

export interface AssistantContext {
  naics: string
  activeTab: string
  kpis?: Record<string, unknown> | null
  brain?: Record<string, unknown>[]
  pipeline?: Record<string, unknown>[]
  mcpTools?: Record<string, unknown>[]
  pursuitSlug?: string | null
  previewPath?: string | null
  previewExcerpt?: string | null
  brainCount: number
  pipelineCount: number
}

export interface ChatSendRequest {
  text: string
  id: number
}

interface AssistantRailProps {
  open: boolean
  onClose: () => void
  width: number
  onWidthChange: (w: number) => void
  context: AssistantContext
  modelProvider: ModelProvider
  onModelProviderChange: (p: ModelProvider) => void
  onSuggestedAction: (action: ChatSuggestedAction) => void
  onOpenArtifact?: (path: string) => void
  onViewSkillRun?: (runId: string, skillId?: string) => void
  prefillInput?: string
  onPrefillConsumed?: () => void
  sendRequest?: ChatSendRequest | null
  onSendRequestConsumed?: () => void
  conversationRefreshToken?: number
}

export function AssistantRail({
  open,
  onClose,
  width,
  onWidthChange,
  context,
  modelProvider,
  onModelProviderChange,
  onSuggestedAction,
  onOpenArtifact,
  onViewSkillRun,
  prefillInput,
  onPrefillConsumed,
  sendRequest,
  onSendRequestConsumed,
  conversationRefreshToken = 0,
}: AssistantRailProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [history, setHistory] = useState<ConversationSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [booting, setBooting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [continueRunId, setContinueRunId] = useState<string | null>(null)
  const [includeVaultExcerpt, setIncludeVaultExcerpt] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastSendIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const refreshHistory = useCallback(async () => {
    const items = await listConversations(30)
    setHistory(items)
  }, [])

  const bootConversation = useCallback(async () => {
    const scope = {
      naics: context.naics,
      pursuit_slug: context.pursuitSlug || undefined,
      active_tab: context.activeTab,
    }
    const conv = await createConversation(scope, modelProvider)
    setConversation(conv)
    storeActiveConversationId(conv.id)
    setApiError(null)
    await refreshHistory()
    return conv
  }, [context.naics, context.pursuitSlug, context.activeTab, modelProvider, refreshHistory])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBooting(true)
    setApiError(null)
    void (async () => {
      try {
        await refreshHistory()
        const savedId = loadActiveConversationId()
        if (savedId) {
          const loaded = await loadConversation(savedId)
          if (!cancelled && loaded) {
            setConversation(loaded)
            if (loaded.model_provider && loaded.model_provider !== modelProvider) {
              onModelProviderChange(loaded.model_provider)
            }
            return
          }
        }
        if (!cancelled) await bootConversation()
      } catch (err) {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : 'Chat API unavailable')
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !conversationRefreshToken) return
    const savedId = loadActiveConversationId()
    if (!savedId) return
    void loadConversation(savedId).then((loaded) => {
      if (loaded) setConversation(loaded)
    })
  }, [conversationRefreshToken, open])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(160, Math.max(40, el.scrollHeight))}px`
  }, [input])

  useEffect(() => {
    if (prefillInput) {
      setInput(prefillInput)
      onPrefillConsumed?.()
    }
  }, [prefillInput, onPrefillConsumed])

  useEffect(() => {
    if (!sendRequest || sendRequest.id === lastSendIdRef.current) return
    lastSendIdRef.current = sendRequest.id
    void (async () => {
      await handleSend(sendRequest.text)
      onSendRequestConsumed?.()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendRequest])

  useEffect(() => {
    scrollToBottom()
  }, [conversation?.messages, sending, streamingText, scrollToBottom])

  useEffect(() => {
    if (!isResizing) return
    const onMove = (ev: MouseEvent) => {
      onWidthChange(Math.max(300, Math.min(820, window.innerWidth - ev.clientX)))
    }
    const onUp = () => setIsResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing, onWidthChange])

  async function ensureConversation(): Promise<Conversation | null> {
    if (conversation?.id) return conversation
    try {
      return await bootConversation()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start conversation'
      setApiError(msg)
      throw err
    }
  }

  async function runSkillInvoke(skillId: string, inquiry: string) {
    setSending(true)
    setApiError(null)
    try {
      const conv = await ensureConversation()
      const result = await invokeSkill({
        skill_id: skillId,
        inquiry,
        naics: context.naics,
        brain: context.brain,
        pipeline: context.pipeline,
        use_llm: modelProvider !== 'fast',
      })
      const lines = result.ok
        ? [`Ran **${skillId}**.`, result.summary || 'Complete.']
        : [`**${skillId}** failed: ${result.error || 'unknown error'}`]
      const actions: ChatSuggestedAction[] = []
      if (result.run_id) {
        actions.push({
          label: result.ok ? 'View process chain' : 'View failed run',
          action: 'view_skill_run',
          payload: { run_id: result.run_id, skill_id: skillId },
        })
      }
      if (result.path) {
        actions.push({
          label: 'Open in Studio',
          action: 'open_studio',
          payload: { path: result.path, slug: result.slug },
        })
      }
      const content = lines.join('\n')
      if (conv?.id) {
        const updated = await appendConversationMessage(conv.id, {
          role: 'assistant',
          content,
          source: result.ok ? 'skill-invoke' : 'skill-invoke-failed',
          run_id: result.run_id,
          skill_id: skillId,
          suggested_actions: actions,
        })
        if (updated) setConversation(updated)
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Skill invoke failed')
    } finally {
      setSending(false)
    }
  }

  function handleSuggestedAction(action: ChatSuggestedAction) {
    if (action.action === 'continue_skill_run' && action.payload?.run_id) {
      setContinueRunId(String(action.payload.run_id))
      const sid = String(action.payload.skill_id || 'skill')
      setInput(`Follow up on ${sid}: `)
      inputRef.current?.focus()
      return
    }
    if (action.action === 'invoke_skill' && action.payload?.skill_id) {
      const sid = String(action.payload.skill_id)
      const inquiry = String(action.payload.inquiry || `run ${sid}`)
      void runSkillInvoke(sid, inquiry)
      return
    }
    onSuggestedAction(action)
  }

  async function handleNewChat() {
    const conv = await bootConversation()
    setConversation(conv)
    setHistoryOpen(false)
    setInput('')
  }

  async function handleOpenChat(id: string) {
    const loaded = await loadConversation(id)
    if (loaded) {
      setConversation(loaded)
      storeActiveConversationId(loaded.id)
      if (loaded.model_provider) {
        onModelProviderChange(loaded.model_provider)
        storeProvider(loaded.model_provider)
      }
    }
    setHistoryOpen(false)
  }

  async function handleDeleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteConversation(id)
    await refreshHistory()
    if (conversation?.id === id) {
      await handleNewChat()
    }
  }

  async function changeProvider(p: ModelProvider) {
    onModelProviderChange(p)
    storeProvider(p)
    if (conversation?.id) {
      const updated = await patchConversation(conversation.id, { model_provider: p })
      if (updated) setConversation(updated)
    }
  }

  const buildSendContext = () => ({
    naics: context.naics,
    active_tab: context.activeTab,
    kpis: context.kpis ?? null,
    brain: context.brain ?? [],
    pipeline: context.pipeline ?? [],
    mcp_tools: context.mcpTools ?? [],
    model_provider: modelProvider,
    continue_run_id: continueRunId || undefined,
    vault_excerpt: includeVaultExcerpt ? (context.previewExcerpt || '') : undefined,
    include_vault_excerpt: includeVaultExcerpt && !!context.previewExcerpt,
  })

  function handleStop() {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    setStreamingText('')
  }

  function handleEditMessage(message: ConversationMessage) {
    if (!message.id || message.role !== 'user') return
    setEditingMessageId(message.id)
    setInput(message.content)
    inputRef.current?.focus()
  }

  async function handleSend(textOverride?: string, opts?: { regenerate?: boolean }) {
    const text = (textOverride ?? input).trim()
    if (!text && !opts?.regenerate) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setSending(true)
    setStreamingText('')
    setApiError(null)
    const editId = editingMessageId
    const runId = continueRunId
    if (!opts?.regenerate) {
      setInput('')
      setEditingMessageId(null)
      setContinueRunId(null)
    }

    const useStream = modelProvider !== 'fast'
    let conv: Conversation | null = null
    try {
      conv = await ensureConversation()
      if (!conv?.id) {
        throw new Error('Conversation not ready — try again after the backend restarts.')
      }

      if (useStream && !opts?.regenerate) {
        const optimistic = await loadConversation(conv.id)
        if (optimistic) {
          const pendingUser: ConversationMessage = {
            id: `pending-${Date.now()}`,
            role: 'user',
            content: text,
          }
          const baseMsgs = editId
            ? (optimistic.messages || []).slice(
                0,
                (optimistic.messages || []).findIndex((m) => m.id === editId),
              )
            : optimistic.messages || []
          setConversation({ ...optimistic, messages: [...baseMsgs, pendingUser] })
        }
      }

      const data = await sendConversationMessage(
        conv.id,
        text,
        buildSendContext(),
        {
          regenerate: opts?.regenerate,
          editMessageId: editId || undefined,
          continueRunId: runId || undefined,
          stream: useStream,
          signal: controller.signal,
          onToken: (_chunk, full) => setStreamingText(full),
        },
      )
      if (data.conversation) {
        setConversation(data.conversation as Conversation)
        storeActiveConversationId((data.conversation as Conversation).id)
      } else {
        const reloaded = await loadConversation(conv.id)
        if (reloaded) {
          setConversation(reloaded)
          storeActiveConversationId(reloaded.id)
        }
      }
      await refreshHistory()
    } catch (err) {
      if (controller.signal.aborted) return
      const msg = err instanceof Error ? err.message : 'Send failed'
      setApiError(msg)
      if (conv?.id) {
        const updated = await appendConversationMessage(conv.id, {
          role: 'assistant',
          content: `**Co-pilot error:** ${msg}`,
          source: 'error',
        })
        if (updated) setConversation(updated)
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setSending(false)
      setStreamingText('')
    }
  }

  async function handleRegenerate() {
    if (!conversation?.id || sending) return
    setSending(true)
    setApiError(null)
    try {
      const data = await sendConversationMessage(
        conversation.id,
        '',
        buildSendContext(),
        {
          regenerate: true,
          stream: modelProvider !== 'fast',
          onToken: (_chunk, full) => setStreamingText(full),
        },
      )
      if (data.conversation) setConversation(data.conversation as Conversation)
      await refreshHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Regenerate failed'
      setApiError(msg)
    } finally {
      setSending(false)
    }
  }

  const messages = conversation?.messages ?? []
  const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === 'assistant')
  const lastAssistantGlobalIdx =
    lastAssistantIdx >= 0 ? messages.length - 1 - lastAssistantIdx : -1

  if (!open) return null

  return (
    <div
      className="chat-pane assistant-rail fixed top-14 bottom-0 right-0 z-[60] flex flex-col overflow-hidden rounded-l-3xl"
      style={{ width }}
    >
      <div
        className={`resize-handle ${isResizing ? 'active' : ''}`}
        onMouseDown={(e) => {
          setIsResizing(true)
          e.preventDefault()
        }}
        title="Drag to resize"
      />

      <div className="chat-header">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-neon-cyan shrink-0" />
          <div className="chat-header-title truncate">{conversation?.title || 'AI Co-pilot'}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" className="chat-icon-btn" title="New chat" onClick={() => void handleNewChat()}>
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button
              type="button"
              className="chat-icon-btn flex items-center gap-0.5"
              title="Conversation history"
              onClick={() => {
                void refreshHistory()
                setHistoryOpen((v) => !v)
              }}
            >
              <History className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {historyOpen && (
              <div className="assistant-history-menu">
                {history.length === 0 && (
                  <div className="assistant-history-empty">No saved conversations yet</div>
                )}
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`assistant-history-item ${conversation?.id === h.id ? 'is-active' : ''}`}
                    onClick={() => void handleOpenChat(h.id)}
                  >
                    <span className="assistant-history-title">{h.title}</span>
                    <span className="assistant-history-meta">
                      {h.message_count} msgs · {providerLabel(h.model_provider) || h.model_provider}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="assistant-history-delete"
                      onClick={(e) => void handleDeleteChat(h.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleDeleteChat(h.id, e as unknown as React.MouseEvent)
                      }}
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="assistant-provider-picker">
            {(['fast', 'ollama', 'xai'] as ModelProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`assistant-provider-btn ${modelProvider === p ? 'is-active' : ''}`}
                onClick={() => void changeProvider(p)}
                title={p === 'xai' ? 'Cloud frontier model (configure API key in Settings)' : p === 'ollama' ? 'Local Ollama' : 'Fast deterministic'}
              >
                {providerLabel(p)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onWidthChange(width > 600 ? 380 : 680)}
            className="chat-icon-btn"
            title="Toggle larger size"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onClose} className="chat-icon-btn">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {apiError && (
        <div className="assistant-api-error" role="alert">
          {apiError}
        </div>
      )}

      <div className="assistant-context-chips">
        <span className="context-chip">NAICS {context.naics}</span>
        <span className="context-chip">{context.activeTab}</span>
        <span className="context-chip">pipe {context.pipelineCount}</span>
        <span className="context-chip">brain {context.brainCount}</span>
        {context.pursuitSlug && <span className="context-chip accent">pursuit {context.pursuitSlug}</span>}
        {context.previewPath && (
          <span className="context-chip accent" title={context.previewPath}>
            preview open
          </span>
        )}
        {context.previewPath && context.previewExcerpt && (
          <label className="context-chip context-chip-toggle">
            <input
              type="checkbox"
              checked={includeVaultExcerpt}
              onChange={(e) => setIncludeVaultExcerpt(e.target.checked)}
            />
            include excerpt
          </label>
        )}
        {continueRunId && (
          <span className="context-chip accent" title={continueRunId}>
            continuing run
          </span>
        )}
      </div>

      <div className="chat-messages space-y-2">
        {messages.length === 0 && (
          <div className="chat-msg assistant chat-msg-md">
            <div
              className="chat-md-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(WELCOME) }}
            />
          </div>
        )}
        {messages.map((m, idx) => (
          <MessageBubble
            key={m.id || idx}
            message={m}
            isLastAssistant={idx === lastAssistantGlobalIdx && !streamingText}
            onSuggestedAction={handleSuggestedAction}
            onOpenArtifact={onOpenArtifact}
            onViewSkillRun={onViewSkillRun}
            onRegenerate={idx === lastAssistantGlobalIdx && !streamingText ? () => void handleRegenerate() : undefined}
            onEdit={m.role === 'user' ? () => handleEditMessage(m) : undefined}
            sending={sending}
          />
        ))}
        {sending && streamingText && (
          <div className="chat-msg assistant chat-msg-md">
            <div
              className="chat-md-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(streamingText) }}
            />
            <div className="chat-msg-meta">streaming…</div>
          </div>
        )}
        {sending && !streamingText && (
          <div className="chat-msg assistant flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-neon-cyan" />
            <span className="text-text-500 text-[11px]">Thinking…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row chat-input-row--stacked">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder="Ask the co-pilot — search SAM, run skills, explore overlaps… (Shift+Enter for new line)"
          className="input-field chat-textarea"
          rows={1}
          disabled={sending || booting}
        />
        {editingMessageId && (
          <div className="assistant-edit-hint">Editing message — send to resend from here</div>
        )}
        {sending ? (
          <button
            type="button"
            onClick={handleStop}
            className="chat-send-btn chat-stop-btn"
            title="Stop generation"
          >
            <Square className="w-3 h-3 inline" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            className={`chat-send-btn ${input.trim() && !booting ? 'is-ready' : ''}`}
            disabled={booting}
            title={booting ? 'Starting session…' : input.trim() ? 'Send message' : 'Type a message to send'}
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  message: m,
  isLastAssistant,
  onSuggestedAction,
  onOpenArtifact,
  onViewSkillRun,
  onRegenerate,
  onEdit,
  sending,
}: {
  message: ConversationMessage
  isLastAssistant: boolean
  onSuggestedAction: (action: ChatSuggestedAction) => void
  onOpenArtifact?: (path: string) => void
  onViewSkillRun?: (runId: string, skillId?: string) => void
  onRegenerate?: () => void
  onEdit?: () => void
  sending: boolean
}) {
  const isUser = m.role === 'user'
  const isSkillInvoke = m.source === 'skill-invoke' || !!m.run_id

  return (
    <div className={isUser ? 'text-right' : ''}>
      <div className={`chat-msg ${isUser ? 'user' : 'assistant'} ${!isUser ? 'chat-msg-md' : ''}`}>
        {isUser ? (
          <>
            {m.content}
            {onEdit && (
              <button
                type="button"
                className="chat-edit-btn"
                onClick={onEdit}
                disabled={sending}
                title="Edit and resend"
              >
                <Pencil className="w-2.5 h-2.5 inline" /> Edit
              </button>
            )}
          </>
        ) : (
          <div
            className="chat-md-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(m.content) }}
          />
        )}
        {!isUser && (m.source || m.model) && (
          <div className="chat-msg-meta">
            {m.source}
            {m.model ? ` · ${m.model}` : ''}
            {isLastAssistant && onRegenerate && (
              <button
                type="button"
                className="chat-regenerate-btn"
                onClick={onRegenerate}
                disabled={sending}
                title="Regenerate last response"
              >
                <RefreshCw className="w-2.5 h-2.5 inline" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {!isUser && m.run_id && (
        <ChatRunCard
          runId={m.run_id}
          skillId={m.skill_id}
          onOpenArtifact={onOpenArtifact}
          onViewFull={onViewSkillRun}
        />
      )}

      {!isUser && m.suggested_actions && m.suggested_actions.length > 0 && (
        <div className="text-right mt-1">
          {m.suggested_actions.map((a, aIdx) => (
            <span key={aIdx} className="chat-suggest" onClick={() => onSuggestedAction(a)}>
              {a.label}
            </span>
          ))}
        </div>
      )}

      {!isUser && isSkillInvoke && !m.run_id && m.skill_id && (
        <div className="text-[10px] text-text-500 mt-1">Skill: {m.skill_id}</div>
      )}
    </div>
  )
}