// Cache-first service worker for the app shell — makes the PWA work fully offline after first load.

const CACHE_NAME = 'expense-tracker-v11';
const APP_SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.json',
  './icon.svg', './icon-192.png', './icon-512.png',
  './budget.html', './budget.js',
  './health.html', './health.js',
  './income.html', './income.js',
  './nav-swipe.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the browser's regular HTTP cache (GitHub Pages sets a 10-minute
  // max-age on every file) so a new service worker always re-caches genuinely fresh files
  // instead of possibly re-caching the same stale response that's still HTTP-cache-valid.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((url) => fetch(url, { cache: 'reload' }).then((res) => cache.put(url, res))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
