// Cache-first service worker for the app shell — makes the PWA work fully offline after first load.

const CACHE_NAME = 'expense-tracker-v8';
const APP_SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.json',
  './icon.svg', './icon-192.png', './icon-512.png',
  './budget.html', './budget.js',
  './health.html', './health.js',
  './income.html', './income.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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
