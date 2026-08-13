// Chinese word segmentation.
//
// This module is deliberately free of Dexie, DOM and Node APIs so that both the
// browser (src/lib/dict.js) and the build script (scripts/prepare-book.mjs) can
// import the exact same implementation. Do not add an import from './db' here.
//
// The candidate set is closed over the dictionary: every emitted token is either
// a dictionary entry, a word the user already has a card for, or a single
// character. That invariant is what makes every token tappable — a segmenter
// that produces linguistically better units the dictionary cannot define (jieba
// leaves 22% of tokens undefinable on Ming vernacular) is worse here, not
// better.
//
// Within that candidate set the search is a Viterbi DP rather than the older
// greedy leftmost-longest scan. Greedy commits to the first longest match even
// when it straddles the real boundary, which produces confidently wrong
// definitions: 老师|父 ("teacher" + "father") for 老|师父 ("old" + "master"),
// 五|百年 ("a century") for 五百|年, 报道 ("news report") for 报|道 ("said").
// Scoring the whole run instead of the leftmost match fixes those without
// changing what may be emitted.

const MAX_WORD_LENGTH = 8
const HANZI_PATTERN = /[㐀-䶿一-鿿]/
const NUMERAL_PATTERN = /[〇零一二三四五六七八九十百千万亿两]/

// Smoothing mass for words that occur in the dictionary but not in this text,
// and the floor count they are given. Results are insensitive to both over
// orders of magnitude; see the regression fixture.
const SMOOTHING = 2000
const UNSEEN_COUNT = 0.5

// Words the user already has a card for are real to this reader even when the
// corpus is thin, so they get a modest boost rather than a hard preference.
const KNOWN_WORD_BONUS = 1.5

// In vernacular narrative, 道 before an opening quote is the speech verb
// "said", not the tail of the preceding word. Measured on 西游记: of 10,784
// sequences ending in 道, 9,767 (90.6%) are followed by a quote opener. Without
// this guard the dictionary happily supplies a fluent wrong reading — 猴王道
// becomes 猴|王道 "the kingly way" (266 times), 那怪道 becomes 那|怪道
// "no wonder" (149), 回报道 becomes 回|报道 "news report" (98).
const SPEECH_VERB = '道'
const QUOTE_OPENERS = new Set(['：', ':', '「', '『', '“', '"'])

export function isHanzi(char) {
  return HANZI_PATTERN.test(char)
}

function isNumeral(char) {
  return NUMERAL_PATTERN.test(char)
}

// Maximal runs of numeric characters, used to stop a candidate from straddling
// the edge of a number. Without this, 五百年 scores 五 + 百年 and the reader is
// told the text says "a century". Runs of a single character are ignored, since
// 三 in 三藏 (Tripitaka) or 一 in 一个 must stay free to combine.
function numeralRuns(chars) {
  const runs = []
  let start = -1

  for (let i = 0; i <= chars.length; i++) {
    const numeric = i < chars.length && isNumeral(chars[i])
    if (numeric && start < 0) start = i
    if (!numeric && start >= 0) {
      if (i - start >= 2) runs.push([start, i])
      start = -1
    }
  }

  return runs
}

function straddlesNumber(runs, from, to) {
  for (const [start, end] of runs) {
    if (from > start && from < end && to > end) return true
    if (from < start && to > start && to < end) return true
  }
  return false
}

// `follower` is the character immediately after this run in the original text.
// Runs are split on hanzi, so the quote opener that marks reported speech
// always falls outside the run and has to be handed in explicitly.
function lookupCandidates(chars, from, dictMap, knownWords, runs, follower) {
  const found = []
  const maxLength = Math.min(MAX_WORD_LENGTH, chars.length - from)

  for (let length = maxLength; length >= 1; length--) {
    const to = from + length
    if (length > 1 && straddlesNumber(runs, from, to)) continue

    const after = to < chars.length ? chars[to] : follower
    if (length > 1 && chars[to - 1] === SPEECH_VERB && QUOTE_OPENERS.has(after)) {
      continue
    }

    const candidate = chars.slice(from, to).join('')
    const known = knownWords.has(candidate)
    if (known || dictMap.has(candidate)) {
      found.push({ text: candidate, length, known, inDict: dictMap.has(candidate) })
    }
  }

  // A single character is always available so a path exists through any text.
  if (!found.some(entry => entry.length === 1)) {
    const candidate = chars[from]
    found.push({
      text: candidate,
      length: 1,
      known: knownWords.has(candidate),
      inDict: dictMap.has(candidate)
    })
  }

  return found
}

// Every dictionary word occurring anywhere in the text, counted as a substring.
// This seeds the model without assuming any segmentation, so it cannot inherit
// the greedy scan's mistakes.
function seedCounts(runsOfText, dictMap, knownWords) {
  const counts = new Map()

  for (const chars of runsOfText) {
    for (let i = 0; i < chars.length; i++) {
      const maxLength = Math.min(MAX_WORD_LENGTH, chars.length - i)
      for (let length = 1; length <= maxLength; length++) {
        const candidate = chars.slice(i, i + length).join('')
        if (dictMap.has(candidate) || knownWords.has(candidate)) {
          counts.set(candidate, (counts.get(candidate) || 0) + 1)
        }
      }
    }
  }

  return counts
}

