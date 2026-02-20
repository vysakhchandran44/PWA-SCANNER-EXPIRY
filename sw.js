/**
 * Service Worker - Expiry Tracker v5.0.0
 * Offline support & caching
 */

const CACHE_NAME = 'expiry-tracker-v5.0.0';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        
        return fetch(e.request)
          .then(response => {
            if (!response || response.status !== 200) {
              return response;
            }
            
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(e.request, clone));
            
            return response;
          })
          .catch(() => {
            if (e.request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});
