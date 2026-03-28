// Tone diacritic maps for numbered-pinyin → accented-pinyin conversion
const TONE_MARKS = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
}

// Matches a single pinyin syllable with a trailing tone number (1-5).
// Captures: (syllable letters)(tone digit)
const NUMBERED_SYLLABLE_PATTERN = /([a-züÜ]+?)([1-5])/gi

function applyToneToSyllable(syllable, tone) {
  if (tone === 5 || tone === 0) {
    return syllable
  }

  // Replace v/V with ü/Ü before processing
  let normalized = syllable.replace(/v/g, 'ü').replace(/V/g, 'Ü')

  const lower = normalized.toLowerCase()
  const toneIndex = tone - 1

  // Standard placement rules:
  // 1. If the syllable contains 'a' or 'e', put the mark there
  // 2. If the syllable contains 'ou', put the mark on the 'o'
  // 3. Otherwise put the mark on the last vowel
  let targetIndex = -1

  const aIndex = lower.indexOf('a')
  const eIndex = lower.indexOf('e')

  if (aIndex !== -1) {
    targetIndex = aIndex
  } else if (eIndex !== -1) {
    targetIndex = eIndex
  } else {
    const ouIndex = lower.indexOf('ou')
    if (ouIndex !== -1) {
      targetIndex = ouIndex
    } else {
      // Find the last vowel
      for (let i = lower.length - 1; i >= 0; i--) {
        if ('iouü'.includes(lower[i])) {
          targetIndex = i
          break
        }
      }
    }
  }

  if (targetIndex === -1) {
    return syllable
  }

  const targetChar = lower[targetIndex]
  const replacement = TONE_MARKS[targetChar]?.[toneIndex]
  if (!replacement) {
    return syllable
  }

  // Preserve original case
  const isUpper = normalized[targetIndex] !== normalized[targetIndex].toLowerCase()
  const finalChar = isUpper ? replacement.toUpperCase() : replacement

  return normalized.slice(0, targetIndex) + finalChar + normalized.slice(targetIndex + 1)
}

export function convertNumberedPinyin(text) {
  if (!text) return ''

  const trimmed = text.trim()

  // Quick check: does it contain any tone numbers?
  if (!/[1-5]/.test(trimmed)) {
    return trimmed
  }

  // If it already contains accented vowels, leave it alone
  if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(trimmed)) {
    return trimmed
  }

  return trimmed.replace(NUMBERED_SYLLABLE_PATTERN, (_, syllable, toneStr) => {
    return applyToneToSyllable(syllable, parseInt(toneStr, 10))
  })
}
