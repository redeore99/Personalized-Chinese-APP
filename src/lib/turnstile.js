const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstileScriptPromise = null

export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

export function isTurnstileConfigured() {
  return Boolean(turnstileSiteKey)
}

export function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cloudflare Turnstile can only load in the browser.'))
  }

  if (window.turnstile?.render) {
    return Promise.resolve(window.turnstile)
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const handleLoad = () => {
      if (window.turnstile?.render) {
        resolve(window.turnstile)
        return
      }

      turnstileScriptPromise = null
      reject(new Error('Cloudflare Turnstile loaded without exposing the widget API.'))
    }

    const handleError = () => {
      turnstileScriptPromise = null
      reject(new Error('Cloudflare Turnstile failed to load.'))
    }

    const existingScript = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        handleLoad()
        return
      }

      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      handleLoad()
    }, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)
  })

  return turnstileScriptPromise
}
