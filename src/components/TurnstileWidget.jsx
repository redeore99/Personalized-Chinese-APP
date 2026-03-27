import { useEffect, useRef, useState } from 'react'
import { loadTurnstileScript } from '../lib/turnstile'

export default function TurnstileWidget({
  siteKey,
  resetSignal = 0,
  onTokenChange,
  onErrorChange
}) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    onTokenChange('')
    onErrorChange('')

    loadTurnstileScript()
      .then(turnstile => {
        if (cancelled || !containerRef.current) {
          return
        }

        containerRef.current.innerHTML = ''
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: 'login',
          theme: 'dark',
          callback: token => {
            if (cancelled) {
              return
            }

            onTokenChange(token)
            onErrorChange('')
          },
          'expired-callback': () => {
            if (cancelled) {
              return
            }

            onTokenChange('')
            onErrorChange('Human verification expired. Please complete it again.')
          },
          'error-callback': () => {
            if (cancelled) {
              return
            }

            onTokenChange('')
            onErrorChange('Human verification could not be completed. Please retry.')
          }
        })

        setLoading(false)
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        onTokenChange('')
        onErrorChange('Cloudflare Turnstile could not load. Check the site key and allowed domain.')
        setLoading(false)
      })

    return () => {
      cancelled = true

      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current)
      }
    }
  }, [onErrorChange, onTokenChange, siteKey])

  useEffect(() => {
    if (!resetSignal || widgetIdRef.current === null || !window.turnstile?.reset) {
      return
    }

    onTokenChange('')
    window.turnstile.reset(widgetIdRef.current)
  }, [onTokenChange, resetSignal])

  return (
    <div className="auth-captcha-shell">
      <div ref={containerRef} className="auth-captcha-slot" />
      {loading && (
        <div className="auth-help-text">Loading human verification...</div>
      )}
    </div>
  )
}
