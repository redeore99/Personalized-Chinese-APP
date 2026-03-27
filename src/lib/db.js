import Dexie from 'dexie'
import { getPrebuiltDeck, getPrebuiltDeckByName, getPrebuiltDeckBySourceKey } from './deckCatalog'

export const DECK_FILTER_UNASSIGNED = 'unassigned'

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

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || `deck-${Date.now().toString(36)}`
}

function compareDecks(left, right) {
  return (
    (left.sortOrder ?? 1000) - (right.sortOrder ?? 1000) ||
    left.name.localeCompare(right.name)
  )
}

function normalizeRecordIds(ids = []) {
  return Array.from(new Set(
    ids
      .map(id => (Number.isFinite(Number(id)) ? Number(id) : id))
      .filter(id => id !== null && id !== undefined && id !== '')
  ))
}

function getCardStatus(card, now = nowIso()) {
  if (card.suspended) return 'suspended'
  if (card.repetitions === 0) return 'new'
  if (card.nextReview <= now) return 'due'
  if (card.repetitions >= 3) return 'mastered'
  return 'learning'
}

function cardStatusLabel(status) {
  switch (status) {
    case 'due':
      return 'Due'
    case 'new':
      return 'New'
    case 'mastered':
      return 'Mastered'
    case 'learning':
      return 'Learning'
    case 'suspended':
      return 'Suspended'
    default:
      return 'Card'
  }
}

function resolveDeckFilter(deckFilter) {
  if (deckFilter === undefined || deckFilter === null || deckFilter === '' || deckFilter === 'all') {
    return 'all'
  }

  if (deckFilter === DECK_FILTER_UNASSIGNED) {
    return DECK_FILTER_UNASSIGNED
  }

  if (typeof deckFilter === 'number') {
    return deckFilter
  }

  const numericValue = Number(deckFilter)
  return Number.isNaN(numericValue) ? deckFilter : numericValue
}

function matchesDeckFilter(card, deckFilter) {
  const resolvedFilter = resolveDeckFilter(deckFilter)
  const cardDeckId = Object.prototype.hasOwnProperty.call(card, 'resolvedDeckId')
    ? card.resolvedDeckId
    : card.deckId

  if (resolvedFilter === 'all') {
    return true
  }

  if (resolvedFilter === DECK_FILTER_UNASSIGNED) {
    return !cardDeckId
  }

  return cardDeckId === resolvedFilter
}

function matchesStatusFilter(card, statusFilter, now = nowIso()) {
  if (!statusFilter || statusFilter === 'all') {
    return true
  }

  return getCardStatus(card, now) === statusFilter
}

function buildCardSearchText(card) {
  return [
    card.character,
    card.pinyin,
    card.meaning,
    card.notes,
    ...(card.tags || []),
    card.deckName || ''
  ]
    .join(' ')
    .toLowerCase()
}

