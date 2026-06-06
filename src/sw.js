// Service Worker: precache app-shell (workbox) + приём Web Push.
import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST || [])

// Новая версия SW активируется сразу и берёт управление страницами —
// иначе старый SW продолжает отдавать закэшированный бандл, пока открыты вкладки.
self.skipWaiting()
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Уведомление', body: event.data.text() }
  }
  const { title = 'КЛИМАТ-ПРО', body = '', url = '/', tag } = payload
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = all.find((c) => 'focus' in c)
      if (focused) {
        await focused.focus()
        if ('navigate' in focused) await focused.navigate(url)
      } else {
        await self.clients.openWindow(url)
      }
    })()
  )
})
