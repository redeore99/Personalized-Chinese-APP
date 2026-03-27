const DEFAULT_PLECO_DECK_NAME = 'Pleco Import'
const PLECO_TEXT_FILE_PATTERN = /\.txt$/i

const HEADER_FIELD_MATCHERS = [
  {
    field: 'character',
    aliases: ['character', 'characters', 'word', 'headword', 'hanzi', 'chinese', 'simplified', 'traditional', 'entry']
  },
  {
    field: 'pinyin',
    aliases: ['pinyin', 'pronunciation', 'pron', 'reading', 'romanization', 'bopomofo']
  },
  {
    field: 'meaning',
    aliases: ['meaning', 'definition', 'gloss', 'translation', 'english', 'english definition', 'sample definition']
  },
  {
    field: 'deck',
    aliases: ['deck', 'decks', 'category', 'categories', 'list', 'group', 'folder']
  },
  {
    field: 'tags',
    aliases: ['tag', 'tags', 'label', 'labels']
  }
]

function normalizeHeaderName(value) {
  return String(value || '')
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/^\ufeff/, '')
    .replace(/\r/g, '')
    .trim()
}

function normalizeLookupPart(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function uniqueValues(values) {
  const seen = new Set()
  const result = []

  for (const value of values) {
    const text = sanitizeText(value)
    const normalized = text.toLowerCase()

    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(text)
  }

  return result
}

function splitListValue(value) {
  const text = sanitizeText(value)
  if (!text) {
    return []
  }

  const separators = [';', '|', '\n', ',']
  const separator = separators.find(candidate => text.includes(candidate))

  if (!separator) {
    return [text]
  }

  return uniqueValues(
    text
      .split(separator)
      .map(item => sanitizeText(item))
      .filter(Boolean)
  )
}

function detectDelimiter(text) {
  const candidates = ['\t', ',', ';', '|']
  const sampleLines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 8)

  const scoredCandidates = candidates.map(delimiter => {
    const score = sampleLines.reduce((total, line) => total + (line.split(delimiter).length - 1), 0)
    return { delimiter, score }
  })

  const bestCandidate = scoredCandidates.sort((left, right) => right.score - left.score)[0]
  return bestCandidate?.score > 0 ? bestCandidate.delimiter : '\t'
}

