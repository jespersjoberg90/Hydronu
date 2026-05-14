const REQUEST_TIMEOUT_MS = 10000

function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('SMHI-anropet tog för lång tid')), ms)
    }),
  ])
}

async function fetchJson(url) {
  const response = await withTimeout(fetch(url))
  if (!response.ok) {
    throw new Error(`SMHI svarade med ${response.status}`)
  }
  return response.json()
}

function getParam(series, key) {
  const param = series?.parameters?.find((item) => item.name === key)
  return Array.isArray(param?.values) ? param.values[0] : null
}

function pickClosestTimeSeries(timeSeries) {
  if (!Array.isArray(timeSeries) || timeSeries.length === 0) return null
  const now = Date.now()
  return timeSeries
    .map((series) => ({ series, diff: Math.abs(new Date(series.validTime).getTime() - now) }))
    .sort((a, b) => a.diff - b.diff)[0]?.series
}

function toPoint(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return null
  const timestamp = Number(pair[0])
  const value = Number(pair[1])
  if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return null
  return { timestamp, value }
}

function getTrend(points) {
  if (!Array.isArray(points) || points.length < 2) return 'steady'
  const latest = points[points.length - 1].value
  const previous = points[points.length - 2].value
  const delta = latest - previous
  if (Math.abs(delta) < Math.max(latest * 0.03, 0.05)) return 'steady'
  return delta > 0 ? 'rising' : 'falling'
}

function getForecastDelta(start, end) {
  if (!start || !end || !Number.isFinite(start.value) || !Number.isFinite(end.value)) {
    return { flow: null, percent: null }
  }

  const flow = end.value - start.value
  const percent = start.value === 0 ? null : (flow / start.value) * 100
  return { flow, percent }
}

