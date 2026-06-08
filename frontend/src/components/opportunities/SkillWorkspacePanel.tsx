import { BookOpen, FolderOpen, Sparkles, X } from 'lucide-react'
import { getGlossaryTip } from '../../constants/captureGlossary'
import { COMBO_TIER_META } from '../../utils/comboIntel'
import type { OpportunityRow } from '../../utils/opportunitiesIntel'
import { Button } from '../ui/Button'
import { FieldTip } from '../ui/FieldTip'

export interface WorkspaceSkill {
  id: string
  name: string
  status: string
  use_when: string
  supports_llm?: boolean
}

export interface WorkspaceArtifact {
  id: string
  label: string
  path: string
  exists: boolean
  bytes?: number
}

export interface SkillWorkspaceState {
  row: OpportunityRow
  slug: string
  briefPath: string
  briefExists: boolean
  skills: WorkspaceSkill[]
  artifacts?: WorkspaceArtifact[]
  lastIntel?: {
    sam?: string
    sam_hits?: number
    usaspending_rels?: number
    used_llm?: boolean
  }
}

interface SkillWorkspacePanelProps {
  workspace: SkillWorkspaceState
  loading?: boolean
  useLlm: boolean
  onUseLlmChange: (v: boolean) => void
  onClose: () => void
  onScaffoldBrief: () => void
  onRunSkill: (skillId: string) => void
  onOpenVault: () => void
  onOpenArtifact: (path: string, label: string) => void
  onTrack: () => void
}

export function SkillWorkspacePanel({
  workspace,
  loading,
  useLlm,
  onUseLlmChange,
  onClose,
  onScaffoldBrief,
  onRunSkill,
  onOpenVault,
  onOpenArtifact,
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
            <div className="text-sm font-semibold text-text-primary truncate flex items-center gap-1">
              Pursuit workspace
              <FieldTip termId="pursuit_workspace" label="workspace" showLearnLink={false} />
            </div>
            <div className="text-[10px] text-text-500 font-mono truncate">{workspace.slug}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="chat-icon-btn" aria-label="Close workspace">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="skill-workspace-body overflow-auto flex-1 p-4 space-y-4">
        <div className="insight magenta">
          Run skills to save drafts under <span className="font-mono">pursuits/{workspace.slug}/</span>. Open links go to <strong className="text-text-primary">Artifacts</strong> — not the curated Knowledge Vault.
        </div>

        {workspace.lastIntel && (
          <div className="text-[10px] text-text-500 surface p-2 rounded-lg">
            Last run: SAM via <span className="text-neon-cyan">{workspace.lastIntel.sam || '—'}</span>
            {workspace.lastIntel.sam_hits != null && ` · ${workspace.lastIntel.sam_hits} notice(s)`}
            {workspace.lastIntel.usaspending_rels != null && ` · ${workspace.lastIntel.usaspending_rels} USASpending rel(s)`}
            {workspace.lastIntel.used_llm && <span className="text-neon-lime"> · LLM narrative added</span>}
          </div>
        )}

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
          <Button variant="soft" onClick={onOpenVault} disabled={!workspace.briefExists} title="Opens capture brief in Artifacts reader">
            <BookOpen className="w-3.5 h-3.5" /> Open brief
          </Button>
          <Button variant="soft" onClick={onScaffoldBrief} disabled={loading}>
            <FolderOpen className="w-3.5 h-3.5" />
            {workspace.briefExists ? 'Refresh brief' : 'Create brief'}
          </Button>
        </div>

        {(workspace.artifacts?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-500 font-semibold mb-2 flex items-center gap-1">
              Vault artifacts
              <FieldTip termId="vault_artifacts" showLearnLink={false} />
            </div>
            <div className="space-y-1">
              {workspace.artifacts!.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={a.exists ? 'text-text-primary' : 'text-text-500'}>
                    {a.label}
                    {a.exists ? <span className="text-neon-lime ml-1">✓</span> : <span className="text-text-500 ml-1">—</span>}
                  </span>
                  {a.exists && (
                    <button
                      type="button"
                      className="text-[10px] text-neon-cyan hover:underline shrink-0"
                      onClick={() => onOpenArtifact(a.path, a.label)}
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-[10px] text-text-400 cursor-pointer">
          <input
            type="checkbox"
            checked={useLlm}
            onChange={(e) => onUseLlmChange(e.target.checked)}
            className="accent-neon-magenta"
          />
          <span className="inline-flex items-center gap-1">
            Add LLM narrative on Capture Brief or Battlecard (Ollama — skips if offline)
            <FieldTip termId="capture_brief_enrich" showLearnLink={false} />
          </span>
        </label>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-500 font-semibold mb-2">Skills</div>
          <div className="space-y-2">
            {workspace.skills.map((skill) => (
              <div key={skill.id} className="tool-card">
                <div className="tool-card-name">{skill.name}</div>
                <div className="tool-card-desc mt-1">{skill.use_when}</div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`pill text-[9px] ${skill.status === 'active' ? 'text-neon-lime' : 'text-neon-amber'}`}>
                    {skill.status}
                  </span>
                  <button
                    type="button"
                    className="action-btn pipeline text-xs"
                    disabled={loading}
                    onClick={() => onRunSkill(skill.id)}
                  >
                    Run{useLlm && skill.supports_llm ? ' + LLM' : ''}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-text-500">
          Folder: <span className="font-mono text-text-400">pursuits/{workspace.slug}/</span>
        </div>
      </div>
    </div>
  )
}