import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DECK_FILTER_UNASSIGNED,
  deleteCard,
  getCardLibrary,
  getDeckOptions,
  updateCard
} from '../lib/db'

const EMPTY_EDITOR = {
  character: '',
  pinyin: '',
  meaning: '',
  deckId: '',
  tags: '',
  notes: '',
  suspended: false
}

function buildEditorState(card) {
  if (!card) return EMPTY_EDITOR

  return {
    character: card.character || '',
    pinyin: card.pinyin || '',
    meaning: card.meaning || '',
    deckId: card.deckId ? String(card.deckId) : '',
    tags: Array.isArray(card.tags) ? card.tags.join(', ') : '',
    notes: card.notes || '',
    suspended: Boolean(card.suspended)
  }
}

function formatDateTime(value) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function buildSearchParams(search, deckFilter, status, sort) {
  const nextParams = {}

  if (search.trim()) nextParams.q = search.trim()
  if (deckFilter && deckFilter !== 'all') nextParams.deck = deckFilter
  if (status && status !== 'all') nextParams.status = status
  if (sort && sort !== 'updated') nextParams.sort = sort

  return nextParams
}

export default function CardsPage({ onRefresh }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [deckFilter, setDeckFilter] = useState(searchParams.get('deck') || 'all')
  const [status, setStatus] = useState(searchParams.get('status') || 'all')
  const [sort, setSort] = useState(searchParams.get('sort') || 'updated')
  const [decks, setDecks] = useState([])
  const [cards, setCards] = useState([])
  const [summary, setSummary] = useState({
    total: 0,
    due: 0,
    new: 0,
    learning: 0,
    mastered: 0,
    suspended: 0,
    unassigned: 0
  })
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [editor, setEditor] = useState(EMPTY_EDITOR)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadDecks() {
    const deckOptions = await getDeckOptions()
    setDecks(deckOptions)
  }

  async function loadCards() {
    setLoading(true)
    const library = await getCardLibrary({
      search,
      deckFilter,
      status,
      sort
    })

    setCards(library.cards)
    setSummary(library.summary)

    if (!library.cards.length) {
      setSelectedCardId(null)
      setEditor(EMPTY_EDITOR)
    } else {
      const selectedCard = library.cards.find(card => card.id === selectedCardId) || library.cards[0]
      setSelectedCardId(selectedCard.id)
      setEditor(buildEditorState(selectedCard))
    }

    setLoading(false)
  }

  useEffect(() => {
    loadDecks()
  }, [])

  useEffect(() => {
    setSearchParams(buildSearchParams(search, deckFilter, status, sort), { replace: true })
  }, [deckFilter, search, setSearchParams, sort, status])

  useEffect(() => {
    loadCards()
  }, [search, deckFilter, status, sort])

  const selectedCard = cards.find(card => card.id === selectedCardId) || null

  const handleSelectCard = card => {
    setSelectedCardId(card.id)
    setEditor(buildEditorState(card))
    setMessage('')
  }

  const handleSave = async () => {
    if (!selectedCardId || !editor.character.trim()) return

    setSaving(true)
    setMessage('')

    await updateCard(selectedCardId, {
      character: editor.character.trim(),
      pinyin: editor.pinyin.trim(),
      meaning: editor.meaning.trim(),
      deckId: editor.deckId ? Number(editor.deckId) : null,
      tags: editor.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      notes: editor.notes.trim(),
      suspended: editor.suspended
    })

    await loadCards()
    onRefresh()
    setMessage('Card updated.')
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!selectedCardId || !selectedCard) return

    const shouldDelete = window.confirm(`Delete "${selectedCard.character}" from your library?`)
    if (!shouldDelete) return

    setSaving(true)
    setMessage('')
    const deletedCount = await deleteCard(selectedCardId)

    if (!deletedCount) {
      setSaving(false)
      setMessage('Could not delete this card locally. Refresh the page and try again.')
      return
    }

    await loadCards()
    onRefresh()
    setMessage('Card deleted.')
    setSaving(false)
  }

  const hasActiveFilters = Boolean(search.trim()) || deckFilter !== 'all' || status !== 'all' || sort !== 'updated'

  return (
    <div className="page">
      <div className="page-header-row" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Cards</h2>
          <p className="text-secondary" style={{ fontSize: 14 }}>
            Browse, search, and reorganize the study library.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/add')}>
          + Add Card
        </button>
      </div>

      <div className="card library-toolbar">
        <div className="form-grid">
          <div>
            <label className="label">Search</label>
            <input
              className="input"
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search character, pinyin, meaning, tags..."
            />
          </div>

          <div>
            <label className="label">Deck</label>
            <select
              className="input"
              value={deckFilter}
              onChange={event => setDeckFilter(event.target.value)}
            >
              <option value="all">All cards</option>
              <option value={DECK_FILTER_UNASSIGNED}>Standalone cards</option>
              {decks.map(deck => (
                <option key={deck.id} value={String(deck.id)}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={status}
              onChange={event => setStatus(event.target.value)}
            >
              <option value="all">All states</option>
              <option value="due">Due</option>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="mastered">Mastered</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div>
            <label className="label">Sort</label>
            <select
              className="input"
              value={sort}
              onChange={event => setSort(event.target.value)}
            >
              <option value="updated">Recently updated</option>
              <option value="due">Next review</option>
              <option value="alpha">Alphabetical</option>
              <option value="created">Newest added</option>
              <option value="deck">Deck name</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('')
                setDeckFilter('all')
                setStatus('all')
                setSort('updated')
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="stats-grid stats-grid-three" style={{ marginTop: 16 }}>
        <SummaryCard label="Visible Cards" value={summary.total} />
        <SummaryCard label="Due" value={summary.due} accent="var(--accent)" />
        <SummaryCard label="New" value={summary.new} accent="#38bdf8" />
        <SummaryCard label="Learning" value={summary.learning} accent="#f59e0b" />
        <SummaryCard label="Mastered" value={summary.mastered} accent="var(--success)" />
        <SummaryCard label="Standalone" value={summary.unassigned} />
      </div>

      <div className="library-layout">
        <div className="card library-list-panel">
          <div className="section-heading-row">
            <h3 className="section-heading">Library</h3>
            <span className="text-muted" style={{ fontSize: 13 }}>
              {summary.total} card{summary.total === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <p className="text-secondary">Loading cards...</p>
          ) : cards.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 12px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>No cards match these filters</h3>
              <p className="text-secondary">
                Try broadening the search or add a new card.
              </p>
            </div>
          ) : (
            <div className="library-list">
              {cards.map(card => (
                <button
                  key={card.id}
                  className={`library-row ${card.id === selectedCardId ? 'active' : ''}`}
                  onClick={() => handleSelectCard(card)}
                >
                  <div className="library-row-main">
                    <div className="char-display" style={{ fontSize: 28, minWidth: 48 }}>{card.character}</div>
                    <div className="library-row-copy">
                      <div className="library-row-title">
                        <span>{card.pinyin || 'No pinyin yet'}</span>
                        <span className={`badge badge-${card.status}`}>{card.statusLabel}</span>
                      </div>
                      <div className="text-secondary" style={{ fontSize: 14 }}>
                        {card.meaning || 'No meaning yet'}
                      </div>
                      <div className="library-row-meta">
                        <span>{card.deckName || 'Standalone'}</span>
                        <span>Next: {formatDateTime(card.nextReview)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card library-editor-panel">
          <div className="section-heading-row">
            <h3 className="section-heading">Card Details</h3>
            {selectedCard && (
              <span className="badge badge-neutral">
                {selectedCard.deckName || 'Standalone'}
              </span>
            )}
          </div>

          {!selectedCard ? (
            <p className="text-secondary">Select a card to inspect or edit it.</p>
          ) : (
            <>
              {message && (
                <div className="card-message card-message-success" style={{ marginBottom: 16 }}>
                  {message}
                </div>
              )}

              <div className="form-grid">
                <div>
                  <label className="label">Character</label>
                  <input
                    className="input"
                    type="text"
                    value={editor.character}
                    onChange={event => setEditor(prev => ({ ...prev, character: event.target.value }))}
                    lang="zh"
                    style={{ fontFamily: 'var(--font-chinese)' }}
                  />
                </div>

                <div>
                  <label className="label">Deck</label>
                  <select
                    className="input"
                    value={editor.deckId}
                    onChange={event => setEditor(prev => ({ ...prev, deckId: event.target.value }))}
                  >
                    <option value="">Standalone card</option>
                    {decks.map(deck => (
                      <option key={deck.id} value={String(deck.id)}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Pinyin</label>
                  <input
                    className="input"
                    type="text"
                    value={editor.pinyin}
                    onChange={event => setEditor(prev => ({ ...prev, pinyin: event.target.value }))}
                  />
                </div>

                <div>
                  <label className="label">Meaning</label>
                  <input
                    className="input"
                    type="text"
                    value={editor.meaning}
                    onChange={event => setEditor(prev => ({ ...prev, meaning: event.target.value }))}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="label">Tags</label>
                <input
                  className="input"
                  type="text"
                  value={editor.tags}
                  onChange={event => setEditor(prev => ({ ...prev, tags: event.target.value }))}
                  placeholder="HSK5, business, lesson-12"
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  value={editor.notes}
                  onChange={event => setEditor(prev => ({ ...prev, notes: event.target.value }))}
                  rows={4}
                />
              </div>

              <div className="library-editor-check">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={editor.suspended}
                    onChange={event => setEditor(prev => ({ ...prev, suspended: event.target.checked }))}
                  />
                  <span>Suspend this card from study queues</span>
                </label>
              </div>

              <div className="library-editor-meta">
                <div>Last review: {formatDateTime(selectedCard.lastReview)}</div>
                <div>Next review: {formatDateTime(selectedCard.nextReview)}</div>
                <div>Updated: {formatDateTime(selectedCard.updatedAt)}</div>
              </div>

              <div className="library-editor-actions">
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !editor.character.trim()}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/add')}>
                  Add Another
                </button>
                <button className="btn btn-ghost" onClick={handleDelete} disabled={saving}>
                  Delete Card
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, accent = 'var(--text-primary)' }) {
  return (
    <div className="card stat-card">
      <div style={{ fontSize: 28, fontWeight: 700, color: accent }}>{value}</div>
      <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  )
}
