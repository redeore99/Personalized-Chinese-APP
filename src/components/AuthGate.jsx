import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

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

function AuthSetupScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div className="auth-badge">Cloud Setup Required</div>
        <h1 className="auth-title">Connect Supabase</h1>
        <p className="auth-subtitle">
          Accounts and sync are now the entry point to the app. Add your Supabase
          URL and publishable key in `.env.local`, then apply the SQL in `supabase/schema.sql`.
        </p>

        <div className="auth-setup-list">
          <div className="auth-setup-item">1. Copy `.env.example` to `.env.local`.</div>
          <div className="auth-setup-item">2. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.</div>
          <div className="auth-setup-item">3. Run the SQL schema and create only your account in Supabase Auth.</div>
        </div>
      </div>
    </div>
  )
}

export default function AuthGate({ children }) {
  const {
    loading,
    session,
    signInWithPassword,
    isConfigured,
    authError,
    clearAuthError,
    authLockRemainingMs
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isConfigured) {
    return <AuthSetupScreen />
  }

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card fade-in">
          <div className="auth-badge">Loading</div>
          <h1 className="auth-title">Checking your session</h1>
          <p className="auth-subtitle">Preparing your synced study space...</p>
        </div>
      </div>
    )
  }

  if (session) {
    return children
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setError('')
    clearAuthError()

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Enter both email and password.')
      return
    }

    setSubmitting(true)

    const result = await signInWithPassword({ email: trimmedEmail, password })

    if (result.error) {
      setError(result.error.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div className="auth-badge">Chinese Study Sync</div>
        <h1 className="auth-title">Sign in to your study account</h1>
        <p className="auth-subtitle">
          Only your manually created account is allowed to use this app.
          Sign in to access your synced cards, reviews, and writing history.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="your-email@example.com"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
          </div>

          {authLockRemainingMs > 0 && (
            <div className="auth-message auth-message-error">
              This browser is cooling down after repeated sign-in attempts. Wait {formatDuration(authLockRemainingMs)} before trying again.
            </div>
          )}

          {(authError || error) && (
            <div className="auth-message auth-message-error">{authError || error}</div>
          )}

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={submitting || authLockRemainingMs > 0}
          >
            {submitting ? 'Signing in...' : authLockRemainingMs > 0 ? `Wait ${formatDuration(authLockRemainingMs)}` : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
