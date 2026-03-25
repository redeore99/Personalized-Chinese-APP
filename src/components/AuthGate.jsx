import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

function AuthSetupScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div className="auth-badge">Cloud Setup Required</div>
        <h1 className="auth-title">Connect Supabase</h1>
        <p className="auth-subtitle">
          Accounts and sync are now the entry point to the app. Add your Supabase
          URL and anon key in `.env.local`, then apply the SQL in `supabase/schema.sql`.
        </p>

        <div className="auth-setup-list">
          <div className="auth-setup-item">1. Copy `.env.example` to `.env.local`.</div>
          <div className="auth-setup-item">2. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.</div>
          <div className="auth-setup-item">3. Run the SQL schema and enable email/password auth.</div>
        </div>
      </div>
    </div>
  )
}

export default function AuthGate({ children }) {
  const { loading, session, signInWithPassword, signUp, isConfigured } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
    setNotice('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Enter both email and password.')
      return
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('Use at least 8 characters for your password.')
        return
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setSubmitting(true)

    const result = mode === 'signin'
      ? await signInWithPassword({ email: trimmedEmail, password })
      : await signUp({ email: trimmedEmail, password })

    if (result.error) {
      setError(result.error.message)
      setSubmitting(false)
      return
    }

    if (mode === 'signup' && !result.data.session) {
      setNotice('Account created. Check your email to confirm the sign-up, then sign in here.')
    }

    setSubmitting(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div className="auth-badge">Chinese Study Sync</div>
        <h1 className="auth-title">Sign in to your study account</h1>
        <p className="auth-subtitle">
          Your cards, reviews, and writing history now sync through your account
          instead of living only in this browser.
        </p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setMode('signin')
              setError('')
              setNotice('')
            }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setMode('signup')
              setError('')
              setNotice('')
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={mode === 'signin' ? 'Enter your password' : 'Create a strong password'}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="label">Confirm Password</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
              />
            </div>
          )}

          {error && (
            <div className="auth-message auth-message-error">{error}</div>
          )}

          {notice && (
            <div className="auth-message auth-message-success">{notice}</div>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting
              ? (mode === 'signin' ? 'Signing in...' : 'Creating account...')
              : (mode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
      </div>
    </div>
  )
}
