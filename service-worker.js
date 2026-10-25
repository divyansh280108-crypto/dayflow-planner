const CACHE_NAME = 'dayflow-v5';
const APP_FILES = [
  './',
  './index.html',
  './styles.css?v=3',
  './app.js?v=3',
  './manifest.webmanifest',
  './icons/dayflow.svg',
  './icons/dayflow-192.png',
  './icons/dayflow-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const appBase = new URL('./', self.location.href).href;
  const target = new URL(event.notification.data?.url || './', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(appBase));
      return existing ? existing.focus() : self.clients.openWindow(target);
    })
  );
});
