import { db, getLocalDataCounts, normalizeDeckMetadata, setMetaValue } from './db'
import { isSupabaseConfigured, supabase } from './supabase'

const REMOTE_FETCH_LIMIT = 5000
const LEGACY_TABLE_COLUMNS = {
  decks: ['id', 'owner_id', 'name', 'created_at', 'updated_at', 'deleted_at']
}

function countsDiffer(localCounts, cloudCounts) {
  return (
    localCounts.cards !== cloudCounts.cards ||
    localCounts.decks !== cloudCounts.decks ||
    localCounts.reviewLog !== cloudCounts.reviewLog ||
    localCounts.writingLog !== cloudCounts.writingLog
  )
}

function combinePushCounts(primaryResult, secondaryResult) {
  return {
    pushed: {
      decks: (primaryResult?.pushed?.decks || 0) + (secondaryResult?.pushed?.decks || 0),
      cards: (primaryResult?.pushed?.cards || 0) + (secondaryResult?.pushed?.cards || 0),
      reviewLogs: (primaryResult?.pushed?.reviewLogs || 0) + (secondaryResult?.pushed?.reviewLogs || 0),
      writingLogs: (primaryResult?.pushed?.writingLogs || 0) + (secondaryResult?.pushed?.writingLogs || 0)
    }
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured.')
  }
}

function isLocalNewer(localUpdatedAt, remoteUpdatedAt) {
  if (!localUpdatedAt) return false
  if (!remoteUpdatedAt) return true
  return new Date(localUpdatedAt).getTime() > new Date(remoteUpdatedAt).getTime()
}

function shouldKeepLocalVersion(existing, remoteUpdatedAt, remoteDeletedAt) {
  if (!existing) {
    return false
  }

  const localDeletedAt = existing.deletedAt || null

  // Tombstones win over non-deleted copies so a deletion on one device
  // cannot be silently undone by a stale clean copy from another device.
  if (localDeletedAt && !remoteDeletedAt) {
    return true
  }

  if (remoteDeletedAt) {
    return false
  }

  if (existing.dirty && isLocalNewer(existing.updatedAt, remoteUpdatedAt)) {
    return true
  }

  return false
}

function serializeDeck(deck, ownerId) {
  return {
    id: deck.syncId,
    owner_id: ownerId,
    name: deck.name,
    slug: deck.slug,
    description: deck.description,
    kind: deck.kind,
    source_key: deck.sourceKey,
    color: deck.color,
    sort_order: deck.sortOrder,
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
    deleted_at: deck.deletedAt
  }
}

function serializeCard(card, ownerId) {
  return {
    id: card.syncId,
    owner_id: ownerId,
    deck_id: card.deckSyncId || null,
    character: card.character,
    pinyin: card.pinyin,
    meaning: card.meaning,
    examples: Array.isArray(card.examples) ? card.examples : [],
    tags: Array.isArray(card.tags) ? card.tags : [],
    notes: card.notes,
    interval: card.interval,
    repetitions: card.repetitions,
    ease_factor: card.easeFactor,
    next_review: card.nextReview,
    last_review: card.lastReview,
    writing_score: card.writingScore,
    writing_count: card.writingCount,
    suspended: Boolean(card.suspended),
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    deleted_at: card.deletedAt
  }
}

function serializeReviewLog(entry, ownerId) {
  return {
    id: entry.syncId,
    owner_id: ownerId,
    card_id: entry.cardSyncId,
    reviewed_at: entry.reviewedAt,
    rating: entry.rating,
    interval_days: entry.intervalDays,
    updated_at: entry.updatedAt
  }
}

function serializeWritingLog(entry, ownerId) {
  return {
    id: entry.syncId,
    owner_id: ownerId,
    card_id: entry.cardSyncId,
    practiced_at: entry.practicedAt,
    score: entry.score,
    stroke_count: entry.strokeCount,
    updated_at: entry.updatedAt
  }
}

async function fetchRemoteTable(tableName) {
  requireSupabase()

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order('updated_at', { ascending: true })
    .range(0, REMOTE_FETCH_LIMIT - 1)

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

async function countRemoteTable(tableName) {
  requireSupabase()

  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })

  if (error) {
    throw new Error(error.message)
  }

  return count || 0
}

async function countRemoteActiveTable(tableName) {
  requireSupabase()

  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (error) {
    throw new Error(error.message)
  }

  return count || 0
}

