/* Scribe service worker — offline caching for the PWA.
   First load must be online (to populate the cache); after that the app + its
   CDN dependencies (CodeMirror, Excalidraw, Harper, marked, Tesseract, fonts)
   work fully offline. Bump CACHE to ship an update. */
const CACHE = "scribe-v2";
const SHELL = ["scribe-next.html", "manifest.webmanifest", "scribe-icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never intercept/cache Supabase or PostHog (live data / analytics must always hit the network).
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("posthog.com")) return;

  if (url.origin === location.origin) {
    // App shell: network-first so updates land, fall back to cache offline.
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("scribe-next.html")))
    );
    return;
  }

  // Cross-origin CDN deps (esm.sh / unpkg / fonts): cache-first — they're versioned + immutable.
  // Only cache clean, final responses — never errors or redirects (those poison cache-first).
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
    )
  );
});
