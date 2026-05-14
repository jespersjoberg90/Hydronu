import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rivers } from './data/rivers'
import { fetchAllRiverSignals } from './services/smhi'
import {
  analyzeRiver,
  formatDateTime,
  formatFlow,
  formatSeasonalComparison,
  getStatusLabel,
  getTrendLabel,
} from './lib/riverSignals'
import './App.css'

function App() {
  const [riverSignals, setRiverSignals] = useState([])
  const [selectedRiverId, setSelectedRiverId] = useState(rivers[0].id)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const detailRef = useRef(null)

  const applyRiverData = useCallback((data) => {
    setRiverSignals(data)
    const best = data.map(analyzeRiver).sort((a, b) => b.score - a.score)[0]
    if (best) setSelectedRiverId(best.river.id)
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

  const selectedRiver = useMemo(() => {
    return analyzedRivers.find((item) => item.river.id === selectedRiverId) || analyzedRivers[0] || null
  }, [analyzedRivers, selectedRiverId])

  const bestRiver = analyzedRivers[0]
  const lastUpdated = selectedRiver?.fetchedAt ? formatDateTime(selectedRiver.fetchedAt) : ''
  const detailId = 'river-detail'

  const handleRiverSelect = (riverId) => {
    setSelectedRiverId(riverId)
    if (window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        detailRef.current?.focus({ preventScroll: true })
      })
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Dagens rekommendation</p>
          <h1>{bestRiver ? `${bestRiver.river.name} ser bäst ut just nu` : 'Var är det bäst att fiska idag?'}</h1>
          <p className="hero-copy">
            {bestRiver
              ? bestRiver.primaryReason
              : 'Sex favoritälvar rankas med Hydronu-flöde, trend, väder och enkla flugregler.'}
          </p>
          <div className="hero-actions">
            <button type="button" onClick={loadRivers} disabled={loading}>
              {loading ? 'Hämtar data...' : 'Uppdatera läget'}
            </button>
            {lastUpdated && <span>Senast uppdaterad {lastUpdated}</span>}
          </div>
        </div>
        <aside className="top-pick" aria-label="Bästa älv just nu">
          <span className="top-pick__label">Fiskeläge</span>
          <strong>{bestRiver?.river.name || 'Hämtar...'}</strong>
          <span>{bestRiver ? `${bestRiver.verdict} · ${bestRiver.score}/100` : 'SMHI-data laddas'}</span>
          {bestRiver && <small>{bestRiver.forecastSummary.label}</small>}
        </aside>
      </section>

      {error && <p className="notice notice--error">{error}</p>}

      <section className="river-grid" aria-label="Favoritälvar">
        {loading && analyzedRivers.length === 0
          ? rivers.map((river) => <RiverSkeleton key={river.id} river={river} />)
          : analyzedRivers.map((item) => (
              <RiverCard
                key={item.river.id}
                item={item}
                selected={selectedRiver?.river.id === item.river.id}
                detailId={detailId}
                onSelect={() => handleRiverSelect(item.river.id)}
              />
            ))}
      </section>

      {selectedRiver && <RiverDetail item={selectedRiver} detailId={detailId} detailRef={detailRef} />}
    </main>
  )
}

function RiverSkeleton({ river }) {
  return (
    <article className="river-card river-card--skeleton">
      <p>{river.region}</p>
      <h2>{river.name}</h2>
      <div className="skeleton-line" />
      <div className="skeleton-line skeleton-line--short" />
    </article>
  )
}

function RiverCard({ item, selected, detailId, onSelect }) {
  const hydrology = item.hydrology || {}
  return (
    <button
      type="button"
      className={`river-card ${selected ? 'river-card--selected' : ''}`}
      onClick={onSelect}
      aria-controls={detailId}
      aria-expanded={selected}
    >
      <div className="river-card__top">
        <span>{item.river.region}</span>
        <strong aria-label={`Fiskeläge ${item.score} av 100`}>{item.score}</strong>
      </div>
      <h2>{item.river.name}</h2>
      <p className="verdict">{item.verdict}</p>
      <p className="card-reason">{item.primaryReason}</p>
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
      </dl>
      <div className="river-card__footer">
        <span>{item.forecastSummary.label}</span>
        <span>{selected ? 'Visas nu' : 'Visa detaljer'} →</span>
      </div>
    </button>
  )
}

function RiverDetail({ item, detailId, detailRef }) {
  const hydrology = item.hydrology || {}
  const weather = item.weather || {}
  return (
    <section
      id={detailId}
      ref={detailRef}
      className="detail-panel"
      aria-labelledby="detail-heading"
      tabIndex={-1}
    >
      <div className="detail-panel__main">
        <p className="eyebrow">Varför denna älv?</p>
        <h2 id="detail-heading">Varför {item.river.name}?</h2>
        <p className="detail-lead">
          {item.verdict} med {formatFlow(hydrology.currentFlow).toLowerCase()} och{' '}
          {getTrendLabel(hydrology.trend)} trend.
        </p>
        <div className="decision-grid">
          <DecisionCard
            label="Vattenläge"
            title={item.seasonalSummary.label}
            body={`${formatFlow(hydrology.currentFlow)} · ${item.conditions.waterColor}. ${item.seasonalSummary.detail}`}
          />
          <DecisionCard
            label="Trend och prognos"
            title={item.forecastSummary.label}
            body={`${getTrendLabel(hydrology.trend)} just nu. ${item.forecastSummary.detail}`}
          />
          <DecisionCard
            label="Väder"
            title={`${item.conditions.weather} · ${weather.tempC ?? '?'} °C`}
            body={`Regn nu: ${weather.precipitationAmountMmPerH ?? 0} mm/h. Molnighet: ${weather.cloudCoverPercent ?? '?'} %.`}
          />
        </div>
        <div className="tactic-card">
          <span>Fisketaktik</span>
          <strong>{item.tacticHint}</strong>
        </div>
        <ul className="reason-list">
          {item.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="detail-meta">
          <span>{formatSeasonalComparison(hydrology)}</span>
          <span>{hydrology.source || 'SMHI Hydrologiskt nuläge'}</span>
          {item.riskFlags.length > 0 && <span>Obs: {item.riskFlags.join(', ')}</span>}
        </div>
      </div>
      <aside className="fly-panel">
        <p className="eyebrow">Flugor att börja med</p>
        {item.recommendations.map((fly) => (
          <article key={fly.name} className="fly-card">
            <div>
              <h3>{fly.name}</h3>
              <p>{fly.note}</p>
            </div>
            <span>{fly.colors.join(' / ')}</span>
          </article>
        ))}
      </aside>
    </section>
  )
}

function DecisionCard({ label, title, body }) {
  return (
    <article className="decision-card">
      <span>{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
  )
}

export default App
