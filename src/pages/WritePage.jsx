import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import HanziWriter from 'hanzi-writer'
import { getDueCards, getAllCards, updateCard, logWriting } from '../lib/db'
import { calculateNextReview, formatInterval } from '../lib/srs'

export default function WritePage({ onRefresh }) {
  const navigate = useNavigate()
  const writerRef = useRef(null)
  const containerRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [mode, setMode] = useState('quiz') // 'quiz' | 'reveal' | 'result'
  const [quizResult, setQuizResult] = useState(null)
  const [mistakes, setMistakes] = useState(0)
  const [totalStrokes, setTotalStrokes] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [loading, setLoading] = useState(true)
  const [finished, setFinished] = useState(false)
  const [sessionStats, setSessionStats] = useState({ practiced: 0, perfect: 0 })

  // Load writing queue
  useEffect(() => {
    async function loadQueue() {
      // Get due cards, or if none due, get some random cards
      let cards = await getDueCards()
      if (cards.length === 0) {
        cards = await getAllCards()
        // Shuffle
        cards.sort(() => Math.random() - 0.5)
      }
      // Only take single-character entries for writing practice
      cards = cards.filter(c => c.character.length === 1 || c.character.length === 2)
      setQueue(cards.slice(0, 20))
      setLoading(false)
      if (cards.length === 0) setFinished(true)
    }
    loadQueue()
  }, [])

  const currentCard = queue[currentIndex]

  // Initialize HanziWriter
  const initWriter = useCallback((card) => {
    if (!containerRef.current || !card) return

    // Clear previous
    containerRef.current.innerHTML = ''
    writerRef.current = null

    // Get container size
    const size = Math.min(containerRef.current.offsetWidth, 300)

    // For multi-char words, only practice the first character
    const char = card.character[0]

    try {
      const writer = HanziWriter.create(containerRef.current, char, {
        width: size,
        height: size,
        padding: 20,
        showOutline: false,
        showCharacter: false,
        strokeColor: '#f1f5f9',
        drawingColor: '#dc2626',
        outlineColor: '#334155',
        highlightColor: '#ef4444',
        drawingWidth: 6,
        strokeAnimationSpeed: 1.5,
        delayBetweenStrokes: 80,
        radicalColor: '#64748b',
        highlightOnComplete: true,
        showHintAfterMisses: 3,
        markStrokeColor: '#dc2626'
      })

      writerRef.current = writer
      setMistakes(0)
      setTotalStrokes(0)
      setMode('quiz')
      setShowHint(false)
      setQuizResult(null)

      // Start quiz mode
      writer.quiz({
        onMistake: (strokeData) => {
          setMistakes(prev => prev + 1)
        },
        onCorrectStroke: (strokeData) => {
          setTotalStrokes(prev => prev + 1)
        },
        onComplete: (summaryData) => {
          const totalMistakes = summaryData.totalMistakes || 0
          const numStrokes = summaryData.character?.strokes?.length || totalStrokes + 1
          const score = Math.max(0, 1 - (totalMistakes / (numStrokes * 2)))

          setQuizResult({
            score,
            mistakes: totalMistakes,
            strokes: numStrokes
          })
          setMode('result')
        }
      })
    } catch (err) {
      console.error('HanziWriter error:', err)
    }
  }, [totalStrokes])

  useEffect(() => {
    if (currentCard && !loading) {
      initWriter(currentCard)
    }
  }, [currentCard, loading, initWriter])

  const handleShowAnimation = () => {
    if (writerRef.current) {
      writerRef.current.showCharacter()
      writerRef.current.animateCharacter()
      setMode('reveal')
    }
  }

  const handleRetry = () => {
    initWriter(currentCard)
  }

  const handleNext = async (ratingOverride = null) => {
    if (!currentCard) return

    // Log writing practice
    const score = quizResult?.score || 0
    await logWriting(currentCard.id, score, quizResult?.strokes || 0)

    // Update card writing stats
    await updateCard(currentCard.id, {
      writingScore: score,
      writingCount: (currentCard.writingCount || 0) + 1
    })

    // If a rating is provided, also do an SRS update
    if (ratingOverride !== null) {
      const updates = calculateNextReview(currentCard, ratingOverride, score)
      await updateCard(currentCard.id, updates)
    }

    setSessionStats(prev => ({
      practiced: prev.practiced + 1,
      perfect: prev.perfect + (score >= 0.9 ? 1 : 0)
    }))

    if (currentIndex + 1 < queue.length) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setFinished(true)
      onRefresh()
    }
  }

  const handleHint = () => {
    if (writerRef.current) {
      writerRef.current.showOutline()
      setShowHint(true)
    }
  }

  if (loading) {
    return <div className="page flex items-center justify-center"><p className="text-secondary">Loading...</p></div>
  }

  if (finished) {
    return (
      <div className="page">
        <div className="empty-state fade-in" style={{ marginTop: 40 }}>
          <div className="emoji">✍️</div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Writing Session Done!</h2>
          <p className="text-secondary" style={{ fontSize: 16 }}>
            Practiced {sessionStats.practiced} characters
            {sessionStats.practiced > 0 && (
              <> — {sessionStats.perfect} perfect</>
            )}
          </p>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary" onClick={() => navigate('/')}>Home</button>
            <button className="btn btn-secondary" onClick={() => navigate('/review')}>Review Cards</button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentCard) return null

  return (
    <div className="page flex flex-col" style={{ paddingBottom: 80 }}>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${(currentIndex / queue.length) * 100}%`,
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'width 0.3s ease'
          }} />
        </div>
        <span className="text-muted" style={{ fontSize: 13 }}>
          {currentIndex + 1} / {queue.length}
        </span>
      </div>

      {/* Prompt: what to write */}
      <div className="text-center" style={{ marginBottom: 16 }}>
        <div className="text-secondary" style={{ fontSize: 14, marginBottom: 4 }}>Write this character:</div>
        <div style={{ fontSize: 20, color: 'var(--accent)' }}>{currentCard.pinyin}</div>
        <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>{currentCard.meaning}</div>
      </div>

      {/* Writing canvas */}
      <div className="writing-canvas-container">
        {/* Grid lines */}
        <svg className="writing-grid" viewBox="0 0 300 300">
          <line x1="150" y1="0" x2="150" y2="300" />
          <line x1="0" y1="150" x2="300" y2="150" />
          <line x1="0" y1="0" x2="300" y2="300" />
          <line x1="300" y1="0" x2="0" y2="300" />
        </svg>
        <div ref={containerRef} style={{ position: 'relative', zIndex: 1 }} />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-1 mt-2" style={{ alignItems: 'center' }}>
        {mode === 'quiz' && (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={handleHint}>
              {showHint ? 'Hint shown' : 'Show outline'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleShowAnimation}>
              Show answer
            </button>
          </div>
        )}

        {mode === 'reveal' && (
          <div className="flex gap-2 mt-1">
            <button className="btn btn-secondary" onClick={handleRetry}>
              Try again
            </button>
            <button className="btn btn-primary" onClick={() => handleNext(0)}>
              Next (forgot)
            </button>
          </div>
        )}

        {mode === 'result' && quizResult && (
          <div className="fade-in text-center" style={{ width: '100%' }}>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: quizResult.score >= 0.9 ? 'var(--success)' :
                     quizResult.score >= 0.5 ? 'var(--warning)' : 'var(--error)',
              marginBottom: 8
            }}>
              {quizResult.score >= 0.9 ? 'Perfect!' :
               quizResult.score >= 0.5 ? 'Good effort!' : 'Keep practicing!'}
              {quizResult.mistakes > 0 && (
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  {quizResult.mistakes} mistake{quizResult.mistakes !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex gap-2" style={{ justifyContent: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={handleRetry}>
                Retry
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleShowAnimation}>
                Animate
              </button>
            </div>

            {/* SRS rating after writing */}
            <div style={{ marginTop: 12 }}>
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Rate your recall:</div>
              <div className="rating-buttons">
                <button className="rating-btn again" onClick={() => handleNext(0)}>Again</button>
                <button className="rating-btn hard" onClick={() => handleNext(1)}>Hard</button>
                <button className="rating-btn good" onClick={() => handleNext(2)}>Good</button>
                <button className="rating-btn easy" onClick={() => handleNext(3)}>Easy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
