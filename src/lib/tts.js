// Chinese text-to-speech via the browser's built-in Web Speech API.
// Free, works offline on most Android devices (Google TTS provides zh-CN voices).

let cachedVoice = null
let voicesLoaded = false

function pickChineseVoice() {
  if (!('speechSynthesis' in window)) return null

  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  const zhVoices = voices.filter(voice => /^zh([-_](CN|Hans))?/i.test(voice.lang) || voice.lang === 'zh')
  if (!zhVoices.length) {
    // Accept zh-TW/zh-HK as fallback rather than nothing
    const anyZh = voices.filter(voice => /^zh/i.test(voice.lang))
    return anyZh[0] || null
  }

  // Prefer Google / local service voices which sound better on Android
  return (
    zhVoices.find(voice => /google/i.test(voice.name) && voice.localService) ||
    zhVoices.find(voice => /google/i.test(voice.name)) ||
    zhVoices.find(voice => voice.localService) ||
    zhVoices[0]
  )
}

function ensureVoices() {
  if (voicesLoaded || !('speechSynthesis' in window)) return
  voicesLoaded = true

  cachedVoice = pickChineseVoice()
  if (!cachedVoice) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoice = pickChineseVoice()
    }, { once: true })
  }
}

export function isTtsSupported() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export function hasChineseVoice() {
  ensureVoices()
  return Boolean(cachedVoice || pickChineseVoice())
}

export function speak(text, { rate = 0.9 } = {}) {
  if (!isTtsSupported() || !text) return false

  ensureVoices()
  const voice = cachedVoice || pickChineseVoice()

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = voice?.lang || 'zh-CN'
  if (voice) utterance.voice = voice
  utterance.rate = rate
  utterance.pitch = 1

  window.speechSynthesis.speak(utterance)
  return true
}

export function stopSpeaking() {
  if (isTtsSupported()) {
    window.speechSynthesis.cancel()
  }
}
