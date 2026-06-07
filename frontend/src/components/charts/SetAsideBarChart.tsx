import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART } from '../../constants/chartTheme'
import {
  chartHeightForRows,
  type SetAsideRow,
  yAxisWidthForLabels,
} from '../../utils/chartLabels'

interface SetAsideBarChartProps {
  data: SetAsideRow[]
  compact?: boolean
  emptyMessage?: string
}

function CategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x == null || y == null || !payload) return null
  return (
    <text x={x} y={y} dy={3} textAnchor="end" fill={CHART.axisStroke} fontSize={8} fontFamily="Inter, sans-serif">
      {payload.value}
    </text>
  )
}

export function SetAsideBarChart({
  data,
  compact = false,
  emptyMessage = 'Set-aside data loads with ingest.',
}: SetAsideBarChartProps) {
  if (!data.length) {
    return (
      <div className="chart-module-empty">{emptyMessage}</div>
    )
  }

  const yWidth = yAxisWidthForLabels(data.map((d) => d.name), compact ? 4.8 : 5.2)
  const height = chartHeightForRows(data.length, compact ? 26 : 30, compact ? 120 : 140)

  return (
    <div className="chart-module" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: compact ? 6 : 10, left: 0, bottom: 4 }}
          barCategoryGap={compact ? '18%' : '22%'}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} horizontal={false} />
          <XAxis
            type="number"
            stroke={CHART.axisStroke}
            tick={CHART.axisTickSm}
            tickFormatter={(v) => `$${v}M`}
            fontSize={8}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yWidth}
            stroke={CHART.axisStroke}
            tick={<CategoryTick />}
            interval={0}
          />
          <Tooltip
            contentStyle={CHART.tooltipStyle}
            formatter={(value: number) => [`$${value}M`, 'Obligations']}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as SetAsideRow | undefined
              return row?.fullName ?? _
            }}
          />
          <Bar dataKey="millions" name="$ Millions" radius={[0, 3, 3, 0]} maxBarSize={compact ? 14 : 18}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 0 ? CHART.colors.magenta : CHART.colors.cyan}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}