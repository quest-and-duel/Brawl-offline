/* Minimal offline shell for GitHub Pages */
const CORE = ["./", "./index.html", "./js/game.js", "./css/style.css", "./assets/manifest.json", "./assets/sprites/char_hero.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("brawl-v2").then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const copy = res.clone();
        if (res.ok && res.url.includes(self.location.origin)) {
          caches.open("brawl-v2").then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
