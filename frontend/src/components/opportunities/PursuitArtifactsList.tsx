import { Eye, Trash2 } from 'lucide-react'
import { EntryRow } from '../lists/EntryRow'

export interface PursuitArtifact {
  id: string
  label: string
  path: string
  exists: boolean
  bytes?: number
}

export interface PursuitFolder {
  slug: string
  vault_root: string
  brief_path: string
  brief_exists: boolean
  artifacts: PursuitArtifact[]
}

interface PursuitArtifactsListProps {
  pursuits: PursuitFolder[]
  onOpen: (path: string, title: string) => void
  onDelete?: (slug: string) => void
  emptyMessage?: string
}

export function PursuitArtifactsList({
  pursuits,
  onOpen,
  onDelete,
  emptyMessage = 'No pursuit artifacts yet — run skills from Future Opportunities → Workspace on a recompete row.',
}: PursuitArtifactsListProps) {
  if (!pursuits.length) {
    return <div className="text-xs text-text-500">{emptyMessage}</div>
  }

  return (
    <div className="space-y-3">
      {pursuits.map((p) => {
        const existing = p.artifacts.filter((a) => a.exists)
        return (
          <div key={p.slug} className="surface p-3 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-text-primary truncate">{p.slug}</div>
                <div className="text-[10px] text-text-500 font-mono truncate">{p.vault_root}/</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.brief_exists && (
                  <button
                    type="button"
                    className="action-btn vault text-[10px]"
                    onClick={() => onOpen(p.brief_path, `Brief — ${p.slug}`)}
                  >
                    <Eye size={11} /> Open brief
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="action-btn destructive text-[10px]"
                    title="Delete this pursuit folder (does not touch global wiki)"
                    onClick={() => onDelete(p.slug)}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              {existing.map((a) => (
                <EntryRow
                  key={a.id}
                  title={a.label}
                  type={a.id}
                  path={a.path}
                  onClick={() => onOpen(a.path, a.label)}
                  actions={
                    <button
                      type="button"
                      className="action-btn vault text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(a.path, a.label)
                      }}
                    >
                      <Eye size={11} /> Open
                    </button>
                  }
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}