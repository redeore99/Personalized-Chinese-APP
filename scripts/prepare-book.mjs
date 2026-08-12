// Prepares a public-domain Project Gutenberg book for the in-app reader.
//
//   node scripts/prepare-book.mjs
//
// Downloads the source text, splits it into chapters, converts the traditional
// original into simplified characters, and writes one JSON file per chapter
// into public/books/<slug>/ so the reader can fetch chapters on demand.
//
// The traditional→simplified mapping is derived from CC-CEDICT, which the app
// already ships as its offline dictionary, so no extra conversion library or
// data file is introduced.
//
// gutenberg.org itself is not reachable from every network (TLS chain issues),
// so the mirrors below are tried in order.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(HERE, '..', 'public', 'books')

// The bundled dictionary written by scripts/update-dictionary.mjs. Using the
// complete CC-CEDICT matters here: with a partial one, characters such as 築
// have no mapping and survive into the "simplified" output.
const CEDICT_FILE = resolve(HERE, '..', 'public', 'dict', 'cedict_ts.u8.gz')

const BOOK = {
  slug: 'xiyouji',
  title: { t: '西遊記', s: '西游记' },
  author: { t: '吳承恩', s: '吴承恩', latin: "Wu Cheng'en" },
  gutenbergId: 23962,
  sources: [
    'https://mirrors.xmission.com/gutenberg/2/3/9/6/23962/23962-0.txt',
    'https://gutenberg.pglaf.org/2/3/9/6/23962/23962-0.txt',
    'https://www.gutenberg.org/cache/epub/23962/pg23962.txt'
  ],
  // Multiples of ten use ○ (U+25CB) rather than 〇 in this edition.
  chapterPattern: /^[ \t　]*第[一二三四五六七八九十百零〇○]+回[ \t　]+\S.*$/gm,
  expectedChapters: 100
}

const MAX_WORD_LENGTH = 8
const HANZI = /[㐀-䶿一-鿿]/

// This edition uses printed variants that CC-CEDICT does not key on, most
// importantly 麽 (U+9EBD) where CC-CEDICT uses 麼 (U+9EBC). Without these the
// very common 甚麽 would survive conversion and fail every dictionary lookup.
const WORD_OVERRIDES = new Map([
  ['甚麽', '什么'],
  ['怎麽', '怎么'],
  ['這麽', '这么'],
  ['那麽', '那么'],
  ['什麽', '什么'],
  ['多麽', '多么'],
  ['要麽', '要么']
])

const CHAR_OVERRIDES = new Map([
  ['麽', '么'],
  ['樸', '朴']
])

async function fetchFirst(urls, label) {
  const failures = []

  for (const url of urls) {
    try {
      process.stdout.write(`  ${label}: ${new URL(url).host} ... `)
      const response = await fetch(url, { redirect: 'follow' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      console.log(`ok (${(text.length / 1024).toFixed(0)} KB)`)
      return text
    } catch (error) {
      console.log(`failed (${error.message})`)
      failures.push(`${url}: ${error.message}`)
    }
  }

  throw new Error(`Could not download ${label}.\n${failures.join('\n')}`)
}

// Word-level and character-level traditional→simplified maps from CC-CEDICT.
function buildConversionMaps(cedict) {
  const words = new Map(WORD_OVERRIDES)
  const chars = new Map(CHAR_OVERRIDES)
  // Characters that are legitimate simplified forms in their own right, used
  // to avoid flagging them as failed conversions.
  const validSimplified = new Set()

  for (const line of cedict.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(\S+)\s+(\S+)\s+\[[^\]]+\]\s+\/.+\/\s*$/)
    if (!match) continue

    const [, trad, simp] = match
    for (const char of simp) validSimplified.add(char)
    if (trad === simp) continue

    if ([...trad].length === 1) {
      // First entry wins: CC-CEDICT lists the common reading first.
      if (!chars.has(trad)) chars.set(trad, simp)
    } else if ([...trad].length === [...simp].length && !words.has(trad)) {
      words.set(trad, simp)
    }
  }

  for (const [trad, simp] of WORD_OVERRIDES) {
    words.set(trad, simp)
    for (const char of simp) validSimplified.add(char)
  }
  for (const [trad, simp] of CHAR_OVERRIDES) chars.set(trad, simp)

  return { words, chars, validSimplified }
}

// Greedy longest match so multi-character words convert as a unit, which
// resolves the handful of ambiguous one-to-many characters correctly.
function toSimplified(text, { words, chars }, stats) {
  const source = [...text]
  let out = ''
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (!HANZI.test(char)) {
      out += char
      index += 1
      continue
    }

    let matched = null
    const maxLength = Math.min(MAX_WORD_LENGTH, source.length - index)
    for (let length = maxLength; length >= 2; length--) {
      const candidate = source.slice(index, index + length).join('')
      if (words.has(candidate)) {
        matched = candidate
        break
      }
    }

    if (matched) {
      out += words.get(matched)
      index += [...matched].length
      continue
    }

    if (chars.has(char)) {
      out += chars.get(char)
      stats.charFallback += 1
    } else {
      // Characters that are identical in both scripts simply pass through.
      out += char
    }
    index += 1
  }

  return out
}

function stripGutenbergWrapper(raw) {
  const startMarker = raw.search(/\*\*\*\s*START OF/i)
  const endMarker = raw.search(/\*\*\*\s*END OF/i)
  const from = startMarker >= 0 ? raw.indexOf('\n', startMarker) + 1 : 0
  const to = endMarker > from ? endMarker : raw.length
  return raw.slice(from, to)
}

