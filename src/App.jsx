import { Analytics } from '@vercel/analytics/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { rivers } from './data/rivers'
import { fetchAllRiverSignals } from './services/smhi'
import {
  analyzeRiver,
  formatDateTime,
  formatFlow,
  getStatusLabel,
  getTrendLabel,
} from './lib/riverSignals'
import RiverCardExpanded from './components/RiverCardExpanded'
import './App.css'

function App() {
  const [riverSignals, setRiverSignals] = useState([])
  const [expandedRiverId, setExpandedRiverId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const applyRiverData = useCallback((data) => {
    setRiverSignals(data)
  }, [])

  const loadRivers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAllRiverSignals(rivers)
      applyRiverData(data)
    } catch (err) {
      setError(err?.message || 'Kunde inte hämta älvdata.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchAllRiverSignals(rivers)
      .then((data) => {
        if (!cancelled) applyRiverData(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Kunde inte hämta älvdata.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applyRiverData])

  const analyzedRivers = useMemo(
    () => riverSignals.map(analyzeRiver).sort((a, b) => b.score - a.score),
    [riverSignals]
  )

  const lastUpdated = analyzedRivers[0]?.fetchedAt ? formatDateTime(analyzedRivers[0].fetchedAt) : ''

  const handleRiverToggle = (riverId) => {
    setExpandedRiverId((current) => (current === riverId ? null : riverId))
  }

  return (
    <>
      <main className="app-shell">
        <section className="hero-panel">
          <div>
            <h1>
              Vattenläge för <span>dagens fiske</span>
            </h1>
            <p className="hero-copy">
              Aktuella flöden, trender och väder för dina favoritälvar — skanna läget snabbt eller öppna ett kort
              för mer.
            </p>
            <div className="hero-actions">
              <button type="button" onClick={loadRivers} disabled={loading}>
                {loading ? 'Hämtar data …' : 'Uppdatera data'}
              </button>
              {lastUpdated && <span className="hero-actions__meta">Senast uppdaterad {lastUpdated}</span>}
            </div>
          </div>
        </section>

        {error && <p className="notice notice--error">{error}</p>}

        <section className="river-grid" aria-label="Favoritälvar">
          {loading && analyzedRivers.length === 0
            ? rivers.map((river) => <RiverSkeleton key={river.id} river={river} />)
            : analyzedRivers.map((item) => (
                <RiverCard
                  key={item.river.id}
                  item={item}
                  expanded={expandedRiverId === item.river.id}
                  onToggle={() => handleRiverToggle(item.river.id)}
                />
              ))}
        </section>
      </main>
      <Analytics />
    </>
  )
}

function RiverSkeleton({ river }) {
  return (
    <article className="river-card river-card--skeleton">
      <h2>{river.name}</h2>
      <div className="skeleton-line" />
      <div className="skeleton-line skeleton-line--short" />
    </article>
  )
}

function RiverCard({ item, expanded, onToggle }) {
  const hydrology = item.hydrology || {}
  const expandId = `river-detail-${item.river.id}`

  return (
    <article
      className={`river-card ${expanded ? 'river-card--expanded river-card--selected' : ''}`}
    >
      <button
        type="button"
        className="river-card__summary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={expandId}
      >
        <div className="river-card__top">
          <strong aria-label={`Lägespoäng ${item.score} av 100`}>{item.score}</strong>
        </div>
        <h2>{item.river.name}</h2>
        <p className="verdict">{item.verdict}</p>
        {item.fishingFlowAssessment?.shortLabel && (
          <p className="river-card__fishing-flow">{item.fishingFlowAssessment.shortLabel}</p>
        )}
        {!expanded && <p className="card-reason">{item.primaryReason}</p>}
        <dl>
          <div>
            <dt>Flöde</dt>
            <dd>{formatFlow(hydrology.currentFlow)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-pill status-pill--${hydrology.status || 'unknown'}`}>
                {getStatusLabel(hydrology.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Trend</dt>
            <dd>{getTrendLabel(hydrology.trend)}</dd>
          </div>
          <div>
            <dt>Färg</dt>
            <dd>{item.conditions.waterColorLabel}</dd>
          </div>
        </dl>
        {!expanded && (
          <div className="river-card__footer">
            <span>{item.forecastSummary.label}</span>
            <span className="river-card__action">Visa mer ↓</span>
          </div>
        )}
      </button>

      {expanded && (
        <>
          <div id={expandId} className="river-card__expand-region">
            <RiverCardExpanded item={item} />
          </div>
          <button type="button" className="river-card__footer river-card__footer--collapse" onClick={onToggle}>
            <span>{item.forecastSummary.label}</span>
            <span className="river-card__action">Dölj ↑</span>
          </button>
        </>
      )}
    </article>
  )
}

export default App
