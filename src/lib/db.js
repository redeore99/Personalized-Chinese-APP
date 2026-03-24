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
