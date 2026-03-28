import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addCard, getDeckOptions, getRecentCards } from '../lib/db'
import { convertNumberedPinyin } from '../lib/pinyin'

export default function AddCardPage({ onRefresh }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const charInputRef = useRef(null)

  const [character, setCharacter] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [meaning, setMeaning] = useState('')
  const [examples, setExamples] = useState([{ zh: '', en: '' }])
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [decks, setDecks] = useState([])
  const [saved, setSaved] = useState(false)
  const [recentCards, setRecentCards] = useState([])

  useEffect(() => {
    let cancelled = false

    async function loadPageData() {
      const [recent, deckOptions] = await Promise.all([
        getRecentCards(10),
        getDeckOptions()
      ])

      if (cancelled) return

      setRecentCards(recent)
      setDecks(deckOptions)

      const requestedDeckId = searchParams.get('deck')
      if (requestedDeckId && Number.isFinite(Number(requestedDeckId))) {
        setSelectedDeckId(requestedDeckId)
      }
    }

    charInputRef.current?.focus()
    loadPageData()

    return () => {
      cancelled = true
    }
  }, [searchParams])

  const handleAddExample = () => {
    setExamples(prev => [...prev, { zh: '', en: '' }])
  }

  const handleRemoveExample = index => {
    setExamples(prev => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleExampleChange = (index, field, value) => {
    setExamples(prev => prev.map((example, currentIndex) => (
      currentIndex === index ? { ...example, [field]: value } : example
    )))
  }

  const handleSave = async () => {
    if (!character.trim()) return

    const card = await addCard({
      character: character.trim(),
      pinyin: pinyin.trim(),
      meaning: meaning.trim(),
      examples: examples.filter(example => example.zh.trim() || example.en.trim()),
      tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      notes: notes.trim(),
      deckId: selectedDeckId && Number.isFinite(Number(selectedDeckId)) ? Number(selectedDeckId) : null
    })

    setSaved(true)
    setRecentCards(prev => [card, ...prev].slice(0, 10))
    onRefresh()

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

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div className="page-header-row">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Add New Card</h2>
            <p className="text-secondary" style={{ fontSize: 14 }}>
              Capture new words and file them into the right deck immediately.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cards')}>
            Browse Cards
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div>
            <label className="label">Deck</label>
            <select
              className="input"
              value={selectedDeckId}
              onChange={event => setSelectedDeckId(event.target.value)}
            >
              <option value="">Standalone card</option>
              {decks.map(deck => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Tags (comma-separated, optional)</label>
            <input
              className="input"
              type="text"
              value={tags}
              onChange={event => setTags(event.target.value)}
              placeholder="e.g. HSK5, business, lesson-12"
            />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="label">Character / Word</label>
        <input
          ref={charInputRef}
          className="input"
          type="text"
          value={character}
          onChange={event => setCharacter(event.target.value)}
          placeholder="e.g. 繁荣"
          style={{ fontFamily: 'var(--font-chinese)', fontSize: 24, textAlign: 'center', padding: '16px' }}
          lang="zh"
        />
      </div>

      <div className="form-grid">
        <div>
          <label className="label">Pinyin</label>
          <input
            className="input"
            type="text"
            value={pinyin}
            onChange={event => setPinyin(event.target.value)}
            placeholder="e.g. fan rong"
          />
        </div>

        <div>
          <label className="label">Meaning</label>
          <input
            className="input"
            type="text"
            value={meaning}
            onChange={event => setMeaning(event.target.value)}
            placeholder="e.g. prosperous, flourishing"
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="label">Example Sentences</label>
        {examples.map((example, index) => (
          <div key={index} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <input
                className="input"
                type="text"
                value={example.zh}
                onChange={event => handleExampleChange(index, 'zh', event.target.value)}
                placeholder="中文例句"
                style={{ fontFamily: 'var(--font-chinese)' }}
                lang="zh"
              />
              {examples.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemoveExample(index)}
                  style={{ padding: '8px', flexShrink: 0 }}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              className="input"
              type="text"
              value={example.en}
              onChange={event => handleExampleChange(index, 'en', event.target.value)}
              placeholder="English translation"
            />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={handleAddExample}>
          + Add example
        </button>
      </div>

      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <label className="label">Notes (optional)</label>
        <textarea
          className="input"
          value={notes}
          onChange={event => setNotes(event.target.value)}
          placeholder="Memory tricks, related words, grammar notes..."
          rows={3}
        />
      </div>

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
        {saved ? 'Saved! Ready for the next one...' : 'Save Card'}
      </button>

      {recentCards.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 className="text-secondary" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Recently Added
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentCards.map(card => (
              <div key={card.id} className="card">
                <div className="library-row-main">
                  <span className="char-display" style={{ fontSize: 24 }}>{card.character}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{convertNumberedPinyin(card.pinyin) || 'No pinyin yet'}</div>
                    <div className="text-muted" style={{ fontSize: 13 }}>{card.meaning || 'No meaning yet'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
