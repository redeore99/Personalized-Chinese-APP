import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WordPopup from '../components/WordPopup'
import { addCard, getAllCards, getDeckOptions } from '../lib/db'
import { buildDictMap, downloadDictionary, getDictStatus, lookupWord, segmentText } from '../lib/dict'
import { convertNumberedPinyin } from '../lib/pinyin'

export default function ArticlePage({ onRefresh }) {
  const navigate = useNavigate()
  const [dictStatus, setDictStatus] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState('')
  const [text, setText] = useState('')
  const [tokens, setTokens] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [knownWords, setKnownWords] = useState(new Set())
  const [selected, setSelected] = useState(null) // { text, entries }
  const [decks, setDecks] = useState([])
  const [targetDeckId, setTargetDeckId] = useState('')
  const [addedWords, setAddedWords] = useState(new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    getDictStatus().then(setDictStatus)
    getDeckOptions().then(setDecks)
  }, [])

  const handleDownloadDict = async () => {
    setDownloading(true)
    setError(null)

    try {
      await downloadDictionary(setProgress)
      setDictStatus(await getDictStatus())
    } catch (err) {
      setError(err.message)
    }

    setDownloading(false)
    setProgress('')
  }

  const handleAnalyze = async () => {
    if (!text.trim()) return

    setAnalyzing(true)
    setError(null)
    setSelected(null)

    try {
      const [dictMap, cards] = await Promise.all([
        buildDictMap(),
        getAllCards()
      ])

      const known = new Set(cards.map(card => card.character.trim()).filter(Boolean))
      setKnownWords(known)
      setTokens(segmentText(text, dictMap, known))
    } catch (err) {
      setError('Analysis failed: ' + err.message)
    }

    setAnalyzing(false)
  }

  const handleTokenTap = async token => {
    if (token.type !== 'word') return
    const entries = await lookupWord(token.text)
    setSelected({ text: token.text, entries })
  }

  const handleAddCard = async () => {
    if (!selected) return

    const bestEntry = selected.entries[0] || null
    await addCard({
      character: selected.text,
      pinyin: bestEntry ? convertNumberedPinyin(bestEntry.pinyin).toLowerCase() : '',
      meaning: bestEntry ? bestEntry.defs : '',
      tags: ['article'],
      deckId: targetDeckId && Number.isFinite(Number(targetDeckId)) ? Number(targetDeckId) : null
    })

    setAddedWords(prev => new Set(prev).add(selected.text))
    setKnownWords(prev => new Set(prev).add(selected.text))
    onRefresh?.()
  }

  const stats = useMemo(() => {
    if (!tokens) return null

    const words = tokens.filter(token => token.type === 'word')
    const unique = new Set(words.map(token => token.text))
    const knownCount = [...unique].filter(word => knownWords.has(word)).length

    return {
      total: unique.size,
      known: knownCount,
      newCount: unique.size - knownCount,
      coverage: unique.size ? Math.round((knownCount / unique.size) * 100) : 0
    }
  }, [tokens, knownWords])

  const dictReady = dictStatus?.loaded

  return (
    <div className="page" style={{ paddingBottom: selected ? 240 : undefined }}>
      <div className="page-header-row" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Article Mode</h2>
          <p className="text-secondary" style={{ fontSize: 14 }}>
            Paste any Chinese text, see what you already know, mine the rest.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Home</button>
      </div>

      {!dictReady && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Offline dictionary needed</h3>
          <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Article mode uses the free CC-CEDICT dictionary (~8 MB, downloaded once and stored on this device).
            It also powers auto-fill on the Add Card page.
          </p>
          <button className="btn btn-primary btn-sm" onClick={handleDownloadDict} disabled={downloading}>
            {downloading ? (progress || 'Downloading...') : 'Download dictionary'}
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">Chinese text</label>
        <textarea
          className="input article-textarea"
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="把中文文章贴在这里，比如财新或新闻里的一段话…"
          rows={6}
          lang="zh"
        />
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 12 }}
          onClick={handleAnalyze}
          disabled={!dictReady || analyzing || !text.trim()}
        >
          {analyzing ? 'Analyzing...' : 'Analyze text'}
        </button>
      </div>

      {error && (
        <div className="card-message card-message-warning" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {stats && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="article-stats-row">
            <span><strong>{stats.total}</strong> unique words</span>
            <span style={{ color: 'var(--success)' }}><strong>{stats.known}</strong> known</span>
            <span style={{ color: 'var(--accent)' }}><strong>{stats.newCount}</strong> new</span>
            <span><strong>{stats.coverage}%</strong> coverage</span>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Tap any word to look it up and add it as a card. Green = already in your library.
          </p>
        </div>
      )}

      {tokens && (
        <div className="card article-reader">
          {tokens.map((token, index) => {
            if (token.type === 'plain') {
              return <span key={index} className="article-plain">{token.text}</span>
            }

            const isKnown = knownWords.has(token.text)
            const classes = [
              'article-token',
              isKnown ? 'article-token-known' : token.inDict ? 'article-token-new' : 'article-token-unknown',
              selected?.text === token.text ? 'article-token-selected' : ''
            ].join(' ')

            return (
              <button key={index} className={classes} onClick={() => handleTokenTap(token)}>
                {token.text}
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <WordPopup
          word={selected.text}
          entries={selected.entries}
          decks={decks}
          targetDeckId={targetDeckId}
          onDeckChange={setTargetDeckId}
          onAdd={handleAddCard}
          onClose={() => setSelected(null)}
          inLibrary={addedWords.has(selected.text) || knownWords.has(selected.text)}
        />
      )}
    </div>
  )
}
