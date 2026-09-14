/**
 * RailMind service worker — offline caching for drivers.
 *
 * Strategy:
 *   • app shell / static assets: stale-while-revalidate
 *   • Supabase REST + auth: network-first with cache fallback so the driver's
 *     own route data stays readable in a signal dead-zone
 *   • POST/DELETE writes: never cached (realtime sync handles them online)
 *   • /api/* (RailAI, push): network-only
 */
const VERSION = 'railmind-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  if (req.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return // network-only

  // Supabase data: network-first, fall back to the last good copy offline
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }

  // Same-origin: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => cached)
      return cached || fresh
    }),
  )
})

/** Web Push — surface railmind notifications even when the tab is closed. */
self.addEventListener('push', (event) => {
  let payload = { title: 'RailMind', body: 'Network update' }
  try {
    payload = event.data ? event.data.json() : payload
  } catch {
    /* plain-text push */
    if (event.data) payload.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag || 'railmind',
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
