import { useState, useEffect, useRef } from 'react'
import { getSecurityValue, setSecurityValue } from '../lib/db'

const PIN_HASH_KEY = 'chinestudy_pin_hash'
const SESSION_KEY = 'chinestudy_authenticated'
const FAILED_ATTEMPTS_KEY = 'chinestudy_failed_attempts'
const LOCKOUT_UNTIL_KEY = 'chinestudy_lockout_until'
const LAST_LOGIN_KEY = 'chinestudy_last_login'
const TAMPER_FLAG_KEY = 'chinestudy_tamper_detected'

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5
const LOCKOUT_MINUTES = [5, 15, 30, 60] // escalating lockout

async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + '_hanzi_salt_2024')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getFailedAttempts() {
  try {
    return JSON.parse(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '[]')
  } catch {
    return []
  }
}

function logFailedAttempt(type = 'wrong_pin') {
  const attempts = getFailedAttempts()
  attempts.push({
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    type
  })
  localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify(attempts))
  return attempts
}

function getUnacknowledgedAttempts() {
  const lastLogin = localStorage.getItem(LAST_LOGIN_KEY)
  const attempts = getFailedAttempts()
  if (!lastLogin) return []
  return attempts.filter(a => a.timestamp > lastLogin)
}

function getLockoutInfo() {
  const lockoutUntil = localStorage.getItem(LOCKOUT_UNTIL_KEY)
  if (!lockoutUntil) return null
  const until = new Date(lockoutUntil)
  if (until > new Date()) return until
  return null
}

function applyLockout(totalRecentFails) {
  // Count how many lockouts have been triggered (every MAX_ATTEMPTS rounds)
  const lockoutRound = Math.floor(totalRecentFails / MAX_ATTEMPTS_BEFORE_LOCKOUT) - 1
  const minuteIndex = Math.min(lockoutRound, LOCKOUT_MINUTES.length - 1)
  const minutes = LOCKOUT_MINUTES[minuteIndex]
  const until = new Date(Date.now() + minutes * 60 * 1000)
  localStorage.setItem(LOCKOUT_UNTIL_KEY, until.toISOString())
  return until
}

