import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Briefcase, BookOpen, Wrench, Layers, Settings, FileStack,
  Clock, Users, Target, Truck, MapPin, TrendingUp,
} from 'lucide-react'

export type SidebarId = 'dashboard' | 'pipeline' | 'artifacts' | 'vault' | 'tools' | 'skills' | 'settings'
export type AccentColor = 'cyan' | 'magenta' | 'purple' | 'lime' | 'amber'

export interface ViewContext {
  naics: string
  dashTab?: string
  obligationsM?: number
  pipelineCount: number
  brainCount: number
  expiringCount: number
  artifactCount?: number
}

export interface NavItem {
  id: SidebarId
  label: string
  icon: LucideIcon
  accent: AccentColor
}

export interface NavGroup {
  label: string
  accent: AccentColor
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Intelligence',
    accent: 'cyan',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3, accent: 'cyan' },
    ],
  },
  {
    label: 'Workflow',
    accent: 'magenta',
    items: [
      { id: 'pipeline', label: 'Pipeline', icon: Briefcase, accent: 'magenta' },
      { id: 'artifacts', label: 'Studio', icon: FileStack, accent: 'magenta' },
      { id: 'vault', label: 'Knowledge Vault', icon: BookOpen, accent: 'purple' },
    ],
  },
  {
    label: 'Tools',
    accent: 'magenta',
    items: [
      { id: 'tools', label: 'MCP Tools', icon: Wrench, accent: 'magenta' },
      { id: 'skills', label: 'Agent Skills', icon: Layers, accent: 'magenta' },
    ],
  },
  {
    label: 'System',
    accent: 'lime',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings, accent: 'lime' },
    ],
  },
]

export const SIDEBAR_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export const DASHBOARD_TABS = [
  { id: 'market', label: 'Market Overview', icon: BarChart3 },
  { id: 'opportunities', label: 'Future Opportunities', icon: Clock },
  { id: 'agency', label: 'Agency Intelligence', icon: Users },
  { id: 'competitive', label: 'Competitive Analysis', icon: Target },
  { id: 'vehicles', label: 'Contract Vehicle Analysis', icon: Truck },
  { id: 'geo', label: 'Geographic Analysis', icon: MapPin },
  { id: 'combo', label: 'Combo Insights', icon: TrendingUp },
] as const

export type DashTabId = (typeof DASHBOARD_TABS)[number]['id']

export interface ViewMetaEntry {
  title: string
  subtitle: string | ((ctx: ViewContext) => string)
  icon: LucideIcon
  accent: AccentColor
}

export const VIEW_META: Record<SidebarId, ViewMetaEntry> = {
  dashboard: {
    title: 'Market Intelligence',
    subtitle: (ctx) => {
      const tab = DASHBOARD_TABS.find((t) => t.id === ctx.dashTab)
      const tabLabel = tab?.label ?? 'Overview'
      const obl = ctx.obligationsM ? ` · ${ctx.obligationsM}M obligations` : ''
      return `NAICS ${ctx.naics} · ${tabLabel}${obl}`
    },
    icon: BarChart3,
    accent: 'cyan',
  },
  pipeline: {
    title: 'Pipeline',
    subtitle: (ctx) =>
      `${ctx.pipelineCount} pursuit${ctx.pipelineCount === 1 ? '' : 's'} tracked · opportunities you chose to bid or watch`,
    icon: Briefcase,
    accent: 'magenta',
  },
  artifacts: {
    title: 'Studio',
    subtitle: (ctx) =>
      `${ctx.artifactCount ?? 0} pursuit folder${(ctx.artifactCount ?? 0) === 1 ? '' : 's'} · skill outputs and previews under pursuits/`,
    icon: FileStack,
    accent: 'magenta',
  },
  vault: {
    title: 'Knowledge Vault',
    subtitle: (ctx) =>
      `${ctx.brainCount} brain entr${ctx.brainCount === 1 ? 'y' : 'ies'} · curated global wiki, competitors, agencies — source of truth`,
    icon: BookOpen,
    accent: 'purple',
  },
  tools: {
    title: 'MCP Tools',
    subtitle: 'Federal contracting MCP catalog — SAM.gov, FPDS, and agent-driven lookups',
    icon: Wrench,
    accent: 'magenta',
  },
  skills: {
    title: 'Agent Skills',
    subtitle: '1102 + capture skill catalog · pairs with MCP Tools for live agent actions',
    icon: Layers,
    accent: 'magenta',
  },
  settings: {
    title: 'Settings',
    subtitle: 'NAICS defaults, theme, API keys, and workspace preferences',
    icon: Settings,
    accent: 'lime',
  },
}

export function resolveSubtitle(
  meta: ViewMetaEntry,
  ctx: ViewContext,
): string {
  return typeof meta.subtitle === 'function' ? meta.subtitle(ctx) : meta.subtitle
}