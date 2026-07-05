// Push notification handlers, imported into the generated service worker
// via workbox importScripts (see vite.config.js).

self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (err) {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || '汉字学习'
  const options = {
    body: payload.body || 'Your cards are waiting for review.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'daily-due',
    renotify: false,
    data: { url: payload.url || '/' }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
