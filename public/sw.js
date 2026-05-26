const CACHE = "triptales-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const manifest = await fetch("/precache-manifest.json", { cache: "no-store" });
        const urls = await manifest.json();
        await cache.addAll(["/", ...urls]);
      } catch {
        await cache.add("/"); // fall back to shell-only
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Don't cache map tiles / Nominatim / ffmpeg cores (cross-origin, large/volatile).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => cached || caches.match("/"));
      return cached || network;
    })
  );
});