function sortCards(cards, sort = 'updated') {
  const sorted = [...cards]

  switch (sort) {
    case 'alpha':
      return sorted.sort((left, right) => (
        left.character.localeCompare(right.character) ||
        left.pinyin.localeCompare(right.pinyin)
      ))
    case 'created':
      return sorted.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    case 'due':
      return sorted.sort((left, right) => (
        left.nextReview.localeCompare(right.nextReview) ||
        right.updatedAt.localeCompare(left.updatedAt)
      ))
    case 'deck':
      return sorted.sort((left, right) => (
        (left.deckName || 'Standalone').localeCompare(right.deckName || 'Standalone') ||
        left.character.localeCompare(right.character)
      ))
    case 'updated':
    default:
      return sorted.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
}

function buildLibrarySummary(cards) {
  return cards.reduce((summary, card) => {
    const status = card.status

    summary.total += 1
    if (status === 'due') summary.due += 1
    if (status === 'new') summary.new += 1
    if (status === 'learning') summary.learning += 1
    if (status === 'mastered') summary.mastered += 1
    if (status === 'suspended') summary.suspended += 1
    if (!card.deckId) summary.unassigned += 1
    return summary
  }, {
    total: 0,
    due: 0,
    new: 0,
    learning: 0,
    mastered: 0,
    suspended: 0,
    unassigned: 0
  })
}

function buildCardSignature({ character, pinyin = '', meaning = '' }) {
  return JSON.stringify([
    character.trim(),
    pinyin.trim(),
    meaning.trim()
  ])
}

function normalizeImportKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function buildImportedCardLookupKeys({ character, pinyin = '', meaning = '' }) {
  const normalizedCharacter = normalizeImportKeyPart(character)
  const normalizedPinyin = normalizeImportKeyPart(pinyin)
  const normalizedMeaning = normalizeImportKeyPart(meaning)

  return [
    normalizedCharacter && normalizedPinyin && normalizedMeaning
      ? `full:${normalizedCharacter}::${normalizedPinyin}::${normalizedMeaning}`
      : null,
    normalizedCharacter && normalizedPinyin
      ? `char-pinyin:${normalizedCharacter}::${normalizedPinyin}`
      : null,
    normalizedCharacter && normalizedMeaning
      ? `char-meaning:${normalizedCharacter}::${normalizedMeaning}`
      : null
  ].filter(Boolean)
}

function buildCharacterLookupKey(character) {
  return normalizeImportKeyPart(character)
}

function findComplementaryCharacterMatch(importedCard, cardsByCharacter) {
  const characterKey = buildCharacterLookupKey(importedCard.character)
  if (!characterKey) {
    return null
  }

  const candidates = Array.from(cardsByCharacter.get(characterKey) || [])
  const compatibleCandidates = candidates.filter(card => (
    Boolean(card.pinyin) !== Boolean(importedCard.pinyin) &&
    Boolean(card.meaning) !== Boolean(importedCard.meaning)
  ))

  return compatibleCandidates.length === 1 ? compatibleCandidates[0] : null
}

function mergeTagLists(existingTags = [], nextTags = []) {
  const merged = []
  const seen = new Set()

  for (const value of [...existingTags, ...nextTags]) {
    const tag = String(value || '').trim()
    const normalized = tag.toLowerCase()

    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    merged.push(tag)
  }

  return merged
}

function isPlecoLinkedSourceKey(sourceKey) {
  return typeof sourceKey === 'string' && sourceKey.startsWith('pleco:')
}

function createPlecoSourceKey(deckName) {
  return `pleco:${slugify(deckName)}`
}

function getLatestTimestamp(values) {
  return values.filter(Boolean).sort().at(-1) || null
}

export function normalizeDeckMetadata(input = {}) {
  const rawInput = typeof input === 'string' ? { name: input } : input
  const template = (
    getPrebuiltDeckBySourceKey(rawInput.sourceKey) ||
    getPrebuiltDeckByName(rawInput.name) ||
    getPrebuiltDeck(rawInput.slug)
  )

  const name = String(rawInput.name || template?.name || '').trim() || 'Untitled Deck'
  const kind = template?.kind || rawInput.kind || 'custom'
  const sourceKey = rawInput.sourceKey || template?.sourceKey || null
  const description = typeof rawInput.description === 'string'
    ? rawInput.description.trim()
    : template?.description || ''
  const color = typeof rawInput.color === 'string' && rawInput.color.trim()
    ? rawInput.color.trim()
    : template?.color || ''
  const sortOrder = Number.isFinite(rawInput.sortOrder)
    ? rawInput.sortOrder
    : template?.sortOrder ?? (kind === 'prebuilt' ? 100 : 1000)

  return {
    name,
    slug: slugify(rawInput.slug || template?.slug || sourceKey || name),
    description,
    kind,
    sourceKey,
    color,
    sortOrder
  }
}

function enrichDeckRecord(deck) {
  return {
    ...deck,
    ...normalizeDeckMetadata(deck)
  }
}

function enrichCardRecord(card, deckById, now = nowIso()) {
  const deck = card.deckId ? deckById.get(card.deckId) || null : null
  const status = getCardStatus(card, now)

  return {
    ...card,
    deckName: deck?.name || '',
    deckKind: deck?.kind || null,
    deckColor: deck?.color || '',
    deckSlug: deck?.slug || '',
    resolvedDeckId: deck?.id || null,
    status,
    statusLabel: cardStatusLabel(status),
    isDue: status === 'due',
    isNew: status === 'new',
    isMastered: status === 'mastered',
    isLearning: status === 'learning',
    isStandalone: !deck
  }
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

db.version(5).stores({
  cards: '++id, syncId, deckId, deckSyncId, character, pinyin, nextReview, lastReview, createdAt, updatedAt, deletedAt, dirty, suspended, *tags',
  decks: '++id, syncId, slug, name, kind, sourceKey, sortOrder, updatedAt, deletedAt, dirty',
  reviewLog: '++id, syncId, cardId, cardSyncId, reviewedAt, updatedAt, dirty',
  writingLog: '++id, syncId, cardId, cardSyncId, practicedAt, updatedAt, dirty',
  security: 'key',
  meta: 'key'
}).upgrade(async tx => {
  const decksTable = tx.table('decks')
  const decks = await decksTable.toArray()

  for (const deck of decks) {
    await decksTable.update(deck.id, normalizeDeckMetadata(deck))
  }
})

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

export async function getDueCards(deckFilter = null) {
  const now = nowIso()
  const [allDue, decks] = await Promise.all([
    db.cards.where('nextReview').belowOrEqual(now).toArray(),
    db.decks.toArray()
  ])
  const activeDeckIds = new Set(decks.filter(isActiveRecord).map(deck => deck.id))

  return allDue
    .filter(isActiveRecord)
    .filter(card => !card.suspended)
    .map(card => ({
      ...card,
      resolvedDeckId: activeDeckIds.has(card.deckId) ? card.deckId : null
    }))
    .filter(card => matchesDeckFilter(card, deckFilter))
    .sort((left, right) => left.nextReview.localeCompare(right.nextReview))
}

export async function getNewCards(deckFilter = null, limit = 20) {
  const [allCards, decks] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray()
  ])
  const activeDeckIds = new Set(decks.filter(isActiveRecord).map(deck => deck.id))

  return allCards
    .filter(isActiveRecord)
    .filter(card => !card.suspended && card.repetitions === 0)
    .map(card => ({
      ...card,
      resolvedDeckId: activeDeckIds.has(card.deckId) ? card.deckId : null
    }))
    .filter(card => matchesDeckFilter(card, deckFilter))
    .slice(0, limit)
}

