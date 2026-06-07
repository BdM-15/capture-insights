import { MessageSquare, RefreshCw, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { StatusPill } from '../ui/StatusPill'

export type HealthState = 'live' | 'degraded' | 'down' | 'checking'

interface TopbarProps {
  naics: string
  onNaicsChange: (value: string) => void
  onNaicsKeyDown: (e: React.KeyboardEvent) => void
  onRefresh: () => void
  loading: boolean
  showChat: boolean
  onToggleChat: () => void
  health: HealthState
  pipelineCount: number
  brainCount: number
}

const healthTone: Record<HealthState, 'live' | 'processing' | 'failed' | 'pending'> = {
  live: 'live',
  degraded: 'processing',
  down: 'failed',
  checking: 'pending',
}

const healthLabel: Record<HealthState, string> = {
  live: 'API live',
  degraded: 'API degraded',
  down: 'API down',
  checking: 'Checking…',
}

export function Topbar({
  naics,
  onNaicsChange,
  onNaicsKeyDown,
  onRefresh,
  loading,
  showChat,
  onToggleChat,
  health,
  pipelineCount,
  brainCount,
}: TopbarProps) {
  return (
    <header className="topbar-vibrant h-14 border-b border-edge fixed w-full z-50">
      <div className="w-full px-6 h-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="brand-tile w-9 h-9 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center">
            <span className="text-ink-950 text-xl font-bold">CI</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-xl font-bold tracking-tighter text-neon-cyan">CAPTURE</span>
            <span className="text-xl font-bold tracking-tighter text-text-primary/70">INSIGHTS</span>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-2">
          <div className="relative">
            <input
              type="text"
              value={naics}
              onChange={(e) => onNaicsChange(e.target.value)}
              onKeyDown={onNaicsKeyDown}
              className="w-full bg-ink-card border border-edge focus:border-neon-cyan/60 text-sm placeholder-text-500 pl-9 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-neon-cyan/30 font-mono"
              placeholder="NAICS (comma-separated OK)"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-500" />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusPill tone={healthTone[health]} className="hidden md:inline-flex">
            {healthLabel[health]}
          </StatusPill>
          {pipelineCount > 0 && (
            <StatusPill tone="neutral" className="hidden lg:inline-flex">
              pipe {pipelineCount}
            </StatusPill>
          )}
          {brainCount > 0 && (
            <StatusPill tone="neutral" className="hidden lg:inline-flex">
              brain {brainCount}
            </StatusPill>
          )}
          <Button variant="primary" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="ghost" onClick={onToggleChat}>
            <MessageSquare className="w-3.5 h-3.5" />
            {showChat ? 'Hide' : 'Show'} Chat
          </Button>
        </div>
      </div>
    </header>
  )
}