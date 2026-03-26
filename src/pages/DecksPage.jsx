import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DECK_FILTER_UNASSIGNED,
  bulkImportCards,
  createDeck,
  getDeckByName,
  getDecksWithCounts,
  getStandaloneCardSummary,
  repairDeckCards
} from '../lib/db'
import { PREBUILT_DECKS } from '../lib/deckCatalog'

export default function DecksPage({ onRefresh }) {
  const navigate = useNavigate()
  const [decks, setDecks] = useState([])
  const [standaloneSummary, setStandaloneSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(null)
  const [repairing, setRepairing] = useState(null)
  const [imported, setImported] = useState(null)
  const [error, setError] = useState(null)
  const [newDeckName, setNewDeckName] = useState('')
  const [creatingDeck, setCreatingDeck] = useState(false)

  async function loadDeckData() {
    const [deckList, standalone] = await Promise.all([
      getDecksWithCounts(),
      getStandaloneCardSummary()
    ])

    setDecks(deckList)
    setStandaloneSummary(standalone)
    setLoading(false)
  }

  useEffect(() => {
    loadDeckData()
  }, [])

  const handleCreateDeck = async () => {
    const name = newDeckName.trim()
    if (!name) return

    setError(null)
    setCreatingDeck(true)

    try {
      const existing = await getDeckByName(name)
      if (existing) {
        setError(`"${name}" already exists.`)
        return
      }

      await createDeck({ name, kind: 'custom' })
      setNewDeckName('')
      await loadDeckData()
      onRefresh()
    } catch (err) {
      console.error('Create deck error:', err)
      setError(`Failed to create deck: ${err.message}`)
    } finally {
      setCreatingDeck(false)
    }
  }

  const handleImport = async prebuilt => {
    setError(null)

    const existing = await getDeckByName(prebuilt.name)
    if (existing) {
      setError(`"${prebuilt.name}" already exists on this device.`)
      return
    }

    setImporting(prebuilt.id)

    try {
      const deckId = await createDeck({
        name: prebuilt.name,
        slug: prebuilt.slug,
        description: prebuilt.description,
        kind: prebuilt.kind,
        sourceKey: prebuilt.sourceKey,
        color: prebuilt.color,
        sortOrder: prebuilt.sortOrder
      })
      await bulkImportCards(deckId, prebuilt.words, prebuilt.tags)
      setImported(prebuilt.id)
      onRefresh()
      await loadDeckData()
      setTimeout(() => setImported(null), 3000)
    } catch (err) {
      console.error('Import error:', err)
      setError(`Failed to import: ${err.message}`)
    } finally {
      setImporting(null)
    }
  }

  const handleRepair = async prebuilt => {
    setError(null)

    const existing = await getDeckByName(prebuilt.name)
    if (!existing) {
      setError(`"${prebuilt.name}" is not on this device yet.`)
      return
    }

    setRepairing(prebuilt.id)

    try {
      const result = await repairDeckCards(existing.id, prebuilt.words, prebuilt.tags)
      await loadDeckData()
      onRefresh()

      if (result.addedCount > 0) {
        setImported(prebuilt.id)
        setError(`Repaired "${prebuilt.name}" by adding ${result.addedCount} missing cards.`)
        setTimeout(() => setImported(null), 3000)
      } else {
        setError(`"${prebuilt.name}" is already complete on this device.`)
      }
    } catch (err) {
      console.error('Repair error:', err)
      setError(`Failed to repair deck: ${err.message}`)
    } finally {
      setRepairing(null)
    }
  }

  const libraryCardCount = decks.reduce((total, deck) => total + deck.cardCount, 0)
  const dueAcrossDecks = decks.reduce((total, deck) => total + deck.dueCount, 0) + (standaloneSummary?.dueCount || 0)

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Decks</h2>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Organize the library, repair imports, and jump straight into a deck.
        </p>
      </div>

      <div className="stats-grid stats-grid-three" style={{ marginBottom: 20 }}>
        <OverviewCard label="Decks" value={decks.length} />
        <OverviewCard label="Cards in Decks" value={libraryCardCount} />
        <OverviewCard label="Standalone" value={standaloneSummary?.cardCount || 0} accent="#f59e0b" />
        <OverviewCard label="Due Across Library" value={dueAcrossDecks} accent="var(--accent)" />
        <OverviewCard label="Prebuilt" value={decks.filter(deck => deck.kind === 'prebuilt').length} />
        <OverviewCard label="Custom" value={decks.filter(deck => deck.kind === 'custom').length} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-heading-row">
          <h3 className="section-heading">Create a Custom Deck</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cards')}>
            Browse cards
          </button>
        </div>
        <div className="deck-create-row">
          <input
            className="input"
            type="text"
            value={newDeckName}
            onChange={event => setNewDeckName(event.target.value)}
            placeholder="e.g. Business Chinese"
          />
          <button className="btn btn-primary" onClick={handleCreateDeck} disabled={creatingDeck || !newDeckName.trim()}>
            {creatingDeck ? 'Creating...' : 'Create Deck'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card-message card-message-warning" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="section-heading-row">
          <h3 className="section-heading">Your Study Library</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/add')}>
            + Add card
          </button>
        </div>

        {standaloneSummary?.cardCount > 0 && (
          <DeckCard
            deck={standaloneSummary}
            onBrowse={() => navigate(`/cards?deck=${DECK_FILTER_UNASSIGNED}`)}
            onReview={() => navigate(`/review?deck=${DECK_FILTER_UNASSIGNED}`)}
            onAddCard={() => navigate('/add')}
          />
        )}

        {decks.length === 0 && !standaloneSummary?.cardCount ? (
          <div className="empty-state" style={{ padding: '28px 12px' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>No decks yet</h3>
            <p className="text-secondary">
              Import a prebuilt list or create your own deck to start organizing the library.
            </p>
          </div>
        ) : (
          decks.map(deck => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onBrowse={() => navigate(`/cards?deck=${deck.id}`)}
              onReview={() => navigate(`/review?deck=${deck.id}`)}
              onAddCard={() => navigate(`/add?deck=${deck.id}`)}
            />
          ))
        )}
      </section>

      <section className="card">
        <div className="section-heading-row">
          <h3 className="section-heading">Prebuilt Decks</h3>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Import once, then repair if a device missed some cards.
          </span>
        </div>

        {PREBUILT_DECKS.map(prebuilt => {
          const matchingDeck = decks.find(deck => deck.name === prebuilt.name)
          const alreadyImported = Boolean(matchingDeck)
          const isImporting = importing === prebuilt.id
          const isRepairing = repairing === prebuilt.id
          const justImported = imported === prebuilt.id
          const missingCount = matchingDeck ? Math.max(prebuilt.words.length - matchingDeck.cardCount, 0) : 0
          const needsRepair = alreadyImported && missingCount > 0

          return (
            <div key={prebuilt.id} className="deck-market-row">
              <div>
                <div className="deck-focus-title-row">
                  <h4 style={{ fontSize: 17, fontWeight: 600 }}>{prebuilt.name}</h4>
                  <span className="badge badge-prebuilt">Prebuilt</span>
                </div>
                <div className="text-secondary" style={{ fontSize: 14 }}>{prebuilt.description}</div>
                {needsRepair && (
                  <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 6 }}>
                    {matchingDeck.cardCount} of {prebuilt.words.length} cards on this device. {missingCount} missing.
                  </div>
                )}
              </div>

              {needsRepair ? (
                <button className="btn btn-primary btn-sm" onClick={() => handleRepair(prebuilt)} disabled={isRepairing}>
                  {isRepairing ? 'Repairing...' : `Repair (${missingCount})`}
                </button>
              ) : (
                <button
                  className={`btn btn-sm ${justImported ? 'btn-secondary' : alreadyImported ? 'btn-ghost' : 'btn-primary'}`}
                  onClick={() => handleImport(prebuilt)}
                  disabled={isImporting || alreadyImported}
                  style={{
                    opacity: alreadyImported ? 0.5 : 1,
                    background: justImported ? 'var(--success)' : undefined
                  }}
                >
                  {isImporting ? 'Importing...' :
                   justImported ? 'Added!' :
                   alreadyImported ? 'Added' : 'Add'}
                </button>
              )}
            </div>
          )
        })}
      </section>

      {loading && (
        <div className="text-center text-secondary" style={{ marginTop: 40 }}>
          Loading...
        </div>
      )}
    </div>
  )
}