function formatTimeRemaining(until) {
  const diff = Math.max(0, until - Date.now())
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export default function PinLock({ children }) {
  const [state, setState] = useState('loading') // loading | setup | locked | unlocked
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('enter') // enter | confirm (for setup)
  const [securityAlert, setSecurityAlert] = useState(null)
  const [lockout, setLockout] = useState(null)
  const [lockoutDisplay, setLockoutDisplay] = useState('')
  const [tamperAlert, setTamperAlert] = useState(false)
  const inputRef = useRef(null)
  const lockoutTimerRef = useRef(null)

  useEffect(() => {
    async function initialize() {
      const localHash = localStorage.getItem(PIN_HASH_KEY)
      const idbHash = await getSecurityValue('pinHash')
      const sessionAuth = sessionStorage.getItem(SESSION_KEY)

      // Tamper detection: IndexedDB has hash but localStorage was wiped
      if (!localHash && idbHash) {
        // Someone cleared localStorage to bypass the PIN — restore it
        localStorage.setItem(PIN_HASH_KEY, idbHash)
        localStorage.setItem(TAMPER_FLAG_KEY, new Date().toISOString())
        logFailedAttempt('tamper_detected')
        const lockoutUntil = getLockoutInfo()
        if (lockoutUntil) setLockout(lockoutUntil)
        setTamperAlert(true)
        setState('locked')
        return
      }

      // First-time setup: no PIN anywhere
      if (!localHash && !idbHash) {
        setState('setup')
        return
      }

      // Sync: localStorage has hash but IndexedDB doesn't yet (migration)
      if (localHash && !idbHash) {
        await setSecurityValue('pinHash', localHash)
      }

      // Show tamper warning if flagged
      if (localStorage.getItem(TAMPER_FLAG_KEY)) {
        setTamperAlert(true)
      }

      if (sessionAuth === 'true') {
        const unacked = getUnacknowledgedAttempts()
        if (unacked.length > 0) setSecurityAlert(unacked)
        setState('unlocked')
      } else {
        const lockoutUntil = getLockoutInfo()
        if (lockoutUntil) setLockout(lockoutUntil)
        setState('locked')
      }
    }
    initialize()
  }, [])

  // Lockout countdown timer
  useEffect(() => {
    if (!lockout) {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
      return
    }
    const update = () => {
      if (new Date() >= lockout) {
        setLockout(null)
        setLockoutDisplay('')
        setError('')
        localStorage.removeItem(LOCKOUT_UNTIL_KEY)
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
      } else {
        setLockoutDisplay(formatTimeRemaining(lockout))
      }
    }
    update()
    lockoutTimerRef.current = setInterval(update, 1000)
    return () => { if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current) }
  }, [lockout])

  useEffect(() => {
    if (state !== 'unlocked' && state !== 'loading' && !lockout) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [state, step, lockout])

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

    if (confirmPin !== pin) {
      setError('PINs do not match. Try again.')
      setStep('enter')
      setPin('')
      setConfirmPin('')
      return
    }

    const hash = await hashPin(pin)
    localStorage.setItem(PIN_HASH_KEY, hash)
    await setSecurityValue('pinHash', hash)
    localStorage.setItem(LAST_LOGIN_KEY, new Date().toISOString())
    sessionStorage.setItem(SESSION_KEY, 'true')
    setState('unlocked')
  }

  const handleUnlock = async () => {
    // Check lockout
    if (lockout) return

    const storedHash = localStorage.getItem(PIN_HASH_KEY)
    const hash = await hashPin(pin)

    if (hash === storedHash) {
      // Success — check for failed attempts since last login
      const unacked = getUnacknowledgedAttempts()
      if (unacked.length > 0) {
        setSecurityAlert(unacked)
      }

      // Clear tamper flag on successful authentication
      localStorage.removeItem(TAMPER_FLAG_KEY)
      setTamperAlert(false)

      // Keep IndexedDB in sync
      await setSecurityValue('pinHash', storedHash)

      localStorage.setItem(LAST_LOGIN_KEY, new Date().toISOString())
      localStorage.removeItem(LOCKOUT_UNTIL_KEY)
      sessionStorage.setItem(SESSION_KEY, 'true')
      setState('unlocked')
    } else {
      // Failed attempt
      const attempts = logFailedAttempt()

      // Count recent fails (last 24h) for lockout escalation
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const recentFails = attempts.filter(a => a.timestamp > oneDayAgo).length

      if (recentFails > 0 && recentFails % MAX_ATTEMPTS_BEFORE_LOCKOUT === 0) {
        const until = applyLockout(recentFails)
        setLockout(until)
        setError(`Too many failed attempts. Locked for ${LOCKOUT_MINUTES[Math.min(Math.floor(recentFails / MAX_ATTEMPTS_BEFORE_LOCKOUT) - 1, LOCKOUT_MINUTES.length - 1)]} minutes.`)
      } else {
        const remaining = MAX_ATTEMPTS_BEFORE_LOCKOUT - (recentFails % MAX_ATTEMPTS_BEFORE_LOCKOUT)
        setError(`Wrong PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`)
      }
      setPin('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (state === 'setup') handleSetup()
      else if (state === 'locked') handleUnlock()
    }
  }

  const dismissAlert = () => {
    setSecurityAlert(null)
  }

  if (state === 'loading') return null

  // Tamper alert overlay (shown after successful login if tampering was detected)
  if (state === 'unlocked' && tamperAlert) {
    return (
      <div className="pin-lock-screen">
        <div className="pin-lock-content fade-in">
          <div className="pin-lock-icon">&#x1F6A8;</div>
          <h1 className="pin-lock-title" style={{ color: 'var(--error)' }}>Tampering Detected</h1>
          <p className="pin-lock-subtitle" style={{ lineHeight: 1.5 }}>
            Someone cleared the browser&apos;s local storage — likely an attempt to bypass PIN protection.
            The PIN was restored from a secure backup.
          </p>
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
            Your study data is intact. We recommend exporting an encrypted backup immediately from Settings.
          </p>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 16, maxWidth: 280 }}
            onClick={() => {
              localStorage.removeItem(TAMPER_FLAG_KEY)
              setTamperAlert(false)
            }}
          >
            Acknowledged
          </button>
        </div>
      </div>
    )
  }

  // Security alert overlay (shown after successful login)
  if (state === 'unlocked' && securityAlert) {
    return (
      <div className="pin-lock-screen">
        <div className="pin-lock-content fade-in">
          <div className="pin-lock-icon">&#x26A0;&#xFE0F;</div>
          <h1 className="pin-lock-title" style={{ color: 'var(--warning)' }}>Security Alert</h1>
          <p className="pin-lock-subtitle">
            <strong>{securityAlert.length} failed PIN attempt{securityAlert.length !== 1 ? 's' : ''}</strong> detected since your last login.
          </p>

          <div className="security-alert-log">
            {securityAlert.map((attempt, i) => (
              <div key={i} className="security-alert-entry">
                <span className="security-alert-time">
                  {new Date(attempt.timestamp).toLocaleString()}
                </span>
                {attempt.type === 'tamper_detected' && (
                  <span style={{ color: 'var(--error)', fontSize: 11, marginLeft: 8 }}>TAMPER</span>
                )}
              </div>
            ))}
          </div>

          <p className="text-secondary" style={{ fontSize: 13, marginTop: 16, lineHeight: 1.5 }}>
            If this wasn't you, consider exporting a backup from Settings and changing your PIN.
          </p>

          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 16, maxWidth: 280 }}
            onClick={dismissAlert}
          >
            Acknowledged
          </button>
        </div>
      </div>
    )
  }

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
            : lockout
              ? `Locked. Try again in ${lockoutDisplay}`
              : 'Enter your PIN to continue'}
        </p>

        {!lockout && (
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
        )}

        {lockout && (
          <div className="lockout-timer">
            {lockoutDisplay}
          </div>
        )}

        {error && <p className="pin-error">{error}</p>}

        {!lockout && (
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 16, maxWidth: 280 }}
            onClick={state === 'setup' ? handleSetup : handleUnlock}
          >
            {state === 'setup'
              ? (step === 'enter' ? 'Next' : 'Set PIN')
              : 'Unlock'}
          </button>
        )}
      </div>
    </div>
  )
}
