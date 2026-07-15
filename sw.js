// Offline-capable cache for the Píla PWA. Network-first for code/markup so
// updates load whenever online; cache-first for icons.
const CACHE = 'pila-v6';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/keypad.js',
  'js/board.js',
  'js/camera.js',
  'js/games/base.js',
  'js/games/x01.js',
  'js/games/cricket.js',
  'js/games/killer.js',
  'js/games/clock.js',
  'js/games/shanghai.js',
  'js/games/golf.js',
  'js/games/halveit.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const codeLike = e.request.mode === 'navigate' ||
    /\.(js|css|webmanifest)$/.test(url.pathname);

  if (codeLike) {
    // network-first: always revalidate with the server (bypass HTTP cache),
    // fall back to SW cache when offline
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
    );
  } else {
    // cache-first for images and other static assets
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
