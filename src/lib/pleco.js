const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod/i

export function buildPlecoSearchUrl({ character }) {
  const query = character.trim()
  return `plecoapi://x-callback-url/s?q=${encodeURIComponent(query)}`
}

export function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile
  }

  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const isTouchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1

  return MOBILE_USER_AGENT_PATTERN.test(userAgent) || isTouchMac
}