async function upsertRemoteDecks(rows) {
  if (!rows.length) return

  for (const row of rows) {
    const existing = await db.decks.where('syncId').equals(row.id).first()
    if (shouldKeepLocalVersion(existing, row.updated_at, row.deleted_at)) {
      continue
    }

    const metadata = normalizeDeckMetadata({
      name: row.name,
      slug: row.slug,
      description: row.description,
      kind: row.kind,
      sourceKey: row.source_key,
      color: row.color,
      sortOrder: row.sort_order
    })

    const payload = {
      syncId: row.id,
      ...metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      dirty: false
    }

    if (existing) {
      await db.decks.update(existing.id, payload)
    } else {
      await db.decks.add(payload)
    }
  }
}

async function upsertRemoteCards(rows) {
  if (!rows.length) return

  const localDecks = await db.decks.toArray()
  const deckIdBySyncId = new Map(localDecks.map(deck => [deck.syncId, deck.id]))

  for (const row of rows) {
    const existing = await db.cards.where('syncId').equals(row.id).first()
    if (shouldKeepLocalVersion(existing, row.updated_at, row.deleted_at)) {
      continue
    }

    const payload = {
      syncId: row.id,
      deckId: row.deck_id ? deckIdBySyncId.get(row.deck_id) || null : null,
      deckSyncId: row.deck_id || null,
      character: row.character,
      pinyin: row.pinyin || '',
      meaning: row.meaning || '',
      examples: Array.isArray(row.examples) ? row.examples : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      notes: row.notes || '',
      interval: row.interval ?? 0,
      repetitions: row.repetitions ?? 0,
      easeFactor: row.ease_factor ?? 2.5,
      nextReview: row.next_review,
      lastReview: row.last_review,
      writingScore: row.writing_score,
      writingCount: row.writing_count ?? 0,
      suspended: Boolean(row.suspended),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      dirty: false
    }

    if (existing) {
      await db.cards.update(existing.id, payload)
    } else {
      await db.cards.add(payload)
    }
  }
}

async function upsertRemoteReviewLogs(rows) {
  if (!rows.length) return

  const localCards = await db.cards.toArray()
  const cardIdBySyncId = new Map(localCards.map(card => [card.syncId, card.id]))

  for (const row of rows) {
    const existing = await db.reviewLog.where('syncId').equals(row.id).first()
    if (existing?.dirty && isLocalNewer(existing.updatedAt, row.updated_at)) {
      continue
    }

    const payload = {
      syncId: row.id,
      cardId: row.card_id ? cardIdBySyncId.get(row.card_id) || null : null,
      cardSyncId: row.card_id || null,
      reviewedAt: row.reviewed_at,
      rating: row.rating,
      intervalDays: row.interval_days,
      updatedAt: row.updated_at,
      dirty: false
    }

    if (existing) {
      await db.reviewLog.update(existing.id, payload)
    } else {
      await db.reviewLog.add(payload)
    }
  }
}

async function upsertRemoteWritingLogs(rows) {
  if (!rows.length) return

  const localCards = await db.cards.toArray()
  const cardIdBySyncId = new Map(localCards.map(card => [card.syncId, card.id]))

  for (const row of rows) {
    const existing = await db.writingLog.where('syncId').equals(row.id).first()
    if (existing?.dirty && isLocalNewer(existing.updatedAt, row.updated_at)) {
      continue
    }

    const payload = {
      syncId: row.id,
      cardId: row.card_id ? cardIdBySyncId.get(row.card_id) || null : null,
      cardSyncId: row.card_id || null,
      practicedAt: row.practiced_at,
      score: row.score,
      strokeCount: row.stroke_count,
      updatedAt: row.updated_at,
      dirty: false
    }

    if (existing) {
      await db.writingLog.update(existing.id, payload)
    } else {
      await db.writingLog.add(payload)
    }
  }
}

async function pullFromCloud() {
  const [decks, cards, reviewLogs, writingLogs] = await Promise.all([
    fetchRemoteTable('decks'),
    fetchRemoteTable('cards'),
    fetchRemoteTable('review_logs'),
    fetchRemoteTable('writing_logs')
  ])

  await db.transaction('rw', [db.decks, db.cards, db.reviewLog, db.writingLog], async () => {
    await upsertRemoteDecks(decks)
    await upsertRemoteCards(cards)
    await upsertRemoteReviewLogs(reviewLogs)
    await upsertRemoteWritingLogs(writingLogs)
  })

  return {
    pulled: {
      decks: decks.length,
      cards: cards.length,
      reviewLogs: reviewLogs.length,
      writingLogs: writingLogs.length
    }
  }
}