export async function getAllCards(deckFilter = null) {
  const [cards, decks] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray()
  ])
  const activeDeckIds = new Set(decks.filter(isActiveRecord).map(deck => deck.id))

  return cards
    .filter(isActiveRecord)
    .map(card => ({
      ...card,
      resolvedDeckId: activeDeckIds.has(card.deckId) ? card.deckId : null
    }))
    .filter(card => matchesDeckFilter(card, deckFilter))
}

export async function getRecentCards(limit = 10) {
  const cards = await db.cards.orderBy('createdAt').reverse().toArray()
  return cards.filter(isActiveRecord).slice(0, limit)
}

export async function getCard(id) {
  const normalizedId = Number.isFinite(Number(id)) ? Number(id) : id
  const card = await db.cards.get(normalizedId)
  return isActiveRecord(card) ? card : null
}

export async function updateCard(id, changes) {
  const normalizedId = Number.isFinite(Number(id)) ? Number(id) : id
  const existing = await db.cards.get(normalizedId)
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

  return db.cards.update(normalizedId, {
    ...changes,
    deckSyncId,
    updatedAt: nowIso(),
    dirty: true
  })
}

export async function deleteCard(id) {
  const normalizedId = Number.isFinite(Number(id)) ? Number(id) : id
  const existing = await db.cards.get(normalizedId)
  if (!existing) return 0

  const deletedAt = nowIso()

  await db.cards.put({
    ...existing,
    deletedAt,
    updatedAt: deletedAt,
    dirty: true
  }, normalizedId)

  return 1
}

