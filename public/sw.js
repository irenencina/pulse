// Pulse's service worker: keeps a copy of the app so it opens without internet, and fetches
// the newest version whenever there is a connection, so updates arrive by themselves.
// Your money data is not here: it lives in the browser's database, which this never touches.
const CACHE = 'pulse-app'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  // The newest copy when online (and keep it for next time); the kept copy when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then((kept) => kept ?? (request.mode === 'navigate' ? caches.match('./index.html') : undefined) ?? Response.error()),
      ),
  )
})
