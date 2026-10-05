// Minimal service worker: enough to make the game installable without getting
// in the way of a live multiplayer build.
//
// Deliberately conservative. The bundle changes on every deploy and the backend
// is a WebSocket, so nothing dynamic is cached: only the shell and the icons,
// and even those are refreshed from the network when it is available.
const SHELL = 'dz-shell-v1';
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never touch the API, the worker, or anything cross-origin: a stale multiplayer
  // response is far worse than no cache at all.
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Network first, falling back to the cached shell when offline.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && (url.pathname === '/' || PRECACHE.includes(url.pathname))) {
          const copy = response.clone();
          caches.open(SHELL).then(c => c.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('/')))
  );
});
