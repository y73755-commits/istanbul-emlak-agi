// İstanbul Emlak Ağı — service worker (otomatik üretilir)
const V = "iea-c0a0bbc7d9";
const CORE = ["./", "index.html", "cevrimdisi.html", "assets/css/style.css?v=134606eb", "assets/js/main.js?v=57d32b57", "assets/js/ilceler.js?v=b22fda2c",
  "assets/fonts/manrope-latin-wght-normal.woff2", "assets/fonts/playfair-display-latin-wght-normal.woff2",
  "assets/icons/logo-44.webp", "assets/icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match("cevrimdisi.html"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  })));
});
