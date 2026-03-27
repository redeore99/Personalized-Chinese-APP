import { createContext, useContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const AUTH_TIMEOUT_MS = 10000
const AUTH_GUARD_STORAGE_KEY = 'hanzi-study-auth-guard'
const AUTH_GUARD_STEPS = [
  { failures: 5, durationMs: 30_000 },
  { failures: 8, durationMs: 120_000 },
  { failures: 10, durationMs: 600_000 }
]

function withTimeout(promise, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, AUTH_TIMEOUT_MS)
    })
  ])
}

function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes && seconds) {
    return `${minutes}m ${seconds}s`
  }

  if (minutes) {
    return `${minutes}m`
  }

  return `${seconds}s`
}

function readAuthGuard() {
  if (typeof window === 'undefined') {
    return { failedAttempts: 0, lockedUntil: null }
  }

  try {
    const savedValue = window.localStorage.getItem(AUTH_GUARD_STORAGE_KEY)
    if (!savedValue) {
      return { failedAttempts: 0, lockedUntil: null }
    }

    const parsed = JSON.parse(savedValue)
    return {
      failedAttempts: Number(parsed.failedAttempts) || 0,
      lockedUntil: Number(parsed.lockedUntil) || null
    }
  } catch {
    return { failedAttempts: 0, lockedUntil: null }
  }
}

function writeAuthGuard(guard) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(AUTH_GUARD_STORAGE_KEY, JSON.stringify(guard))
  } catch {
    // Ignore storage write failures and keep the in-memory guard.
  }
}

function getAuthLockRemainingMs(guard) {
  if (!guard?.lockedUntil) {
    return 0
  }

  return Math.max(0, guard.lockedUntil - Date.now())
}

function clearExpiredLock(guard) {
  if (getAuthLockRemainingMs(guard) > 0) {
    return guard
  }

  if (!guard?.lockedUntil) {
    return guard
  }

  return {
    ...guard,
    lockedUntil: null
  }
}

function getCooldownDuration(failedAttempts) {
  return AUTH_GUARD_STEPS.reduce((currentDuration, step) => (
    failedAttempts >= step.failures ? step.durationMs : currentDuration
  ), 0)
}

function registerFailedAttempt(guard) {
  const failedAttempts = (guard?.failedAttempts || 0) + 1
  const durationMs = getCooldownDuration(failedAttempts)

  return {
    failedAttempts,
    lockedUntil: durationMs ? Date.now() + durationMs : null
  }
}

function shouldCountFailedAttempt(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) {
    return true
  }

  return !['network', 'fetch', 'timed out', 'timeout'].some(fragment => message.includes(fragment))
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authGuard, setAuthGuard] = useState(() => clearExpiredLock(readAuthGuard()))

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false)
      return undefined
    }

    let mounted = true
    let validationRun = 0

    const rejectSession = (message, shouldSignOut = true) => {
      setAuthError(message)
      setSession(null)
      setLoading(false)

      if (shouldSignOut) {
        window.setTimeout(() => {
          void supabase.auth.signOut()
        }, 0)
      }
    }

    const applySession = async nextSession => {
      const runId = ++validationRun

      try {
        if (nextSession) {
          const { data: isAllowed, error } = await withTimeout(
            supabase.rpc('is_allowed_user'),
            'Authorization check timed out.'
          )

          if (!mounted || runId !== validationRun) {
            return
          }

          if (error || !isAllowed) {
            console.error('Unauthorized account rejected:', error)
            const reason = error?.message ? ` (${error.message})` : ''
            rejectSession(`This account is not authorized for this app.${reason}`)
            return
          }
        }

        if (nextSession && !nextSession.user) {
          rejectSession('We could not restore your session. Please sign in again.')
          return
        }

        setSession(nextSession ?? null)
        setLoading(false)
      } catch (error) {
        if (!mounted || runId !== validationRun) {
          return
        }

        console.error('Supabase session validation failed:', error)
        rejectSession('We could not verify your session. Please sign in again.')
      }
    }

    withTimeout(
      supabase.auth.getSession(),
      'Session check timed out.'
    )
      .then(({ data, error }) => {
        if (!mounted) return

        if (error) {
          console.error('Supabase session load failed:', error)
        }

        void applySession(data.session ?? null)
      })
      .catch(error => {
        if (!mounted) return

        console.error('Supabase session bootstrap failed:', error)
        rejectSession('We could not restore your session. Please sign in again.', false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return

      // Supabase warns that awaiting Supabase calls inside this callback can deadlock.
      window.setTimeout(() => {
        if (!mounted) return
        void applySession(nextSession)
      }, 0)
    })

    return () => {
      mounted = false
      validationRun += 1
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const nextGuard = clearExpiredLock(readAuthGuard())
    writeAuthGuard(nextGuard)
    setAuthGuard(nextGuard)
  }, [])

  useEffect(() => {
    if (!authGuard.lockedUntil) {
      return undefined
    }

    const interval = window.setInterval(() => {
      const nextGuard = clearExpiredLock(readAuthGuard())
      writeAuthGuard(nextGuard)
      setAuthGuard(nextGuard)
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [authGuard.lockedUntil])

  const signInWithPassword = async ({ email, password }) => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured.') }
    }

    const currentGuard = clearExpiredLock(readAuthGuard())
    writeAuthGuard(currentGuard)
    setAuthGuard(currentGuard)

    const lockRemainingMs = getAuthLockRemainingMs(currentGuard)
    if (lockRemainingMs > 0) {
      return {
        error: new Error(`Too many sign-in attempts on this device. Wait ${formatDuration(lockRemainingMs)} and try again.`)
      }
    }

    setAuthError('')
    const result = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    })

    if (result.error) {
      if (shouldCountFailedAttempt(result.error)) {
        const nextGuard = registerFailedAttempt(currentGuard)
        writeAuthGuard(nextGuard)
        setAuthGuard(nextGuard)

        const nextLockRemainingMs = getAuthLockRemainingMs(nextGuard)
        if (nextLockRemainingMs > 0) {
          return {
            ...result,
            error: new Error(`${result.error.message} Too many failed attempts on this device. Wait ${formatDuration(nextLockRemainingMs)} and try again.`)
          }
        }
      }

      return result
    }

    const resetGuard = { failedAttempts: 0, lockedUntil: null }
    writeAuthGuard(resetGuard)
    setAuthGuard(resetGuard)
    return result
  }

  const signOut = async () => {
    if (!supabase) {
      return { error: null }
    }

    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        authError,
        signInWithPassword,
        signOut,
        clearAuthError: () => setAuthError(''),
        isConfigured: isSupabaseConfigured(),
        authLockRemainingMs: getAuthLockRemainingMs(authGuard)
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
