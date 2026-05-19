const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 7

function startOfUtcDay(timestamp) {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function dayKey(timestamp) {
  return startOfUtcDay(timestamp)
}

function aggregateByDay(points) {
  const buckets = new Map()

  for (const point of points) {
    const key = dayKey(point.timestamp)
    const bucket = buckets.get(key) || { timestamp: key, values: [], kind: point.kind }
    bucket.values.push(point.value)
    if (point.kind === 'forecast') bucket.kind = 'forecast'
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
    .map((bucket) => ({
      timestamp: bucket.timestamp,
      value: bucket.values.reduce((sum, value) => sum + value, 0) / bucket.values.length,
      kind: bucket.kind,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

function getCenterTimestamp(hydrology) {
  if (hydrology?.observedAt) {
    const observed = new Date(hydrology.observedAt).getTime()
    if (Number.isFinite(observed)) return observed
  }

  const hindcast = hydrology?.hindcast || []
  const latest = hindcast[hindcast.length - 1]
  if (latest?.timestamp) return latest.timestamp

  return Date.now()
}

export function buildFlowChartSeries(hydrology) {
  if (!hydrology?.available) return null

  const hindcast = (hydrology.hindcast || []).map((point) => ({ ...point, kind: 'observed' }))
  const forecast = (hydrology.forecast || []).map((point) => ({ ...point, kind: 'forecast' }))
  const combined = [...hindcast, ...forecast].filter(
    (point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value)
  )

  if (combined.length < 2) return null

  const center = getCenterTimestamp(hydrology)
  const centerDay = startOfUtcDay(center)
  const windowStart = centerDay - WINDOW_DAYS * DAY_MS
  const windowEnd = centerDay + WINDOW_DAYS * DAY_MS

  const inWindow = combined.filter(
    (point) => point.timestamp >= windowStart && point.timestamp <= windowEnd
  )

  const daily =
    inWindow.length > 16 ? aggregateByDay(inWindow) : inWindow.sort((a, b) => a.timestamp - b.timestamp)

  if (daily.length < 2) return null

  const values = daily.map((point) => point.value)
  const minFlow = Math.min(...values)
  const maxFlow = Math.max(...values)
  const hasForecast = daily.some((point) => point.kind === 'forecast')

  return {
    points: daily,
    minFlow,
    maxFlow,
    todayTimestamp: centerDay,
    windowStart,
    windowEnd,
    hasForecast,
  }
}

export function getFlowChartSummary(series) {
  if (!series?.points?.length) return 'Flödesdiagram saknas'

  const first = series.points[0].value
  const last = series.points[series.points.length - 1].value
  const delta = last - first
  const direction =
    Math.abs(delta) < Math.max(first * 0.03, 0.5)
      ? 'stabilt'
      : delta > 0
        ? 'stigande'
        : 'sjunkande'

  return `Flöde från ${Math.round(first)} till ${Math.round(last)} kubikmeter per sekund, ${direction} över perioden`
}
