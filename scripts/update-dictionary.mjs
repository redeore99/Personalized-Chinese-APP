// Refreshes the bundled offline CC-CEDICT dictionary.
//
//   node scripts/update-dictionary.mjs
//
// Downloads the current full CC-CEDICT release from MDBG and writes it to
// public/dict/cedict_ts.u8.gz, which the app serves from its own origin.
//
// Why the file is bundled rather than fetched from a CDN at runtime:
//   - mdbg.net sends no Access-Control-Allow-Origin header, so the browser
//     cannot fetch it directly.
//   - The previous source (a third-party GitHub mirror) silently carried only
//     43,848 of the 121,069 CC-CEDICT entries, which degraded every dictionary
//     lookup in the app. Serving our own copy makes that class of drift
//     impossible and keeps the check below as a guard.
//
// CC-CEDICT is published by MDBG under CC BY-SA 4.0. The licence header at the
// top of the file is preserved verbatim, as the licence requires.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '..', 'public', 'dict')
const OUT_FILE = resolve(OUT_DIR, 'cedict_ts.u8.gz')

const SOURCE_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'
const MIN_EXPECTED_ENTRIES = 100000

const ENTRY_PATTERN = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/

async function main() {
  console.log(`Downloading CC-CEDICT from ${new URL(SOURCE_URL).host} ...`)

  const response = await fetch(SOURCE_URL, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${SOURCE_URL}`)
  }

  const downloaded = Buffer.from(await response.arrayBuffer())
  const isGzip = downloaded[0] === 0x1f && downloaded[1] === 0x8b
  const text = (isGzip ? gunzipSync(downloaded) : downloaded).toString('utf8')

  let entries = 0
  for (const line of text.split('\n')) {
    if (line && !line.startsWith('#') && ENTRY_PATTERN.test(line)) entries += 1
  }

  console.log(`  parsed ${entries.toLocaleString()} entries (${(text.length / 1048576).toFixed(1)} MB raw)`)

  if (entries < MIN_EXPECTED_ENTRIES) {
    throw new Error(
      `Only ${entries} entries parsed, expected at least ${MIN_EXPECTED_ENTRIES}. ` +
      'Refusing to write a truncated dictionary.'
    )
  }

  const compressed = gzipSync(Buffer.from(text, 'utf8'), { level: 9 })
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, compressed)

  console.log(`  wrote public/dict/cedict_ts.u8.gz (${(compressed.length / 1048576).toFixed(1)} MB)`)
  console.log('\nDevices must re-download the dictionary from Settings to pick this up.')
}

main().catch(error => {
  console.error(`\nupdate-dictionary failed: ${error.message}`)
  process.exitCode = 1
})