// Prose is hard-wrapped at ~40 characters, so lines inside a block are joined.
// Indented lines are verse and keep their own line breaks.
function toParagraphs(block) {
  const lines = block.split('\n').filter(line => line.trim().length > 0)
  const paragraphs = []

  for (const line of lines) {
    const isVerse = /^[ \t　]/.test(line)
    const text = line.trim()
    const previous = paragraphs[paragraphs.length - 1]

    if (!previous || isVerse || previous.verse) {
      paragraphs.push({ text, verse: isVerse })
    } else {
      previous.text += text
    }
  }

  return paragraphs
}

function splitChapters(body) {
  const headings = [...body.matchAll(BOOK.chapterPattern)]
  if (headings.length !== BOOK.expectedChapters) {
    throw new Error(`Expected ${BOOK.expectedChapters} chapters, found ${headings.length}.`)
  }

  return headings.map((heading, index) => {
    const start = heading.index
    const end = index + 1 < headings.length ? headings[index + 1].index : body.length
    const chunk = body.slice(start, end)
    const newline = chunk.indexOf('\n')

    return {
      n: index + 1,
      title: chunk.slice(0, newline).trim().replace(/\s+/g, ' '),
      blocks: chunk
        .slice(newline + 1)
        .split(/\n\s*\n/)
        .map(toParagraphs)
        .filter(paragraphs => paragraphs.length > 0)
        .flat()
    }
  })
}

async function main() {
  console.log(`Preparing "${BOOK.title.t}" (Project Gutenberg #${BOOK.gutenbergId})\n`)

  let cedict
  try {
    cedict = gunzipSync(await readFile(CEDICT_FILE)).toString('utf8')
  } catch {
    throw new Error('public/dict/cedict_ts.u8.gz is missing. Run: node scripts/update-dictionary.mjs')
  }

  const raw = await fetchFirst(BOOK.sources, 'book')

  const maps = buildConversionMaps(cedict)
  console.log(`\n  conversion maps: ${maps.words.size} words, ${maps.chars.size} characters`)

  const body = stripGutenbergWrapper(raw)
  const chapters = splitChapters(body)
  console.log(`  chapters: ${chapters.length}`)

  // A conversion is only wrong if a traditional-only character survives into
  // the simplified output, so residuals are measured against the CC-CEDICT
  // traditional-only character set rather than against "unknown" characters.
  const stats = { charFallback: 0, residual: new Map() }

  const countResiduals = simplified => {
    for (const char of simplified) {
      if (maps.chars.has(char) && !maps.validSimplified.has(char)) {
        stats.residual.set(char, (stats.residual.get(char) || 0) + 1)
      }
    }
  }
  const outDir = resolve(PUBLIC_DIR, BOOK.slug)
  await mkdir(outDir, { recursive: true })

  const index = []
  let totalHanzi = 0
  let corrupted = 0

  for (const chapter of chapters) {
    const paragraphs = chapter.blocks.map(paragraph => {
      const simplified = toSimplified(paragraph.text, maps, stats)
      countResiduals(simplified)
      return {
        t: paragraph.text,
        s: simplified,
        ...(paragraph.verse ? { v: 1 } : {})
      }
    })

    const hanzi = paragraphs.reduce(
      (total, paragraph) => total + (paragraph.t.match(/[㐀-䶿一-鿿]/g) || []).length,
      0
    )
    corrupted += paragraphs.reduce(
      (total, paragraph) => total + (paragraph.t.match(/[一-鿿]\?/g) || []).length,
      0
    )
    totalHanzi += hanzi

    const title = { t: chapter.title, s: toSimplified(chapter.title, maps, stats) }
    const file = `ch-${String(chapter.n).padStart(3, '0')}.json`

    await writeFile(
      resolve(outDir, file),
      JSON.stringify({ book: BOOK.slug, n: chapter.n, title, hanzi, paragraphs }),
      'utf8'
    )

    index.push({ n: chapter.n, title, hanzi, file })
  }

  await writeFile(
    resolve(outDir, 'index.json'),
    JSON.stringify(
      {
        slug: BOOK.slug,
        title: BOOK.title,
        author: BOOK.author,
        language: 'zh',
        script: 'both',
        source: {
          name: 'Project Gutenberg',
          id: BOOK.gutenbergId,
          url: `https://www.gutenberg.org/ebooks/${BOOK.gutenbergId}`,
          license: 'Public domain (Project Gutenberg License)'
        },
        chapterCount: index.length,
        totalHanzi,
        chapters: index
      },
      null,
      2
    ),
    'utf8'
  )

  const residual = [...stats.residual.entries()].sort((a, b) => b[1] - a[1])
  const residualTotal = residual.reduce((total, [, count]) => total + count, 0)
  console.log(`\n  total hanzi: ${totalHanzi.toLocaleString()}`)
  console.log(`  character-level conversions: ${stats.charFallback.toLocaleString()}`)
  console.log(
    `  traditional characters left in the simplified text: ${residualTotal} ` +
    `(${((residualTotal / totalHanzi) * 100).toFixed(4)}%, ${residual.length} distinct)`
  )
  if (residual.length) {
    console.log(`    most frequent: ${residual.slice(0, 12).map(([c, n]) => `${c}(${n})`).join(' ')}`)
  }
  console.log(`  glyphs corrupted to "?" in the Gutenberg source: ${corrupted}`)
  console.log(`\n  wrote ${index.length + 1} files to public/books/${BOOK.slug}/`)
}

main().catch(error => {
  console.error(`\nprepare-book failed: ${error.message}`)
  process.exitCode = 1
})