async function upsertRemoteRows(tableName, rows) {
  if (!rows.length) {
    return { usedLegacyFallback: false }
  }

  requireSupabase()
  const { error } = await supabase.from(tableName).upsert(rows, { onConflict: 'id' })

  if (!error) {
    return { usedLegacyFallback: false }
  }

  if (
    tableName === 'decks' &&
    (
      /column .* does not exist/i.test(error.message) ||
      /schema cache/i.test(error.message) ||
      /Could not find the .* column/i.test(error.message)
    )
  ) {
    const fallbackRows = rows.map(row => {
      const allowedColumns = LEGACY_TABLE_COLUMNS[tableName]
      return Object.fromEntries(
        Object.entries(row).filter(([key]) => allowedColumns.includes(key))
      )
    })

    const { error: fallbackError } = await supabase
      .from(tableName)
      .upsert(fallbackRows, { onConflict: 'id' })

    if (fallbackError) {
      throw new Error(fallbackError.message)
    }

    return { usedLegacyFallback: true }
  }

  throw new Error(error.message)
}

async function markRowsSynced(table, syncIds) {
  if (!syncIds.length) return

  await table
    .where('syncId')
    .anyOf(syncIds)
    .modify(row => {
      row.dirty = false
    })
}

async function pushRowsToCloud(userId, { includeClean = false } = {}) {
  const [decks, cards, reviewLogs, writingLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLog.toArray(),
    db.writingLog.toArray()
  ])

  const deckRows = decks
    .filter(deck => includeClean || deck.dirty)
    .map(deck => serializeDeck(deck, userId))

  const cardRows = cards
    .filter(card => includeClean || card.dirty)
    .map(card => serializeCard(card, userId))

  const reviewRows = reviewLogs
    .filter(entry => (includeClean || entry.dirty) && entry.cardSyncId)
    .map(entry => serializeReviewLog(entry, userId))

  const writingRows = writingLogs
    .filter(entry => (includeClean || entry.dirty) && entry.cardSyncId)
    .map(entry => serializeWritingLog(entry, userId))

  const deckUpsertResult = await upsertRemoteRows('decks', deckRows)
  if (!deckUpsertResult.usedLegacyFallback) {
    await markRowsSynced(db.decks, deckRows.map(row => row.id))
  }

  await upsertRemoteRows('cards', cardRows)
  await markRowsSynced(db.cards, cardRows.map(row => row.id))

  await upsertRemoteRows('review_logs', reviewRows)
  await markRowsSynced(db.reviewLog, reviewRows.map(row => row.id))

  await upsertRemoteRows('writing_logs', writingRows)
  await markRowsSynced(db.writingLog, writingRows.map(row => row.id))

  return {
    pushed: {
      decks: deckRows.length,
      cards: cardRows.length,
      reviewLogs: reviewRows.length,
      writingLogs: writingRows.length
    }
  }
}

export async function syncWithCloud(userId, { forceFullReconcile = false } = {}) {
  requireSupabase()

  if (!userId) {
    throw new Error('Cannot sync without an authenticated user.')
  }

  let pullResult = await pullFromCloud()
  let pushResult = await pushRowsToCloud(userId)
  let localCounts = await getLocalDataCounts()
  let cloudCounts = await getCloudDataCounts()
  let fullReconcilePerformed = false

  if (forceFullReconcile || countsDiffer(localCounts, cloudCounts)) {
    fullReconcilePerformed = true

    const reconcilePushResult = await pushRowsToCloud(userId, { includeClean: true })
    pushResult = combinePushCounts(pushResult, reconcilePushResult)
    pullResult = await pullFromCloud()
    localCounts = await getLocalDataCounts()
    cloudCounts = await getCloudDataCounts()
  }

  const syncedAt = new Date().toISOString()
  const countsStillDiffer = countsDiffer(localCounts, cloudCounts)

  await setMetaValue(`cloud:lastSync:${userId}`, syncedAt)
  if (fullReconcilePerformed) {
    await setMetaValue(`cloud:lastMigration:${userId}`, syncedAt)
  }

  return {
    syncedAt,
    reconciledAt: fullReconcilePerformed ? syncedAt : null,
    fullReconcilePerformed,
    countsStillDiffer,
    localCounts,
    cloudCounts,
    ...pullResult,
    ...pushResult
  }
}

export async function migrateLocalDataToCloud(userId) {
  requireSupabase()

  if (!userId) {
    throw new Error('Cannot migrate data without an authenticated user.')
  }

  return syncWithCloud(userId, { forceFullReconcile: true })
}

export async function getCloudDataCounts() {
  requireSupabase()

  const [decks, cards, reviewLog, writingLog] = await Promise.all([
    countRemoteActiveTable('decks'),
    countRemoteActiveTable('cards'),
    countRemoteTable('review_logs'),
    countRemoteTable('writing_logs')
  ])

  return {
    decks,
    cards,
    reviewLog,
    writingLog
  }
}
