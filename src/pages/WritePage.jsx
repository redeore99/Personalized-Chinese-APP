import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import HanziWriter from 'hanzi-writer'
import { getDueCards, getAllCards, updateCard, logWriting } from '../lib/db'
import { calculateNextReview } from '../lib/srs'

export default function WritePage({ onRefresh }) {
  const navigate = useNavigate()
  const writerRef = useRef(null)
  const containerRef = useRef(null)
  const charCompleteRef = useRef(null)

  // Queue & navigation
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Multi-character tracking
  const [charIndex, setCharIndex] = useState(0) // which char in current word
  const [charStatuses, setCharStatuses] = useState([]) // 'pending' | 'active' | 'done' per char

  // Stroke-level progress
  const [strokesDone, setStrokesDone] = useState(0)
  const [totalStrokes, setTotalStrokes] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [totalMistakesWord, setTotalMistakesWord] = useState(0)
  const [totalStrokesWord, setTotalStrokesWord] = useState(0)

  // UI state
  const [mode, setMode] = useState('writing') // 'writing' | 'char-complete' | 'word-complete' | 'result'
  const [showHint, setShowHint] = useState(false)
  const [loading, setLoading] = useState(true)
  const [finished, setFinished] = useState(false)
  const [sessionStats, setSessionStats] = useState({ practiced: 0, perfect: 0 })
  const [wordScore, setWordScore] = useState(0)
  const [charCompleteFlash, setCharCompleteFlash] = useState(false)

  // Load writing queue
  useEffect(() => {
    async function loadQueue() {
      let cards = await getDueCards()
      if (cards.length === 0) {
        cards = await getAllCards()
        cards.sort(() => Math.random() - 0.5)
      }
      // Allow up to 4-char words (most HSK vocabulary)
      cards = cards.filter(c => c.character.length >= 1 && c.character.length <= 4)
      setQueue(cards.slice(0, 20))
      setLoading(false)
      if (cards.length === 0) setFinished(true)
    }
    loadQueue()
  }, [])

  const currentCard = queue[currentIndex]

  // Initialize character statuses when card changes
  useEffect(() => {
    if (currentCard) {
      const chars = Array.from(currentCard.character)
      setCharStatuses(chars.map((_, i) => i === 0 ? 'active' : 'pending'))
      setCharIndex(0)
      setTotalMistakesWord(0)
      setTotalStrokesWord(0)
      setWordScore(0)
      setMode('writing')
    }
  }, [currentCard])

  // Get container size, responsive
  const getCanvasSize = useCallback(() => {
    if (!containerRef.current) return 280
    return Math.min(containerRef.current.offsetWidth, 280)
  }, [])

  // Initialize HanziWriter for a specific character
  const initWriter = useCallback((char, charIdx) => {
    if (!containerRef.current || !char) return

    containerRef.current.innerHTML = ''
    writerRef.current = null

    const size = getCanvasSize()

    try {
      const writer = HanziWriter.create(containerRef.current, char, {
        width: size,
        height: size,
        padding: 15,
        renderer: 'svg',
        // Don't show the character or outline initially — user draws blind
        showOutline: false,
        showCharacter: false,
        // Colors tuned for dark theme
        strokeColor: '#e2e8f0',       // Clean white for completed strokes
        drawingColor: '#f87171',      // Soft red while drawing
        outlineColor: '#475569',      // Subtle outline when shown as hint
        highlightColor: '#fbbf24',    // Amber for hints
        highlightCompleteColor: '#22c55e', // Green flash on completion
        // Drawing feel — thicker for touch, fast feedback
        drawingWidth: 8,
        strokeWidth: 2,
        outlineWidth: 2,
        drawingFadeDuration: 200,     // Fast fade after stroke recognition
        strokeFadeDuration: 300,      // Clean stroke appears quickly
        strokeAnimationSpeed: 2,      // Fast animation
        delayBetweenStrokes: 60,
        // Leniency — slightly forgiving for mobile touch
        highlightOnComplete: true
      })

      writerRef.current = writer
      setStrokesDone(0)
      setMistakes(0)
      setShowHint(false)
      setMode('writing')

      // Load character data to get stroke count
      HanziWriter.loadCharacterData(char).then(data => {
        setTotalStrokes(data.strokes.length)
      }).catch(() => setTotalStrokes(0))

      // Start quiz
      writer.quiz({
        leniency: 1.2,               // Slightly forgiving
        showHintAfterMisses: 3,       // Show hint after 3 mistakes on same stroke
        markStrokeCorrectAfterMisses: 6, // Auto-accept after 6 fails (like Hello Chinese)
        highlightOnComplete: true,
        acceptBackwardsStrokes: true,  // Accept reverse direction strokes
        onMistake: (strokeData) => {
          setMistakes(strokeData.totalMistakes)
        },
        onCorrectStroke: (strokeData) => {
          setStrokesDone(strokeData.strokeNum + 1)
          setMistakes(strokeData.totalMistakes)
        },
        onComplete: (summaryData) => {
          const mistakesOnChar = summaryData.totalMistakes || 0
          setTotalMistakesWord(prev => prev + mistakesOnChar)
          charCompleteRef.current?.(charIdx, mistakesOnChar)
        }
      })
    } catch (err) {
      console.error('HanziWriter error:', err)
      // If character not found, skip it
      charCompleteRef.current?.(charIdx, 0)
    }
  }, [getCanvasSize])

  // Called when a single character is completed
  const handleCharComplete = useCallback((completedCharIdx, mistakesOnChar) => {
    if (!currentCard) return

    const chars = Array.from(currentCard.character)
    const nextCharIdx = completedCharIdx + 1

    // Accumulate strokes for the whole word
    setTotalStrokesWord(prev => prev + totalStrokes)

    // Update statuses
    setCharStatuses(prev => prev.map((s, i) => {
      if (i === completedCharIdx) return 'done'
      if (i === nextCharIdx) return 'active'
      return s
    }))

    if (nextCharIdx < chars.length) {
      // Flash the completed character briefly, then move to next
      setCharCompleteFlash(true)
      setMode('char-complete')
      setTimeout(() => {
        setCharCompleteFlash(false)
        setCharIndex(nextCharIdx)
        setMode('writing')
      }, 600)
    } else {
      // All characters done — show result
      const finalMistakes = totalMistakesWord + mistakesOnChar
      const finalStrokes = totalStrokesWord + totalStrokes
      const score = finalStrokes > 0
        ? Math.max(0, 1 - (finalMistakes / (finalStrokes * 2)))
        : 0
      setWordScore(score)
      setMode('result')
    }
  }, [currentCard, totalMistakesWord, totalStrokes, totalStrokesWord])

  // Keep ref in sync so initWriter callbacks always have latest version
  charCompleteRef.current = handleCharComplete

  // Init writer when charIndex or currentCard changes
  // Using a key that only changes when we actually need to reinitialize
  const writerKey = currentCard ? `${currentCard.id}-${charIndex}` : null
  useEffect(() => {
    if (currentCard && !loading) {
      const chars = Array.from(currentCard.character)
      if (charIndex < chars.length) {
        initWriter(chars[charIndex], charIndex)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writerKey, loading])

  const handleShowHint = () => {
    if (writerRef.current && !showHint) {
      writerRef.current.showOutline()
      setShowHint(true)
    }
  }

  const handleShowAnswer = () => {
    if (writerRef.current) {
      writerRef.current.cancelQuiz()
      writerRef.current.showCharacter()
      writerRef.current.animateCharacter()
      // Count this as a fail for the word
      setTotalMistakesWord(prev => prev + 10)
      setMode('revealed')
    }
  }

  const handleAnimateStroke = () => {
    if (writerRef.current) {
      writerRef.current.animateCharacter()
    }
  }

  const handleRetryChar = () => {
    if (currentCard) {
      const chars = Array.from(currentCard.character)
      initWriter(chars[charIndex], charIndex)
    }
  }

  const handleRetryWord = () => {
    if (currentCard) {
      setCharIndex(0)
      setTotalMistakesWord(0)
      setTotalStrokesWord(0)
      const chars = Array.from(currentCard.character)
      setCharStatuses(chars.map((_, i) => i === 0 ? 'active' : 'pending'))
      setMode('writing')
    }
  }

  const handleNext = async (rating) => {
    if (!currentCard) return

    const score = wordScore
    await logWriting(currentCard.id, score, totalStrokes)
    await updateCard(currentCard.id, {
      writingScore: score,
      writingCount: (currentCard.writingCount || 0) + 1
    })

    if (rating !== null && rating !== undefined) {
      const updates = calculateNextReview(currentCard, rating, score)
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

  // After revealing answer, move to next char or show result
  const handleAfterReveal = () => {
    if (!currentCard) return
    const chars = Array.from(currentCard.character)
    const nextCharIdx = charIndex + 1

    setCharStatuses(prev => prev.map((s, i) => {
      if (i === charIndex) return 'done'
      if (i === nextCharIdx) return 'active'
      return s
    }))

    if (nextCharIdx < chars.length) {
      setCharIndex(nextCharIdx)
      setMode('writing')
    } else {
      setWordScore(0) // failed since we revealed
      setMode('result')
    }
  }

  if (loading) {
    return (
      <div className="page flex items-center justify-center">
        <p className="text-secondary">Loading...</p>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="page">
        <div className="empty-state fade-in" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 48 }}>&#x270D;&#xFE0F;</div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Session Complete</h2>
          <p className="text-secondary" style={{ fontSize: 16, lineHeight: 1.5 }}>
            {sessionStats.practiced} word{sessionStats.practiced !== 1 ? 's' : ''} practiced
            {sessionStats.perfect > 0 && (
              <span style={{ color: 'var(--success)' }}> &mdash; {sessionStats.perfect} perfect</span>
            )}
          </p>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary" onClick={() => navigate('/')}>Home</button>
            <button className="btn btn-secondary" onClick={() => navigate('/review')}>Review</button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentCard) return null

  const chars = Array.from(currentCard.character)
  const isMultiChar = chars.length > 1
  const strokeProgress = totalStrokes > 0 ? (strokesDone / totalStrokes) : 0

  return (
    <div className="page write-page">
      {/* Progress bar */}
      <div className="write-progress-bar">
        <div className="write-progress-fill" style={{ '--progress': `${(currentIndex / queue.length) * 100}%` }} />
        <span className="write-progress-text">{currentIndex + 1}/{queue.length}</span>
      </div>

      {/* Prompt */}
      <div className="write-prompt">
        <div className="write-prompt-label">Write this word</div>
        <div className="write-prompt-pinyin">{currentCard.pinyin}</div>
        <div className="write-prompt-meaning">{currentCard.meaning}</div>
      </div>

      {/* Character slots — shows which character you're on */}
      {isMultiChar && (
        <div className="write-char-slots">
          {chars.map((ch, i) => (
            <div
              key={i}
              className={`write-char-slot ${charStatuses[i] || 'pending'} ${charCompleteFlash && charStatuses[i] === 'done' && i === charIndex ? 'flash' : ''}`}
            >
              {charStatuses[i] === 'done' ? (
                <span className="write-char-slot-char">{ch}</span>
              ) : charStatuses[i] === 'active' ? (
                <span className="write-char-slot-active">?</span>
              ) : (
                <span className="write-char-slot-pending">&middot;</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div className="write-canvas-wrap">
        <div className="write-canvas-outer">
          {/* Grid */}
          <svg className="write-grid" viewBox="0 0 280 280" preserveAspectRatio="xMidYMid meet">
            <line x1="140" y1="0" x2="140" y2="280" />
            <line x1="0" y1="140" x2="280" y2="140" />
            <line x1="0" y1="0" x2="280" y2="280" />
            <line x1="280" y1="0" x2="0" y2="280" />
          </svg>
          <div ref={containerRef} className="write-canvas-inner" />
        </div>

        {/* Stroke counter */}
        {mode === 'writing' && totalStrokes > 0 && (
          <div className="write-stroke-counter">
            <div className="write-stroke-counter-bar">
              <div
                className="write-stroke-counter-fill"
                style={{ width: `${strokeProgress * 100}%` }}
              />
            </div>
            <span className="write-stroke-counter-text">
              {strokesDone}/{totalStrokes}
              {mistakes > 0 && (
                <span className="write-stroke-mistakes"> ({mistakes} miss{mistakes !== 1 ? 'es' : ''})</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="write-controls">
        {mode === 'writing' && (
          <div className="write-controls-row">
            <button className="btn btn-ghost btn-sm" onClick={handleShowHint} disabled={showHint}>
              {showHint ? 'Outline shown' : 'Show outline'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleShowAnswer}>
              Give up
            </button>
          </div>
        )}

        {mode === 'char-complete' && (
          <div className="write-controls-row fade-in">
            <span className="text-success" style={{ fontWeight: 600, fontSize: 15 }}>
              Stroke complete &mdash; next character...
            </span>
          </div>
        )}

        {mode === 'revealed' && (
          <div className="write-controls-row fade-in">
            <button className="btn btn-secondary btn-sm" onClick={handleRetryChar}>
              Retry this character
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAfterReveal}>
              Continue
            </button>
          </div>
        )}

        {mode === 'result' && (
          <div className="write-result fade-in">
            {/* Score display */}
            <div className="write-result-header">
              <span className={`write-result-score ${
                wordScore >= 0.9 ? 'perfect' : wordScore >= 0.5 ? 'good' : 'poor'
              }`}>
                {wordScore >= 0.9 ? 'Perfect!' :
                 wordScore >= 0.5 ? 'Good effort' : 'Keep practicing'}
              </span>
              {totalMistakesWord > 0 && (
                <span className="write-result-mistakes">
                  {totalMistakesWord} mistake{totalMistakesWord !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Quick actions */}
            <div className="write-controls-row" style={{ marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={handleRetryWord}>
                Retry word
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleAnimateStroke}>
                Animate
              </button>
            </div>

            {/* SRS rating */}
            <div className="write-srs-label">Rate your recall</div>
            <div className="rating-buttons">
              <button className="rating-btn again" onClick={() => handleNext(0)}>Again</button>
              <button className="rating-btn hard" onClick={() => handleNext(1)}>Hard</button>
              <button className="rating-btn good" onClick={() => handleNext(2)}>Good</button>
              <button className="rating-btn easy" onClick={() => handleNext(3)}>Easy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
