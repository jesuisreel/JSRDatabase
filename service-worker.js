// Кэшируются только изображения этого сайта, которые пользователь уже запросил.
const IMAGE_CACHE = 'jsr-images-v1';
const META_CACHE = 'jsr-images-meta-v1';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('jsr-images-') && name !== IMAGE_CACHE && name !== META_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function saveImage(request, response) {
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) return;
  try {
    const copy = response.clone();
    const cache = await caches.open(IMAGE_CACHE);
    await cache.put(request, copy);
    const meta = await caches.open(META_CACHE);
    await meta.put(request.url, new Response(String(Date.now())));
  } catch (error) {
    // Переполнение хранилища не должно мешать показу изображения.
    console.warn('Не удалось сохранить изображение в кэш:', error);
  }
}

async function refreshIfNeeded(request) {
  try {
    const meta = await caches.open(META_CACHE);
    const saved = await meta.match(request.url);
    const timestamp = saved ? Number(await saved.text()) : 0;
    if (timestamp && Date.now() - timestamp < CHECK_INTERVAL) return;
    const response = await fetch(request, {cache: 'no-cache'});
    await saveImage(request, response);
  } catch (_) {
    // При отсутствии сети остаётся ранее сохранённая версия.
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.destination !== 'image' || url.origin !== self.location.origin) return;

  // waitUntil вызывается синхронно, чтобы фоновое обновление успело завершиться.
  let background;
  const backgroundDone = new Promise(resolve => { background = resolve; });
  event.waitUntil(backgroundDone);
  event.respondWith((async () => {
    try {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        refreshIfNeeded(request).finally(background);
        return cached;
      }
      const response = await fetch(request);
      saveImage(request, response).finally(background);
      return response;
    } catch (_) {
      background();
      return fetch(request);
    }
  })());
});
