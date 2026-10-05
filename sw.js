const CACHE_NAME = 'advance-pwa-home-v38';
const APP_SHELL = [
  './', './index.html', './styles.css', './script.js',
  './technical-report-editor.js', './firebase-config.js', './pwa-mobile.css',
  './manifest.json', './commercial-report.css', './src/ui/commercial-report.js',
  './midia/logo-advancecheck.svg', './midia/iconspwa/favicon.svg',
  './midia/iconspwa/advancecheck192.png', './midia/iconspwa/advancecheck512.png',
  './src/data/client-repository.js',
  './src/data/product-repository.js',
  './src/data/product-import.js',
  './data/produtos-advance.json',
  './src/domain/products.js',
  './src/data/cnpj-lookup.js',
  './src/domain/formatters.js',
  './src/domain/history.js',
  './src/domain/identifiers.js',
  './src/domain/reports.js',
  './src/domain/scheduling.js',
  './src/services/location.js',
  './src/services/commercial-save.js',
  './src/ui/assistance.js',
  './src/ui/agenda-calendar.js',
  './src/ui/home-map.js',
  './src/ui/pwa.js',
  './src/ui/visit-view.js',
];
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('advance-pwa-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function respond(request, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  // Versioned app shell assets are immutable within a service-worker release.
  if (request.mode !== 'navigate' && cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      // A quota/cache error must not discard a successful network response.
      try { await cache.put(cacheKey, response.clone()); } catch {}
      return response;
    }
    return cached || response;
  } catch {
    return cached || new Response('Recurso indisponível offline.', { status: 503 });
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  url.search = '';
  url.hash = '';
  // Cache only a finite list of static assets. Never cache APIs or user uploads.
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith(respond(event.request, url.href));
});
