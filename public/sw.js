self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("imp-mobile-v1").then((cache) => cache.addAll(["/mobile", "/manifest.webmanifest"])));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((response) => response || caches.match("/mobile"))));
});