function dayKey(timestamp) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getUTCMonth() + 1}-${date.getUTCDate()}`
}

function normalizeBackgroundPoint(pair) {
  if (!Array.isArray(pair) || pair.length < 2 || !Array.isArray(pair[1])) return null
  const timestamp = Number(pair[0])
  if (!Number.isFinite(timestamp)) return null
  const values = pair[1].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (values.length === 0) return null
  return { timestamp, values }
}

function quantile(sortedValues, q) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null
  const pos = (sortedValues.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sortedValues[base + 1]
  if (!Number.isFinite(next)) return sortedValues[base]
  return sortedValues[base] + rest * (next - sortedValues[base])
}

function getSeasonalStats(flow, timestamp, background) {
  if (!Number.isFinite(flow) || !Number.isFinite(timestamp) || !Array.isArray(background)) return null
  const targetKey = dayKey(timestamp)
  const backgroundPoint = background.map(normalizeBackgroundPoint).find((point) => dayKey(point?.timestamp) === targetKey)
  if (!backgroundPoint) return null

  const values = backgroundPoint.values
  const lowerCount = values.filter((value) => value < flow).length
  const equalCount = values.filter((value) => value === flow).length
  const percentile = ((lowerCount + equalCount * 0.5) / values.length) * 100

  return {
    percentile,
    sampleSize: values.length,
    referencePeriod: '1991-2022',
    p05: quantile(values, 0.05),
    p15: quantile(values, 0.15),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
  }
}

function getSeasonalFlowStatus(seasonalStats) {
  if (!seasonalStats || !Number.isFinite(seasonalStats.percentile)) return 'unknown'
  if (seasonalStats.percentile < 5) return 'very-low'
  if (seasonalStats.percentile < 15) return 'low'
  if (seasonalStats.percentile <= 75) return 'normal'
  if (seasonalStats.percentile <= 90) return 'high'
  return 'very-high'
}

function getReferenceFlowStatus(flow, mq, mlq, mhq) {
  if (![flow, mq, mlq, mhq].every(Number.isFinite)) return 'unknown'
  if (flow <= mlq) return 'very-low'
  if (flow < mq * 0.75) return 'low'
  if (flow <= mq * 1.35) return 'normal'
  if (flow < mhq) return 'high'
  return 'very-high'
}

function normalizeHydronu(data, hydronuId) {
  const chart = data?.chartData || data
  const hindcast = (chart?.coutHindcast?.data || []).map(toPoint).filter(Boolean)
  const forecast = (chart?.coutForecast?.data || []).map(toPoint).filter(Boolean)
  const precipitationForecast = (chart?.psimForecast?.data || []).map(toPoint).filter(Boolean)
  const latest = hindcast[hindcast.length - 1] || null
  const next = forecast[0] || null
  const lastForecast = forecast[forecast.length - 1] || null
  const forecastDelta = getForecastDelta(next, lastForecast)
  const forecastPrecipitationTotal = precipitationForecast.reduce((sum, point) => sum + point.value, 0)
  const mq = Number(chart?.mq)
  const mlq = Number(chart?.mlq)
  const mhq = Number(chart?.mhq)
  const seasonalStats = latest ? getSeasonalStats(latest.value, latest.timestamp, chart?.background) : null
  const status = seasonalStats
    ? getSeasonalFlowStatus(seasonalStats)
    : getReferenceFlowStatus(latest?.value, mq, mlq, mhq)

  return {
    source: 'SMHI Hydrologiskt nuläge',
    available: Boolean(latest),
    hydronuId,
    productionTime: data?.productionTime || null,
    observedAt: latest ? new Date(latest.timestamp).toISOString() : null,
    currentFlow: latest?.value ?? null,
    normalFlow: Number.isFinite(mq) ? mq : null,
    lowReferenceFlow: Number.isFinite(mlq) ? mlq : null,
    highReferenceFlow: Number.isFinite(mhq) ? mhq : null,
    trend: getTrend(hindcast.slice(-5)),
    forecastTrend: getTrend([next, lastForecast].filter(Boolean)),
    forecastStartFlow: next?.value ?? null,
    forecastEndFlow: lastForecast?.value ?? null,
    forecastDeltaFlow: forecastDelta.flow,
    forecastDeltaPercent: forecastDelta.percent,
    forecastPrecipitationTotal,
    status: latest ? status : 'unknown',
    statusBasis: seasonalStats ? 'seasonal-percentile' : 'reference-flow',
    seasonalStats,
    hindcast,
    forecast,
  }
}

export async function fetchHydronuForRiver(river) {
  const data = await fetchJson(`/hydronu/data/point?subid=${river.hydronuId}`)
  return normalizeHydronu(data, river.hydronuId)
}

export async function fetchWeatherForPoint(lat, lon) {
  const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`
  const data = await fetchJson(url)
  const closest = pickClosestTimeSeries(data?.timeSeries)
  if (!closest) throw new Error('Ingen väderprognos hittades')

  return {
    source: 'SMHI väderprognos',
    available: true,
    observedAt: closest.validTime,
    tempC: getParam(closest, 't'),
    cloudCoverPercent: getParam(closest, 'tcc_mean'),
    precipitationCategory: getParam(closest, 'pcat'),
    precipitationAmountMmPerH: getParam(closest, 'pmean'),
    windSpeedMs: getParam(closest, 'ws'),
  }
}

export async function fetchRiverSignals(river) {
  const [hydrologyResult, weatherResult] = await Promise.allSettled([
    fetchHydronuForRiver(river),
    fetchWeatherForPoint(river.lat, river.lon),
  ])

  return {
    river,
    hydrology:
      hydrologyResult.status === 'fulfilled'
        ? hydrologyResult.value
        : {
            source: 'SMHI Hydrologiskt nuläge',
            available: false,
            reason: hydrologyResult.reason?.message || 'Hydronu kunde inte hämtas',
          },
    weather:
      weatherResult.status === 'fulfilled'
        ? weatherResult.value
        : {
            source: 'SMHI väderprognos',
            available: false,
            reason: weatherResult.reason?.message || 'Väder kunde inte hämtas',
          },
    fetchedAt: new Date().toISOString(),
  }
}

export async function fetchAllRiverSignals(rivers) {
  const results = await Promise.allSettled(rivers.map((river) => fetchRiverSignals(river)))
  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    return {
      river: rivers[index],
      hydrology: { available: false, reason: result.reason?.message || 'Kunde inte hämta älvdata' },
      weather: { available: false, reason: 'Ej hämtad' },
      fetchedAt: new Date().toISOString(),
    }
  })
}
