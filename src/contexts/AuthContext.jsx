import { createContext, useContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const AuthContext = createContext(null)

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

    const applySession = async nextSession => {
      if (nextSession) {
        const { data, error } = await supabase
          .from('app_config')
          .select('allowed_email')
          .maybeSingle()

        if (error || !data?.allowed_email) {
          console.error('Unauthorized account rejected:', error)
          setAuthError('This account is not authorized for this app.')
          setSession(null)
          setLoading(false)
          await supabase.auth.signOut()
          return
        }
      }

      if (nextSession && !nextSession.user) {
        await supabase.auth.signOut()
        setSession(null)
        setLoading(false)
        return
      }

      setSession(nextSession ?? null)
      setLoading(false)
    }

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return

      if (error) {
        console.error('Supabase session load failed:', error)
      }

      await applySession(data.session ?? null)
    })

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return
      await applySession(nextSession)
    })

    return () => {
      mounted = false
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
