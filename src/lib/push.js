import { isSupabaseConfigured, supabase } from './supabase'

// Client side of the daily reminder system:
// - the browser subscribes to Web Push (VAPID) and stores the subscription in Supabase
// - a scheduled Supabase Edge Function (send-due-push) sends "cards due" pushes daily
// The VAPID public key is not a secret; it is served from the database via the
// get_vapid_public_key() RPC so no extra frontend env var is needed.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index++) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getNotificationPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

async function getVapidPublicKey() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.rpc('get_vapid_public_key')
  if (error) throw new Error('Could not load the push key: ' + error.message)
  if (!data) throw new Error('Push is not configured on the server yet.')
  return data
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error('This browser does not support push notifications. On Android, install the app to your home screen from Chrome.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const [vapidKey, registration, userResult] = await Promise.all([
    getVapidPublicKey(),
    navigator.serviceWorker.ready,
    supabase.auth.getUser()
  ])

  const user = userResult?.data?.user
  if (!user) {
    throw new Error('You need to be signed in to enable reminders.')
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      owner_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: arrayBufferToBase64Url(subscription.getKey('p256dh')),
      auth: arrayBufferToBase64Url(subscription.getKey('auth')),
      user_agent: navigator.userAgent.slice(0, 250),
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' })

  if (error) {
    throw new Error('Could not save the subscription: ' + error.message)
  }

  return subscription
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription()
  if (!subscription) return

  if (isSupabaseConfigured() && supabase) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
  }

  await subscription.unsubscribe()
}

// End-to-end test: asks the edge function to send a real push to this device.
export async function sendTestPush() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.functions.invoke('send-due-push', {
    body: { test: true }
  })

  if (error) throw new Error('Test push failed: ' + error.message)
  return data
}

// App icon badge with the due count (supported on installed PWAs).
export function updateAppBadge(count) {
  if (!('setAppBadge' in navigator)) return

  if (count > 0) {
    navigator.setAppBadge(Math.min(count, 999)).catch(() => {})
  } else if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {})
  }
}
