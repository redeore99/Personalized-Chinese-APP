import Dexie from 'dexie'

function nowIso() {
  return new Date().toISOString()
}

export function createSyncId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeExamples(examples) {
  return Array.isArray(examples) ? examples.filter(Boolean) : []
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter(Boolean) : []
}

function isActiveRecord(record) {
  return record && !record.deletedAt
}

export const db = new Dexie('ChineseStudyApp')

db.version(1).stores({
  cards: '++id, character, pinyin, deckId, nextReview, *tags',
  decks: '++id, name, createdAt',
  reviewLog: '++id, cardId, reviewedAt, rating, intervalDays',
  writingLog: '++id, cardId, practicedAt, score, strokeCount'
})

db.version(2).stores({
  cards: '++id, character, pinyin, deckId, nextReview, *tags',
  decks: '++id, name, createdAt',
  reviewLog: '++id, cardId, reviewedAt, rating, intervalDays',
  writingLog: '++id, cardId, practicedAt, score, strokeCount',
  security: 'key'
})

db.version(3).stores({
  cards: '++id, character, pinyin, deckId, nextReview, *tags',
  decks: '++id, &name, createdAt',
  reviewLog: '++id, cardId, reviewedAt, rating, intervalDays',
  writingLog: '++id, cardId, practicedAt, score, strokeCount',
  security: 'key'
})

db.version(4).stores({
  cards: '++id, syncId, character, pinyin, deckId, deckSyncId, nextReview, updatedAt, deletedAt, dirty, *tags',
  decks: '++id, syncId, name, createdAt, updatedAt, deletedAt, dirty',
  reviewLog: '++id, syncId, cardId, cardSyncId, reviewedAt, updatedAt, dirty',
  writingLog: '++id, syncId, cardId, cardSyncId, practicedAt, updatedAt, dirty',
  security: 'key',
  meta: 'key'
}).upgrade(async tx => {
  const decksTable = tx.table('decks')
  const cardsTable = tx.table('cards')
  const reviewLogTable = tx.table('reviewLog')
  const writingLogTable = tx.table('writingLog')

  const deckIdToSyncId = new Map()
  const cardIdToSyncId = new Map()

  const decks = await decksTable.toArray()
  for (const deck of decks) {
    const syncId = deck.syncId || createSyncId()
    deckIdToSyncId.set(deck.id, syncId)
    await decksTable.update(deck.id, {
      syncId,
      updatedAt: deck.updatedAt || deck.createdAt || nowIso(),
      deletedAt: deck.deletedAt || null,
      dirty: false
    })
  }

  const cards = await cardsTable.toArray()
  for (const card of cards) {
    const syncId = card.syncId || createSyncId()
    cardIdToSyncId.set(card.id, syncId)
    await cardsTable.update(card.id, {
      syncId,
      deckSyncId: card.deckId ? deckIdToSyncId.get(card.deckId) || null : null,
      examples: normalizeExamples(card.examples),
      tags: normalizeTags(card.tags),
      updatedAt: card.updatedAt || card.createdAt || nowIso(),
      deletedAt: card.deletedAt || null,
      dirty: false
    })
  }

  const reviewLogs = await reviewLogTable.toArray()
  for (const entry of reviewLogs) {
    await reviewLogTable.update(entry.id, {
      syncId: entry.syncId || createSyncId(),
      cardSyncId: entry.cardSyncId || cardIdToSyncId.get(entry.cardId) || null,
      updatedAt: entry.updatedAt || entry.reviewedAt || nowIso(),
      dirty: false
    })
  }

  const writingLogs = await writingLogTable.toArray()
  for (const entry of writingLogs) {
    await writingLogTable.update(entry.id, {
      syncId: entry.syncId || createSyncId(),
      cardSyncId: entry.cardSyncId || cardIdToSyncId.get(entry.cardId) || null,
      updatedAt: entry.updatedAt || entry.practicedAt || nowIso(),
      dirty: false
    })
  }
})

export async function setSecurityValue(key, value) {
  await db.security.put({ key, value, updatedAt: nowIso() })
}

export async function getSecurityValue(key) {
  const entry = await db.security.get(key)
  return entry ? entry.value : null
}

export async function setMetaValue(key, value) {
  await db.meta.put({ key, value, updatedAt: nowIso() })
}

export async function getMetaValue(key) {
  const entry = await db.meta.get(key)
  return entry ? entry.value : null
}

export function createCard({
  character,
  pinyin = '',
  meaning = '',
  examples = [],
  deckId = null,
  deckSyncId = null,
  tags = [],
  notes = ''
}) {
  const createdAt = nowIso()

  return {
    syncId: createSyncId(),
    character,
    pinyin,
    meaning,
    examples: normalizeExamples(examples),
    deckId,
    deckSyncId,
    tags: normalizeTags(tags),
    notes,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: createdAt,
    lastReview: null,
    writingScore: null,
    writingCount: 0,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    dirty: true,
    suspended: false
  }
}

export async function addCard(cardData) {
  const deck = cardData.deckId ? await db.decks.get(cardData.deckId) : null
  const card = createCard({
    ...cardData,
    deckSyncId: deck?.syncId || null
  })

  const id = await db.cards.add(card)
  return { ...card, id }
}

