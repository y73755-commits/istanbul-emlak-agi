"""Eski GitHub Pages adresi için yalnızca yönlendirme yapan küçük sayfalar üretir.

GitHub Pages, ticari işlemlere aracılık eden siteler için kullanılamadığından site orada barındırılmaz;
y73755-commits.github.io/istanbul-emlak-agi/... adresine gelen ziyaretçi aynı sayfanın asıl adresine aktarılır.

Kullanım: python3 tools/yonlendirme_sayfalari.py <derlenmiş site klasörü> <çıktı klasörü>
"""
import html, json, os, shutil, sys

KOK = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HEDEF = json.load(open(os.path.join(KOK, "data", "site.json"), encoding="utf-8"))["site"]["site_url"].rstrip("/")
ONEK = "/istanbul-emlak-agi"   # GitHub Pages proje sitesi yolu

SAYFA = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<title>İstanbul Emlak Ağı yeni adresinde</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="{url}">
<meta http-equiv="refresh" content="0;url={url}">
<script>location.replace("{hedef}"+location.pathname.replace(/^\\/istanbul-emlak-agi(?=\\/|$)/,"")+location.search+location.hash)</script>
</head><body style="font-family:system-ui,sans-serif;padding:24px">
<p>İstanbul Emlak Ağı yeni adresine taşındı: <a href="{url}">{url}</a></p>
</body></html>
"""

# Daha önce bu adreste kurulan hizmet çalışanı kendini kaldırır; sayfalar ağdan (yönlendirme) gelir.
SW = """self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll(); })
    .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); }));
});
"""


def temiz(yol):
    yol = yol.replace(os.sep, "/")
    if yol == "index.html":
        return ""
    if yol.endswith("/index.html"):
        return yol[: -len("index.html")]
    return yol[: -len(".html")] if yol.endswith(".html") else yol


def main(kaynak, cikti):
    if os.path.exists(cikti):
        shutil.rmtree(cikti)
    os.makedirs(cikti)
    sayi = 0
    for kok, _, dosyalar in os.walk(kaynak):
        if os.path.relpath(kok, kaynak).split(os.sep)[0] in (".git", ".github", "assets", "testler", "supabase", "kaynak", "tools", "zamanlayici", "data", "dagitim", "node_modules"):
            continue
        for ad in dosyalar:
            if not ad.endswith(".html"):
                continue
            goreli = os.path.relpath(os.path.join(kok, ad), kaynak)
            hedef_yol = os.path.join(cikti, goreli)
            os.makedirs(os.path.dirname(hedef_yol), exist_ok=True)
            if ad.startswith("google") and len(ad) > 20:      # Search Console doğrulama dosyası olduğu gibi kalır
                shutil.copyfile(os.path.join(kok, ad), hedef_yol)
                continue
            url = HEDEF + "/" + ("" if ad == "404.html" else temiz(goreli))
            open(hedef_yol, "w", encoding="utf-8").write(SAYFA.format(url=html.escape(url), hedef=HEDEF))
            sayi += 1
    open(os.path.join(cikti, "sw.js"), "w", encoding="utf-8").write(SW)
    open(os.path.join(cikti, "robots.txt"), "w", encoding="utf-8").write("User-agent: *\nDisallow:\n")
    open(os.path.join(cikti, ".nojekyll"), "w").close()
    print(f"{sayi} yönlendirme sayfası → {HEDEF}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
