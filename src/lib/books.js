import {
  clearCachedBook,
  countCachedChapters,
  getCachedChapter,
  putCachedChapter
} from './db'

// Public-domain books prepared by scripts/prepare-book.mjs into public/books/.
// Chapters are fetched on demand and cached in IndexedDB so the reader works
// offline once a chapter has been opened.
export const BOOKS = [
  {
    slug: 'xiyouji',
    title: '西游记',
    titleTraditional: '西遊記',
    latinTitle: 'Journey to the West',
    author: '吴承恩 · Wu Cheng’en',
    era: 'Ming dynasty vernacular',
    blurb:
      'The Monkey King and the pilgrimage west. Episodic, heavily repetitive vocabulary, ' +
      'and written in vernacular rather than classical Chinese — the most approachable ' +
      'full-length classic for a learner.',
    chapterCount: 100,
    source: {
      name: 'Project Gutenberg',
      id: 23962,
      url: 'https://www.gutenberg.org/ebooks/23962',
      license: 'Public domain'
    }
  }
]

const BOOK_BASE = '/books'

export function getBook(slug) {
  return BOOKS.find(book => book.slug === slug) || null
}

const indexCache = new Map()

export async function loadBookIndex(slug) {
  if (indexCache.has(slug)) {
    return indexCache.get(slug)
  }

  const promise = (async () => {
    const response = await fetch(`${BOOK_BASE}/${slug}/index.json`)
    if (!response.ok) {
      throw new Error(`Could not load the book index (HTTP ${response.status}).`)
    }
    return response.json()
  })()

  indexCache.set(slug, promise)

  try {
    return await promise
  } catch (error) {
    indexCache.delete(slug)
    throw error
  }
}

function chapterFile(n) {
  return `ch-${String(n).padStart(3, '0')}.json`
}

export async function loadChapter(slug, n) {
  const cached = await getCachedChapter(slug, n)
  if (cached?.paragraphs) {
    return cached
  }

  const response = await fetch(`${BOOK_BASE}/${slug}/${chapterFile(n)}`)
  if (!response.ok) {
    throw new Error(`Could not load chapter ${n} (HTTP ${response.status}).`)
  }

  const chapter = await response.json()
  await putCachedChapter(slug, n, {
    title: chapter.title,
    hanzi: chapter.hanzi,
    paragraphs: chapter.paragraphs
  })

  return chapter
}

export async function getBookCacheStatus(slug) {
  const [index, cached] = await Promise.all([
    loadBookIndex(slug).catch(() => null),
    countCachedChapters(slug)
  ])

  const total = index?.chapterCount || getBook(slug)?.chapterCount || 0

  return {
    cachedChapters: cached,
    totalChapters: total,
    complete: total > 0 && cached >= total
  }
}

// Fetches every chapter that is not cached yet, so the whole book is readable
// offline. Chapters already on the device are skipped.
export async function downloadWholeBook(slug, onProgress = () => {}) {
  const index = await loadBookIndex(slug)
  const total = index.chapters.length
  let done = 0

  for (const entry of index.chapters) {
    const cached = await getCachedChapter(slug, entry.n)
    if (!cached?.paragraphs) {
      await loadChapter(slug, entry.n)
    }

    done += 1
    onProgress(`Saving chapter ${done} of ${total}...`, done / total)
  }

  return { chapters: total }
}

export async function removeBookFromDevice(slug) {
  await clearCachedBook(slug)
}

export function chapterText(chapter, script = 's') {
  return (chapter?.paragraphs || []).map(paragraph => paragraph[script]).join('')
}
