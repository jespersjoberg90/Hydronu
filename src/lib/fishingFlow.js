const seasonLabels = {
  spring: 'vår',
  summer: 'sommar',
  offSeason: 'sommar',
}

const seasonTitles = {
  spring: 'vår/tidigt laxfiske',
  summer: 'sommar (harr/öring)',
  offSeason: 'sommar (harr/öring)',
}

export function getFishingSeason(date = new Date()) {
  const month = date.getMonth() + 1
  if (month >= 4 && month <= 5) return 'spring'
  if (month >= 6 && month <= 9) return 'summer'
  return 'offSeason'
}

export function getFishingSeasonLabel(season) {
  return seasonLabels[season] || seasonLabels.summer
}

export function getFishingSeasonTitle(season) {
  return seasonTitles[season] || seasonTitles.summer
}

export function getFishingFlowRange(river, season) {
  const config = river?.fishingFlow
  if (!config) return null

  const key = season === 'spring' ? 'spring' : 'summer'
  const range = config[key]
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null

  return { ...range, season: key }
}

function formatRange(range) {
  return `${range.min}–${range.max} m³/s`
}

export function assessFishingFlow(river, currentFlow, season = getFishingSeason()) {
  const range = getFishingFlowRange(river, season)
  const seasonLabel = getFishingSeasonLabel(season)
  const seasonTitle = getFishingSeasonTitle(season)

  if (!range || !Number.isFinite(currentFlow)) {
    return {
      status: 'unknown',
      season,
      seasonLabel,
      seasonTitle,
      range: null,
      label: 'Fiskeflöde okänt',
      detail: 'Saknar erfarenhetsintervall eller aktuellt flöde.',
      shortLabel: null,
    }
  }

  const span = range.max - range.min || 1
  const nearMargin = span * 0.15

  let status = 'within'
  if (currentFlow < range.min) status = 'below'
  if (currentFlow > range.max) status = 'above'

  const rangeText = formatRange(range)
  const labels = {
    within: {
      label: `Inom bra intervall för ${seasonTitle}`,
      detail: `Flödet ligger inom ${rangeText}, vilket brukar vara bra för ${seasonTitle}.`,
      shortLabel: 'Inom bra intervall',
    },
    below: {
      label: `Under bra intervall för ${seasonTitle}`,
      detail: `Flödet är lägre än ${rangeText}, men kan fortfarande vara fiskbart beroende på älv och ljus.`,
      shortLabel: 'Under intervall',
    },
    above: {
      label: `Över bra intervall för ${seasonTitle}`,
      detail: `Flödet är högre än ${rangeText}. Vattnet kan bli grumligare och svårare att läsa.`,
      shortLabel: 'Över intervall',
    },
  }

  const copy = labels[status]
  const nearBelow = status === 'below' && currentFlow >= range.min - nearMargin
  const nearAbove = status === 'above' && currentFlow <= range.max + nearMargin

  return {
    status,
    season,
    seasonLabel,
    seasonTitle,
    range,
    rangeText,
    nearBelow,
    nearAbove,
    label: copy.label,
    detail: copy.detail,
    shortLabel: copy.shortLabel,
    note: river.fishingFlow?.note || '',
    character: river.fishingFlow?.character || '',
  }
}
