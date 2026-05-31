/* Offline shell: свежий код из сети, кэш только для тяжёлых файлов с ?v= */
const SW_VERSION = 3;
const CACHE_STATIC = `brawl-static-v${SW_VERSION}`;

function isNetworkFirst(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  return (
    p.endsWith("/index.html") ||
    p.endsWith("/") ||
    p.endsWith("/game.js") ||
    p.endsWith("/style.css") ||
    p.endsWith("/sw.js") ||
    p.endsWith("/manifest.json") ||
    p.endsWith("/manifest.webmanifest")
  );
}

function isVersionedAsset(url) {
  return url.searchParams.has("v") || /\.(mp3|png|webp|ogg)(\?|$)/i.test(url.pathname);
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      cache.addAll(["./index.html", "./manifest.webmanifest"]).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("brawl-") && n !== CACHE_STATIC)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkFirst(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isVersionedAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC, event));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw _;
  }
}

async function staleWhileRevalidate(request, cacheName, fetchEvent) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone()).catch(() => {});
        trimCache(cacheName, 48).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    if (fetchEvent) fetchEvent.waitUntil(networkPromise);
    return cached;
  }
  const res = await networkPromise;
  if (res) return res;
  return new Response("", { status: 504, statusText: "Offline" });
}
