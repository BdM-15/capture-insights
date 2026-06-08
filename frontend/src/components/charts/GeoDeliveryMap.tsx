import Plot from 'react-plotly.js'
import { CHART } from '../../constants/chartTheme'
import { isMappableState, type GeoMapState } from '../../utils/geographicIntel'

interface GeoDeliveryMapProps {
  states: readonly GeoMapState[]
}

const GEO_COLORSCALE: [number, string][] = [
  [0, 'rgba(17,23,42,0.55)'],
  [0.12, 'rgba(0,240,255,0.18)'],
  [0.35, 'rgba(0,240,255,0.42)'],
  [0.65, 'rgba(0,255,156,0.55)'],
  [1, '#00f0ff'],
]

export function GeoDeliveryMap({ states }: GeoDeliveryMapProps) {
  const valid = states.filter((s) => isMappableState(s.state))
  if (!valid.length) {
    return <div className="chart-module-empty">No mappable state data in this slice.</div>
  }

  return (
    <div className="chart-panel-plot" style={{ height: 300 }}>
      <Plot
        data={[{
          type: 'choropleth',
          locationmode: 'USA-states',
          locations: valid.map((s) => s.state),
          z: valid.map((s) => s.millions),
          text: valid.map(
            (s) => `${s.state}<br>$${s.millions}M obligated<br>${s.share_pct}% of slice<br>${s.actions.toLocaleString()} actions`,
          ),
          hovertemplate: '%{text}<extra></extra>',
          colorscale: GEO_COLORSCALE,
          zmin: 0,
          marker: { line: { color: '#1f2a44', width: 0.6 } },
          colorbar: {
            title: { text: '$M', side: 'right', font: { size: 9, color: CHART.fontColor } },
            tickfont: { size: 9, color: CHART.fontColor },
            thickness: 12,
            len: 0.85,
          },
        }]}
        layout={{
          geo: {
            scope: 'usa',
            bgcolor: 'rgba(0,0,0,0)',
            lakecolor: 'rgba(17,23,42,0.8)',
            landcolor: 'rgba(31,42,68,0.65)',
            subunitcolor: '#1f2a44',
            countrycolor: '#1f2a44',
            showlakes: true,
            showsubunits: true,
          },
          margin: { t: 4, r: 4, b: 4, l: 4 },
          paper_bgcolor: CHART.transparent,
          font: { size: 9, color: CHART.fontColor },
        }}
        style={{ width: '100%', height: '100%' }}
        config={{ displayModeBar: false }}
      />
    </div>
  )
}