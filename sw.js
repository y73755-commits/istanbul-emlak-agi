// İstanbul Emlak Ağı — service worker (otomatik üretilir)
const V = "iea-d77aa2db87";
const CORE = ["./", "cevrimdisi", "assets/css/style.css?v=c9986820", "assets/js/main.js?v=0635749c", "assets/js/ilceler.js?v=b22fda2c",
  "assets/fonts/manrope-latin-wght-normal.woff2", "assets/fonts/playfair-display-latin-wght-normal.woff2",
  "assets/icons/logo-44.webp", "assets/icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match("cevrimdisi"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  })));
});
