import { flies } from '../data/flies'

const statusLabels = {
  'very-low': 'Mycket lågt',
  low: 'Lågt',
  normal: 'Normalt',
  high: 'Högt',
  'very-high': 'Mycket högt',
  unknown: 'Okänt',
}

const trendLabels = {
  rising: 'stigande',
  falling: 'sjunkande',
  steady: 'stabilt',
}

const trendToneLabels = {
  rising: 'Stiger',
  falling: 'Sjunker',
  steady: 'Stabilt',
}

function getWeatherLabel(weather) {
  const rain = Number(weather?.precipitationAmountMmPerH || 0)
  const cloud = Number(weather?.cloudCoverPercent ?? 50)
  if (rain >= 0.35 || weather?.precipitationCategory >= 1) return 'Rain'
  if (cloud >= 85) return 'Overcast'
  if (cloud >= 55) return 'Cloudy'
  if (cloud >= 20) return 'Bright'
  return 'Sunny'
}

function getTimeLabel(now = new Date()) {
  const hour = now.getHours()
  if (hour < 5) return 'Night'
  if (hour < 8) return 'Dawn'
  if (hour < 19) return 'Day'
  if (hour < 22) return 'Dusk'
  return 'Night'
}

function getWaterLevel(status) {
  if (status === 'very-low' || status === 'low') return 'Low'
  if (status === 'high') return 'High'
  if (status === 'very-high') return 'Flood'
  return 'Medium'
}

function getWaterColor(hydrology, weather) {
  const rain = Number(weather?.precipitationAmountMmPerH || 0)
  if (hydrology?.status === 'very-high') return 'Turbid'
  if (hydrology?.status === 'high' || hydrology?.trend === 'rising' || rain >= 0.35) return 'Colored'
  if (hydrology?.status === 'low' || hydrology?.status === 'very-low') return 'Clear'
  return 'Humic'
}

function includesFit(values, actual) {
  return Array.isArray(values) && (values.includes('All') || values.includes(actual))
}

function scoreFly(fly, conditions) {
  const checks = [
    includesFit(fly.fits.waterColor, conditions.waterColor),
    includesFit(fly.fits.waterLevel, conditions.waterLevel),
    includesFit(fly.fits.weather, conditions.weather),
    includesFit(fly.fits.time, conditions.time),
  ]
  return checks.filter(Boolean).length
}

function getSeasonalSummary(hydrology) {
  const stats = hydrology?.seasonalStats
  if (!stats || !Number.isFinite(stats.percentile)) {
    return {
      label: 'Säsongsdata saknas',
      detail: 'Statusen bygger på fasta referensflöden.',
      tone: 'unknown',
    }
  }

  const percentile = Math.round(stats.percentile)
  const detail = `Högre än ${percentile} % av referensåren för samma datum (${stats.referencePeriod}).`

  if (percentile < 5) return { label: 'Extremt lågt för årstiden', detail, tone: 'very-low' }
  if (percentile < 15) return { label: 'Lågt för årstiden', detail, tone: 'low' }
  if (percentile <= 75) return { label: 'Normalt för årstiden', detail, tone: 'normal' }
  if (percentile <= 90) return { label: 'Högt för årstiden', detail, tone: 'high' }
  return { label: 'Mycket högt för årstiden', detail, tone: 'very-high' }
}

function getForecastSummary(hydrology) {
  if (!hydrology?.available || !Number.isFinite(hydrology.forecastDeltaFlow)) {
    return {
      label: 'Prognos saknas',
      detail: 'Hydronu gav ingen användbar 10-dagarsprognos.',
      tone: 'unknown',
    }
  }

  const delta = hydrology.forecastDeltaFlow
  const percent = Number.isFinite(hydrology.forecastDeltaPercent)
    ? `${Math.abs(Math.round(hydrology.forecastDeltaPercent))} %`
    : `${formatFlow(Math.abs(delta))}`
  const trendLabel = trendToneLabels[hydrology.forecastTrend] || 'Stabilt'

  if (hydrology.forecastTrend === 'steady') {
    return {
      label: 'Stabilt kommande dagar',
      detail: `Prognosen rör sig mindre än cirka ${percent} på 10 dagar.`,
      tone: 'steady',
    }
  }

  return {
    label: `${trendLabel} kommande dagar`,
    detail: `Prognosen ${hydrology.forecastTrend === 'falling' ? 'sjunker' : 'stiger'} med cirka ${percent} på 10 dagar.`,
    tone: hydrology.forecastTrend,
  }
}

function getPrimaryReason(hydrology) {
  const seasonal = getSeasonalSummary(hydrology)
  if (!hydrology?.available) return hydrology?.reason || 'Flödesdata saknas just nu.'
  if (hydrology.status === 'normal' && hydrology.trend === 'falling') {
    return 'Säsongsnormal nivå med sjunkande trend.'
  }
  if (hydrology.status === 'high' && hydrology.trend === 'falling') {
    return 'Högt vatten, men på väg åt rätt håll.'
  }
  if (hydrology.status === 'very-high') return 'Mycket vatten i systemet gör läget mer svårbedömt.'
  if (hydrology.status === 'low' || hydrology.status === 'very-low') return 'Lågt vatten kräver mer försiktigt fiske.'
  return seasonal.label
}

function getRiskFlags(signals, conditions) {
  const hydrology = signals.hydrology || {}
  const weather = signals.weather || {}
  const flags = []
  const rain = Number(weather?.precipitationAmountMmPerH || 0)

  if (!hydrology.available) flags.push('Begränsat dataunderlag')
  if (hydrology.status === 'very-high') flags.push('Mycket högt flöde')
  if (hydrology.status === 'very-low') flags.push('Mycket lågt flöde')
  if (hydrology.trend === 'rising') flags.push('Stigande vatten')
  if (hydrology.forecastTrend === 'rising') flags.push('Prognosen pekar uppåt')
  if (rain > 0.5 || conditions.weather === 'Rain') flags.push('Regn kan färga vattnet')

  return flags
}

