import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DECK_FILTER_UNASSIGNED, getDecksWithCounts, getStandaloneCardSummary, getStudyActivity } from '../lib/db'
import { getHabitSummary, SESSION_NEW_CARD_COUNT } from '../lib/habits'
import { getTodaysPick } from '../data/videos'
import { convertNumberedPinyin } from '../lib/pinyin'

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
  const [habit, setHabit] = useState(null)
  const [loading, setLoading] = useState(true)
  const todaysPick = getTodaysPick()

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

  // Habit summary depends on today's counts from stats
  useEffect(() => {
    let cancelled = false

    getHabitSummary({
      todayReviews: stats.todayReviews || 0,
      todayWriting: stats.todayWritingCount || 0
    }).then(summary => {
      if (!cancelled) setHabit(summary)
    })

    return () => {
      cancelled = true
    }
  }, [stats.todayReviews, stats.todayWritingCount])

  const dueNow = stats.dueCount || 0
  const goal = habit?.goal ?? 20
  const remainingForGoal = habit ? habit.reviewsRemaining : goal
  const sessionReviewCount = Math.min(remainingForGoal > 0 ? remainingForGoal : 5, dueNow)
  const reviewStepDone = Boolean(habit?.goalReached) || dueNow === 0
  const goalProgress = Math.min(100, Math.round(((stats.todayReviews || 0) / goal) * 100))

  return (
    <div className="page">
      <div className="dashboard-hero">
        <div className="dashboard-hero-badge">Study Dashboard</div>
        <h1 className="dashboard-hero-title">汉字学习</h1>
        <p className="dashboard-hero-copy">
          A little every day beats a lot once a month.
        </p>
      </div>

      {/* Today's Session — the one-tap daily habit */}
      <section className="card session-card">
        <div className="session-head">
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Today&apos;s Session</h3>
            <div className="text-secondary" style={{ fontSize: 13 }}>
              {habit?.goalReached
                ? 'Goal reached — anything more is a bonus.'
                : `Goal: ${habit?.goal ?? 20} reviews · ~10 minutes`}
            </div>
          </div>
          <div className={`streak-pill ${habit?.studiedToday ? 'streak-alive' : ''}`}>
            <span className="streak-flame">🔥</span>
            <span className="streak-count">{habit?.streak ?? 0}</span>
            <span className="streak-label">day{(habit?.streak ?? 0) === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="goal-bar">
          <div className="goal-bar-fill" style={{ width: `${goalProgress}%` }} />
        </div>
        <div className="goal-bar-caption text-muted">
          {stats.todayReviews || 0} / {habit?.goal ?? 20} reviews today
          {!habit?.studiedToday && (habit?.streak ?? 0) > 0 && ' · study today to keep the streak'}
        </div>

        <div className="session-steps">
          <button
            className={`session-step ${reviewStepDone ? 'done' : ''}`}
            onClick={() => navigate(`/review?limit=${Math.max(sessionReviewCount, 5)}`)}
          >
            <span className="session-step-check">{reviewStepDone ? '✓' : '1'}</span>
            <span className="session-step-copy">
              <strong>{reviewStepDone ? 'Reviews done' : `Review ${sessionReviewCount || 5} cards`}</strong>
              <span>{dueNow} due · up to {SESSION_NEW_CARD_COUNT} new words mixed in</span>
            </span>
          </button>

          <button
            className={`session-step ${habit?.wroteToday ? 'done' : ''}`}
            onClick={() => navigate('/write')}
          >
            <span className="session-step-check">{habit?.wroteToday ? '✓' : '2'}</span>
            <span className="session-step-copy">
              <strong>Write a few characters</strong>
              <span>Stroke practice keeps reading sharp</span>
            </span>
          </button>

          <button
            className={`session-step ${habit?.watchedToday ? 'done' : ''}`}
            onClick={() => navigate('/watch')}
          >
            <span className="session-step-check">{habit?.watchedToday ? '✓' : '3'}</span>
            <span className="session-step-copy">
              <strong>Watch: {todaysPick ? todaysPick.title : 'today’s pick'}</strong>
              <span>{todaysPick ? todaysPick.channel : 'Curated videos'}</span>
            </span>
          </button>
        </div>

        {habit?.week && (
          <div className="week-strip">
            {habit.week.map(day => (
              <div key={day.key} className={`week-dot ${day.studied ? 'studied' : ''} ${day.isToday ? 'today' : ''}`}>
                <span>{day.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="stats-grid stats-grid-three">
        <StatCard label="Due Now" value={stats.dueCount || 0} accent="var(--accent)" />
        <StatCard label="Reviewed Today" value={stats.todayReviews || 0} accent="var(--success)" />
        <StatCard label="Writing Today" value={stats.todayWritingCount || 0} accent="#38bdf8" />
        <StatCard label="Decks" value={stats.deckCount || 0} />
        <StatCard label="Standalone" value={stats.unassignedCount || 0} accent="#f59e0b" />
        <StatCard label="Total Cards" value={stats.totalCards || 0} />
      </div>

      <div className="quick-actions-grid">
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/cards')} style={{ padding: '16px 20px' }}>
          Browse Cards
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/add')} style={{ padding: '16px 20px' }}>
          Add New Card
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/article')} style={{ padding: '16px 20px' }}>
          Article Mode
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/watch')} style={{ padding: '16px 20px' }}>
          Watch
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
                      {convertNumberedPinyin(item.pinyin) || 'No pinyin'}{item.meaning ? ` · ${item.meaning}` : ''}
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
              <p className="text-secondary">Import HSK 5, Economics, or Radicals from the Decks tab.</p>
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
