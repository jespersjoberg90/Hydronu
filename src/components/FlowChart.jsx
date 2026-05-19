import { buildFlowChartSeries, getFlowChartSummary } from '../lib/flowChart'
import { getFishingSeasonLabel } from '../lib/fishingFlow'

const WIDTH = 320
const HEIGHT = 120
const PADDING = { top: 12, right: 12, bottom: 24, left: 12 }

function scaleX(timestamp, windowStart, windowEnd, innerWidth) {
  if (windowEnd === windowStart) return innerWidth / 2
  return ((timestamp - windowStart) / (windowEnd - windowStart)) * innerWidth
}

function scaleY(value, minFlow, maxFlow, innerHeight) {
  const range = maxFlow - minFlow || 1
  const normalized = (value - minFlow) / range
  return innerHeight - normalized * innerHeight
}

function getChartBounds(minFlow, maxFlow, fishingRange) {
  let chartMin = minFlow
  let chartMax = maxFlow

  if (fishingRange) {
    chartMin = Math.min(chartMin, fishingRange.min)
    chartMax = Math.max(chartMax, fishingRange.max)
  }

  const padding = (chartMax - chartMin) * 0.08 || 1
  return {
    chartMin: chartMin - padding,
    chartMax: chartMax + padding,
  }
}

function toPolyline(points, windowStart, windowEnd, chartMin, chartMax, innerWidth, innerHeight) {
  return points
    .map((point) => {
      const x = scaleX(point.timestamp, windowStart, windowEnd, innerWidth) + PADDING.left
      const y = scaleY(point.value, chartMin, chartMax, innerHeight) + PADDING.top
      return `${x},${y}`
    })
    .join(' ')
}

export default function FlowChart({ hydrology, fishingRange, fishingSeason }) {
  const series = buildFlowChartSeries(hydrology)

  if (!series) {
    return <p className="flow-chart__empty">Diagram saknas just nu.</p>
  }

  const innerWidth = WIDTH - PADDING.left - PADDING.right
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom
  const { points, minFlow, maxFlow, todayTimestamp, windowStart, windowEnd, hasForecast } = series
  const { chartMin, chartMax } = getChartBounds(minFlow, maxFlow, fishingRange)
  const observedPoints = points.filter((point) => point.kind !== 'forecast')
  const forecastPoints = points.filter((point) => point.kind === 'forecast')
  const todayX = scaleX(todayTimestamp, windowStart, windowEnd, innerWidth) + PADDING.left
  const ariaLabel = getFlowChartSummary(series)
  const seasonLabel = getFishingSeasonLabel(fishingSeason || 'summer')

  let bandY = null
  let bandHeight = null
  if (fishingRange) {
    const bandTop = scaleY(fishingRange.max, chartMin, chartMax, innerHeight) + PADDING.top
    const bandBottom = scaleY(fishingRange.min, chartMin, chartMax, innerHeight) + PADDING.top
    bandY = bandTop
    bandHeight = Math.max(bandBottom - bandTop, 1)
  }

  return (
    <div className="flow-chart__canvas">
      <svg
        className="flow-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        {fishingRange && bandY !== null && (
          <rect
            className="flow-chart__band"
            x={PADDING.left}
            y={bandY}
            width={innerWidth}
            height={bandHeight}
            rx={4}
          />
        )}

        <line
          className="flow-chart__today-line"
          x1={todayX}
          x2={todayX}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
        />

        {observedPoints.length > 1 && (
          <polyline
            className="flow-chart__line flow-chart__line--observed"
            fill="none"
            points={toPolyline(
              observedPoints,
              windowStart,
              windowEnd,
              chartMin,
              chartMax,
              innerWidth,
              innerHeight
            )}
          />
        )}

        {hasForecast && forecastPoints.length > 1 && (
          <polyline
            className="flow-chart__line flow-chart__line--forecast"
            fill="none"
            points={toPolyline(
              forecastPoints,
              windowStart,
              windowEnd,
              chartMin,
              chartMax,
              innerWidth,
              innerHeight
            )}
          />
        )}

        {points.map((point) => {
          const x = scaleX(point.timestamp, windowStart, windowEnd, innerWidth) + PADDING.left
          const y = scaleY(point.value, chartMin, chartMax, innerHeight) + PADDING.top
          return (
            <circle
              key={`${point.kind}-${point.timestamp}`}
              className={`flow-chart__dot flow-chart__dot--${point.kind}`}
              cx={x}
              cy={y}
              r={3.5}
            />
          )
        })}
      </svg>

      <div className="flow-chart__axis" aria-hidden="true">
        <span>−7 d</span>
        <span>Idag</span>
        <span>+7 d</span>
      </div>

      <p className="flow-chart__range" aria-hidden="true">
        {Math.round(chartMin)}–{Math.round(chartMax)} m³/s
      </p>

      {fishingRange && (
        <p className="flow-chart__legend" aria-hidden="true">
          Grönt band: bra intervall för {seasonLabel}
        </p>
      )}
    </div>
  )
}