function getTacticHint(conditions, hydrology) {
  if (!hydrology?.available) return 'Börja med säkra pooler och låt lokala observationer styra.'
  if (hydrology.status === 'very-high' || conditions.waterLevel === 'Flood') {
    return 'Fiska lugnare kanter, kortare kast och något större profil med tydlig kontrast.'
  }
  if (hydrology.status === 'high') {
    return hydrology.trend === 'falling'
      ? 'Sök fisk nära kanter och nackar när vattnet börjar falla undan.'
      : 'Prioritera lugnare vatten och flugor som syns i färgat flöde.'
  }
  if (hydrology.status === 'low' || hydrology.status === 'very-low') {
    return 'Gå försiktigt, fiska tunnare och prioritera gryning, skymning eller skuggade partier.'
  }
  if (conditions.time === 'Dawn' || conditions.time === 'Dusk') {
    return 'Bra ljusläge: börja med förstavalet och fiska igenom heta ståndplatser metodiskt.'
  }
  return 'Börja brett med rekommenderad allroundfluga och justera efter färg och ljus.'
}

export function getRiverConditions(signals) {
  const hydrology = signals.hydrology || {}
  const weather = signals.weather || {}
  const waterLevel = getWaterLevel(hydrology.status)
  const waterColor = getWaterColor(hydrology, weather)
  return {
    waterLevel,
    waterColor,
    weather: getWeatherLabel(weather),
    time: getTimeLabel(),
  }
}

export function getFlyRecommendations(conditions, limit = 3) {
  return flies
    .map((fly) => ({ ...fly, score: scoreFly(fly, conditions) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function analyzeRiver(signals) {
  const hydrology = signals.hydrology || {}
  const conditions = getRiverConditions(signals)
  const recommendations = getFlyRecommendations(conditions)
  const seasonalSummary = getSeasonalSummary(hydrology)
  const forecastSummary = getForecastSummary(hydrology)
  const primaryReason = getPrimaryReason(hydrology)
  const riskFlags = getRiskFlags(signals, conditions)
  const tacticHint = getTacticHint(conditions, hydrology)
  let score = 50
  const reasons = []

  if (!hydrology.available) {
    score = 35
    reasons.push(hydrology.reason || 'Flödesdata saknas just nu.')
  } else {
    if (hydrology.seasonalStats) {
      reasons.push(
        `Flödet är högre än ${Math.round(hydrology.seasonalStats.percentile)} % av referensåren för samma datum.`
      )
    }
    if (hydrology.status === 'normal') {
      score += 22
      reasons.push('Flödet ligger inom säsongsnormal nivå.')
    }
    if (hydrology.status === 'low') {
      score += 6
      reasons.push('Lägre vatten kan vara fiskbart, särskilt i svagare ljus.')
    }
    if (hydrology.status === 'high') {
      score += hydrology.trend === 'falling' ? 16 : -2
      reasons.push(hydrology.trend === 'falling' ? 'Högt men på väg ner.' : 'Högt vatten kräver lite mer tålamod.')
    }
    if (hydrology.status === 'very-low') {
      score -= 16
      reasons.push('Mycket lågt vatten brukar göra fisket svårare.')
    }
    if (hydrology.status === 'very-high') {
      score -= hydrology.trend === 'falling' ? 8 : 24
      reasons.push('Mycket högt flöde kan göra älven svårfiskad.')
    }
    if (hydrology.trend === 'falling') {
      score += 10
      reasons.push('Sjunkande trend är ofta ett plus.')
    }
    if (hydrology.trend === 'rising') {
      score -= 8
      reasons.push('Stigande vatten kan färga upp och störa fisket.')
    }
  }

  const rain = Number(signals.weather?.precipitationAmountMmPerH || 0)
  const cloud = Number(signals.weather?.cloudCoverPercent ?? 50)
  if (rain > 0.5) {
    score -= 6
    reasons.push('Regn kan ge mer färg och snabbare förändringar.')
  } else if (cloud > 55) {
    score += 5
    reasons.push('Molnigare väder ger behagligare ljus.')
  }

  if (conditions.time === 'Dawn' || conditions.time === 'Dusk') {
    score += 6
    reasons.push('Tid på dygnet är lovande.')
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)))
  return {
    ...signals,
    conditions,
    recommendations,
    score: boundedScore,
    verdict: getVerdict(boundedScore, hydrology),
    primaryReason,
    seasonalSummary,
    forecastSummary,
    riskFlags,
    tacticHint,
    reasons: reasons.slice(0, 3),
  }
}

function getVerdict(score, hydrology) {
  if (!hydrology?.available) return 'Begränsat underlag'
  if (score >= 78) return 'Hetast idag'
  if (score >= 64) return 'Bra läge'
  if (score >= 48) return 'Värt att bevaka'
  return 'Avvakta'
}

export function formatFlow(value) {
  if (!Number.isFinite(value)) return 'Saknas'
  if (value < 10) return `${value.toFixed(1)} m³/s`
  return `${Math.round(value)} m³/s`
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatSeasonalComparison(hydrology) {
  const stats = hydrology?.seasonalStats
  if (!stats || !Number.isFinite(stats.percentile)) return 'Säsongsdata saknas'
  return `p${Math.round(stats.percentile)} · ${stats.referencePeriod}`
}

export function getStatusLabel(status) {
  return statusLabels[status] || statusLabels.unknown
}

export function getTrendLabel(trend) {
  return trendLabels[trend] || trendLabels.steady
}
