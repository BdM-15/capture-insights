import { BookOpen, Copy, FileStack, RefreshCw, X } from 'lucide-react'

export interface PreviewDocument {
  name: string
  path: string
  content: string
  excerpt?: string
}

interface DocumentPreviewPanelProps {
  doc: PreviewDocument
  /** When pursuit workspace is open, shift left so both panels are visible */
  stackWithWorkspace?: boolean
  onClose: () => void
  onReload: () => void
}

export function DocumentPreviewPanel({
  doc,
  stackWithWorkspace = false,
  onClose,
  onReload,
}: DocumentPreviewPanelProps) {
  const isArtifact = (doc.path || '').replace(/\\/g, '/').startsWith('pursuits/')
  const accent = isArtifact ? 'artifacts' : 'vault'
  const Icon = isArtifact ? FileStack : BookOpen
  const label = isArtifact ? 'Artifact preview' : 'Vault preview'

  const rightOffset = stackWithWorkspace ? 'min(420px, 100vw)' : '0px'
  const width = stackWithWorkspace
    ? 'min(560px, calc(100vw - min(420px, 100vw)))'
    : 'min(560px, 100vw)'

  return (
    <div
      className={`document-preview-pane document-preview-pane--${accent} fixed top-14 bottom-0 z-[63] flex flex-col overflow-hidden rounded-l-3xl`}
      style={{ right: rightOffset, width }}
    >
      <div className="document-preview-header">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${isArtifact ? 'text-neon-magenta' : 'text-accent-purple'}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{doc.name || label}</div>
            <div className="text-[10px] text-text-500 font-mono truncate">{doc.path}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="chat-icon-btn" aria-label="Close preview">
          <X className="w-3.5 h-3.5" />
        </button>
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