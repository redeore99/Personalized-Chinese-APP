// Regression check for the reader's segmenter.
//
//   npm run check-segmentation
//
// Loads the bundled dictionary and the book lexicon exactly as the app does,
// runs src/lib/segment.js over the reviewed excerpts in
// scripts/segmentation-cases.json, and fails if any of them changes.
//
// Run this after touching src/lib/segment.js, the scoring constants, the book
// name list, or the dictionary parser. Without it, tuning one case silently
// undoes another.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const { segmentText } = await import(
  pathToFileURL(resolve(ROOT, 'src', 'lib', 'segment.js')).href
)

const ENTRY_PATTERN = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/

function loadDictionary() {
  const text = gunzipSync(readFileSync(resolve(ROOT, 'public', 'dict', 'cedict_ts.u8.gz'))).toString('utf8')
  const map = new Map()

  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = line.match(ENTRY_PATTERN)
    if (!match) continue
    const entry = { pinyin: match[3], defs: match[4] }
    const existing = map.get(match[2])
    if (existing) existing.push(entry)
    else map.set(match[2], [entry])
  }

  return map
}

const cases = JSON.parse(readFileSync(resolve(HERE, 'segmentation-cases.json'), 'utf8'))
const dictMap = loadDictionary()

const lexicon = JSON.parse(
  readFileSync(resolve(ROOT, 'public', 'books', cases.book, 'lexicon.json'), 'utf8')
)
for (const [word, info] of Object.entries(lexicon.names || {})) {
  if (!dictMap.has(word)) dictMap.set(word, [{ pinyin: info.p, defs: info.d }])
}
const counts = new Map(Object.entries(lexicon.counts || {}))

console.log(
  `dictionary ${dictMap.size.toLocaleString()} headwords · ` +
  `${Object.keys(lexicon.names || {}).length} book names · ` +
  `${counts.size.toLocaleString()} frequencies\n`
)

function segment(text) {
  return segmentText(text, dictMap, new Set(), { counts })
    .filter(token => token.type === 'word')
    .map(token => token.text)
}

let failed = 0
let checked = 0
let undefinable = 0

for (const group of ['fix', 'keep']) {
  const list = cases[group] || []
  let groupFailed = 0

  for (const testCase of list) {
    checked += 1
    const actual = segment(testCase.text)
    const ok = actual.join('|') === testCase.expect.join('|')

    for (const token of actual) {
      if ([...token].length >= 1 && !dictMap.has(token)) undefinable += 1
    }

    if (!ok) {
      groupFailed += 1
      failed += 1
      console.log(`FAIL [${group}] ${testCase.text}`)
      console.log(`  expected  ${testCase.expect.join('|')}`)
      console.log(`  actual    ${actual.join('|')}`)
      if (testCase.wasGreedy) console.log(`  old greedy ${testCase.wasGreedy.join('|')}`)
      if (testCase.note) console.log(`  note      ${testCase.note}`)
      console.log()
    }
  }

  console.log(`${group.padEnd(5)} ${list.length - groupFailed}/${list.length} passing`)
}

console.log(`\nundefinable tokens across all cases: ${undefinable}`)

if (failed) {
  console.error(`\n${failed} of ${checked} segmentation cases failed.`)
  process.exitCode = 1
} else {
  console.log(`\nall ${checked} segmentation cases pass.`)
}