export async function bulkDeleteCards(ids = []) {
  const normalizedIds = normalizeRecordIds(ids)
  if (!normalizedIds.length) {
    return { deletedCount: 0 }
  }

  return db.transaction('rw', [db.cards], async () => {
    const existingCards = await db.cards.bulkGet(normalizedIds)
    const deletedAt = nowIso()
    const cardsToDelete = existingCards
      .filter(isActiveRecord)
      .map(card => ({
        ...card,
        deletedAt,
        updatedAt: deletedAt,
        dirty: true
      }))

    if (cardsToDelete.length) {
      await db.cards.bulkPut(cardsToDelete)
    }

    return {
      deletedCount: cardsToDelete.length
    }
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

export async function createDeck(deckInput) {
  const createdAt = nowIso()
  const deck = normalizeDeckMetadata(deckInput)
  const id = await db.decks.add({
    syncId: createSyncId(),
    ...deck,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    dirty: true
  })

  return id
}

export async function updateDeck(id, changes) {
  const existing = await db.decks.get(id)
  if (!existing) return 0

  const normalized = normalizeDeckMetadata({
    ...existing,
    ...changes
  })

  return db.decks.update(id, {
    ...normalized,
    updatedAt: nowIso(),
    dirty: true
  })
}

export async function bulkDeleteDecks(ids = []) {
  const normalizedIds = normalizeRecordIds(ids)
  if (!normalizedIds.length) {
    return {
      deletedDeckCount: 0,
      detachedCardCount: 0
    }
  }

  return db.transaction('rw', [db.decks, db.cards], async () => {
    const existingDecks = await db.decks.bulkGet(normalizedIds)
    const activeDecks = existingDecks.filter(isActiveRecord)
    if (!activeDecks.length) {
      return {
        deletedDeckCount: 0,
        detachedCardCount: 0
      }
    }

    const deckIdSet = new Set(activeDecks.map(deck => deck.id))
    const deletedAt = nowIso()
    const activeCards = (await db.cards.toArray()).filter(isActiveRecord)
    const cardsToDetach = activeCards
      .filter(card => deckIdSet.has(card.deckId))
      .map(card => ({
        ...card,
        deckId: null,
        deckSyncId: null,
        updatedAt: deletedAt,
        dirty: true
      }))
    const decksToDelete = activeDecks.map(deck => ({
      ...deck,
      deletedAt,
      updatedAt: deletedAt,
      dirty: true
    }))

    if (cardsToDetach.length) {
      await db.cards.bulkPut(cardsToDetach)
    }

    if (decksToDelete.length) {
      await db.decks.bulkPut(decksToDelete)
    }

    return {
      deletedDeckCount: decksToDelete.length,
      detachedCardCount: cardsToDetach.length
    }
  })
}

export async function getDeck(id) {
  const deck = await db.decks.get(id)
  return isActiveRecord(deck) ? enrichDeckRecord(deck) : null
}

export async function getDeckByName(name) {
  const deck = await db.decks.where('name').equals(name).first()
  return isActiveRecord(deck) ? enrichDeckRecord(deck) : null
}

export async function getDeckOptions() {
  const decks = await db.decks.toArray()
  return decks
    .filter(isActiveRecord)
    .map(enrichDeckRecord)
    .sort(compareDecks)
}

export async function getDecksWithCounts() {
  const now = nowIso()
  const [decks, cards] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray()
  ])

  const activeDecks = decks.filter(isActiveRecord)
  const activeDeckIds = new Set(activeDecks.map(deck => deck.id))
  const activeCards = cards.filter(isActiveRecord)

  return activeDecks
    .map(enrichDeckRecord)
    .map(deck => {
      const deckCards = activeCards.filter(card => activeDeckIds.has(card.deckId) && card.deckId === deck.id)
      const dueCount = deckCards.filter(card => !card.suspended && card.nextReview <= now).length
      const newCount = deckCards.filter(card => !card.suspended && card.repetitions === 0).length
      const knownCount = deckCards.filter(card => card.repetitions >= 3).length
      const learningCount = deckCards.filter(card => !card.suspended && card.repetitions > 0 && card.repetitions < 3).length
      const suspendedCount = deckCards.filter(card => card.suspended).length
      const lastReviewedAt = getLatestTimestamp(deckCards.map(card => card.lastReview))
      const lastUpdatedAt = getLatestTimestamp([deck.updatedAt, ...deckCards.map(card => card.updatedAt)])

      return {
        ...deck,
        cardCount: deckCards.length,
        dueCount,
        newCount,
        knownCount,
        learningCount,
        suspendedCount,
        standalone: false,
        completionRate: deckCards.length ? Math.round((knownCount / deckCards.length) * 100) : 0,
        lastReviewedAt,
        lastUpdatedAt
      }
    })
    .sort(compareDecks)
}

export async function getStandaloneCardSummary() {
  const now = nowIso()
  const [cards, decks] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray()
  ])
  const activeDeckIds = new Set(decks.filter(isActiveRecord).map(deck => deck.id))
  const standaloneCards = cards
    .filter(isActiveRecord)
    .filter(card => !activeDeckIds.has(card.deckId))

  const dueCount = standaloneCards.filter(card => !card.suspended && card.nextReview <= now).length
  const newCount = standaloneCards.filter(card => !card.suspended && card.repetitions === 0).length
  const knownCount = standaloneCards.filter(card => card.repetitions >= 3).length
  const suspendedCount = standaloneCards.filter(card => card.suspended).length

  return {
    id: DECK_FILTER_UNASSIGNED,
    name: 'Standalone Cards',
    description: 'Cards not assigned to a deck yet',
    kind: 'standalone',
    cardCount: standaloneCards.length,
    dueCount,
    newCount,
    knownCount,
    suspendedCount,
    standalone: true,
    lastReviewedAt: getLatestTimestamp(standaloneCards.map(card => card.lastReview)),
    lastUpdatedAt: getLatestTimestamp(standaloneCards.map(card => card.updatedAt))
  }
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