function viterbi(chars, dictMap, knownWords, counts, total, follower = '') {
  const runs = numeralRuns(chars)
  const n = chars.length
  const score = new Float64Array(n + 1).fill(-Infinity)
  const back = new Array(n + 1).fill(null)
  score[0] = 0

  for (let i = 0; i < n; i++) {
    if (score[i] === -Infinity) continue

    for (const candidate of lookupCandidates(chars, i, dictMap, knownWords, runs, follower)) {
      const count = (counts.get(candidate.text) || 0) + UNSEEN_COUNT
      let step = Math.log(count / (total + SMOOTHING))
      if (candidate.known) step += KNOWN_WORD_BONUS

      const to = i + candidate.length
      const next = score[i] + step
      if (next > score[to]) {
        score[to] = next
        back[to] = candidate
      }
    }
  }

  const tokens = []
  let at = n
  while (at > 0) {
    const candidate = back[at]
    if (!candidate) break
    tokens.push(candidate)
    at -= candidate.length
  }

  return tokens.reverse()
}

function totalOf(counts) {
  let total = 0
  for (const value of counts.values()) total += value
  return total
}

// Splits text into alternating hanzi runs and untouched plain text.
function splitRuns(text) {
  const chars = Array.from(text || '')
  const pieces = []
  let buffer = []
  let hanzi = null

  for (const char of chars) {
    const isHan = isHanzi(char)
    if (hanzi === null) hanzi = isHan
    if (isHan !== hanzi) {
      pieces.push({ hanzi, chars: buffer })
      buffer = []
      hanzi = isHan
    }
    buffer.push(char)
  }

  if (buffer.length) pieces.push({ hanzi: Boolean(hanzi), chars: buffer })
  return pieces
}

/**
 * Segments Chinese text against a dictionary.
 *
 * @param {string} text
 * @param {Map} dictMap        word -> entries, from buildDictMap()
 * @param {Set} knownWords     words the user has cards for
 * @param {object} [options]
 * @param {Map} [options.counts]      word frequencies to score with. When
 *   omitted they are derived from `text` itself, which is what keeps this
 *   register-appropriate: a Ming novel supplies Ming statistics, a pasted news
 *   article supplies modern ones. A frequency table mined from modern Chinese
 *   actively destroys classical vocabulary (我等, 怎的, 却才 all fragment).
 * @param {number} [options.refine=1] Viterbi-EM refinement passes. Each pass
 *   re-counts from the previous segmentation, replacing substring counts with
 *   true token counts.
 */
export function segmentText(text, dictMap, knownWords = new Set(), options = {}) {
  const pieces = splitRuns(text)
  const hanziRuns = []
  const followers = []
  pieces.forEach((piece, index) => {
    if (!piece.hanzi) return
    hanziRuns.push(piece.chars)
    const next = pieces[index + 1]
    followers.push(next ? next.chars[0] : '')
  })
  if (!hanziRuns.length) {
    return pieces.map(piece => ({ text: piece.chars.join(''), type: 'plain' }))
  }

  let counts = options.counts || seedCounts(hanziRuns, dictMap, knownWords)
  let total = totalOf(counts)

  const passes = options.counts ? 0 : Math.max(0, options.refine ?? 1)
  let segmented = hanziRuns.map((chars, i) => viterbi(chars, dictMap, knownWords, counts, total, followers[i]))

  for (let pass = 0; pass < passes; pass++) {
    const refined = new Map()
    for (const tokens of segmented) {
      for (const token of tokens) {
        refined.set(token.text, (refined.get(token.text) || 0) + 1)
      }
    }
    counts = refined
    total = totalOf(counts)
    segmented = hanziRuns.map((chars, i) => viterbi(chars, dictMap, knownWords, counts, total, followers[i]))
  }

  const tokens = []
  let runIndex = 0
  for (const piece of pieces) {
    if (!piece.hanzi) {
      tokens.push({ text: piece.chars.join(''), type: 'plain' })
      continue
    }
    for (const candidate of segmented[runIndex]) {
      tokens.push({
        text: candidate.text,
        type: 'word',
        inDict: candidate.inDict,
        known: candidate.known
      })
    }
    runIndex += 1
  }

  return tokens
}

/**
 * Frequency counts for a whole book, so a chapter is scored against the entire
 * work rather than only the page in front of the reader. Built at prepare time
 * by scripts/prepare-book.mjs.
 */
export function buildCorpusCounts(texts, dictMap, knownWords = new Set(), refine = 1) {
  const hanziRuns = []
  const followers = []
  for (const text of texts) {
    const pieces = splitRuns(text)
    pieces.forEach((piece, index) => {
      if (!piece.hanzi) return
      hanziRuns.push(piece.chars)
      const next = pieces[index + 1]
      followers.push(next ? next.chars[0] : '')
    })
  }

  let counts = seedCounts(hanziRuns, dictMap, knownWords)
  let total = totalOf(counts)

  for (let pass = 0; pass <= refine; pass++) {
    const segmented = hanziRuns.map((chars, i) => viterbi(chars, dictMap, knownWords, counts, total, followers[i]))
    const refined = new Map()
    for (const tokens of segmented) {
      for (const token of tokens) {
        refined.set(token.text, (refined.get(token.text) || 0) + 1)
      }
    }
    counts = refined
    total = totalOf(counts)
  }

  return counts
}