export async function getDueCards(deckId = null) {
  const now = nowIso()
  const allDue = await db.cards.where('nextReview').belowOrEqual(now).toArray()

  return allDue
    .filter(isActiveRecord)
    .filter(card => !card.suspended)
    .filter(card => deckId === null || card.deckId === deckId)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
}

export async function getNewCards(deckId = null, limit = 20) {
  const allCards = await db.cards.toArray()

  return allCards
    .filter(isActiveRecord)
    .filter(card => !card.suspended && card.repetitions === 0)
    .filter(card => deckId === null || card.deckId === deckId)
    .slice(0, limit)
}

export async function getAllCards() {
  const cards = await db.cards.toArray()
  return cards.filter(isActiveRecord)
}

export async function getRecentCards(limit = 10) {
  const cards = await db.cards.orderBy('createdAt').reverse().toArray()
  return cards.filter(isActiveRecord).slice(0, limit)
}

export async function getCard(id) {
  const card = await db.cards.get(id)
  return isActiveRecord(card) ? card : null
}

export async function updateCard(id, changes) {
  const existing = await db.cards.get(id)
  if (!existing) return 0

  let deckSyncId = existing.deckSyncId || null
  if (Object.prototype.hasOwnProperty.call(changes, 'deckId')) {
    if (changes.deckId === null) {
      deckSyncId = null
    } else {
      const deck = await db.decks.get(changes.deckId)
      deckSyncId = deck?.syncId || null
    }
  }

  return db.cards.update(id, {
    ...changes,
    deckSyncId,
    updatedAt: nowIso(),
    dirty: true
  })
}

export async function deleteCard(id) {
  return db.cards.update(id, {
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    dirty: true
  })
}

export async function logReview(cardId, rating, intervalDays) {
  const reviewedAt = nowIso()
  const card = await db.cards.get(cardId)

  return db.reviewLog.add({
    syncId: createSyncId(),
    cardId,
    cardSyncId: card?.syncId || null,
    reviewedAt,
    rating,
    intervalDays,
    updatedAt: reviewedAt,
    dirty: true
  })
}

export async function logWriting(cardId, score, strokeCount) {
  const practicedAt = nowIso()
  const card = await db.cards.get(cardId)

  return db.writingLog.add({
    syncId: createSyncId(),
    cardId,
    cardSyncId: card?.syncId || null,
    practicedAt,
    score,
    strokeCount,
    updatedAt: practicedAt,
    dirty: true
  })
}

export async function createDeck(name) {
  const createdAt = nowIso()
  const id = await db.decks.add({
    syncId: createSyncId(),
    name,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    dirty: true
  })

  return id
}

export async function getDecksWithCounts() {
  const decks = await db.decks.toArray()
  const cards = await db.cards.toArray()
  const activeDecks = decks.filter(isActiveRecord)
  const activeCards = cards.filter(isActiveRecord)

  return activeDecks.map(deck => ({
    ...deck,
    cardCount: activeCards.filter(card => card.deckId === deck.id).length
  }))
}

export async function bulkImportCards(deckId, wordsArray, tags = []) {
  const now = nowIso()
  const deck = deckId ? await db.decks.get(deckId) : null
  const deckSyncId = deck?.syncId || null

  const cards = wordsArray.map(word => ({
    syncId: createSyncId(),
    character: word.character,
    pinyin: word.pinyin || '',
    meaning: word.meaning || '',
    examples: normalizeExamples(word.examples),
    deckId,
    deckSyncId,
    tags: normalizeTags(tags),
    notes: '',
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: now,
    lastReview: null,
    writingScore: null,
    writingCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
    suspended: false
  }))

  const batchSize = 100
  for (let index = 0; index < cards.length; index += batchSize) {
    await db.cards.bulkAdd(cards.slice(index, index + batchSize))
  }

  return cards.length
}

export async function getDeckByName(name) {
  const deck = await db.decks.where('name').equals(name).first()
  return isActiveRecord(deck) ? deck : null
}

export async function getTodayReviewCount() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return db.reviewLog
    .where('reviewedAt')
    .aboveOrEqual(todayStart.toISOString())
    .count()
}

export async function getLocalDataCounts() {
  const [cards, decks, reviewLog, writingLog] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray(),
    db.reviewLog.toArray(),
    db.writingLog.toArray()
  ])

  return {
    cards: cards.filter(isActiveRecord).length,
    decks: decks.filter(isActiveRecord).length,
    reviewLog: reviewLog.length,
    writingLog: writingLog.length
  }
}

export async function getStats() {
  const now = nowIso()
  const [allCards, todayReviews] = await Promise.all([
    db.cards.toArray(),
    getTodayReviewCount()
  ])

  const activeCards = allCards.filter(isActiveRecord)
  const dueCount = activeCards.filter(card => !card.suspended && card.nextReview <= now).length
  const totalCards = activeCards.length
  const knownCards = activeCards.filter(card => card.repetitions >= 3).length
  const newCards = activeCards.filter(card => card.repetitions === 0).length

  return {
    totalCards,
    dueCount,
    knownCards,
    newCards,
    todayReviews
  }
}
