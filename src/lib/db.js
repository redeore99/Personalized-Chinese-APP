import Dexie from 'dexie'

export const db = new Dexie('ChineseStudyApp')

db.version(1).stores({
  // Cards: the core study unit
  cards: '++id, character, pinyin, deckId, nextReview, *tags',
  // Decks: groups of cards
  decks: '++id, name, createdAt',
  // Review log: history of every review for stats
  reviewLog: '++id, cardId, reviewedAt, rating, intervalDays',
  // Writing practice log
  writingLog: '++id, cardId, practicedAt, score, strokeCount'
})

db.version(2).stores({
  cards: '++id, character, pinyin, deckId, nextReview, *tags',
  decks: '++id, name, createdAt',
  reviewLog: '++id, cardId, reviewedAt, rating, intervalDays',
  writingLog: '++id, cardId, practicedAt, score, strokeCount',
  // Device-local security metadata
  security: 'key'
})

db.version(3).stores({
  cards: '++id, character, pinyin, deckId, nextReview, *tags',
  decks: '++id, &name, createdAt',
  reviewLog: '++id, cardId, reviewedAt, rating, intervalDays',
  writingLog: '++id, cardId, practicedAt, score, strokeCount',
  security: 'key'
})

// Store a device-local security value in IndexedDB
export async function setSecurityValue(key, value) {
  await db.security.put({ key, value, updatedAt: new Date().toISOString() })
}

// Retrieve a device-local security value from IndexedDB
export async function getSecurityValue(key) {
  const entry = await db.security.get(key)
  return entry ? entry.value : null
}

// Default SRS fields for a new card
export function createCard({
  character,
  pinyin = '',
  meaning = '',
  examples = [],
  deckId = null,
  tags = [],
  notes = ''
}) {
  return {
    character,
    pinyin,
    meaning,
    examples, // Array of { zh: '...', en: '...' }
    deckId,
    tags,
    notes,
    // SM-2 SRS fields
    interval: 0,        // days until next review
    repetitions: 0,     // consecutive correct reviews
    easeFactor: 2.5,    // difficulty multiplier (starts at 2.5)
    nextReview: new Date().toISOString(), // due immediately
    lastReview: null,
    // Writing practice
    writingScore: null,  // last writing accuracy (0-1)
    writingCount: 0,     // total writing attempts
    // Meta
    createdAt: new Date().toISOString(),
    suspended: false
  }
}

// Add a new card to the database
export async function addCard(cardData) {
  const card = createCard(cardData)
  const id = await db.cards.add(card)
  return { ...card, id }
}

// Get all cards due for review (nextReview <= now)
export async function getDueCards(deckId = null) {
  const now = new Date().toISOString()
  let query = db.cards.where('nextReview').belowOrEqual(now)

  const allDue = await query.toArray()

  return allDue
    .filter(c => !c.suspended)
    .filter(c => deckId === null || c.deckId === deckId)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
}

// Get new cards (never reviewed)
export async function getNewCards(deckId = null, limit = 20) {
  const all = await db.cards.toArray()
  return all
    .filter(c => !c.suspended && c.repetitions === 0)
    .filter(c => deckId === null || c.deckId === deckId)
    .slice(0, limit)
}

// Get all cards
export async function getAllCards() {
  return db.cards.toArray()
}

// Get card by id
export async function getCard(id) {
  return db.cards.get(id)
}

// Update a card
export async function updateCard(id, changes) {
  return db.cards.update(id, changes)
}

// Delete a card
export async function deleteCard(id) {
  return db.cards.delete(id)
}

// Log a review
export async function logReview(cardId, rating, intervalDays) {
  return db.reviewLog.add({
    cardId,
    reviewedAt: new Date().toISOString(),
    rating,
    intervalDays
  })
}

// Log writing practice
export async function logWriting(cardId, score, strokeCount) {
  return db.writingLog.add({
    cardId,
    practicedAt: new Date().toISOString(),
    score,
    strokeCount
  })
}

// Create a deck
export async function createDeck(name) {
  const id = await db.decks.add({ name, createdAt: new Date().toISOString() })
  return id
}

// Get all decks with card counts
export async function getDecksWithCounts() {
  const decks = await db.decks.toArray()
  const cards = await db.cards.toArray()
  return decks.map(deck => ({
    ...deck,
    cardCount: cards.filter(c => c.deckId === deck.id).length
  }))
}

// Bulk import cards into a deck (batch for performance)
export async function bulkImportCards(deckId, wordsArray, tags = []) {
  const now = new Date().toISOString()
  const cards = wordsArray.map(word => ({
    character: word.character,
    pinyin: word.pinyin || '',
    meaning: word.meaning || '',
    examples: word.examples || [],
    deckId,
    tags,
    notes: '',
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: now,
    lastReview: null,
    writingScore: null,
    writingCount: 0,
    createdAt: now,
    suspended: false
  }))

  // Batch in chunks of 100 for performance
  const BATCH_SIZE = 100
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    await db.cards.bulkAdd(cards.slice(i, i + BATCH_SIZE))
  }

  return cards.length
}

// Check if a deck with a given name already exists
export async function getDeckByName(name) {
  return db.decks.where('name').equals(name).first()
}

// Get stats
export async function getStats() {
  const now = new Date().toISOString()
  const allCards = await db.cards.toArray()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayReviews = await db.reviewLog
    .where('reviewedAt')
    .aboveOrEqual(todayStart.toISOString())
    .count()

  const dueCount = allCards.filter(c => !c.suspended && c.nextReview <= now).length
  const totalCards = allCards.length
  const knownCards = allCards.filter(c => c.repetitions >= 3).length
  const newCards = allCards.filter(c => c.repetitions === 0).length

  return {
    totalCards,
    dueCount,
    knownCards,
    newCards,
    todayReviews
  }
}
