const CACHE_NAME = 'advance-pwa-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/firebase-config.js'
];

// Instala o Service Worker e guarda os ficheiros no Cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Limpa caches antigos caso a gente atualize o app (v2, v3...)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Interceta os pedidos (Tenta buscar na rede; se estiver sem internet, puxa do Cache)
self.addEventListener('fetch', event => {
  // Ignora os pedidos feitos ao Firebase e à BrasilAPI (para não travar os dados)
  if (event.request.url.includes('firestore') || event.request.url.includes('brasilapi') || event.request.url.includes('identitytoolkit')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
