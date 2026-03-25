import { createContext, useContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false)
      return undefined
    }

    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) {
        console.error('Supabase session load failed:', error)
      }

      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setLoading(false)
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

    return supabase.auth.signInWithPassword({ email, password })
  }

  const signUp = async ({ email, password }) => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured.') }
    }

    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin
      }
    })
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
        signInWithPassword,
        signUp,
        signOut,
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
