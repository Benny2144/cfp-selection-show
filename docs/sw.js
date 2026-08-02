const CACHE = 'cfp-dynasty-shell-v4';
const SHELL = [
  '/', '/manifest.webmanifest?v=3', '/assets/cfp-icon-192.png',
  '/assets/cfp-icon-512.png', '/assets/room-bg.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/media/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(async response => {
        if (response.ok) await caches.open(CACHE).then(cache => cache.put('/', response.clone()));
        return response;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const update = fetch(request).then(async response => {
        if (response.ok) await caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      });
      return cached || update;
    })
  );
});
