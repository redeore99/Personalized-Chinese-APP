import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DECK_FILTER_UNASSIGNED, getDecksWithCounts, getStandaloneCardSummary, getStudyActivity } from '../lib/db'

function formatRelativeTime(value) {
  if (!value) return 'Never'

  const diffMs = Date.now() - new Date(value).getTime()
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000))

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

function activityLabel(item) {
  return item.type === 'review' ? 'Review' : 'Writing'
}

export default function HomePage({ stats, onRefresh }) {
  const navigate = useNavigate()
  const [activity, setActivity] = useState([])
  const [deckFocus, setDeckFocus] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      onRefresh()

      const [recentActivity, decks, standalone] = await Promise.all([
        getStudyActivity(8),
        getDecksWithCounts(),
        getStandaloneCardSummary()
      ])

      if (cancelled) return

      const focusDecks = [...decks]
        .filter(deck => deck.cardCount > 0)
        .sort((left, right) => (
          right.dueCount - left.dueCount ||
          right.cardCount - left.cardCount ||
          left.name.localeCompare(right.name)
        ))

      if (standalone.cardCount > 0) {
        focusDecks.push(standalone)
      }

      setActivity(recentActivity)
      setDeckFocus(focusDecks.slice(0, 4))
      setLoading(false)
    }

    loadDashboard()

    return () => {
      cancelled = true
    }
  }, [onRefresh])

  return (
    <div className="page">
      <div className="dashboard-hero">
        <div className="dashboard-hero-badge">Study Dashboard</div>
        <h1 className="dashboard-hero-title">汉字学习</h1>
        <p className="dashboard-hero-copy">
          Track what is due, what you studied today, and where each card belongs.
        </p>
      </div>

      <div className="stats-grid stats-grid-three">
        <StatCard label="Due Now" value={stats.dueCount || 0} accent="var(--accent)" />
        <StatCard label="Reviewed Today" value={stats.todayReviews || 0} accent="var(--success)" />
        <StatCard label="Writing Today" value={stats.todayWritingCount || 0} accent="#38bdf8" />
        <StatCard label="Decks" value={stats.deckCount || 0} />
        <StatCard label="Standalone" value={stats.unassignedCount || 0} accent="#f59e0b" />
        <StatCard label="Total Cards" value={stats.totalCards || 0} />
      </div>

      <div className="quick-actions-grid">
        <button
          className={`btn btn-block ${stats.dueCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => navigate('/review')}
          style={{ padding: '16px 20px' }}
        >
          {stats.dueCount > 0 ? `Start Review (${stats.dueCount})` : 'Open Review'}
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/write')} style={{ padding: '16px 20px' }}>
          Writing Practice
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/cards')} style={{ padding: '16px 20px' }}>
          Browse Cards
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/add')} style={{ padding: '16px 20px' }}>
          Add New Card
        </button>
      </div>

      <div className="dashboard-sections">
        <section className="card dashboard-section">
          <div className="section-heading-row">
            <h3 className="section-heading">Recent Study Activity</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cards')}>
              Open library
            </button>
          </div>

          {loading ? (
            <p className="text-secondary">Loading activity...</p>
          ) : activity.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 12px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>No study activity yet</h3>
              <p className="text-secondary">
                Your reviews and writing practice will start appearing here.
              </p>
            </div>
          ) : (
            <div className="activity-list">
              {activity.map(item => (
                <div key={item.id} className="activity-row">
                  <div className={`activity-icon activity-${item.type}`}>
                    {item.type === 'review' ? 'R' : 'W'}
                  </div>
                  <div className="activity-copy">
                    <div className="activity-copy-top">
                      <span className="char-display" style={{ fontSize: 22 }}>{item.character}</span>
                      <span className={`badge badge-${item.type}`}>{activityLabel(item)}</span>
                    </div>
                    <div className="text-secondary" style={{ fontSize: 14 }}>
                      {item.pinyin || 'No pinyin'}{item.meaning ? ` · ${item.meaning}` : ''}
                    </div>
                    <div className="activity-meta">
                      <span>{item.deckName || 'Standalone'}</span>
                      <span>{item.label}</span>
                      <span>{item.detail}</span>
                      <span>{formatRelativeTime(item.performedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card dashboard-section">
          <div className="section-heading-row">
            <h3 className="section-heading">Deck Focus</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/decks')}>
              Manage decks
            </button>
          </div>

          {loading ? (
            <p className="text-secondary">Loading decks...</p>
          ) : deckFocus.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 12px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>No decks yet</h3>
              <p className="text-secondary">Import HSK 5 or create a custom deck to organize your cards.</p>
            </div>
          ) : (
            <div className="deck-focus-list">
              {deckFocus.map(deck => {
                const deckTarget = deck.standalone ? DECK_FILTER_UNASSIGNED : deck.id
                return (
                  <div key={deck.id} className="deck-focus-row">
                    <div>
                      <div className="deck-focus-title-row">
                        <h4 style={{ fontSize: 17, fontWeight: 600 }}>{deck.name}</h4>
                        <span className={`badge badge-${deck.kind || 'neutral'}`}>
                          {deck.kind || 'deck'}
                        </span>
                      </div>
                      <div className="text-secondary" style={{ fontSize: 14 }}>
                        {deck.description || `${deck.cardCount} cards organized here`}
                      </div>
                      <div className="deck-focus-meta">
                        <span>{deck.cardCount} cards</span>
                        <span>{deck.dueCount} due</span>
                        <span>{deck.newCount || 0} new</span>
                        <span>{deck.knownCount || 0} known</span>
                      </div>
                    </div>
                    <div className="deck-focus-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cards?deck=${deckTarget}`)}>
                        Browse
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/review?deck=${deckTarget}`)}>
                        Review
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent = 'var(--text-primary)' }) {
  return (
    <div className="card stat-card">
      <div style={{ fontSize: 32, fontWeight: 700, color: accent }}>{value}</div>
      <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  )
}
