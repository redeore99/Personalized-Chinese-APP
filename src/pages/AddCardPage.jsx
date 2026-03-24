import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addCard, db } from '../lib/db'

export default function AddCardPage({ onRefresh }) {
  const navigate = useNavigate()
  const charInputRef = useRef(null)

  const [character, setCharacter] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [meaning, setMeaning] = useState('')
  const [examples, setExamples] = useState([{ zh: '', en: '' }])
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [saved, setSaved] = useState(false)
  const [recentCards, setRecentCards] = useState([])

  // Focus character input on mount
  useEffect(() => {
    charInputRef.current?.focus()
    // Load recent cards
    db.cards.orderBy('createdAt').reverse().limit(10).toArray().then(setRecentCards)
  }, [])

  const handleAddExample = () => {
    setExamples(prev => [...prev, { zh: '', en: '' }])
  }

  const handleRemoveExample = (index) => {
    setExamples(prev => prev.filter((_, i) => i !== index))
  }

  const handleExampleChange = (index, field, value) => {
    setExamples(prev => prev.map((ex, i) => i === index ? { ...ex, [field]: value } : ex))
  }

  const handleSave = async () => {
    if (!character.trim()) return

    const card = await addCard({
      character: character.trim(),
      pinyin: pinyin.trim(),
      meaning: meaning.trim(),
      examples: examples.filter(ex => ex.zh.trim() || ex.en.trim()),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: notes.trim()
    })

    // Show success
    setSaved(true)
    setRecentCards(prev => [card, ...prev].slice(0, 10))
    onRefresh()

    // Reset form for quick re-entry
    setTimeout(() => {
      setCharacter('')
      setPinyin('')
      setMeaning('')
      setExamples([{ zh: '', en: '' }])
      setNotes('')
      setTags('')
      setSaved(false)
      charInputRef.current?.focus()
    }, 800)
  }

  // Auto-lookup: try to detect pinyin from character
  // (basic approach — future enhancement: CC-CEDICT integration)
  const handleCharacterChange = (value) => {
    setCharacter(value)
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Add New Card</h2>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Quick-add characters you encounter
        </p>
      </div>

      {/* Character input */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Character / Word</label>
        <input
          ref={charInputRef}
          className="input"
          type="text"
          value={character}
          onChange={e => handleCharacterChange(e.target.value)}
          placeholder="e.g. 繁荣"
          style={{ fontFamily: 'var(--font-chinese)', fontSize: 24, textAlign: 'center', padding: '16px' }}
          lang="zh"
        />
      </div>

      {/* Pinyin */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Pinyin</label>
        <input
          className="input"
          type="text"
          value={pinyin}
          onChange={e => setPinyin(e.target.value)}
          placeholder="e.g. fán róng"
        />
      </div>

      {/* Meaning */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Meaning</label>
        <input
          className="input"
          type="text"
          value={meaning}
          onChange={e => setMeaning(e.target.value)}
          placeholder="e.g. prosperous, flourishing"
        />
      </div>

      {/* Example sentences */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Example Sentences</label>
        {examples.map((ex, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <input
                className="input"
                type="text"
                value={ex.zh}
                onChange={e => handleExampleChange(i, 'zh', e.target.value)}
                placeholder="中文例句"
                style={{ fontFamily: 'var(--font-chinese)' }}
                lang="zh"
              />
              {examples.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemoveExample(i)}
                  style={{ padding: '8px', flexShrink: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
            <input
              className="input"
              type="text"
              value={ex.en}
              onChange={e => handleExampleChange(i, 'en', e.target.value)}
              placeholder="English translation"
            />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={handleAddExample}>
          + Add example
        </button>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Notes (optional)</label>
        <textarea
          className="input"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Memory tricks, related words, grammar notes..."
          rows={2}
        />
      </div>

      {/* Tags */}
      <div style={{ marginBottom: 24 }}>
        <label className="label">Tags (comma-separated, optional)</label>
        <input
          className="input"
          type="text"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="e.g. HSK5, business, lesson-12"
        />
      </div>

      {/* Save button */}
      <button
        className={`btn btn-block ${saved ? 'btn-secondary' : 'btn-primary'}`}
        onClick={handleSave}
        disabled={!character.trim()}
        style={{
          padding: '16px',
          fontSize: 18,
          opacity: character.trim() ? 1 : 0.5,
          background: saved ? 'var(--success)' : undefined
        }}
      >
        {saved ? '✓ Saved! Adding another...' : 'Save Card'}
      </button>

      {/* Recently added */}
      {recentCards.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 className="text-secondary" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Recently Added
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {recentCards.map(card => (
              <div
                key={card.id}
                className="card"
                style={{ padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <span className="char-display" style={{ fontSize: 20 }}>{card.character}</span>
                <span className="text-muted" style={{ fontSize: 13 }}>{card.pinyin}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
