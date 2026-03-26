import { createContext, useContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const AUTH_TIMEOUT_MS = 10000

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

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

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

  const signInWithPassword = async ({ email, password }) => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured.') }
    }

    setAuthError('')
    return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
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
        isConfigured: isSupabaseConfigured()
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
