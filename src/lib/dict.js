import { db, getMetaValue, setMetaValue } from './db'
import { convertNumberedPinyin } from './pinyin'

// Offline CC-CEDICT dictionary.
// Downloaded once on demand (~3.8 MB gzipped, cached in IndexedDB), then used for:
// - Add Card auto-fill (pinyin + meaning)
// - Article mode and book reader segmentation and word lookups
// CC-CEDICT is CC BY-SA licensed (https://cc-cedict.org).
//
// The file is served from our own origin (see scripts/update-dictionary.mjs)
// because mdbg.net sends no CORS header, and because the third-party mirror
// this used to point at silently carried only ~36% of CC-CEDICT.
export const DICT_SOURCE_URL = '/dict/cedict_ts.u8.gz'

// A complete CC-CEDICT has ~125k entries. Anything far below that means the
// device is holding a stale or truncated copy and should re-download.
export const DICT_MIN_ENTRIES = 100000

const MAX_WORD_LENGTH = 8

let dictMapPromise = null

// Vercel may or may not decompress the .gz for us depending on how it
// negotiates the response, so the gzip magic number decides.
async function readDictionaryText(response) {
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b

  if (!isGzip) {
    return new TextDecoder('utf-8').decode(buffer)
  }

  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot decompress the dictionary. Please update your browser.')
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function normalizePinyin(rawPinyin) {
  // CC-CEDICT writes ü as "u:" — our converter understands "v"
  return rawPinyin.replace(/u:/gi, 'v').trim()
}

const CROSS_REFERENCE = /^see (also )?[一-鿿]/
// CC-CEDICT carries thousands of modern counties and districts. In classical
// text their names collide with ordinary character pairs, so a cross-reference
// pointing at one is not worth keeping the headword for.
const ADMINISTRATIVE_DIVISION = /^see (also )?[一-鿿]+(县|區|区|市|鎮|镇|鄉|乡|街道)$/

// "see 沙悟淨|沙悟净[Sha1 Wu4 jing4]" reads badly in the popup, so the
// traditional half and the bracketed pinyin are dropped for display.
function tidyCrossReference(def) {
  return def
    .replace(/([一-鿿]+)\|([一-鿿]+)/g, '$2')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCedictLine(line) {
  if (!line || line.startsWith('#')) return null

  // Format: TRAD SIMP [pin1 yin1] /def 1/def 2/
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/)
  if (!match) return null

  const [, trad, simp, pinyin, defsRaw] = match
  const allDefs = defsRaw
    .split('/')
    .map(def => def.trim())
    .filter(Boolean)

  // Cross-references are noise when a real definition exists, but dropping the
  // headword when they are all it has removed 3,874 entries from the dictionary,
  // including proper nouns this app needs (悟净, 二郎, 一壁厢, 舍利子). Those
  // words then failed to segment as units and could not be looked up at all.
  //
  // The exception is administrative divisions: keeping those made things worse,
  // because 城中 ("in the city") and 满城 ("the whole city") would each become a
  // single token glossed as a district in Guangxi.
  const substantive = allDefs.filter(def => !CROSS_REFERENCE.test(def))
  let defs = substantive

  if (!defs.length) {
    const tidied = allDefs.map(tidyCrossReference)
    defs = tidied.every(def => ADMINISTRATIVE_DIVISION.test(def)) ? [] : tidied
  }

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
    loadedAt,
    // Devices that loaded the old truncated mirror need a refresh.
    outdated: count > 0 && count < DICT_MIN_ENTRIES
  }
}

export async function downloadDictionary(onProgress = () => {}) {
  onProgress('Downloading CC-CEDICT (~3.8 MB)...')

  const response = await fetch(DICT_SOURCE_URL)
  if (!response.ok) {
    throw new Error(`Dictionary download failed (HTTP ${response.status}). Check your connection and try again.`)
  }

  onProgress('Decompressing dictionary...')
  const text = await readDictionaryText(response)

  onProgress('Parsing dictionary entries...')
  const lines = text.split('\n')
  const entries = []
  for (const line of lines) {
    const entry = parseCedictLine(line)
    if (entry) entries.push(entry)
  }

  if (entries.length < DICT_MIN_ENTRIES) {
    throw new Error(
      `The downloaded dictionary looks incomplete (${entries.length.toLocaleString()} entries, ` +
      `expected at least ${DICT_MIN_ENTRIES.toLocaleString()}). Please try again later.`
    )
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
