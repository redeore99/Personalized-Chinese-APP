const DEFAULT_PLECO_DECK_NAME = 'Pleco Import'

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

function uniqueValues(values) {
  const seen = new Set()
  const result = []

  for (const value of values) {
    const normalized = value.toLowerCase()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(value)
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

function buildRowRecord(row, rowNumber, columnMap, defaultDeckName) {
  const character = readMappedValue(row, columnMap, 'character')
  if (!character) {
    return null
  }

  const pinyin = readMappedValue(row, columnMap, 'pinyin')
  const meaning = readMappedValue(row, columnMap, 'meaning')
  const categories = splitListValue(readMappedValue(row, columnMap, 'deck'))
  const importedTags = splitListValue(readMappedValue(row, columnMap, 'tags'))
  const deckName = categories[0] || defaultDeckName
  const tags = uniqueValues([...categories.slice(1), ...importedTags, 'pleco-import'])

  return {
    rowNumber,
    character,
    pinyin,
    meaning,
    deckName,
    tags
  }
}

function buildRowSignature(record) {
  return JSON.stringify([
    record.deckName,
    record.character,
    record.pinyin,
    record.meaning
  ])
}

export async function parsePlecoImportFile(file, options = {}) {
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
    throw new Error('The selected file could not be read as a Pleco export.')
  }

  const { hasHeader, map } = inferColumnMap(rows)
  const dataRows = hasHeader ? rows.slice(1) : rows
  const deckMap = new Map()
  const seenRows = new Set()
  let invalidRowCount = 0

  dataRows.forEach((row, index) => {
    const record = buildRowRecord(row, index + (hasHeader ? 2 : 1), map, defaultDeckName)
    if (!record) {
      invalidRowCount += 1
      return
    }

    const rowSignature = buildRowSignature(record)
    if (seenRows.has(rowSignature)) {
      return
    }

    seenRows.add(rowSignature)

    if (!deckMap.has(record.deckName)) {
      deckMap.set(record.deckName, [])
    }

    deckMap.get(record.deckName).push(record)
  })

  const decks = Array.from(deckMap.entries()).map(([name, cards]) => ({
    name,
    cards
  }))

  const cardCount = decks.reduce((total, deck) => total + deck.cards.length, 0)

  if (!cardCount) {
    throw new Error('No importable cards were found. Export a text, TSV, or CSV file from Pleco flashcards and try again.')
  }

  return {
    delimiter,
    hasHeader,
    rowCount: dataRows.length,
    invalidRowCount,
    deckCount: decks.length,
    cardCount,
    decks
  }
}

export { DEFAULT_PLECO_DECK_NAME }
