import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PlecoLookupButton from '../components/PlecoLookupButton'
import { DECK_FILTER_UNASSIGNED, getDeck, getDueCards, getNewCards, logReview, updateCard } from '../lib/db'
import { convertNumberedPinyin } from '../lib/pinyin'
import { calculateNextReview, previewIntervals, formatInterval } from '../lib/srs'

export default function ReviewPage({ onRefresh }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 })
  const [loading, setLoading] = useState(true)
  const [finished, setFinished] = useState(false)
  const [deckLabel, setDeckLabel] = useState('')

  const deckParam = searchParams.get('deck')
  const parsedDeckId = deckParam && deckParam !== DECK_FILTER_UNASSIGNED
    ? Number(deckParam)
    : null
  const deckFilter = deckParam === DECK_FILTER_UNASSIGNED
    ? DECK_FILTER_UNASSIGNED
    : Number.isFinite(parsedDeckId)
      ? parsedDeckId
      : null

  // Load review queue
  useEffect(() => {
    async function loadQueue() {
      const [due, newCards, deck] = await Promise.all([
        getDueCards(deckFilter),
        getNewCards(deckFilter, 10),
        deckFilter && deckFilter !== DECK_FILTER_UNASSIGNED ? getDeck(deckFilter) : Promise.resolve(null)
      ])

      if (deckFilter === DECK_FILTER_UNASSIGNED) {
        setDeckLabel('Standalone Cards')
      } else if (deck) {
        setDeckLabel(deck.name)
      } else {
        setDeckLabel('')
      }

      // Combine: due cards first, then some new cards
      const combined = [...due]
      for (const nc of newCards) {
        if (!combined.find(c => c.id === nc.id)) {
          combined.push(nc)
        }
      }

      setQueue(combined)
      setLoading(false)

      if (combined.length === 0) {
        setFinished(true)
      }
    }
    loadQueue()
  }, [deckFilter])

  const currentCard = queue[currentIndex]

  const handleFlip = useCallback(() => {
    setFlipped(true)
  }, [])

  const handleRate = useCallback(async (rating) => {
    if (!currentCard) return

    // Calculate new SRS values
    const updates = calculateNextReview(currentCard, rating)

    // Update card in DB
    await updateCard(currentCard.id, updates)
    await logReview(currentCard.id, rating, updates.interval)

    // Update session stats
    setSessionStats(prev => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (rating >= 2 ? 1 : 0)
    }))

    // If "Again", re-add card to end of queue
    if (rating === 0) {
      setQueue(prev => [...prev, { ...currentCard, ...updates }])
    }

    // Move to next card
    if (currentIndex + 1 < queue.length) {
      setCurrentIndex(prev => prev + 1)
      setFlipped(false)
    } else {
      setFinished(true)
      onRefresh()
    }
  }, [currentCard, currentIndex, queue.length, onRefresh])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (!currentCard) return
      if (!flipped) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          handleFlip()
        }
      } else {
        if (e.key === '1') handleRate(0)
        if (e.key === '2') handleRate(1)
        if (e.key === '3') handleRate(2)
        if (e.key === '4') handleRate(3)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [flipped, currentCard, handleRate, handleFlip])

  if (loading) {
    return <div className="page flex items-center justify-center"><p className="text-secondary">Loading cards...</p></div>
  }

  if (finished) {
    return (
      <div className="page">
        <div className="empty-state fade-in" style={{ marginTop: 40 }}>
          <div className="emoji">🎉</div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Session Complete!</h2>
          <p className="text-secondary" style={{ fontSize: 16 }}>
            You reviewed {sessionStats.reviewed} cards
            {sessionStats.reviewed > 0 && (
              <> — {Math.round(sessionStats.correct / sessionStats.reviewed * 100)}% correct</>
            )}
          </p>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary" onClick={() => navigate('/')}>Home</button>
            <button className="btn btn-secondary" onClick={() => navigate('/write')}>Practice Writing</button>
          </div>
        </div>
      </div>
    )
  }

  const intervals = currentCard ? previewIntervals(currentCard) : {}

  return (
    <div className="page flex flex-col" style={{ height: '100%', paddingBottom: 80 }}>
      {deckLabel && (
        <div className="page-subtitle-chip" style={{ marginBottom: 12 }}>
          Reviewing {deckLabel}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          flex: 1,
          height: 4,
          background: 'var(--bg-elevated)',
          borderRadius: 2,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${(currentIndex / queue.length) * 100}%`,
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'width 0.3s ease'
          }} />
        </div>
        <span className="text-muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
          {currentIndex + 1} / {queue.length}
        </span>
      </div>

      {/* Card */}
      <div
        className="card fade-in"
        key={currentCard?.id + '-' + currentIndex}
        onClick={!flipped ? handleFlip : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: flipped ? 'default' : 'pointer',
          minHeight: 300,
          textAlign: 'center',
          gap: 16
        }}
      >
        {/* Front: character */}
        <div className="char-display char-xl">{currentCard?.character}</div>

        {!flipped && (
          <p className="text-muted" style={{ fontSize: 14 }}>Tap to reveal</p>
        )}

        {/* Back: pinyin + meaning + examples */}
        {flipped && (
          <div className="slide-up" style={{ width: '100%' }}>
            <div style={{ fontSize: 24, color: 'var(--accent)', marginBottom: 4 }}>
              {convertNumberedPinyin(currentCard?.pinyin)}
            </div>
            <div style={{
              fontSize: 16,
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              marginBottom: 16,
              maxHeight: 160,
              overflowY: 'auto',
              textAlign: 'left',
              width: '100%'
            }}>
              {currentCard?.meaning}
            </div>

            <PlecoLookupButton character={currentCard?.character} />

            {currentCard?.examples?.length > 0 && (
              <div style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
                textAlign: 'left'
              }}>
                {currentCard.examples.map((ex, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="char-display" style={{ fontSize: 16 }}>{ex.zh}</div>
                    <div className="text-secondary" style={{ fontSize: 14 }}>{ex.en}</div>
                  </div>
                ))}
              </div>
            )}

            {currentCard?.notes && (
              <div style={{
                marginTop: 8,
                fontSize: 14,
                color: 'var(--text-muted)',
                fontStyle: 'italic'
              }}>
                {currentCard.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="rating-buttons slide-up" style={{ marginTop: 16 }}>
          <button className="rating-btn again" onClick={() => handleRate(0)}>
            Again
            <span className="interval">{formatInterval(intervals.again)}</span>
          </button>
          <button className="rating-btn hard" onClick={() => handleRate(1)}>
            Hard
            <span className="interval">{formatInterval(intervals.hard)}</span>
          </button>
          <button className="rating-btn good" onClick={() => handleRate(2)}>
            Good
            <span className="interval">{formatInterval(intervals.good)}</span>
          </button>
          <button className="rating-btn easy" onClick={() => handleRate(3)}>
            Easy
            <span className="interval">{formatInterval(intervals.easy)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
