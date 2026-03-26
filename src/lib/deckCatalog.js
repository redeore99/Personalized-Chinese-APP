import { hsk5Words } from '../data/hsk5'

export const PREBUILT_DECKS = [
  {
    id: 'hsk5',
    sourceKey: 'hsk5',
    slug: 'hsk-5',
    name: 'HSK 5',
    description: '1,300 words - Upper Intermediate',
    color: '#fb7185',
    kind: 'prebuilt',
    sortOrder: 10,
    tags: ['HSK5'],
    words: hsk5Words
  }
]

const prebuiltDeckBySourceKey = new Map(PREBUILT_DECKS.map(deck => [deck.sourceKey, deck]))
const prebuiltDeckByName = new Map(PREBUILT_DECKS.map(deck => [deck.name.toLowerCase(), deck]))

export function getPrebuiltDeckBySourceKey(sourceKey) {
  return sourceKey ? prebuiltDeckBySourceKey.get(String(sourceKey).toLowerCase()) || null : null
}

export function getPrebuiltDeckByName(name) {
  return name ? prebuiltDeckByName.get(String(name).trim().toLowerCase()) || null : null
}

export function getPrebuiltDeck(sourceKeyOrName) {
  return getPrebuiltDeckBySourceKey(sourceKeyOrName) || getPrebuiltDeckByName(sourceKeyOrName)
}
