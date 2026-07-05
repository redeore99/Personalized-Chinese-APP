import { db, getMetaValue, setMetaValue } from './db'
import { convertNumberedPinyin } from './pinyin'

// Offline CC-CEDICT dictionary.
// Downloaded once on demand (~8 MB text, cached in IndexedDB), then used for:
// - Add Card auto-fill (pinyin + meaning)
// - Article mode segmentation and word lookups
// CC-CEDICT is CC BY-SA licensed (https://cc-cedict.org).
export const DICT_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/jtoy/crdict@master/cedict_ts.u8'

const MAX_WORD_LENGTH = 8

let dictMapPromise = null

function normalizePinyin(rawPinyin) {
  // CC-CEDICT writes ü as "u:" — our converter understands "v"
  return rawPinyin.replace(/u:/gi, 'v').trim()
}

function parseCedictLine(line) {
  if (!line || line.startsWith('#')) return null

  // Format: TRAD SIMP [pin1 yin1] /def 1/def 2/
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/)
  if (!match) return null

  const [, trad, simp, pinyin, defsRaw] = match
  const defs = defsRaw
    .split('/')
    .map(def => def.trim())
    .filter(Boolean)
    .filter(def => !/^see (also )?[一-鿿]/.test(def))

  if (!defs.length) return null

  return {
    simp,
    trad,
    pinyin: normalizePinyin(pinyin),
    defs: defs.slice(0, 6).join('; ').slice(0, 500)
  }
}

export async function getDictStatus() {
  const [count, loadedAt] = await Promise.all([
    db.dict.count(),
    getMetaValue('dictLoadedAt')
  ])

  return {
    loaded: count > 0,
    entryCount: count,
    loadedAt
  }
}

export async function downloadDictionary(onProgress = () => {}) {
  onProgress('Downloading CC-CEDICT (~8 MB)...')

  const response = await fetch(DICT_SOURCE_URL)
  if (!response.ok) {
    throw new Error(`Dictionary download failed (HTTP ${response.status}). Check your connection and try again.`)
  }

  const text = await response.text()

  onProgress('Parsing dictionary entries...')
  const lines = text.split('\n')
  const entries = []
  for (const line of lines) {
    const entry = parseCedictLine(line)
    if (entry) entries.push(entry)
  }

  if (entries.length < 1000) {
    throw new Error('The downloaded dictionary looks incomplete. Please try again later.')
  }

  onProgress(`Saving ${entries.length.toLocaleString()} entries...`)
  await db.transaction('rw', [db.dict], async () => {
    await db.dict.clear()
    const batchSize = 5000
    for (let index = 0; index < entries.length; index += batchSize) {
      await db.dict.bulkAdd(entries.slice(index, index + batchSize))
    }
  })

  await setMetaValue('dictLoadedAt', new Date().toISOString())
  dictMapPromise = null

  return { entryCount: entries.length }
}

export async function clearDictionary() {
  await db.dict.clear()
  await setMetaValue('dictLoadedAt', null)
  dictMapPromise = null
}

function scoreEntry(entry) {
  let score = 0
  if (/^(variant of|old variant of|archaic)/i.test(entry.defs)) score -= 4
  if (/^surname\b/i.test(entry.defs)) score -= 2
  if (/^[A-Z]/.test(entry.pinyin)) score -= 1 // proper nouns after common words
  score += Math.min(entry.defs.length, 120) / 120
  return score
}

export async function lookupWord(word) {
  if (!word) return []
  const entries = await db.dict.where('simp').equals(word).toArray()
  return entries.sort((left, right) => scoreEntry(right) - scoreEntry(left))
}

// Best-effort auto-fill values for the Add Card form.
export async function autofillFor(word) {
  const entries = await lookupWord(word)
  if (!entries.length) return null

  const best = entries[0]
  const meanings = entries
    .slice(0, 2)
    .map(entry => entry.defs)
    .join(' | ')

  return {
    pinyin: convertNumberedPinyin(best.pinyin).toLowerCase(),
    meaning: meanings.slice(0, 300)
  }
}

// In-memory map for fast segmentation (built lazily, ~1-2s for 100k entries).
export function buildDictMap() {
  if (!dictMapPromise) {
    dictMapPromise = (async () => {
      const entries = await db.dict.toArray()
      const map = new Map()
      for (const entry of entries) {
        const existing = map.get(entry.simp)
        if (existing) {
          existing.push(entry)
        } else {
          map.set(entry.simp, [entry])
        }
      }
      for (const list of map.values()) {
        list.sort((left, right) => scoreEntry(right) - scoreEntry(left))
      }
      return map
    })()
  }

  return dictMapPromise
}

const HANZI_PATTERN = /[㐀-䶿一-鿿]/

export function isHanzi(char) {
  return HANZI_PATTERN.test(char)
}

// Greedy longest-match segmentation against the dictionary plus the user's
// own card characters. Non-hanzi runs are kept as plain text tokens.
export function segmentText(text, dictMap, knownWords = new Set()) {
  const tokens = []
  const chars = Array.from(text || '')
  let index = 0
  let plainBuffer = ''

  const flushPlain = () => {
    if (plainBuffer) {
      tokens.push({ text: plainBuffer, type: 'plain' })
      plainBuffer = ''
    }
  }

  while (index < chars.length) {
    const char = chars[index]

    if (!isHanzi(char)) {
      plainBuffer += char
      index += 1
      continue
    }

    flushPlain()

    let matched = null
    const maxLength = Math.min(MAX_WORD_LENGTH, chars.length - index)
    for (let length = maxLength; length >= 1; length--) {
      const candidate = chars.slice(index, index + length).join('')
      if (knownWords.has(candidate) || dictMap.has(candidate)) {
        matched = candidate
        break
      }
    }

    if (matched) {
      tokens.push({
        text: matched,
        type: 'word',
        inDict: dictMap.has(matched),
        known: knownWords.has(matched)
      })
      index += Array.from(matched).length
    } else {
      tokens.push({ text: char, type: 'word', inDict: false, known: knownWords.has(char) })
      index += 1
    }
  }

  flushPlain()
  return tokens
}
