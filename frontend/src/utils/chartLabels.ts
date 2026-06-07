/** Normalize long USASpending set-aside strings for compact chart labels */
export function formatSetAsideLabel(raw: string, maxLen = 20): string {
  let label = (raw || 'Unknown')
    .replace(/\s+SET\s+ASIDE/gi, '')
    .replace(/\s+FOR\s+/gi, ' ')
    .trim()

  if (/NO\s|FULL\s*(&|AND)?\s*OPEN|UNRESTRICTED/i.test(label)) return 'Full & Open'
  if (/SMALL\s+BUSINESS/i.test(label)) return 'Small Business'
  if (/8\s*\(\s*A\s*\)/i.test(label)) return '8(a)'
  if (/HUB\s*ZONE/i.test(label)) return 'HUBZone'
  if (/SDVOSB|SERVICE[- ]DISABLED/i.test(label)) return 'SDVOSB'
  if (/WOSB|WOMAN/i.test(label)) return 'WOSB'
  if (/ECONOMICALLY/i.test(label)) return 'EDWOSB'

  if (label.length > maxLen) return `${label.slice(0, maxLen - 1)}…`
  return label
}

export function chartHeightForRows(count: number, rowHeight = 30, min = 120, max = 340): number {
  if (count <= 0) return min
  return Math.min(max, Math.max(min, count * rowHeight + 28))
}

export function yAxisWidthForLabels(labels: string[], charWidth = 5, min = 56, max = 132): number {
  const longest = Math.max(...labels.map((l) => l.length), 6)
  return Math.min(max, Math.max(min, Math.ceil(longest * charWidth)))
}

export interface SetAsideRow {
  name: string
  fullName: string
  millions: number
  actions?: number
}

export function normalizeSetAsideRows(items: readonly any[], max = 10): SetAsideRow[] {
  return items.slice(0, max).map((s) => {
    const fullName = s.set_aside || 'Unknown'
    return {
      name: formatSetAsideLabel(fullName),
      fullName,
      millions: s.millions || 0,
      actions: s.actions,
    }
  })
}