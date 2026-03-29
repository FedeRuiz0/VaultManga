const STATIC_CACHE = 'mangavault-static-v1';
const READER_CACHE = 'mangavault-reader-assets-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(['/', '/index.html']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const isReaderAsset =
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('uploads.mangadex.org') ||
    url.hostname.includes('mangadex.network');

  if (!isReaderAsset) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(request);
        const cache = await caches.open(READER_CACHE);

        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone()).catch(() => {});
        }

        return response;
      } catch (error) {
        const fallback = await caches.match(request);
        if (fallback) return fallback;
        throw error;
      }
    })
  );
});