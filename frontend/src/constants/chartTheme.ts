/** Shared Recharts / Plotly styling — use instead of hardcoded hex in chart configs */
export const CHART = {
  gridStroke: '#1f2a44',
  axisStroke: '#64748b',
  axisTick: { fontSize: 10 },
  axisTickSm: { fontSize: 9 },
  tooltipStyle: {
    background: '#11172a',
    border: '1px solid #1f2a44',
    fontSize: 11,
    borderRadius: 8,
  },
  legendStyle: { fontSize: 10 },
  fontColor: '#e6ecff',
  colors: {
    cyan: '#00f0ff',
    magenta: '#ff2bd6',
    amber: '#ffb020',
    lime: '#00ff9c',
  },
  transparent: 'rgba(0,0,0,0)',
  sankeyLink: 'rgba(0,240,255,0.3)',
  sankeyNodeLine: '#1f2a44',
} as const