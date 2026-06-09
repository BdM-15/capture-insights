import { useEffect, useRef, useState } from 'react'
import { BookOpen, Copy, FileStack, Maximize2, RefreshCw, X } from 'lucide-react'

export interface PreviewDocument {
  name: string
  path: string
  content: string
  excerpt?: string
}

const WORKSPACE_WIDTH = 420
const SKILL_INVOKE_WIDTH = 480
const CHAT_WIDTH_DEFAULT = 380
const DEFAULT_WIDTH = 560
const MIN_WIDTH = 360
export const PREVIEW_PANEL_STORAGE_KEY = 'ci_preview_panel_width'
export const PREVIEW_PANEL_DEFAULT_WIDTH = DEFAULT_WIDTH

export function readStoredPreviewWidth(): number {
  try {
    const n = Number(localStorage.getItem(PREVIEW_PANEL_STORAGE_KEY))
    if (n >= MIN_WIDTH && n <= 1400) return n
  } catch {}
  return DEFAULT_WIDTH
}

const STORAGE_KEY = PREVIEW_PANEL_STORAGE_KEY

function readStoredWidth(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    if (n >= MIN_WIDTH && n <= 1400) return n
  } catch {}
  return DEFAULT_WIDTH
}

interface DocumentPreviewPanelProps {
  doc: PreviewDocument
  /** Shift left when right-side drawers are open so preview stays visible */
  stackWithWorkspace?: boolean
  stackWithSkillInvoke?: boolean
  stackWithChat?: boolean
  chatWidth?: number
  onClose: () => void
  onReload: () => void
}

export function DocumentPreviewPanel({
  doc,
  stackWithWorkspace = false,
  stackWithSkillInvoke = false,
  stackWithChat = false,
  chatWidth = CHAT_WIDTH_DEFAULT,
  onClose,
  onReload,
}: DocumentPreviewPanelProps) {
  const [width, setWidth] = useState(readStoredWidth)
  const [isResizing, setIsResizing] = useState(false)
  const widthRef = useRef(width)
  widthRef.current = width

  const isArtifact = (doc.path || '').replace(/\\/g, '/').startsWith('pursuits/')
  const accent = isArtifact ? 'artifacts' : 'vault'
  const Icon = isArtifact ? FileStack : BookOpen
  const label = isArtifact ? 'Studio preview' : 'Vault preview'

  const rightOffset =
    (stackWithChat ? chatWidth : 0) +
    (stackWithWorkspace ? WORKSPACE_WIDTH : 0) +
    (stackWithSkillInvoke ? SKILL_INVOKE_WIDTH : 0)
  const maxWidth = Math.max(
    MIN_WIDTH,
    Math.min(1100, window.innerWidth - rightOffset - 96),
  )

  useEffect(() => {
    if (!isResizing) return
    const onMove = (ev: MouseEvent) => {
      const next = window.innerWidth - rightOffset - ev.clientX
      setWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, next)))
    }
    const onUp = () => {
      setIsResizing(false)
      try {
        localStorage.setItem(STORAGE_KEY, String(widthRef.current))
      } catch {}
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing, maxWidth, rightOffset])

  useEffect(() => {
    setWidth((w) => Math.max(MIN_WIDTH, Math.min(maxWidth, w)))
  }, [maxWidth])

  function startResize(e: React.MouseEvent) {
    setIsResizing(true)
    e.preventDefault()
  }

  function toggleWide() {
    setWidth((w) => (w >= maxWidth * 0.85 ? DEFAULT_WIDTH : Math.min(maxWidth, 820)))
  }

  return (
    <div
      className={`document-preview-pane document-preview-pane--${accent} fixed top-14 bottom-0 z-[63] flex flex-col overflow-hidden rounded-l-3xl`}
      style={{ right: rightOffset, width }}
    >
      <div
        className={`resize-handle ${isResizing ? 'active' : ''}`}
        onMouseDown={startResize}
        title="Drag to resize preview width"
        aria-label="Resize preview panel"
      />

      <div className="document-preview-header">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${isArtifact ? 'text-neon-magenta' : 'text-accent-purple'}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{doc.name || label}</div>
            <div className="text-[10px] text-text-500 font-mono truncate">{doc.path}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleWide}
            className="chat-icon-btn"
            title="Toggle wider reading width"
            aria-label="Toggle preview width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onClose} className="chat-icon-btn" aria-label="Close preview">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="document-preview-body flex-1 overflow-auto p-4">
        <div className="document-preview-content whitespace-pre-wrap text-[11px] leading-relaxed text-text-300">
          {doc.content || doc.excerpt || '(empty)'}
        </div>
      </div>

      <div className="document-preview-footer flex flex-wrap gap-2 p-3 border-t border-edge">
        <button
          type="button"
          className="action-btn vault text-[10px]"
          onClick={() => {
            try { navigator.clipboard.writeText(doc.content || doc.excerpt || '') } catch {}
          }}
        >
          <Copy className="w-3 h-3" /> Copy text
        </button>
        <button type="button" className="action-btn vault text-[10px]" onClick={onReload}>
          <RefreshCw className="w-3 h-3" /> Reload full file
        </button>
        <button
          type="button"
          className="action-btn vault text-[10px]"
          onClick={() => { try { navigator.clipboard.writeText(doc.path || '') } catch {} }}
        >
          <Copy className="w-3 h-3" /> Copy path
        </button>
        <button
          type="button"
          className="action-btn vault text-[10px]"
          onClick={() => {
            const help = `cd C:\\Users\\benma\\capture-insights\n# Obsidian: open data/knowledge → ${doc.path}`
            try { navigator.clipboard.writeText(help) } catch {}
          }}
        >
          Obsidian jump
        </button>
      </div>
    </div>
  )
}