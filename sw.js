// Cache-first service worker for the app shell — makes the PWA work fully offline after first load.

const CACHE_NAME = 'expense-tracker-v22';
const APP_SHELL = [
  // index.html is now the Overview page (manifest start_url) — expenses.html holds what used
  // to be index.html's content. Renamed so a bare/bookmarked URL lands on Overview by default,
  // not just installed-PWA launches (start_url only affects the latter).
  './', './index.html', './overview.js', './style.css', './manifest.json',
  './icon.svg', './icon-192.png', './icon-512.png',
  './expenses.html', './app.js',
  './budget.html', './budget.js',
  './health.html', './health.js',
  './income.html', './income.js',
  './debts.html', './debts.js',
  './nav-swipe.js', './supabase-sync.js',
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
    // Fetching by URL string (not the original Request object) avoids a real Chrome gotcha:
    // a navigation request has mode:'navigate', and re-fetching that exact Request object
    // fails outright (ERR_FAILED) rather than falling through to network. This bit any page
    // not already in an older cached version when opened by direct navigation.
    caches.match(event.request).then((cached) => cached || fetch(event.request.url))
  );
});
