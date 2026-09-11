/**
 * LookaMusic Service Worker — Offline-First PWA Engine
 *
 * Provides instant app launch and complete offline functionality:
 * - Pre-caches application shell, core navigation routes, icons, and static assets.
 * - Stale-While-Revalidate for script bundles, styles, and web assets.
 * - Network-First with Cache Fallback for page navigation.
 * - Leaves real-time audio streams, microphone and worklets uninhibited.
 */

const CACHE_VERSION = "lookamusic-v1.0.0";
const STATIC_CACHE = `lookamusic-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `lookamusic-dynamic-${CACHE_VERSION}`;

const PRECACHE_RESOURCES = [
  "/",
  "/session",
  "/compose",
  "/learn",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

// Install: Pre-cache core shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        // Use allSettled so a single missing optional asset doesn't fail SW registration
        return Promise.allSettled(
          PRECACHE_RESOURCES.map((url) =>
            fetch(url, { cache: "reload" }).then((res) => {
              if (res.ok) return cache.put(url, res);
              return Promise.reject(new Error(`Failed to fetch ${url}: ${res.status}`));
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Purge stale caches from previous versions & claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle standard HTTP/HTTPS GET requests
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // Bypass Next.js hot module reloading & webpack middleware in dev
  if (url.pathname.includes("_next/webpack-hmr") || url.pathname.includes("__nextjs")) {
    return;
  }

  // 1. Navigation requests (HTML pages): Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback
          const cached = await caches.match(request);
          if (cached) return cached;
          const rootCached = await caches.match("/");
          if (rootCached) return rootCached;
          return new Response("LookaMusic offline — Conecte-se uma vez para carregar novos módulos.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  // 2. Static Assets (_next/static, fonts, icons, styles): Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. All other requests: Network-first
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

// Message: Allow client to trigger immediate skipWaiting
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
