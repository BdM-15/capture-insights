import { Copy } from 'lucide-react'
import { Button } from '../ui/Button'
import { AskCoPilotButton } from '../ui/AskCoPilotButton'

interface BrainEntryCardProps {
  name: string
  type: string
  citation?: string
  display: string
  wikiPath?: string | null
  hasWiki: boolean
  overlayValue?: string
  onRemove: () => void
  onOverlayBlur: (value: string) => void
  onAsk: (prompt: string) => void
}

export function BrainEntryCard({
  name,
  type,
  citation,
  display,
  wikiPath,
  hasWiki,
  overlayValue,
  onRemove,
  onOverlayBlur,
  onAsk,
}: BrainEntryCardProps) {
  return (
    <div className="entry">
      <div className="entry-head">
        <div>
          <span className="entry-title">{name}</span>
          <span className="entry-type">{type}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AskCoPilotButton
            prompt={`Use my vault context for "${name}" (${type}). What capture angles, risks, and next actions should I take?`}
            label="Use in chat"
            onAsk={onAsk}
          />
          <button
            type="button"
            onClick={onRemove}
            className="text-neon-red/80 text-xs hover:underline"
            title="Remove from accumulator (native .md on disk stays)"
          >
            remove
          </button>
        </div>
      </div>

      {hasWiki ? (
        <div className="entry-body">
          <div className="text-neon-cyan text-[10px] mb-0.5 uppercase tracking-wide">
            Synthesized from USASpending + citations
          </div>
          <div className="whitespace-pre-wrap text-text-300">{display}</div>
          {wikiPath && (
            <div className="mt-1.5 flex items-center gap-2 text-[9px] text-text-500 font-mono">
              {wikiPath}
              <Button
                variant="vault"
                size="xs"
                onClick={() => { try { navigator.clipboard.writeText(display) } catch {} }}
                title="Copy full synthesized note"
              >
                <Copy size={12} /> Copy full
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="entry-body text-text-400">{display}</div>
      )}

      {citation && <div className="entry-meta">{citation}</div>}

      <div className="mt-2">
        <div className="text-[9px] text-text-500 mb-0.5">Your overlay (appends to native .md on save)</div>
        <input
          defaultValue={overlayValue}
          onBlur={(e) => onOverlayBlur(e.target.value)}
          className="input-field w-full text-xs"
          placeholder="Shipley angle, negotiation lever, new intel, ontology idea…"
        />
      </div>
    </div>
  )
}