function DeckCard({ deck, onBrowse, onReview, onAddCard }) {
  return (
    <div className="deck-card">
      <div className="deck-card-top">
        <div>
          <div className="deck-focus-title-row">
            <h4 style={{ fontSize: 18, fontWeight: 600 }}>{deck.name}</h4>
            <span className={`badge badge-${deck.kind || 'neutral'}`}>{deck.kind || 'deck'}</span>
          </div>
          <div className="text-secondary" style={{ fontSize: 14 }}>
            {deck.description || `${deck.cardCount} cards in this deck`}
          </div>
        </div>
        <div className="deck-card-count">{deck.cardCount}</div>
      </div>

      <div className="deck-card-metrics">
        <span>{deck.dueCount} due</span>
        <span>{deck.newCount || 0} new</span>
        <span>{deck.knownCount || 0} known</span>
        <span>{deck.suspendedCount || 0} suspended</span>
      </div>

      <div className="deck-card-actions">
        <button className="btn btn-ghost btn-sm" onClick={onBrowse}>Browse</button>
        <button className="btn btn-secondary btn-sm" onClick={onReview}>Review</button>
        {!deck.standalone && (
          <button className="btn btn-secondary btn-sm" onClick={onAddCard}>Add Card</button>
        )}
      </div>
    </div>
  )
}

function OverviewCard({ label, value, accent = 'var(--text-primary)' }) {
  return (
    <div className="card stat-card">
      <div style={{ fontSize: 28, fontWeight: 700, color: accent }}>{value}</div>
      <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  )
}
