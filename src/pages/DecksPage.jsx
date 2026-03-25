import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDecksWithCounts, createDeck, bulkImportCards, getDeckByName } from '../lib/db'
import { hsk5Words } from '../data/hsk5'

const PREBUILT_DECKS = [
  {
    id: 'hsk5',
    name: 'HSK 5',
    description: '1,300 words — Upper Intermediate',
    words: hsk5Words,
    tags: ['HSK5']
  }
]

export default function DecksPage({ onRefresh }) {
  const navigate = useNavigate()
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(null) // which deck is importing
  const [imported, setImported] = useState(null) // which deck was just imported
  const [error, setError] = useState(null)

  const loadDecks = async () => {
    const d = await getDecksWithCounts()
    setDecks(d)
    setLoading(false)
  }

  useEffect(() => { loadDecks() }, [])

  const handleImport = async (prebuilt) => {
    setError(null)

    // Check if already imported
    const existing = await getDeckByName(prebuilt.name)
    if (existing) {
      setError(`"${prebuilt.name}" deck already exists (${decks.find(d => d.name === prebuilt.name)?.cardCount || 0} cards)`)
      return
    }

    setImporting(prebuilt.id)

    try {
      const deckId = await createDeck(prebuilt.name)
      const count = await bulkImportCards(deckId, prebuilt.words, prebuilt.tags)
      setImported(prebuilt.id)
      onRefresh()
      await loadDecks()

      // Clear success message after a few seconds
      setTimeout(() => setImported(null), 3000)
    } catch (err) {
      console.error('Import error:', err)
      setError(`Failed to import: ${err.message}`)
    } finally {
      setImporting(null)
    }
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Decks</h2>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Manage your card collections
        </p>
      </div>

      {/* Existing decks */}
      {decks.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 className="text-secondary" style={{
            fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 0.5, marginBottom: 12
          }}>
            Your Decks
          </h3>
          {decks.map(deck => (
            <div key={deck.id} className="card" style={{
              padding: '16px', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{deck.name}</div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  {deck.cardCount} cards
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pre-built decks */}
      <div>
        <h3 className="text-secondary" style={{
          fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: 0.5, marginBottom: 12
        }}>
          Pre-built Decks
        </h3>

        {error && (
          <div style={{
            padding: '12px 16px', marginBottom: 12, borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)',
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        {PREBUILT_DECKS.map(prebuilt => {
          const alreadyImported = decks.some(d => d.name === prebuilt.name)
          const isImporting = importing === prebuilt.id
          const justImported = imported === prebuilt.id

          return (
            <div key={prebuilt.id} className="card" style={{
              padding: '16px', marginBottom: 8
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{prebuilt.name}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {prebuilt.description}
                  </div>
                </div>
                <button
                  className={`btn btn-sm ${justImported ? 'btn-secondary' : alreadyImported ? 'btn-ghost' : 'btn-primary'}`}
                  onClick={() => handleImport(prebuilt)}
                  disabled={isImporting || alreadyImported}
                  style={{
                    padding: '8px 16px', fontSize: 13, flexShrink: 0,
                    opacity: alreadyImported ? 0.5 : 1,
                    background: justImported ? 'var(--success)' : undefined
                  }}
                >
                  {isImporting ? 'Importing...' :
                   justImported ? 'Added!' :
                   alreadyImported ? 'Added' : 'Add'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add card manually */}
      <button
        className="btn btn-secondary btn-block"
        onClick={() => navigate('/add')}
        style={{ marginTop: 24, padding: '14px' }}
      >
        + Add card manually
      </button>

      {loading && (
        <div className="text-center text-secondary" style={{ marginTop: 40 }}>
          Loading...
        </div>
      )}
    </div>
  )
}
