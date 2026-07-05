import { useState } from 'react'
import { isTtsSupported, speak } from '../lib/tts'

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 010 7.07" />
    <path d="M19.07 4.93a10 10 0 010 14.14" />
  </svg>
)

export default function SpeakButton({ text, size = 'sm', slow = false, label = null }) {
  const [speaking, setSpeaking] = useState(false)

  if (!isTtsSupported() || !text) {
    return null
  }

  const handleSpeak = event => {
    event.stopPropagation()
    speak(text, { rate: slow ? 0.65 : 0.9 })
    setSpeaking(true)
    setTimeout(() => setSpeaking(false), 900)
  }

  return (
    <button
      type="button"
      className={`speak-btn ${size === 'lg' ? 'speak-btn-lg' : ''} ${speaking ? 'speaking' : ''}`}
      onClick={handleSpeak}
      aria-label={`Pronounce ${text}`}
      title="Pronounce"
    >
      <SpeakerIcon />
      {label && <span>{label}</span>}
    </button>
  )
}
