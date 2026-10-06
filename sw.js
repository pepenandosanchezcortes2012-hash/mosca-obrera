// Mosca Obrera: service worker. Primero la red (siempre la versión nueva); si no hay conexión, lo último guardado.
// También permite mostrar notificaciones en Android, donde `new Notification()` no funciona.
const CACHE = 'mosca-obrera-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return r;
  }).catch(() => caches.match(req).then((r) => r || caches.match('./'))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => {
    for (const w of ws) { if ('focus' in w) { return w.focus(); } }
    return self.clients.openWindow('./');
  }));
});
