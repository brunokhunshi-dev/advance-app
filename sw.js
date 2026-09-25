const CACHE_NAME = 'advance-pwa-v3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './firebase-config.js',
  './pwa-mobile.css',
  './manifest.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function responderComRede(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('brasilapi.com.br') ||
      url.hostname.includes('nominatim.openstreetmap.org') ||
      url.pathname.includes('/firestore')) return;

  event.respondWith(
    event.request.mode === 'navigate'
      ? responderComRede(event.request).then(response => response || caches.match('./index.html'))
      : responderComRede(event.request)
  );
});
