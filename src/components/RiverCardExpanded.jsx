import FlowChart from './FlowChart'
import { formatSeasonalComparison } from '../lib/riverSignals'

function getContextNotes(item) {
  const fishing = item.fishingFlowAssessment
  const seasonal = item.seasonalSummary
  const weather = item.weather || {}
  const notes = []

  const weatherParts = [item.conditions.weatherLabel]
  if (Number.isFinite(weather.tempC)) weatherParts.push(`${weather.tempC.toFixed(1)} °C`)
  notes.push(`Väder: ${weatherParts.join(' · ')}`)

  if (fishing?.note) notes.push(fishing.note)
  if (seasonal?.label && seasonal.label !== 'Säsongsdata saknas') {
    notes.push(seasonal.label)
  }
  if (item.riskFlags.length > 0) notes.push(item.riskFlags.join(' · '))

  return notes
}

export default function RiverCardExpanded({ item }) {
  const hydrology = item.hydrology || {}
  const fishing = item.fishingFlowAssessment
  const contextNotes = getContextNotes(item)
  const sources = [
    hydrology.source || 'SMHI Hydrologiskt nuläge',
    formatSeasonalComparison(hydrology),
  ].filter((part) => part && part !== 'Säsongsdata saknas')

  return (
    <div className="river-expand">
      <p className="river-expand__insight">{item.primaryReason}</p>
      {contextNotes.length > 0 && (
        <p className="river-expand__context">{contextNotes.join(' · ')}</p>
      )}

      <section className="river-expand__section river-expand__section--chart">
        <h3>Flöde över tid</h3>
        <FlowChart
          hydrology={hydrology}
          fishingRange={fishing?.range}
          fishingSeason={fishing?.season}
        />
      </section>

      <section className="river-expand__section river-expand__section--flies">
        <h3>Rekommenderat just nu</h3>
        <p className="river-expand__tactic">{item.tactic?.text || item.tacticHint}</p>
        <ul className="river-expand__flies">
          {item.recommendations.map((fly) => (
            <li key={fly.name}>
              <strong>{fly.name}</strong>
              <span>{fly.note}</span>
            </li>
          ))}
        </ul>
      </section>

      {sources.length > 0 && (
        <p className="river-expand__sources">Källa: {sources.join(' · ')}</p>
      )}
    </div>
  )
}