function parseDelimitedText(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let insideQuotes = false

  const flushField = () => {
    row.push(field)
    field = ''
  }

  const flushRow = () => {
    flushField()
    if (row.some(value => sanitizeText(value))) {
      rows.push(row)
    }
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]
    const next = text[index + 1]

    if (current === '"') {
      if (insideQuotes && next === '"') {
        field += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (!insideQuotes && current === delimiter) {
      flushField()
      continue
    }

    if (!insideQuotes && current === '\n') {
      flushRow()
      continue
    }

    if (!insideQuotes && current === '\r') {
      continue
    }

    field += current
  }

  if (field || row.length) {
    flushRow()
  }

  return rows
}

function resolveHeaderField(headerName) {
  if (!headerName) {
    return null
  }

  for (const matcher of HEADER_FIELD_MATCHERS) {
    if (matcher.aliases.some(alias => headerName === alias || headerName.includes(alias))) {
      return matcher.field
    }
  }

  return null
}

function looksLikeHeader(row) {
  const matches = row
    .map(value => resolveHeaderField(normalizeHeaderName(value)))
    .filter(Boolean)

  return new Set(matches).size >= 2
}

function inferColumnMap(rows) {
  const firstRow = rows[0] || []
  if (!firstRow.length) {
    return {
      hasHeader: false,
      map: {
        character: 0,
        pinyin: 1,
        meaning: 2,
        deck: 3,
        tags: 4
      }
    }
  }

  if (!looksLikeHeader(firstRow)) {
    return {
      hasHeader: false,
      map: {
        character: 0,
        pinyin: 1,
        meaning: 2,
        deck: 3,
        tags: 4
      }
    }
  }

  const map = {}
  firstRow.forEach((value, index) => {
    const field = resolveHeaderField(normalizeHeaderName(value))
    if (field && map[field] === undefined) {
      map[field] = index
    }
  })

  return { hasHeader: true, map }
}

function readMappedValue(row, columnMap, field) {
  const index = columnMap[field]
  return index === undefined ? '' : sanitizeText(row[index])
}

function buildLookupKeys({ character, pinyin = '', meaning = '' }) {
  const normalizedCharacter = normalizeLookupPart(character)
  const normalizedPinyin = normalizeLookupPart(pinyin)
  const normalizedMeaning = normalizeLookupPart(meaning)

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
  return normalizeLookupPart(character)
}

function buildRowRecord(row, rowNumber, columnMap) {
  const character = readMappedValue(row, columnMap, 'character')
  if (!character) {
    return null
  }

  return {
    rowNumber,
    character,
    pinyin: readMappedValue(row, columnMap, 'pinyin'),
    meaning: readMappedValue(row, columnMap, 'meaning'),
    categoryNames: splitListValue(readMappedValue(row, columnMap, 'deck')),
    tags: splitListValue(readMappedValue(row, columnMap, 'tags'))
  }
}

function findComplementaryCharacterMatch(record, recordsByCharacter) {
  const characterKey = buildCharacterLookupKey(record.character)
  if (!characterKey) {
    return null
  }

  const candidates = Array.from(recordsByCharacter.get(characterKey) || [])
  const compatibleCandidates = candidates.filter(candidate => (
    Boolean(candidate.pinyin) !== Boolean(record.pinyin) &&
    Boolean(candidate.meaning) !== Boolean(record.meaning)
  ))

  return compatibleCandidates.length === 1 ? compatibleCandidates[0] : null
}

function findAggregatedCard(record, lookupByKey, recordsByCharacter) {
  for (const key of buildLookupKeys(record)) {
    const match = lookupByKey.get(key)
    if (match) {
      return match
    }
  }

  return findComplementaryCharacterMatch(record, recordsByCharacter)
}

function rememberAggregatedCard(record, lookupByKey, recordsByCharacter) {
  for (const key of buildLookupKeys(record)) {
    if (!lookupByKey.has(key)) {
      lookupByKey.set(key, record)
    }
  }

  const characterKey = buildCharacterLookupKey(record.character)
  if (!characterKey) {
    return
  }

  if (!recordsByCharacter.has(characterKey)) {
    recordsByCharacter.set(characterKey, new Set())
  }

  recordsByCharacter.get(characterKey).add(record)
}

function normalizeAggregatedCard(record, defaultDeckName) {
  const categoryNames = uniqueValues(record.categoryNames)
  const primaryDeckName = categoryNames[0] || defaultDeckName

  return {
    character: record.character,
    pinyin: record.pinyin,
    meaning: record.meaning,
    deckName: primaryDeckName,
    categoryNames,
    tags: uniqueValues([...categoryNames.slice(1), ...record.tags])
  }
}

function validatePlecoTextFile(file) {
  const name = sanitizeText(file?.name)

  if (name && !PLECO_TEXT_FILE_PATTERN.test(name)) {
    throw new Error('Pleco linked refresh currently supports .txt exports only.')
  }
}

export async function parsePlecoImportFile(file, options = {}) {
  validatePlecoTextFile(file)
  const text = await file.text()
  return parsePlecoImportText(text, options)
}

export function parsePlecoImportText(text, options = {}) {
  const normalizedText = String(text || '').replace(/^\ufeff/, '').trim()
  const defaultDeckName = sanitizeText(options.defaultDeckName) || DEFAULT_PLECO_DECK_NAME

  if (!normalizedText) {
    throw new Error('The selected file is empty.')
  }

  const delimiter = detectDelimiter(normalizedText)
  const rows = parseDelimitedText(normalizedText, delimiter)

  if (!rows.length) {
    throw new Error('The selected file could not be read as a Pleco .txt export.')
  }

  const { hasHeader, map } = inferColumnMap(rows)
  const dataRows = hasHeader ? rows.slice(1) : rows
  const aggregatedCards = []
  const lookupByKey = new Map()
  const recordsByCharacter = new Map()
  let invalidRowCount = 0

  dataRows.forEach((row, index) => {
    const record = buildRowRecord(row, index + (hasHeader ? 2 : 1), map)
    if (!record) {
      invalidRowCount += 1
      return
    }

    const existingRecord = findAggregatedCard(record, lookupByKey, recordsByCharacter)
    if (existingRecord) {
      if (!existingRecord.pinyin && record.pinyin) {
        existingRecord.pinyin = record.pinyin
      }

      if (!existingRecord.meaning && record.meaning) {
        existingRecord.meaning = record.meaning
      }

      existingRecord.categoryNames = uniqueValues([
        ...existingRecord.categoryNames,
        ...record.categoryNames
      ])
      existingRecord.tags = uniqueValues([
        ...existingRecord.tags,
        ...record.tags
      ])
      rememberAggregatedCard(existingRecord, lookupByKey, recordsByCharacter)
      return
    }

    const nextRecord = {
      character: record.character,
      pinyin: record.pinyin,
      meaning: record.meaning,
      categoryNames: uniqueValues(record.categoryNames),
      tags: uniqueValues(record.tags)
    }

    aggregatedCards.push(nextRecord)
    rememberAggregatedCard(nextRecord, lookupByKey, recordsByCharacter)
  })

  const cards = aggregatedCards.map(record => normalizeAggregatedCard(record, defaultDeckName))
  const deckNames = uniqueValues(cards.map(card => card.deckName))

  if (!cards.length) {
    throw new Error('No importable cards were found. Export a Pleco .txt file and try again.')
  }

  return {
    delimiter,
    hasHeader,
    rowCount: dataRows.length,
    invalidRowCount,
    deckCount: deckNames.length,
    cardCount: cards.length,
    deckNames,
    cards
  }
}

export { DEFAULT_PLECO_DECK_NAME }