export async function repairDeckCards(deckId, wordsArray, tags = []) {
  const now = nowIso()
  const deck = deckId ? await db.decks.get(deckId) : null
  const deckSyncId = deck?.syncId || null

  const existingCards = await db.cards.toArray()
  const existingSignatures = new Set(
    existingCards
      .filter(isActiveRecord)
      .filter(card => card.deckId === deckId)
      .map(card => buildCardSignature(card))
  )

  const missingCards = wordsArray
    .filter(word => !existingSignatures.has(buildCardSignature(word)))
    .map(word => ({
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

  if (!missingCards.length) {
    return {
      addedCount: 0,
      totalCount: existingSignatures.size
    }
  }

  const batchSize = 100
  for (let index = 0; index < missingCards.length; index += batchSize) {
    await db.cards.bulkAdd(missingCards.slice(index, index + batchSize))
  }

  return {
    addedCount: missingCards.length,
    totalCount: existingSignatures.size + missingCards.length
  }
}

export async function refreshPlecoLinkedDecks(plecoCards = []) {
  if (!Array.isArray(plecoCards) || plecoCards.length === 0) {
    return {
      decksCreated: 0,
      decksRefreshed: 0,
      cardsAdded: 0,
      cardsEnriched: 0,
      cardsSkipped: 0
    }
  }

  return db.transaction('rw', [db.decks, db.cards], async () => {
    const decks = (await db.decks.toArray()).filter(isActiveRecord)
    const cards = (await db.cards.toArray()).filter(isActiveRecord)
    const deckBySourceKey = new Map()
    const deckByName = new Map()
    const cardByLookupKey = new Map()
    const cardsByCharacter = new Map()
    const cardsToAdd = []
    const createdDeckIds = new Set()
    const refreshedDeckIds = new Set()
    const summary = {
      decksCreated: 0,
      decksRefreshed: 0,
      cardsAdded: 0,
      cardsEnriched: 0,
      cardsSkipped: 0
    }

    function rememberCard(card) {
      for (const key of buildImportedCardLookupKeys(card)) {
        if (!cardByLookupKey.has(key)) {
          cardByLookupKey.set(key, card)
        }
      }

      const characterKey = buildCharacterLookupKey(card.character)
      if (!characterKey) {
        return
      }

      if (!cardsByCharacter.has(characterKey)) {
        cardsByCharacter.set(characterKey, new Set())
      }

      cardsByCharacter.get(characterKey).add(card)
    }

    function findExistingCard(importedCard) {
      for (const key of buildImportedCardLookupKeys(importedCard)) {
        const match = cardByLookupKey.get(key)
        if (match) {
          return match
        }
      }

      return findComplementaryCharacterMatch(importedCard, cardsByCharacter)
    }

    function rememberDeck(deck) {
      if (deck.sourceKey) {
        deckBySourceKey.set(deck.sourceKey, deck)
      }

      if (deck.kind === 'custom' && (!deck.sourceKey || isPlecoLinkedSourceKey(deck.sourceKey))) {
        deckByName.set(deck.name.toLowerCase(), deck)
      }
    }

    async function touchLinkedDeck(deckName, createIfMissing = false) {
      const normalizedDeckName = String(deckName || '').trim() || 'Pleco Import'
      const sourceKey = createPlecoSourceKey(normalizedDeckName)
      let deck = deckBySourceKey.get(sourceKey) || deckByName.get(normalizedDeckName.toLowerCase()) || null

      if (!deck) {
        if (!createIfMissing) {
          return null
        }

        const createdAt = nowIso()
        const metadata = normalizeDeckMetadata({
          name: normalizedDeckName,
          kind: 'custom',
          sourceKey,
          description: 'Linked to Pleco .txt refresh imports'
        })

        const newDeck = {
          syncId: createSyncId(),
          ...metadata,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
          dirty: true
        }

        const deckId = await db.decks.add(newDeck)
        deck = { ...newDeck, id: deckId }
        rememberDeck(deck)
        createdDeckIds.add(deck.id)
        return deck
      }

      const updates = {}

      if (deck.sourceKey !== sourceKey) {
        updates.sourceKey = sourceKey
      }

      if (!deck.description || deck.description === 'Imported from Pleco flashcards') {
        updates.description = 'Linked to Pleco .txt refresh imports'
      }

      if (Object.keys(updates).length > 0) {
        const updatedAt = nowIso()
        await db.decks.update(deck.id, {
          ...updates,
          updatedAt,
          dirty: true
        })

        deck = {
          ...deck,
          ...updates,
          updatedAt,
          dirty: true
        }
        rememberDeck(deck)
      }

      if (!createdDeckIds.has(deck.id)) {
        refreshedDeckIds.add(deck.id)
      }

      return deck
    }

    for (const deck of decks) {
      rememberDeck(deck)
    }

    for (const card of cards) {
      rememberCard(card)
    }

    for (const importedCard of plecoCards) {
      const record = {
        character: importedCard.character,
        pinyin: importedCard.pinyin || '',
        meaning: importedCard.meaning || '',
        deckName: String(importedCard.deckName || '').trim() || 'Pleco Import',
        tags: normalizeTags(importedCard.tags)
      }

      const existingCard = findExistingCard(record)
      const linkedDeck = await touchLinkedDeck(record.deckName, !existingCard)

      if (existingCard) {
        const updates = {}

        if (!existingCard.pinyin && record.pinyin) {
          updates.pinyin = record.pinyin
        }

        if (!existingCard.meaning && record.meaning) {
          updates.meaning = record.meaning
        }

        const mergedTags = mergeTagLists(existingCard.tags, record.tags)
        if (mergedTags.length !== (existingCard.tags || []).length) {
          updates.tags = mergedTags
        }

        if (existingCard.deckId && linkedDeck && existingCard.deckId === linkedDeck.id && existingCard.deckSyncId !== linkedDeck.syncId) {
          updates.deckSyncId = linkedDeck.syncId || null
        }

        if (Object.keys(updates).length === 0) {
          summary.cardsSkipped += 1
          continue
        }

        if (!existingCard.id) {
          Object.assign(existingCard, updates)
          rememberCard(existingCard)
          continue
        }

        const updatedAt = nowIso()

        await db.cards.update(existingCard.id, {
          ...updates,
          updatedAt,
          dirty: true
        })

        Object.assign(existingCard, updates, {
          updatedAt,
          dirty: true
        })
        rememberCard(existingCard)
        summary.cardsEnriched += 1
        continue
      }

      const createdAt = nowIso()
      const card = {
        syncId: createSyncId(),
        character: record.character,
        pinyin: record.pinyin,
        meaning: record.meaning,
        examples: [],
        deckId: linkedDeck?.id || null,
        deckSyncId: linkedDeck?.syncId || null,
        tags: record.tags,
        notes: '',
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

      cardsToAdd.push(card)
      rememberCard(card)
      summary.cardsAdded += 1
    }

    if (cardsToAdd.length) {
      const batchSize = 100
      for (let index = 0; index < cardsToAdd.length; index += batchSize) {
        await db.cards.bulkAdd(cardsToAdd.slice(index, index + batchSize))
      }
    }

    const emptyCreatedDeckIds = []
    for (const deckId of createdDeckIds) {
      const activeCardCount = (await db.cards.where('deckId').equals(deckId).toArray())
        .filter(isActiveRecord)
        .length

      if (activeCardCount === 0) {
        emptyCreatedDeckIds.push(deckId)
      }
    }

    if (emptyCreatedDeckIds.length) {
      const cleanedUpAt = nowIso()
      const createdDecks = await db.decks.bulkGet(emptyCreatedDeckIds)
      const decksToTombstone = createdDecks
        .filter(isActiveRecord)
        .map(deck => ({
          ...deck,
          deletedAt: cleanedUpAt,
          updatedAt: cleanedUpAt,
          dirty: true
        }))

      if (decksToTombstone.length) {
        await db.decks.bulkPut(decksToTombstone)
      }

      for (const deckId of emptyCreatedDeckIds) {
        createdDeckIds.delete(deckId)
      }
    }

    summary.decksCreated = createdDeckIds.size
    summary.decksRefreshed = refreshedDeckIds.size

    return summary
  })
}

export async function importPlecoDecks(plecoCards = []) {
  return refreshPlecoLinkedDecks(plecoCards)
}

export async function getTodayReviewCount() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return db.reviewLog
    .where('reviewedAt')
    .aboveOrEqual(todayStart.toISOString())
    .count()
}

export async function getTodayWritingCount() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return db.writingLog
    .where('practicedAt')
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

export async function getCardLibrary({
  search = '',
  deckFilter = 'all',
  status = 'all',
  sort = 'updated'
} = {}) {
  const now = nowIso()
  const [cards, decks] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray()
  ])

  const deckById = new Map(
    decks
      .filter(isActiveRecord)
      .map(deck => {
        const enriched = enrichDeckRecord(deck)
        return [enriched.id, enriched]
      })
  )

  const query = search.trim().toLowerCase()
  const enrichedCards = cards
    .filter(isActiveRecord)
    .map(card => enrichCardRecord(card, deckById, now))

  const filteredCards = enrichedCards.filter(card => {
    if (!matchesDeckFilter(card, deckFilter)) {
      return false
    }

    if (!matchesStatusFilter(card, status, now)) {
      return false
    }

    if (!query) {
      return true
    }

    return buildCardSearchText(card).includes(query)
  })

  const sortedCards = sortCards(filteredCards, sort)

  return {
    cards: sortedCards,
    summary: buildLibrarySummary(sortedCards)
  }
}

export async function getStudyActivity(limit = 12) {
  const [reviewLog, writingLog, cards, decks] = await Promise.all([
    db.reviewLog.toArray(),
    db.writingLog.toArray(),
    db.cards.toArray(),
    db.decks.toArray()
  ])

  const activeCards = cards.filter(isActiveRecord)
  const cardById = new Map(activeCards.map(card => [card.id, card]))
  const deckById = new Map(
    decks
      .filter(isActiveRecord)
      .map(deck => {
        const enriched = enrichDeckRecord(deck)
        return [enriched.id, enriched]
      })
  )

  const reviewItems = reviewLog.map(entry => {
    const card = cardById.get(entry.cardId) || null
    const deck = card?.deckId ? deckById.get(card.deckId) || null : null
    const ratingLabel = ['Again', 'Hard', 'Good', 'Easy'][entry.rating] || 'Review'

    return {
      id: `review-${entry.id}`,
      type: 'review',
      performedAt: entry.reviewedAt,
      cardId: card?.id || null,
      character: card?.character || 'Deleted card',
      pinyin: card?.pinyin || '',
      meaning: card?.meaning || '',
      deckId: deck?.id || null,
      deckName: deck?.name || '',
      label: ratingLabel,
      detail: `${entry.intervalDays} day${entry.intervalDays === 1 ? '' : 's'} interval`
    }
  })

  const writingItems = writingLog.map(entry => {
    const card = cardById.get(entry.cardId) || null
    const deck = card?.deckId ? deckById.get(card.deckId) || null : null
    const percentage = entry.score === null || entry.score === undefined
      ? null
      : Math.round(entry.score * 100)

    return {
      id: `writing-${entry.id}`,
      type: 'writing',
      performedAt: entry.practicedAt,
      cardId: card?.id || null,
      character: card?.character || 'Deleted card',
      pinyin: card?.pinyin || '',
      meaning: card?.meaning || '',
      deckId: deck?.id || null,
      deckName: deck?.name || '',
      label: percentage === null ? 'Writing' : `${percentage}% accuracy`,
      detail: `${entry.strokeCount} stroke${entry.strokeCount === 1 ? '' : 's'}`
    }
  })

  return [...reviewItems, ...writingItems]
    .sort((left, right) => right.performedAt.localeCompare(left.performedAt))
    .slice(0, limit)
}

export async function getStats() {
  const now = nowIso()
  const [allCards, decks, todayReviews, todayWritingCount] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray(),
    getTodayReviewCount(),
    getTodayWritingCount()
  ])

  const activeCards = allCards.filter(isActiveRecord)
  const activeDecks = decks.filter(isActiveRecord)
  const activeDeckIds = new Set(activeDecks.map(deck => deck.id))
  const dueCount = activeCards.filter(card => !card.suspended && card.nextReview <= now).length
  const totalCards = activeCards.length
  const knownCards = activeCards.filter(card => card.repetitions >= 3).length
  const newCards = activeCards.filter(card => card.repetitions === 0).length
  const unassignedCount = activeCards.filter(card => !activeDeckIds.has(card.deckId)).length
  const suspendedCount = activeCards.filter(card => card.suspended).length

  return {
    totalCards,
    dueCount,
    knownCards,
    newCards,
    todayReviews,
    todayWritingCount,
    deckCount: activeDecks.length,
    unassignedCount,
    suspendedCount
  }
}
