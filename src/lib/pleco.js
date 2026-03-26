const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod/i

export function buildPlecoDefinitionUrl({ character, pinyin = '' }) {
  const params = new URLSearchParams({
    hw: character.trim(),
    sec: 'dict'
  })

  const normalizedPinyin = pinyin.trim()
  if (normalizedPinyin) {
    params.set('py', normalizedPinyin)
  }

  return `plecoapi://x-callback-url/df?${params.toString()}`
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
