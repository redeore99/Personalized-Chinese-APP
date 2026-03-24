import { useState, useEffect, useRef } from 'react'

const PIN_HASH_KEY = 'chinestudy_pin_hash'
const SESSION_KEY = 'chinestudy_authenticated'

async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + '_hanzi_salt_2024')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PinLock({ children }) {
  const [state, setState] = useState('loading') // loading | setup | locked | unlocked
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('enter') // enter | confirm (for setup)
  const inputRef = useRef(null)

  useEffect(() => {
    const storedHash = localStorage.getItem(PIN_HASH_KEY)
    const sessionAuth = sessionStorage.getItem(SESSION_KEY)

    if (!storedHash) {
      setState('setup')
    } else if (sessionAuth === 'true') {
      setState('unlocked')
    } else {
      setState('locked')
    }
  }, [])

  useEffect(() => {
    if (state !== 'unlocked' && state !== 'loading') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [state, step])

  const handleSetup = async () => {
    if (step === 'enter') {
      if (pin.length < 4) {
        setError('PIN must be at least 4 digits')
        return
      }
      setStep('confirm')
      setConfirmPin('')
      setError('')
      return
    }

    // confirm step
    if (confirmPin !== pin) {
      setError('PINs do not match. Try again.')
      setStep('enter')
      setPin('')
      setConfirmPin('')
      return
    }

    const hash = await hashPin(pin)
    localStorage.setItem(PIN_HASH_KEY, hash)
    sessionStorage.setItem(SESSION_KEY, 'true')
    setState('unlocked')
  }

  const handleUnlock = async () => {
    const storedHash = localStorage.getItem(PIN_HASH_KEY)
    const hash = await hashPin(pin)

    if (hash === storedHash) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setState('unlocked')
    } else {
      setError('Wrong PIN')
      setPin('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (state === 'setup') handleSetup()
      else if (state === 'locked') handleUnlock()
    }
  }

  if (state === 'loading') return null
  if (state === 'unlocked') return children

  return (
    <div className="pin-lock-screen">
      <div className="pin-lock-content fade-in">
        <div className="pin-lock-icon">
          {state === 'setup' ? '🔐' : '🔒'}
        </div>

        <h1 className="pin-lock-title">
          {state === 'setup'
            ? (step === 'enter' ? 'Set Your PIN' : 'Confirm PIN')
            : '汉字学习'}
        </h1>

        <p className="pin-lock-subtitle">
          {state === 'setup'
            ? (step === 'enter'
                ? 'Choose a PIN to protect your study data'
                : 'Enter the same PIN again to confirm')
            : 'Enter your PIN to continue'}
        </p>

        <div className="pin-input-wrapper">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            className="pin-input"
            placeholder="••••"
            maxLength={8}
            value={state === 'setup' && step === 'confirm' ? confirmPin : pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '')
              setError('')
              if (state === 'setup' && step === 'confirm') {
                setConfirmPin(val)
              } else {
                setPin(val)
              }
            }}
            onKeyDown={handleKeyDown}
          />

          <div className="pin-dots">
            {Array.from({ length: 4 }).map((_, i) => {
              const currentVal = state === 'setup' && step === 'confirm' ? confirmPin : pin
              return (
                <div
                  key={i}
                  className={`pin-dot ${i < currentVal.length ? 'filled' : ''}`}
                />
              )
            })}
          </div>
        </div>

        {error && <p className="pin-error">{error}</p>}

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 16, maxWidth: 280 }}
          onClick={state === 'setup' ? handleSetup : handleUnlock}
        >
          {state === 'setup'
            ? (step === 'enter' ? 'Next' : 'Set PIN')
            : 'Unlock'}
        </button>
      </div>
    </div>
  )
}
