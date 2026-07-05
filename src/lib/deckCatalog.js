import { hsk5Words } from '../data/hsk5'
import { econCoreWords } from '../data/econ1'
import { radicalWords } from '../data/radicals'

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
    words: hsk5Words,
    courseUrl: 'https://chinesezerotohero.teachable.com/p/hsk-5-course',
    courseName: 'CZH HSK 5 Course'
  },
  {
    id: 'econ-core',
    sourceKey: 'econ-core',
    slug: 'economics-core',
    name: 'Economics · Core',
    description: `${econCoreWords.length} essential economics & finance terms - macro, markets, trade, data`,
    color: '#38bdf8',
    kind: 'prebuilt',
    sortOrder: 20,
    tags: ['econ'],
    words: econCoreWords,
    courseUrl: null,
    courseName: null
  },
  {
    id: 'radicals',
    sourceKey: 'radicals',
    slug: 'radicals-components',
    name: 'Radicals & Components',
    description: `${radicalWords.length} most useful radicals with their names and example characters`,
    color: '#a78bfa',
    kind: 'prebuilt',
    sortOrder: 30,
    tags: ['radicals'],
    words: radicalWords,
    courseUrl: 'https://www.youtube.com/@GraceMandarinChinese/search?query=characters',
    courseName: 'Character videos'
  }
]

// Chinese Zero to Hero course catalog for quick access from the Decks page.
export const CZH_LINKS = [
  { label: 'All CZH courses', url: 'https://chinesezerotohero.teachable.com/' },
  { label: 'HSK 5 course', url: 'https://chinesezerotohero.teachable.com/p/hsk-5-course' },
  { label: 'HSK 5 Expansion: Movies & TV', url: 'https://chinesezerotohero.teachable.com/p/hsk-5-expansion-drama' }
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
