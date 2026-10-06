// Mosca OS: service worker. Guarda todo al instalarse para que funcione sin internet (como una app local).
// Con red, siempre trae la versión nueva; sin red, usa lo guardado.
// También permite mostrar notificaciones en Android, donde `new Notification()` no funciona.
const CACHE = 'mosca-os-v6';
const BASE = ['./', 'index.html', 'estilo.css', 'icono.svg', 'icono-192.png', 'icono-512.png', 'manifest.webmanifest',
  'js/cerebro.js', 'js/mundo.js', 'js/pantalla.js', 'js/sistema.js', 'js/copiloto.js', 'js/vista.js', 'js/terminal.js', 'js/conexiones.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((r) => r || (req.mode === 'navigate' ? caches.match('./', { ignoreSearch: true }) : undefined))
    .then((r) => r || new Response('Sin conexión', { status: 503 }))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => {
    for (const w of ws) { if ('focus' in w) { return w.focus(); } }
    return self.clients.openWindow('./');
  }));
});
