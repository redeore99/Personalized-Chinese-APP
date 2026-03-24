import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStats, db } from '../lib/db'

export default function HomePage({ stats, onRefresh }) {
  const navigate = useNavigate()
  const [recentReviews, setRecentReviews] = useState(0)

  useEffect(() => {
    onRefresh()

    // Count today's reviews
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    db.reviewLog
      .where('reviewedAt')
      .aboveOrEqual(todayStart.toISOString())
      .count()
      .then(setRecentReviews)
  }, [])

  return (
    <div className="page">
      <div className="text-center mt-2">
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>汉字学习</h1>
        <p className="text-secondary mt-1">Your Chinese study session</p>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginTop: 24
      }}>
        <StatCard
          label="Due Now"
          value={stats.dueCount || 0}
          color="var(--accent)"
          onClick={() => stats.dueCount > 0 && navigate('/review')}
        />
        <StatCard
          label="Reviewed Today"
          value={recentReviews}
          color="var(--success)"
        />
        <StatCard
          label="Known Words"
          value={stats.knownCards || 0}
          color="#3b82f6"
        />
        <StatCard
          label="Total Cards"
          value={stats.totalCards || 0}
          color="var(--text-secondary)"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-2 mt-3">
        {stats.dueCount > 0 ? (
          <button
            className="btn btn-primary btn-block"
            onClick={() => navigate('/review')}
            style={{ padding: '16px 24px', fontSize: 18 }}
          >
            Start Review ({stats.dueCount} cards)
          </button>
        ) : stats.totalCards > 0 ? (
          <div className="card text-center" style={{ padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>All caught up!</h3>
            <p className="text-secondary mt-1">No cards due for review right now.</p>
          </div>
        ) : null}

        <button
          className="btn btn-secondary btn-block"
          onClick={() => navigate('/write')}
        >
          Writing Practice
        </button>

        <button
          className="btn btn-secondary btn-block"
          onClick={() => navigate('/add')}
        >
          Add New Words
        </button>
      </div>

      {/* Empty state for new users */}
      {stats.totalCards === 0 && (
        <div className="empty-state mt-3 fade-in">
          <div className="emoji">📝</div>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>No cards yet</h3>
          <p className="text-secondary">
            Start by adding some characters you want to study.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/add')}
          >
            Add Your First Card
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, onClick }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'center',
        padding: '16px 12px'
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
      <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  )
}
