import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TurnstileWidget from './TurnstileWidget'
import { isTurnstileConfigured, turnstileSiteKey } from '../lib/turnstile'

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
          <div className="auth-setup-item">2. Fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_TURNSTILE_SITE_KEY`.</div>
          <div className="auth-setup-item">3. Run the SQL schema and create only your account in Supabase Auth.</div>
          <div className="auth-setup-item">4. Enable Supabase CAPTCHA with Cloudflare Turnstile before signing in.</div>
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
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaError, setCaptchaError] = useState('')
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0)
  const captchaConfigured = isTurnstileConfigured()

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
    setCaptchaError('')
    clearAuthError()

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Enter both email and password.')
      return
    }

    if (!captchaConfigured) {
      setError('Cloudflare Turnstile is not configured. Add VITE_TURNSTILE_SITE_KEY and enable Supabase CAPTCHA before signing in.')
      return
    }

    if (!captchaToken) {
      setError('Complete the human verification first.')
      return
    }

    setSubmitting(true)

    const result = await signInWithPassword({
      email: trimmedEmail,
      password,
      captchaToken
    })

    setCaptchaToken('')
    setCaptchaResetSignal(prev => prev + 1)

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
          Sign in to access your synced cards, reviews, and writing history. Cloudflare Turnstile protects the login form before Supabase accepts the password request.
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

          <div>
            <label className="label">Human Verification</label>
            {captchaConfigured ? (
              <>
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  resetSignal={captchaResetSignal}
                  onTokenChange={setCaptchaToken}
                  onErrorChange={setCaptchaError}
                />
                <div className="auth-help-text">
                  Complete the Cloudflare Turnstile check so Supabase can verify this sign-in request.
                </div>
              </>
            ) : (
              <div className="auth-help-text">
                Add `VITE_TURNSTILE_SITE_KEY` and enable Supabase CAPTCHA to turn on sign-in protection.
              </div>
            )}
          </div>

          {authLockRemainingMs > 0 && (
            <div className="auth-message auth-message-error">
              This browser is cooling down after repeated sign-in attempts. Wait {formatDuration(authLockRemainingMs)} before trying again.
            </div>
          )}

          {!captchaConfigured && (
            <div className="auth-message auth-message-error">
              Cloudflare Turnstile is not configured. Add `VITE_TURNSTILE_SITE_KEY` locally and in Vercel, then enable Turnstile in Supabase Auth.
            </div>
          )}

          {captchaError && (
            <div className="auth-message auth-message-error">{captchaError}</div>
          )}

          {(authError || error) && (
            <div className="auth-message auth-message-error">{authError || error}</div>
          )}

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={submitting || authLockRemainingMs > 0 || !captchaConfigured || !captchaToken}
          >
            {submitting ? 'Signing in...' : authLockRemainingMs > 0 ? `Wait ${formatDuration(authLockRemainingMs)}` : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
