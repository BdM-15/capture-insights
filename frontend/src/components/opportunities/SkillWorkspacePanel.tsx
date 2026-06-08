import { BookOpen, FolderOpen, Sparkles, X } from 'lucide-react'
import { getGlossaryTip } from '../../constants/captureGlossary'
import { COMBO_TIER_META } from '../../utils/comboIntel'
import type { OpportunityRow } from '../../utils/opportunitiesIntel'
import { Button } from '../ui/Button'

export interface WorkspaceSkill {
  id: string
  name: string
  status: string
  use_when: string
}

export interface SkillWorkspaceState {
  row: OpportunityRow
  slug: string
  briefPath: string
  briefExists: boolean
  skills: WorkspaceSkill[]
}

interface SkillWorkspacePanelProps {
  workspace: SkillWorkspaceState
  loading?: boolean
  onClose: () => void
  onScaffoldBrief: () => void
  onRunSkill: (skillId: string) => void
  onOpenVault: () => void
  onTrack: () => void
}

export function SkillWorkspacePanel({
  workspace,
  loading,
  onClose,
  onScaffoldBrief,
  onRunSkill,
  onOpenVault,
  onTrack,
}: SkillWorkspacePanelProps) {
  const row = workspace.row
  const tierMeta = COMBO_TIER_META[row.combo_tier]
  const millions = row.obligation_millions ?? (row.obligation || 0) / 1e6

  return (
    <div className="skill-workspace-pane fixed top-14 bottom-0 right-0 z-[62] flex flex-col overflow-hidden rounded-l-3xl w-[min(420px,100vw)]">
      <div className="skill-workspace-header">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-neon-magenta shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">Pursuit workspace</div>
            <div className="text-[10px] text-text-500 font-mono truncate">{workspace.slug}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="chat-icon-btn" aria-label="Close workspace">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="skill-workspace-body overflow-auto flex-1 p-4 space-y-4">
        <div className="insight magenta">
          One place to scaffold vault artifacts and run capture skills for this contract — without leaving the recompete list.
        </div>

        <div className="surface p-3 rounded-xl space-y-2 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-text-500 font-semibold">Contract snapshot</div>
          <div><span className="text-text-500">Incumbent · </span>{row.recipient || '—'}</div>
          <div><span className="text-text-500">Customer agency · </span>{row.agency || '—'}</div>
          <div><span className="text-text-500">Contract ends · </span>{row.end_date || '—'} ({row.months_to_end ?? '?'} mo)</div>
          <div><span className="text-text-500">Obligated value · </span>${millions.toFixed(1)}M</div>
          <div>
            <span className="text-text-500">Priority · </span>
            <span className={tierMeta?.tone}>{row.tier_label || tierMeta?.label}</span>
            {' '}(score {row.display_score ?? row.combo_score ?? 0})
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="pipeline"
            onClick={onTrack}
            disabled={loading}
            title={getGlossaryTip('track_pipeline')}
          >
            + Track
          </Button>
          <Button variant="soft" onClick={onOpenVault} disabled={!workspace.briefExists}>
            <BookOpen className="w-3.5 h-3.5" /> Open brief
          </Button>
          <Button variant="soft" onClick={onScaffoldBrief} disabled={loading}>
            <FolderOpen className="w-3.5 h-3.5" />
            {workspace.briefExists ? 'Refresh brief' : 'Create brief'}
          </Button>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-500 font-semibold mb-2">Skills</div>
          <div className="space-y-2">
            {workspace.skills.map((skill) => (
              <div key={skill.id} className="tool-card">
                <div className="tool-card-name">{skill.name}</div>
                <div className="tool-card-desc mt-1">{skill.use_when}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="pill text-[9px] text-neon-amber">{skill.status}</span>
                  <button
                    type="button"
                    className="action-btn pipeline text-xs"
                    disabled={loading}
                    onClick={() => onRunSkill(skill.id)}
                  >
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-text-500">
          Vault path: <span className="font-mono text-text-400">{workspace.briefPath}</span>
          {workspace.briefExists ? ' · brief on disk' : ' · brief not created yet'}
        </div>
      </div>
    </div>
  )
}