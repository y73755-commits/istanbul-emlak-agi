#!/usr/bin/env python3
"""İstanbul Emlak Ağı — statik site üretici.

İçerik data/ klasöründedir:
  data/site.json        ayarlar (WhatsApp numarası, paketler, ana sayfa metinleri)
  data/talepler.json    yayındaki vatandaş ve emlakçı talepleri (yalnızca özet bilgi!)
  data/istanbul.json    39 ilçe ve mahalleleri
  data/harita.json      ilçe haritası
  data/gorseller.json   fotoğraf listesi
  data/metinler/*.md    KVKK, kullanım koşulları, çerez politikası

Çalıştırma:  python3 build.py   (yalnızca Python 3 standart kütüphanesi)
GitHub'da data/ değiştiğinde otomatik çalışır (.github/workflows/build.yml).
"""
import json, os, re, datetime, urllib.parse, hashlib
from html import escape as e

ROOT = os.path.dirname(os.path.abspath(__file__))
def load(name):
    return json.load(open(os.path.join(ROOT, "data", name), encoding="utf-8"))

D = load("site.json"); T = load("talepler.json"); IST = load("istanbul.json")
MAP = load("harita.json"); G = load("gorseller.json")
ILCE_BILGI = load("ilce_bilgileri.json")["ilceler"]
S, C, U = D["site"], D["iletisim"], D["uyelik"]
KOD = T["kodlar"]
BASE_URL = S["site_url"].rstrip("/")
BASE_PATH = urllib.parse.urlparse(BASE_URL).path.rstrip("/") + "/"
TODAY = datetime.date.today()
YAYIN_GUN = int(D.get("talep_yayin_suresi_gun", 60))
ILCELER = IST["ilceler"]
ILCE_BY_AD = {i["ad"]: i for i in ILCELER}
GORSEL = {g["ad"]: g for g in G["gorseller"]}
PAID = bool(U.get("ucretli_erisim_aktif"))
SITE = S["ad"]
SB = D["supabase"]
SB_VER = hashlib.sha1(open(os.path.join(ROOT, "assets", "js", "supabase.min.js"), "rb").read()).hexdigest()[:8]

GRUP = {"konut": ["daire", "rezidans", "villa", "mustakil"],
        "arsa": ["arsa", "tarla"],
        "ticari": ["ofis", "dukkan", "depo", "bina"]}
GRUP_AD = {"konut": "Tüm konut türleri", "arsa": "Tüm arsa ve tarla", "ticari": "Tüm ticari türler"}

# ------------------------------------------------------------------ yardımcılar
def wa(msg):
    return f"https://wa.me/{C['whatsapp']}?text={urllib.parse.quote(msg)}"

WA_MSG = {
    "uyelik": "Merhaba, İstanbul Emlak Ağı'ndan emlakçı üyeliği satın almak istiyorum.\nAd soyad: \nEmlak ofisi: \nPaket: ",
    "bilgi": "Merhaba, İstanbul Emlak Ağı emlakçı üyeliği hakkında bilgi almak istiyorum.",
    "platform": "Merhaba, İstanbul Emlak Ağı platformu hakkında bilgi almak istiyorum.",
    "destek": "Merhaba, İstanbul Emlak Ağı'ndan destek almak istiyorum. Konu: ",
}
WA_SECENEK = [("uyelik", "Üyelik satın almak istiyorum"), ("bilgi", "Emlakçı üyeliği hakkında bilgi"),
              ("platform", "Platform hakkında bilgi"), ("destek", "Destek almak istiyorum")]

def ek_de(kelime):
    """Türkçe bulunma eki: Kadıköy'de, Beşiktaş'ta, Pendik'te, Kartal'da."""
    w = kelime.strip().replace("İ", "i").replace("I", "ı").lower()
    sesli = [ch for ch in w if ch in "aıoueiöü"]
    v = sesli[-1] if sesli else "e"
    sert = w[-1:] in list("çfhkpsşt")
    return "'" + ("t" if sert else "d") + ("a" if v in "aıou" else "e")

def de(ad):
    return ad + ek_de(ad)

def tl(n):
    return f"{int(n):,}".replace(",", ".")

def kisa_tl(n):
    n = int(n)
    if n >= 1_000_000:
        v = n / 1_000_000
        s = (f"{v:.1f}".rstrip("0").rstrip(".")).replace(".", ",")
        return f"{s} milyon"
    return tl(n)

def butce_metni(t):
    a, b = t.get("butce_min"), t.get("butce_max")
    ay = "/ay" if t.get("islem") == "kiralik" else ""
    if a and b:
        if a >= 1_000_000 and b >= 1_000_000:
            return f"{kisa_tl(a).replace(' milyon', '')} – {kisa_tl(b)} TL{ay}"
        return f"{kisa_tl(a)} – {kisa_tl(b)} TL{ay}"
    if b:
        return f"En fazla {kisa_tl(b)} TL{ay}"
    if a:
        etiket = "İstenen" if t.get("kategori") in ("satmak", "kiraya-vermek") else "En az"
        return f"{etiket} {kisa_tl(a)} TL{ay}"
    return "Bütçe görüşülecek"

AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
def tarih_metni(s):
    d = datetime.date.fromisoformat(s)
    return f"{d.day} {AYLAR[d.month - 1]} {d.year}"

def asset_ver(path):
    h = hashlib.sha1(open(os.path.join(ROOT, path), "rb").read()).hexdigest()[:8]
    return f"{path}?v={h}"

def aktif_talepler(liste):
    out = []
    for t in liste:
        if t.get("durum", "aktif") != "aktif":
            continue
        if t.get("ornek") and not T.get("ornekleri_goster", True):
            continue
        try:
            yas = (TODAY - datetime.date.fromisoformat(t["tarih"])).days
        except Exception:
            continue
        if t.get("ornek") or yas <= YAYIN_GUN:
            out.append(t)
    return sorted(out, key=lambda t: t["tarih"], reverse=True)

VT = aktif_talepler(T["vatandas_talepleri"])
ET = aktif_talepler(T["emlakci_talepleri"])

def ilce_sayilari():
    c = {i["ad"]: 0 for i in ILCELER}
    for t in VT + ET:
        if t.get("ilce") in c:
            c[t["ilce"]] += 1
    return c
SAYI = ilce_sayilari()

# ------------------------------------------------------------------ ikonlar
def svg(path, vb="0 0 24 24", cls="i"):
    return f'<svg class="{cls}" viewBox="{vb}" aria-hidden="true">{path}</svg>'

ST = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
I = {
 "wa": svg('<path fill="currentColor" d="M16.04 3C9.08 3 3.43 8.64 3.43 15.6c0 2.22.58 4.39 1.69 6.3L3.33 28.7l6.96-1.83a12.6 12.6 0 0 0 5.75 1.39h.01c6.95 0 12.6-5.65 12.6-12.6 0-3.37-1.31-6.53-3.69-8.91A12.52 12.52 0 0 0 16.04 3Zm0 23.07h-.01a10.5 10.5 0 0 1-5.35-1.46l-.38-.23-4.13 1.08 1.1-4.02-.25-.41a10.44 10.44 0 0 1-1.6-5.43c0-5.79 4.71-10.5 10.51-10.5 2.8 0 5.44 1.1 7.42 3.08a10.43 10.43 0 0 1 3.07 7.43c0 5.79-4.71 10.5-10.5 10.5Zm5.76-7.86c-.32-.16-1.87-.92-2.16-1.03-.29-.1-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.18.21-.37.24-.68.08-.32-.16-1.33-.49-2.54-1.57-.94-.84-1.57-1.87-1.75-2.18-.18-.32-.02-.49.14-.65.14-.14.32-.37.47-.55.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54h-.6c-.21 0-.55.08-.84.4-.29.32-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.8.66.75.24 1.44.21 1.98.13.6-.09 1.87-.76 2.13-1.5.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.6-.37Z"/>', "0 0 32 32"),
 "pin": svg(f'<path {ST} d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z"/><circle {ST} cx="12" cy="9.5" r="2.5"/>'),
 "lock": svg(f'<rect {ST} x="5" y="11" width="14" height="9" rx="2"/><path {ST} d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
 "search": svg(f'<circle {ST} cx="11" cy="11" r="6.5"/><path {ST} d="m20 20-4.2-4.2"/>'),
 "check": svg(f'<path {ST} d="m5 12.5 4.5 4.5L19 7.5"/>'),
 "x": svg(f'<path {ST} d="M6 6l12 12M18 6 6 18"/>'),
 "arrow": svg(f'<path {ST} d="M5 12h14M13 6l6 6-6 6"/>'),
 "user": svg(f'<circle {ST} cx="12" cy="8" r="4"/><path {ST} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
 "users": svg(f'<circle {ST} cx="9" cy="8" r="3.5"/><path {ST} d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5"/><circle {ST} cx="17" cy="9" r="2.8"/><path {ST} d="M16 14.6c2.6-.3 4.7 1.3 5.5 4.4"/>'),
 "shield": svg(f'<path {ST} d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6l-7-3Z"/><path {ST} d="m9 12 2 2 4-4"/>'),
 "hand": svg(f'<path {ST} d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path {ST} d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2.8 2.8 0 0 0-4 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a4 4 0 0 1 4.6-.7l.5.2a3 3 0 0 0 2.1.2L21 6"/><path {ST} d="m21 3 1 8h-2M3 3 2 14l6.5 6.5a1.4 1.4 0 0 0 2-2M3 4h8"/>'),
 "doc": svg(f'<path {ST} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path {ST} d="M14 3v5h5M9 13h6M9 17h6"/>'),
 "clock": svg(f'<circle {ST} cx="12" cy="12" r="8.5"/><path {ST} d="M12 7.5V12l3 2"/>'),
 "heart": svg(f'<path {ST} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'),
 "home": svg(f'<path {ST} d="m3 11 9-7 9 7"/><path {ST} d="M5 10v10h14V10"/>'),
 "phone": svg(f'<path {ST} d="M6.6 3.5h2.5l1.4 4-2 1.4a12 12 0 0 0 6.6 6.6l1.4-2 4 1.4v2.5A2 2 0 0 1 18.4 20 15.4 15.4 0 0 1 4 5.6a2 2 0 0 1 2.6-2.1Z"/>'),
 "map": svg(f'<path {ST} d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z"/><path {ST} d="M9 4v14M15 6v14"/>'),
 "filter": svg(f'<path {ST} d="M4 6h16M7 12h10M10 18h4"/>'),
 "plus": svg(f'<path {ST} d="M12 5v14M5 12h14"/>'),
 "menu": svg(f'<path {ST} d="M4 7h16M4 12h16M4 17h16"/>'),
}

GOOGLE_G = ('<svg class="g-ic" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>'
            '<path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>'
            '<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>'
            '<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>')

def logo(P):
    """Görsel paketindeki logo (kaynak/logo → assets/icons/logo-44/88.webp, tools/gorselleri_hazirla.py)."""
    return (f'<a class="logo" href="{P}index.html" aria-label="{e(SITE)} ana sayfa">'
            f'<img src="{P}assets/icons/logo-44.webp" srcset="{P}assets/icons/logo-44.webp 1x, {P}assets/icons/logo-88.webp 2x" '
            f'width="273" height="44" alt="{e(SITE)}" decoding="async"></a>')

# ------------------------------------------------------------------ görseller
def pic(name, P, cls="", sizes="(max-width: 760px) 100vw, 33vw", eager=False, alt=None):
    g = GORSEL[name]
    w_, h_ = [int(x) for x in g["oran"].split(":")]
    ws = g["genislikler"]
    src = f"{P}assets/img/{name}-{ws[0]}.webp"
    srcset = ", ".join(f"{P}assets/img/{name}-{w}.webp {w}w" for w in ws)
    load = 'fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    W = ws[-1]; H = round(W * h_ / w_)
    return (f'<img class="{cls}" src="{src}" srcset="{srcset}" sizes="{sizes}" alt="{e(alt if alt is not None else g["alt"])}" '
            f'width="{W}" height="{H}" {load}>')

# ------------------------------------------------------------------ sayfa iskeleti
NAV = [("index.html", "Ana Sayfa"), ("musteri-talepleri.html", "Müşteri Talepleri"),
       ("emlakci-talepleri.html", "Emlakçı Talepleri"), ("portfoy-is-birligi.html", "Portföy ve İş Birliği"),
       ("uyelik-paketleri.html", "Üyelik Paketleri"), ("hakkimizda.html", "Hakkımızda"), ("iletisim.html", "İletişim")]

CSS = asset_ver("assets/css/style.css")
JS = asset_ver("assets/js/main.js")
APPJS = asset_ver("assets/js/app.js")

PAGES = []  # sitemap için

def header(P, active):
    items = "".join(
        f'<li><a href="{P}{h}"{" aria-current=\"page\"" if h == active else ""}>{e(t)}</a></li>' for h, t in NAV)
    return f'''<a class="skip" href="#icerik">İçeriğe geç</a>
<header class="site-header" data-header>
  <div class="wrap header-in">
    {logo(P)}
    <nav class="nav" id="anamenu" aria-label="Ana menü" data-nav>
      <ul>{items}</ul>
      <a class="btn btn-gold nav-cta" href="{P}uye-ol.html">{I["user"]}<span>Giriş Yap / Üye Ol</span></a>
    </nav>
    <button class="nav-toggle" type="button" aria-controls="anamenu" aria-expanded="false" data-nav-toggle>
      {I["menu"]}<span class="sr">Menüyü aç</span>
    </button>
  </div>
</header>'''

def footer(P):
    avrupa = [i for i in ILCELER if i["yaka"] == "Avrupa Yakası"]
    anadolu = [i for i in ILCELER if i["yaka"] == "Anadolu Yakası"]
    def il_links(lst):
        return "".join(f'<a href="{P}ilce/{i["slug"]}.html">{e(i["ad"])}</a>' for i in lst)
    wa_links = "".join(f'<li><a href="{e(wa(WA_MSG[k]))}" target="_blank" rel="noopener" data-track="whatsapp" data-ctx="footer-{k}">{e(t)}</a></li>' for k, t in WA_SECENEK)
    return f'''<footer class="site-footer">
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        {logo(P)}
        <p>{e(S["slogan"])}. Vatandaşları, emlak danışmanlarını ve emlak ofislerini İstanbul'un 39 ilçesinde tek ağda buluşturur.</p>
        <p class="foot-slogan">{e(S["kampanya_slogani"])}</p>
      </div>
      <div>
        <h2 class="foot-h">Platform</h2>
        <ul class="foot-list">
          <li><a href="{P}talep-olustur.html">Ücretsiz talep oluştur</a></li>
          <li><a href="{P}musteri-talepleri.html">Müşteri talepleri</a></li>
          <li><a href="{P}emlakci-talepleri.html">Emlakçı talepleri</a></li>
          <li><a href="{P}portfoy-is-birligi.html">Portföy ve iş birliği</a></li>
          <li><a href="{P}emlakci-uyelik.html">Emlakçı üyeliği</a></li>
          <li><a href="{P}uyelik-paketleri.html">Üyelik paketleri</a></li>
          <li><a href="{P}istanbul-ilceleri.html">İstanbul ilçeleri</a></li>
        </ul>
      </div>
      <div>
        <h2 class="foot-h">WhatsApp</h2>
        <ul class="foot-list">{wa_links}</ul>
        <p class="foot-note">WhatsApp: <a href="{e(wa(WA_MSG["platform"]))}" target="_blank" rel="noopener" data-wa-gosterim>{e(C["telefon_gosterim"])}</a><br>Konum: {e(C.get("konum", "İstanbul"))}<br>{e(C["hizmet_bolgesi"])}</p>
      </div>
    </div>
    <div class="foot-ilce">
      <div><h2 class="foot-h">Avrupa Yakası</h2><div class="foot-ilce-list">{il_links(avrupa)}</div></div>
      <div><h2 class="foot-h">Anadolu Yakası</h2><div class="foot-ilce-list">{il_links(anadolu)}</div></div>
    </div>
    <div class="foot-bottom">
      <span>© {TODAY.year} {e(SITE)}</span>
      <nav aria-label="Yasal bağlantılar">
        <a href="{P}kvkk-aydinlatma-metni.html">KVKK Aydınlatma Metni</a>
        <a href="{P}kullanim-kosullari.html">Kullanım Koşulları</a>
        <a href="{P}cerez-politikasi.html">Çerez Politikası</a>
      </nav>
    </div>
  </div>
</footer>
<aside class="wa-float" data-wa aria-label="WhatsApp iletişim">
  <div class="wa-menu" id="wa-menu" hidden data-wa-menu>
    <p class="wa-menu-h">WhatsApp'tan yazın</p>
    {"".join(f'<a href="{e(wa(WA_MSG[k]))}" target="_blank" rel="noopener" data-track="whatsapp" data-ctx="float-{k}">{e(t)}{I["arrow"]}</a>' for k, t in WA_SECENEK)}
  </div>
  <a class="wa-btn" href="{e(wa(WA_MSG["platform"]))}" target="_blank" rel="noopener" aria-controls="wa-menu" aria-expanded="false" data-wa-toggle data-track="whatsapp" data-ctx="float">
    {I["wa"]}<span class="sr">WhatsApp ile iletişime geçin</span>
  </a>
</aside>'''

def page(path, title, desc, body, P="", active=None, schema=None, extra_js="", noindex=False, og_img="assets/img/og.jpg", son_js=""):
    url = BASE_URL + "/" + ("" if path == "index.html" else path)
    full_title = title if SITE in title else f"{title} | {SITE}"
    sch = ""
    org = {"@context": "https://schema.org", "@type": "Organization", "name": SITE, "url": BASE_URL + "/",
           "logo": BASE_URL + "/assets/icons/icon-512.png", "slogan": S["slogan"],
           "areaServed": {"@type": "City", "name": "İstanbul"}, "address": {"@type": "PostalAddress", "addressLocality": "İstanbul", "addressCountry": "TR"},
           "contactPoint": {"@type": "ContactPoint", "telephone": "+" + C["whatsapp"], "contactType": "customer service", "areaServed": "TR", "availableLanguage": "Turkish"}}
    blocks = [org] if path == "index.html" else []
    if path == "index.html":
        blocks.append({"@context": "https://schema.org", "@type": "WebSite", "name": SITE, "url": BASE_URL + "/", "inLanguage": "tr-TR"})
    if schema:
        blocks += schema if isinstance(schema, list) else [schema]
    for b in blocks:
        sch += f'<script type="application/ld+json">{json.dumps(b, ensure_ascii=False)}</script>\n'
    verify = f'<meta name="google-site-verification" content="{e(S["google_site_verification"])}">' if S.get("google_site_verification") else ""
    robots = '<meta name="robots" content="noindex">' if noindex else ""
    cfg = json.dumps({"base": BASE_PATH, "wa": C["whatsapp"], "ga4": D.get("olcum", {}).get("ga4_id", ""), "yayinGun": YAYIN_GUN,
                      "bugun": TODAY.isoformat(), "sbUrl": SB["url"], "sbKey": SB["anahtar"], "sbVer": SB_VER,
                      "kod": KOD, "ikon": {k: I[k] for k in ("heart", "pin", "lock", "check", "wa")},
                      "ilceListesi": [i["ad"] for i in ILCELER], "ucretliOzellik": U["ucretli_ozellikler"], "googleG": GOOGLE_G},
                     ensure_ascii=False).replace("</", "<\\/")
    html = f'''<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">
{robots}{verify}
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="tr_TR">
<meta property="og:site_name" content="{e(SITE)}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{BASE_URL}/{og_img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B1120">
<link rel="icon" href="{P}favicon.ico" sizes="48x48">
<link rel="icon" href="{P}assets/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="{P}assets/icons/apple-touch-icon.png">
<link rel="manifest" href="{P}manifest.webmanifest">
<link rel="preload" href="{P}assets/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{P}assets/fonts/playfair-display-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{P}{CSS}">
<script>window.IEA={cfg};</script>
{sch}</head>
<body>
{header(P, active)}
<main id="icerik">
{body}
</main>
{footer(P)}
{extra_js}<script src="{P}{JS}" defer></script>
<script src="{P}{APPJS}" defer></script>
{son_js}
</body>
</html>
'''
    out = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(html)
    if not noindex:
        PAGES.append(path)

def ilce_js(P):
    return f'<script src="{P}{asset_ver("assets/js/ilceler.js")}" defer></script>\n'

def crumbs(P, items):
    li = "".join(f'<li><a href="{P}{h}">{e(t)}</a></li>' if h else f'<li aria-current="page">{e(t)}</li>' for h, t in items)
    sch = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": n + 1, "name": t, **({"item": BASE_URL + "/" + h} if h else {})}
        for n, (h, t) in enumerate(items)]}
    return f'<nav class="crumbs" aria-label="Sayfa yolu"><ol>{li}</ol></nav>', sch

def page_head(P, kicker, h1, lead, img=None, crumb_items=None, actions=""):
    cr, sch = crumbs(P, crumb_items) if crumb_items else ("", None)
    bg = f'<div class="ph-bg">{pic(img, P, sizes="100vw", eager=True, alt="")}</div>' if img else ""
    html = f'''<section class="page-head{" has-img" if img else ""}">
  {bg}
  <div class="wrap ph-in">
    {cr}
    <p class="kicker">{e(kicker)}</p>
    <h1>{h1}</h1>
    <p class="lead">{lead}</p>
    {f'<div class="actions">{actions}</div>' if actions else ""}
  </div>
</section>'''
    return html, sch

# ------------------------------------------------------------------ talep kartları
def tur_ad(t):
    return KOD["turler"].get(t.get("tur", ""), "")

def talep_kart(t, P, tip="vatandas"):
    """Sade talep kartı. Gizli bilgi içermez; detay butonu sunucuda yetki kontrolü yapar."""
    kat_map = KOD["vatandas_kategorileri"] if tip == "vatandas" else KOD["emlakci_kategorileri"]
    kat = kat_map.get(t["kategori"], "")
    yer = " / ".join(x for x in [t.get("ilce") or "İstanbul geneli", t.get("mahalle")] if x)
    meta = []
    if t.get("tur"): meta.append(tur_ad(t))
    if t.get("islem"): meta.append(KOD["islemler"].get(t["islem"], ""))
    if t.get("oda"): meta.append(t["oda"])
    if t.get("m2"): meta.append(f'{t["m2"]} m²')
    grup = next((g for g, lst in GRUP.items() if t.get("tur") in lst), "")
    bmin = t.get("butce_min") or 0
    bmax = t.get("butce_max") or t.get("butce_min") or 0
    ornek = t.get("ornek")
    kilit = "İletişim ücretli üyelere açık" if tip == "vatandas" else "İletişim onaylı emlakçılara açık"
    return f'''<article class="tcard" data-talep data-id="" data-no="{e(t["no"])}" data-tarih="{e(t["tarih"])}" data-kategori="{e(t["kategori"])}" data-ilce="{e(t.get("ilce", ""))}" data-mahalle="{e(t.get("mahalle", ""))}" data-tur="{e(t.get("tur", ""))}" data-grup="{grup}" data-islem="{e(t.get("islem", ""))}" data-bmin="{bmin}" data-bmax="{bmax}" data-ornek="{1 if ornek else 0}">
  <div class="tcard-top"><span class="badge">{e(kat)}</span>{'<span class="badge badge-ornek">Örnek</span>' if ornek else ''}<button class="fav" type="button" aria-pressed="false" data-fav="{e(t["no"])}" title="Favorilere ekle">{I["heart"]}<span class="sr">Favorilere ekle</span></button></div>
  <h3 class="tcard-h">{e(t["baslik"])}</h3>
  <p class="tcard-loc">{I["pin"]}{e(yer)}</p>
  <div class="tcard-mid"><p class="tcard-price">{e(butce_metni(t))}</p><p class="tcard-meta">{" · ".join(e(m) for m in meta if m)}</p></div>
  <p class="tcard-sum">{e(t["ozet"])}</p>
  <div class="tcard-foot"><span class="tcard-lock">{I["lock"]}{kilit}</span><button class="btn btn-sm btn-line" type="button" data-detay="{'ornek' if ornek else ''}" data-tip="{tip}">Detay ve iletişim</button></div>
  <div class="tcard-sub"><span class="tcard-no">{e(t["no"])} · {e(tarih_metni(t["tarih"]))}</span></div>
</article>'''

def liste_notu(tip="vatandas"):
    if tip == "vatandas":
        m = ("Herkes taleplerin yalnızca özetini görür. Talep sahibinin adı, telefonu ve detaylı açıklaması; yönetici tarafından onaylanmış, "
             "aktif ücretli üyeliği olan emlakçılara sunucudan açılır ve her görüntüleme kayıt altına alınır.")
    else:
        m = ("İş birliği paylaşımlarının detayı ve paylaşan emlakçının iletişim bilgisi yalnızca onaylı emlakçı üyelere açılır. "
             "Emlakçılar arası paylaşım ücretsizdir.")
    return f'<p class="list-note">{I["lock"]}<span>{m}</span></p>'

def bos_durum(metin, P, cta=True):
    btn = f'<a class="btn btn-gold" href="{P}talep-olustur.html">{I["plus"]}<span>Ücretsiz talep oluştur</span></a>' if cta else ""
    return f'<div class="empty">{I["doc"]}<p>{metin}</p>{btn}</div>'

ORNEK_NOT = ('<p class="ornek-not" data-ornek-not>“Örnek” etiketli kayıtlar, platformun nasıl çalışacağını göstermek için hazırlanmıştır; '
             'gerçek talepler yayınlandıkça kaldırılacaktır.</p>')

# ------------------------------------------------------------------ form parçaları
def opt(v, t, sel=False):
    return f'<option value="{e(v)}"{" selected" if sel else ""}>{e(t)}</option>'

def kategori_opts(kind="vatandas", bos="Seçin"):
    m = KOD["vatandas_kategorileri"] if kind == "vatandas" else KOD["emlakci_kategorileri"]
    return opt("", bos) + "".join(opt(k, v) for k, v in m.items())

def tur_opts(bos="Tümü", gruplu=False):
    out = opt("", bos)
    if gruplu:
        out += '<optgroup label="Gruplar">' + "".join(opt("g:" + g, GRUP_AD[g]) for g in GRUP) + "</optgroup>"
        out += '<optgroup label="Türler">' + "".join(opt(k, v) for k, v in KOD["turler"].items()) + "</optgroup>"
    else:
        out += "".join(opt(k, v) for k, v in KOD["turler"].items())
    return out

def ilce_opts(bos="İlçe seçin"):
    out = opt("", bos)
    for yaka in ("Avrupa Yakası", "Anadolu Yakası"):
        out += f'<optgroup label="{yaka}">' + "".join(opt(i["ad"], i["ad"]) for i in ILCELER if i["yaka"] == yaka) + "</optgroup>"
    return out

BUTCE_ARALIK = [("", "Bütçe aralığı"), ("0-25000", "Kiralık · 25.000 TL'ye kadar"), ("25000-50000", "Kiralık · 25.000 – 50.000 TL"),
                ("50000-150000", "Kiralık · 50.000 – 150.000 TL"), ("0-5000000", "Satılık · 5 milyon TL'ye kadar"),
                ("5000000-10000000", "Satılık · 5 – 10 milyon TL"), ("10000000-20000000", "Satılık · 10 – 20 milyon TL"),
                ("20000000-", "Satılık · 20 milyon TL üzeri")]

def field(label, inner, cls="", hint="", fid=""):
    h = f'<small class="hint">{hint}</small>' if hint else ""
    return f'<div class="field {cls}"><label for="{fid}">{label}</label>{inner}{h}</div>'

# ------------------------------------------------------------------ harita
def _bbox(d):
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", d)]
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)

def harita_svg(P, vurgula=None, etiket=True, link=True):
    """İlçe haritası. Kalabalık etiketler yerine her ilçenin adı üzerine gelince
    (masaüstü) ya da dokununca (mobil) açılan ipucunda gösterilir (main.js: haritaIpucu).
    Yakınlaştırılmış ilçe haritasında yalnızca vurgulanan ilçenin adı yazılır."""
    parts, labels = [], []
    vb = MAP["viewBox"]; fs = 1.0
    if vurgula and vurgula in MAP["ilceler"]:
        x0, y0, x1, y1 = _bbox(MAP["ilceler"][vurgula]["d"])
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        w = max((x1 - x0) * 2.6, (y1 - y0) * 2.6 * 1.4, 220)
        h = w / 1.4
        vx = min(max(cx - w / 2, 0), 1000 - w) if w < 1000 else 0
        vb = f"{vx:.0f} {cy - h / 2:.0f} {w:.0f} {h:.0f}"
        fs = w / 1000
    for i in ILCELER:
        m = MAP["ilceler"].get(i["ad"])
        if not m:
            continue
        n = SAYI.get(i["ad"], 0)
        cls = "il" + (" has" if n else "") + (" on" if vurgula == i["ad"] else "")
        bilgi = f'{n} talep' if n else f'{len(i["mahalleler"])} mahalle'
        path = f'<path class="{cls}" d="{m["d"]}"></path>'
        if link:
            path = (f'<a href="{P}ilce/{i["slug"]}.html" aria-label="{e(i["ad"])} ({e(bilgi)})" '
                    f'data-ad="{e(i["ad"])}" data-bilgi="{e(bilgi)}">{path}</a>')
        parts.append(path)
        if etiket and vurgula == i["ad"]:
            labels.append(f'<text x="{m["x"]}" y="{m["y"]}" class="on" style="font-size:{30 * fs:.1f}px;stroke-width:{4 * fs:.1f}px">{e(i["ad"])}</text>')
    return (f'<div class="imap-wrap"><svg class="imap" viewBox="{vb}" role="group" aria-label="{e(vurgula + " ilçesi haritası") if vurgula else "İstanbul ilçe haritası"}">'
            f'<g class="imap-p">{"".join(parts)}</g><g class="imap-l" aria-hidden="true">{"".join(labels)}</g></svg>'
            f'<div class="imap-tip" role="status" aria-live="polite" hidden></div></div>')

# ------------------------------------------------------------------ ANA SAYFA
KUTULAR = [
    ("satilik-konut", "Satılık Konut", "musteri-talepleri.html?islem=satilik&grup=konut", "Daire, rezidans ve müstakil ev"),
    ("kiralik-konut", "Kiralık Konut", "musteri-talepleri.html?islem=kiralik&grup=konut", "Aileler ve kurumsal kiracılar"),
    ("satilik-arsa", "Satılık Arsa", "musteri-talepleri.html?islem=satilik&tur=arsa", "İmarlı ve tek tapulu parseller"),
    ("tarla", "Kiralık Arsa / Tarla", "musteri-talepleri.html?islem=kiralik&grup=arsa", "Tarım ve depolama alanları"),
    ("kat-karsiligi", "Kat Karşılığı Arsa", "musteri-talepleri.html?islem=kat-karsiligi", "Kentsel dönüşüm ve müteahhit"),
    ("kiralik-ofis", "Kiralık Ofis", "musteri-talepleri.html?islem=kiralik&tur=ofis", "Plaza katı ve iş merkezi"),
    ("ticari", "Satılık Ticari Gayrimenkul", "musteri-talepleri.html?islem=satilik&grup=ticari", "Yatırımlık, kira getirili"),
    ("dukkan", "Kiralık Dükkân", "musteri-talepleri.html?islem=kiralik&tur=dukkan", "Cadde üzeri ve çarşı içi"),
    ("villa", "Villa", "musteri-talepleri.html?tur=villa", "Bahçeli, havuzlu, müstakil"),
    ("is-birligi", "Emlakçı Portföy ve İş Birliği", "portfoy-is-birligi.html", "Ofisler arası portföy paylaşımı"),
]

def kim_ne_gorur():
    rows = [
        ("Vatandaş taleplerinin özeti (başlık, tür, ilçe/mahalle, bütçe, kısa açıklama)", "yes", "yes", "yes"),
        ("Vatandaş taleplerinin tam açıklaması ve iletişim bilgisi", "no", "no", "paid"),
        ("Emlakçı iş birliği paylaşımları (tam detay ve emlakçının iletişimi)", "no", "yes", "yes"),
        ("İş birliği paylaşımı yapma", "no", "yes", "yes"),
        ("Filtreleme ve favorilere ekleme", "part", "yes", "yes"),
    ]
    sym = {"yes": f'<span class="ok">{I["check"]}<span class="sr">Görür</span></span>',
           "no": f'<span class="no">{I["x"]}<span class="sr">Göremez</span></span>',
           "part": '<span class="part">Sınırlı</span>',
           "paid": (f'<span class="ok" data-ucretli="acik"{"" if PAID else " hidden"}>{I["check"]}<span class="sr">Görür</span></span>'
                    f'<span class="part" data-ucretli="kapali"{" hidden" if PAID else ""}>Paket satışı başlayınca</span>')}
    body = "".join(f'<tr><th scope="row">{e(r[0])}</th><td>{sym[r[1]]}</td><td>{sym[r[2]]}</td><td>{sym[r[3]]}</td></tr>' for r in rows)
    return f'''<div class="table-wrap" tabindex="0" role="region" aria-label="Üyelik karşılaştırma tablosu"><table class="matrix">
<thead><tr><th scope="col">Bilgi</th><th scope="col">Ziyaretçi / Vatandaş</th><th scope="col">Onaylı emlakçı</th><th scope="col">Onaylı emlakçı <span>(ücretli, aktif)</span></th></tr></thead>
<tbody>{body}</tbody></table></div>
<p class="small muted matrix-not">Talep sahibi kendi talebinin tüm bilgilerini, yönetici ise bütün talepleri her zaman görür. <span data-ucretli="kapali"{" hidden" if PAID else ""}><strong>Şu an lansman dönemi:</strong> paket satışı başlamadığı için vatandaşların iletişim bilgisi hiçbir emlakçıya açılmıyor.</span></p>'''

def build_index():
    P = ""
    hero_search = f'''<form class="search" action="musteri-talepleri.html" method="get" role="search" aria-label="Talep ara" data-ilce-form>
  <div class="search-grid">
    {field("Ne arıyorsunuz?", f'<select id="s-kat" name="kategori">{kategori_opts("vatandas", "Tüm talepler")}</select>', fid="s-kat")}
    {field("İlçe", f'<select id="s-ilce" name="ilce" data-ilce>{ilce_opts("Tüm İstanbul")}</select>', fid="s-ilce")}
    {field("Mahalle", '<select id="s-mah" name="mahalle" data-mahalle disabled><option value="">Önce ilçe seçin</option></select>', fid="s-mah")}
    {field("Gayrimenkul türü", f'<select id="s-tur" name="tur">{tur_opts("Tüm türler", gruplu=True)}</select>', fid="s-tur")}
    {field("Bütçe aralığı", '<select id="s-butce" name="butce">' + "".join(opt(v, t) for v, t in BUTCE_ARALIK) + '</select>', fid="s-butce")}
    <button class="btn btn-gold search-btn" type="submit">{I["search"]}<span>Ara</span></button>
  </div>
</form>'''
    kutular = "".join(f'''<a class="cat" href="{h}">
  {pic(img, P, sizes="(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 20vw")}
  <span class="cat-txt"><strong>{e(t)}</strong><small>{e(s)}</small></span>
</a>''' for img, t, h, s in KUTULAR)
    vt = "".join(talep_kart(t, P) for t in VT[:6]) or bos_durum("Henüz yayında talep yok. İlk talebi siz oluşturun.", P)
    et = "".join(talep_kart(t, P, "emlakci") for t in ET[:3]) or bos_durum("Henüz yayında emlakçı talebi yok.", P, cta=False)
    ornek = ORNEK_NOT if any(t.get("ornek") for t in VT[:6] + ET[:3]) else ""
    avrupa = [i for i in ILCELER if i["yaka"] == "Avrupa Yakası"]
    anadolu = [i for i in ILCELER if i["yaka"] == "Anadolu Yakası"]
    def chips(lst):
        return "".join(f'<a class="chip" href="ilce/{i["slug"]}.html">{e(i["ad"])}{f"<b>{SAYI[i["ad"]]}</b>" if SAYI[i["ad"]] else ""}</a>' for i in lst)
    toplam_mah = sum(len(i["mahalleler"]) for i in ILCELER)
    body = f'''<section class="hero">
  <div class="hero-bg">{pic("hero-bogaz", P, sizes="100vw", eager=True)}</div>
  <div class="wrap hero-in">
    <p class="kicker">{e(S["slogan"])}</p>
    <h1 data-ayar="ana_baslik">{e(D["ana_sayfa"]["baslik"])}</h1>
    <p class="lead" data-ayar="ana_alt">{e(D["ana_sayfa"]["alt_aciklama"])}</p>
    <div class="actions">
      <a class="btn btn-gold btn-lg" href="talep-olustur.html">{I["plus"]}<span>Ücretsiz Talep Oluştur</span></a>
      <a class="btn btn-line btn-lg" href="emlakci-uyelik.html">{I["users"]}<span>Emlakçı Olarak Katıl</span></a>
    </div>
    {hero_search}
    <ul class="stats">
      <li><strong>39</strong><span>İlçe</span></li>
      <li><strong>{toplam_mah}</strong><span>Mahalle</span></li>
      <li><strong>Ücretsiz</strong><span>Vatandaş talebi</span></li>
      <li><strong>Onaylı</strong><span>Emlakçı ağı</span></li>
    </ul>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Kategoriler</p>
      <h2>Ne arıyorsanız, doğru talep burada</h2>
      <p>Konuttan arsaya, ofisten kat karşılığı projelere kadar İstanbul'daki tüm gayrimenkul talepleri tek ağda.</p>
    </div>
    <div class="cats">{kutular}</div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="wrap">
    <div class="sec-head row">
      <div><p class="kicker">Yeni müşteri talepleri</p><h2>Vatandaşların güncel arayışları</h2></div>
      <a class="link-gold" href="musteri-talepleri.html">Tüm müşteri talepleri{I["arrow"]}</a>
    </div>
    {liste_notu("vatandas")}
    <div class="tgrid" data-db-list data-tip="vatandas" data-limit="6">{vt}</div>
    <div class="sec-head row mt">
      <div><p class="kicker">Emlakçı talepleri</p><h2>Ofisler arası iş birliği</h2></div>
      <a class="link-gold" href="emlakci-talepleri.html">Tüm emlakçı talepleri{I["arrow"]}</a>
    </div>
    <div class="tgrid" data-db-list data-tip="emlakci" data-limit="3">{et}</div>
    {ornek}
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Nasıl çalışır?</p>
      <h2>Üç taraf, tek ağ</h2>
    </div>
    <div class="steps3">
      <div class="step-card">
        <span class="step-ic">{I["home"]}</span>
        <h3>Vatandaş</h3>
        <ol>
          <li>Kısa formla ücretsiz talebinizi oluşturun.</li>
          <li>Talebiniz kontrol edilip özet olarak yayınlanır; adınız ve telefonunuz herkese açık olmaz.</li>
          <li>Onaylı emlak danışmanları size uygun seçeneklerle ulaşır.</li>
        </ol>
        <a class="link-gold" href="talep-olustur.html">Talep oluştur{I["arrow"]}</a>
      </div>
      <div class="step-card">
        <span class="step-ic">{I["users"]}</span>
        <h3>Emlak danışmanı</h3>
        <ol>
          <li>Yetki belgenizle başvurun, yönetici onayından sonra hesabınız açılır.</li>
          <li>Portföyünüzü ve müşteri ihtiyaçlarınızı diğer emlakçılarla paylaşın.</li>
          <li>İş birliği talepleriyle portföy ve müşteri eşleştirin.</li>
        </ol>
        <a class="link-gold" href="emlakci-uyelik.html">Emlakçı başvurusu{I["arrow"]}</a>
      </div>
      <div class="step-card">
        <span class="step-ic">{I["shield"]}</span>
        <h3>Ücretli üye</h3>
        <ol>
          <li>Aylık veya yıllık paketinizi WhatsApp'tan talep edin.</li>
          <li>Ödemeniz kontrol edilir, üyeliğiniz yönetici tarafından açılır.</li>
          <li>Vatandaş taleplerinin tam detayına ve iletişim bilgisine erişin.</li>
        </ol>
        <a class="link-gold" href="uyelik-paketleri.html">Üyelik paketleri{I["arrow"]}</a>
      </div>
    </div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="wrap map-sec">
    <div class="map-txt">
      <p class="kicker">İstanbul'un 39 ilçesi</p>
      <h2>Yalnızca İstanbul, mahalle mahalle</h2>
      <p>Platform yalnızca İstanbul'da hizmet verir. İlçe seçtiğinizde yalnızca o ilçeye bağlı mahalleler listelenir; arama, talep oluşturma ve filtrelemenin tamamı ilçe ve mahalle bazında çalışır.</p>
      <h3 class="yaka-h">Avrupa Yakası</h3><div class="chips">{chips(avrupa)}</div>
      <h3 class="yaka-h">Anadolu Yakası</h3><div class="chips">{chips(anadolu)}</div>
    </div>
    <div class="map-box">{harita_svg(P)}<p class="map-cap">İlçe adını görmek için haritada üzerine gelin ya da dokunun; ikinci dokunuşta ilçe sayfası açılır.</p></div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Gizlilik önce gelir</p>
      <h2>Kim neyi görür?</h2>
      <p>Vatandaşın adı ve telefonu hiçbir zaman herkese açık yayınlanmaz. Tam detay ve iletişim bilgisi yalnızca yönetici tarafından onaylanmış, aktif ücretli üyeliği olan emlakçılara açılır.</p>
    </div>
    {kim_ne_gorur()}
  </div>
</section>

<section class="cta-band">
  <div class="wrap cta-in">
    <div>
      <p class="kicker">{e(SITE)}</p>
      <h2>{e(S["kampanya_slogani"])}</h2>
    </div>
    <div class="actions">
      <a class="btn btn-gold btn-lg" href="talep-olustur.html">{I["plus"]}<span>Talep Oluştur</span></a>
      <a class="btn btn-line btn-lg" href="emlakci-uyelik.html">{I["users"]}<span>Emlakçı Olarak Katıl</span></a>
    </div>
  </div>
</section>'''
    page("index.html", f"{SITE} | {S['slogan']}",
         "İstanbul'un 39 ilçesinde gayrimenkul arayan vatandaşları, emlak danışmanlarını ve emlak ofislerini buluşturan talep ve iş birliği platformu. Ücretsiz talep oluşturun.",
         body, P, "index.html", extra_js=ilce_js(P))

# ------------------------------------------------------------------ TALEP LİSTELERİ
def filtre_bar(kind):
    kat = kategori_opts(kind, "Tüm talep türleri")
    return f'''<form class="filters" data-filters aria-label="Talepleri filtrele" onsubmit="return false">
  <details class="filters-box" open data-filters-box><summary><span>Filtrele</span>{I["filter"]}</summary>
  <div class="filters-grid">
    {field("Talep türü", f'<select id="f-kat" name="kategori">{kat}</select>', fid="f-kat")}
    {field("İlçe", f'<select id="f-ilce" name="ilce" data-ilce>{ilce_opts("Tüm İstanbul")}</select>', fid="f-ilce")}
    {field("Mahalle", '<select id="f-mah" name="mahalle" data-mahalle disabled><option value="">Tüm mahalleler</option></select>', fid="f-mah")}
    {field("Gayrimenkul türü", f'<select id="f-tur" name="tur">{tur_opts("Tüm türler", gruplu=True)}</select>', fid="f-tur")}
    {field("Satılık / kiralık", '<select id="f-islem" name="islem">' + opt("", "Tümü") + "".join(opt(k, v) for k, v in KOD["islemler"].items()) + '</select>', fid="f-islem")}
    {field("En az bütçe (TL)", '<input id="f-bmin" name="bmin" inputmode="numeric" autocomplete="off" placeholder="0" data-money>', fid="f-bmin")}
    {field("En fazla bütçe (TL)", '<input id="f-bmax" name="bmax" inputmode="numeric" autocomplete="off" placeholder="Sınırsız" data-money>', fid="f-bmax")}
    {field("Sırala", '<select id="f-sira" name="sira">' + opt("yeni", "En yeni") + opt("eski", "En eski") + opt("butce-artan", "Bütçe (artan)") + opt("butce-azalan", "Bütçe (azalan)") + '</select>', fid="f-sira")}
  </div>
  </details>
  <div class="filters-foot">
    <label class="check"><input type="checkbox" name="fav" data-only-fav> <span>Sadece favorilerim</span></label>
    <p class="count" aria-live="polite" data-count></p>
    <button class="btn btn-ghost btn-sm" type="reset" data-reset>Filtreleri temizle</button>
  </div>
</form>'''

def build_lists():
    P = ""
    # Müşteri talepleri
    ph, sch = page_head(P, "Müşteri talepleri", "Vatandaşların gayrimenkul talepleri",
        "İstanbul'da gayrimenkul arayan veya gayrimenkulünü satmak, kiraya vermek isteyen vatandaşların talepleri. Herkes özetleri görür; tam detay ve iletişim bilgisi yalnızca aktif ücretli üyeliği olan onaylı emlakçılara açılır.",
        "kiralik-konut", [("index.html", "Ana Sayfa"), (None, "Müşteri Talepleri")],
        f'<a class="btn btn-gold" href="talep-olustur.html">{I["plus"]}<span>Ücretsiz talep oluştur</span></a>')
    cards = "".join(talep_kart(t, P) for t in VT)
    body = f'''{ph}
<section class="sec sec-tight">
  <div class="wrap">
    {filtre_bar("vatandas")}
    <h2 class="sr">Yayındaki vatandaş talepleri</h2>
    {liste_notu("vatandas")}
    <div class="tgrid" data-list data-db-list data-tip="vatandas">{cards}</div>
    {bos_durum("Bu filtrelere uyan talep bulunamadı. Filtreleri genişletin veya talebinizi oluşturun.", P).replace('class="empty"', 'class="empty" hidden data-empty')}
    {ORNEK_NOT if any(t.get("ornek") for t in VT) else ""}
  </div>
</section>'''
    page("musteri-talepleri.html", "Müşteri Talepleri — İstanbul Gayrimenkul Talepleri",
         "İstanbul'da satılık ve kiralık konut, arsa, ofis ve dükkân arayan vatandaşların güncel talepleri. İlçe, mahalle, tür ve bütçeye göre filtreleyin.",
         body, P, "musteri-talepleri.html", schema=sch, extra_js=ilce_js(P))

    # Emlakçı talepleri
    ph, sch = page_head(P, "Emlakçı talepleri", "Emlakçılar arası iş birliği talepleri",
        "Emlak danışmanlarının aradığı portföyler, hazır alıcı ve kiracı müşterileri ve iş birliğine açık portföyleri. Detay ve paylaşan emlakçının iletişim bilgisi yalnızca onaylı emlakçı üyelere açıktır.",
        "is-birligi", [("index.html", "Ana Sayfa"), (None, "Emlakçı Talepleri")],
        f'<a class="btn btn-gold" href="portfoy-is-birligi.html#paylas">{I["plus"]}<span>İş birliği talebi gönder</span></a>'
        f'<a class="btn btn-line" href="emlakci-uyelik.html">{I["users"]}<span>Emlakçı olarak katıl</span></a>')
    cards = "".join(talep_kart(t, P, "emlakci") for t in ET)
    body = f'''{ph}
<section class="sec sec-tight">
  <div class="wrap">
    {filtre_bar("emlakci")}
    <h2 class="sr">Yayındaki emlakçı iş birliği talepleri</h2>
    {liste_notu("emlakci")}
    <div class="tgrid" data-list data-db-list data-tip="emlakci">{cards}</div>
    {bos_durum("Bu filtrelere uyan emlakçı talebi bulunamadı.", P, cta=False).replace('class="empty"', 'class="empty" hidden data-empty')}
    {ORNEK_NOT if any(t.get("ornek") for t in ET) else ""}
  </div>
</section>'''
    page("emlakci-talepleri.html", "Emlakçı Talepleri — Portföy ve Müşteri İş Birliği",
         "İstanbul'daki emlak danışmanlarının portföy, alıcı ve kiracı müşteri iş birliği talepleri. Onaylı emlakçılar detay ve iletişime erişir.",
         body, P, "emlakci-talepleri.html", schema=sch, extra_js=ilce_js(P))

# ------------------------------------------------------------------ FORMLAR
def kisi_alanlari(prefix, ofis=False):
    o = field("Emlak ofisi adı", f'<input id="{prefix}-ofis" name="ofis" required autocomplete="organization" maxlength="80">', fid=f"{prefix}-ofis") if ofis else ""
    return (field("Ad soyad", f'<input id="{prefix}-ad" name="ad" required autocomplete="name" maxlength="60">', fid=f"{prefix}-ad")
            + o
            + field("Cep telefonu", f'<input id="{prefix}-tel" name="tel" type="tel" required autocomplete="tel" inputmode="tel" placeholder="05xx xxx xx xx" data-phone>',
                    hint="WhatsApp'ta kullandığınız numara.", fid=f"{prefix}-tel"))

def talep_alanlari(prefix, kind):
    detay_ipucu = ("Yalnızca aktif ücretli üyeliği olan onaylı emlakçılar görür." if kind == "vatandas"
                   else "Yalnızca onaylı emlakçı üyeler görür.")
    return f'''<div class="form-grid">
  {field("Talep türü", f'<select id="{prefix}-kat" name="kategori" required data-kategori>{kategori_opts(kind)}</select>', "span2", fid=f"{prefix}-kat")}
  {field("İlçe", f'<select id="{prefix}-ilce" name="ilce" {"required" if kind == "vatandas" else ""} data-ilce>{ilce_opts("İlçe seçin" if kind == "vatandas" else "İstanbul geneli")}</select>', fid=f"{prefix}-ilce")}
  {field("Mahalle", f'<select id="{prefix}-mah" name="mahalle" data-mahalle disabled><option value="">Önce ilçe seçin</option></select>', hint="İsteğe bağlı", fid=f"{prefix}-mah")}
  {field("Gayrimenkul türü", f'<select id="{prefix}-tur" name="tur" required data-tur>{tur_opts("Seçin")}</select>', fid=f"{prefix}-tur")}
  {field("Satılık / kiralık", f'<select id="{prefix}-islem" name="islem" required>' + opt("", "Seçin") + "".join(opt(k, v) for k, v in KOD["islemler"].items()) + '</select>', fid=f"{prefix}-islem")}
  {field('<span data-butce-label>Bütçe aralığı (TL)</span>', f'<div class="duo"><input id="{prefix}-bmin" name="bmin" inputmode="numeric" placeholder="En az" data-money aria-label="En az"><input name="bmax" inputmode="numeric" placeholder="En fazla" data-money aria-label="En fazla"></div>', "span2", fid=f"{prefix}-bmin")}
  {field("Metrekare (m²)", f'<input id="{prefix}-m2" name="m2" inputmode="numeric" maxlength="6" placeholder="ör. 120">', fid=f"{prefix}-m2")}
  {field("Oda sayısı", f'<select id="{prefix}-oda" name="oda">' + opt("", "Seçin") + "".join(opt(x, x) for x in ["1+0", "1+1", "2+1", "3+1", "3+2", "4+1", "4+2", "5+1 ve üzeri"]) + '</select>', "", hint="Konut için", fid=f"{prefix}-oda")}
  {field("Başlık", f'<input id="{prefix}-baslik" name="baslik" required minlength="5" maxlength="120" placeholder="Seçimlerinize göre önerilir, değiştirebilirsiniz">', "span2", hint="Herkese açık görünür.", fid=f"{prefix}-baslik")}
  {field("Kısa açıklama", f'<input id="{prefix}-ozet" name="ozet" required minlength="5" maxlength="200" placeholder="ör. Metroya yakın, otoparklı, ara kat tercih">', "span2", hint="Herkese açık görünür; ad, telefon veya adres yazmayın.", fid=f"{prefix}-ozet")}
  {field("Detaylı açıklama", f'<textarea id="{prefix}-aciklama" name="aciklama" rows="4" maxlength="2000" required placeholder="Konum tercihi, kat, bina yaşı, otopark, tapu durumu, taşınma tarihi…"></textarea>', "span2", hint=detay_ipucu, fid=f"{prefix}-aciklama")}
</div>'''

def basari_paneli():
    return f'''<div class="done" hidden data-done tabindex="-1">
  <span class="done-ic">{I["check"]}</span>
  <div data-done-icerik></div>
</div>'''

def build_forms():
    P = ""
    kvkk = '<a href="kvkk-aydinlatma-metni.html" target="_blank">KVKK aydınlatma metnini</a>'
    # --- vatandaş talep formu
    ph, sch = page_head(P, "Ücretsiz talep", "Gayrimenkul talebinizi oluşturun",
        "Ücretsizdir. Formu doldurun ve Google hesabınızla tek tıkla giriş yapın; talebiniz kontrol edildikten sonra özet olarak yayınlanır. Adınız ve telefonunuz herkese açık yayınlanmaz.",
        None, [("index.html", "Ana Sayfa"), (None, "Talep Oluştur")])
    form = f'''<form class="card form" data-db-form="vatandas" novalidate>
  {talep_alanlari("v", "vatandas")}
  <h2 class="form-h">İletişim bilgileriniz</h2>
  <div class="form-grid">{kisi_alanlari("v")}</div>
  <label class="check consent"><input type="checkbox" name="onay" required>
    <span>İletişim bilgilerimin, platformun ücretli üyesi olan emlak danışmanlarıyla paylaşılmasına onay veriyorum. {kvkk} okudum.</span></label>
  <p class="form-err" role="alert" hidden data-err></p>
  <button class="btn btn-gold btn-lg btn-block" type="submit">{I["check"]}<span>Talebimi gönder</span></button>
  <p class="form-note">{I["lock"]} Göndermeden önce Google hesabınızla giriş yapmanız istenir; yazdıklarınız kaybolmaz. Telefon numaranız yalnızca iletişim içindir, SMS gönderilmez. Talebinizi daha sonra <a class="link-gold" href="hesabim.html">Hesabım</a> sayfasından görüntüleyebilir, düzenleyebilir veya kapatabilirsiniz.</p>
</form>
{basari_paneli()}'''
    aside = f'''<aside class="side">
  <div class="card side-card">
    <h2>Nasıl ilerler?</h2>
    <ol class="numlist">
      <li>Formu doldurur, Google hesabınızla giriş yaparsınız.</li>
      <li>Talebiniz kontrol edilir ve özet hâliyle yayınlanır.</li>
      <li>Onaylı emlak danışmanları size uygun seçeneklerle ulaşır.</li>
      <li>Talebiniz sonuçlandığında Hesabım sayfasından kapatır veya kalıcı olarak silersiniz.</li>
    </ol>
  </div>
  <div class="card side-card">
    <h2>Herkese açık görünen</h2>
    <p>Başlık, talep türü, ilçe/mahalle, bütçe, oda/m² ve kısa açıklama.</p>
    <h2>Herkese açık görünmeyen</h2>
    <p>Adınız, telefonunuz ve detaylı açıklamanız. Bunlar yalnızca aktif ücretli üyeliği olan onaylı emlakçılara, sunucudan açılır.<span data-ucretli="kapali"{" hidden" if PAID else ""}> Lansman döneminde paket satışı başlamadığı için şu an hiçbir emlakçıya açılmaz.</span></p>
  </div>
</aside>'''
    body = f'''{ph}
<section class="sec sec-tight"><div class="wrap two-col">{form}{aside}</div></section>'''
    page("talep-olustur.html", "Ücretsiz Gayrimenkul Talebi Oluştur",
         "İstanbul'da satılık veya kiralık konut, arsa, ofis, dükkân ya da villa mı arıyorsunuz? Ücretsiz talep oluşturun, onaylı emlak danışmanları size ulaşsın.",
         body, P, None, schema=sch, extra_js=ilce_js(P))

    # --- emlakçı üyelik başvurusu
    ilce_checks = ""
    for yaka in ("Avrupa Yakası", "Anadolu Yakası"):
        ilce_checks += f'<fieldset class="ilce-set"><legend>{yaka} <button type="button" class="mini" data-select-all="{yaka}">Tümünü seç</button></legend><div class="ilce-checks">'
        ilce_checks += "".join(f'<label class="check sm"><input type="checkbox" name="ilceler" value="{e(i["ad"])}" data-yaka="{yaka}"><span>{e(i["ad"])}</span></label>' for i in ILCELER if i["yaka"] == yaka)
        ilce_checks += "</div></fieldset>"
    ph, sch = page_head(P, "Emlakçı üyeliği", "Emlak danışmanı olarak ağa katılın",
        "Taşınmaz Ticareti Yetki Belgesi olan emlak danışmanları ve emlak ofisleri başvurabilir. Başvurunuz yönetici tarafından kontrol edilir; onaylandığında hesabınız açılır ve iş birliği paylaşımlarına katılırsınız.",
        "is-birligi", [("index.html", "Ana Sayfa"), ("uye-ol.html", "Üye Ol"), (None, "Emlakçı Üyeliği")])
    form = f'''<form class="card form" data-db-form="emlakci" novalidate>
  <h2 class="form-h first">Kişisel ve ofis bilgileri</h2>
  <div class="form-grid">
    {kisi_alanlari("k", ofis=True)}
    {field("E-posta", '<input id="k-eposta" name="eposta" type="email" required autocomplete="email" maxlength="80">', fid="k-eposta")}
    {field("Taşınmaz Ticareti Yetki Belgesi no", '<input id="k-yetki" name="yetki" required inputmode="numeric" maxlength="20" placeholder="ör. 3412345">', "span2", hint="Belge numaranız onay sırasında kontrol edilir.", fid="k-yetki")}
  </div>
  <h2 class="form-h">Hizmet verdiğiniz ilçeler</h2>
  {ilce_checks}
  <p class="hint">Profil fotoğrafınızı onaydan sonra Hesabım sayfasından ekleyebilirsiniz (isteğe bağlı).</p>
  <label class="check consent"><input type="checkbox" name="onay" required>
    <span>{kvkk} okudum; <a href="kullanim-kosullari.html" target="_blank">kullanım koşullarını</a> kabul ediyorum.</span></label>
  <p class="form-err" role="alert" hidden data-err></p>
  <button class="btn btn-gold btn-lg btn-block" type="submit">{I["check"]}<span>Başvurumu gönder</span></button>
  <p class="form-note">{I["lock"]} Göndermeden önce Google hesabınızla giriş yapmanız istenir; yazdıklarınız kaybolmaz. Telefonunuz iletişim içindir, SMS gönderilmez. Başvurunuzun durumunu Hesabım sayfasından takip edersiniz.</p>
</form>
{basari_paneli()}'''
    aside = f'''<aside class="side">
  <div class="card side-card">
    <h2>Üyelikle neler yaparsınız?</h2>
    <ul class="ticks">{"".join(f"<li>{I['check']}{e(x)}</li>" for x in U["ucretsiz_ozellikler"])}</ul>
    <p class="small">Vatandaş taleplerinin tam detayı ve iletişim bilgisi için <a class="link-gold" href="uyelik-paketleri.html">ücretli paketler</a>.</p>
  </div>
  <div class="card side-card">
    <h2>Onay süreci</h2>
    <ol class="numlist">
      <li>Google hesabınızla giriş yapıp başvurunuzu gönderirsiniz.</li>
      <li>Yetki belgeniz ve bilgileriniz yönetici tarafından kontrol edilir.</li>
      <li>Onaylandığınızda hesabınız aktif olur, iş birliği paylaşımı yapabilirsiniz.</li>
    </ol>
  </div>
</aside>'''
    body = f'''{ph}
<section class="sec sec-tight"><div class="wrap two-col">{form}{aside}</div></section>'''
    page("emlakci-uyelik.html", "Emlakçı Üyeliği Başvurusu",
         "İstanbul'daki emlak danışmanları ve emlak ofisleri için iş birliği ağı. Yetki belgenizle başvurun, onaylandıktan sonra portföy ve müşteri paylaşımına katılın.",
         body, P, None, schema=sch)

    # --- üye ol (yönlendirme)
    ph, sch = page_head(P, "Giriş yap / Üye ol", "Platforma katılın",
        "Vatandaşlar ücretsiz talep oluşturur, emlak danışmanları yetki belgesiyle başvurur. Giriş Google hesabınızla yapılır; şifre ve SMS gerekmez.",
        None, [("index.html", "Ana Sayfa"), (None, "Üye Ol")])
    body = f'''{ph}
<section class="sec sec-tight">
  <div class="wrap">
    <div class="join three">
      <a class="join-card" href="giris.html">
        <span class="step-ic">{I["user"]}</span>
        <h2>Giriş yap</h2>
        <p>Taleplerinizi, başvurunuzu ve üyeliğinizi görmek için Google hesabınızla giriş yapın.</p>
        <span class="link-gold">Google ile giriş{I["arrow"]}</span>
      </a>
      <a class="join-card" href="talep-olustur.html">
        <span class="step-ic">{I["home"]}</span>
        <h2>Vatandaşım</h2>
        <p>Gayrimenkul arıyorum veya gayrimenkulümü satmak / kiraya vermek istiyorum. Tamamen ücretsizdir.</p>
        <span class="link-gold">Ücretsiz talep oluştur{I["arrow"]}</span>
      </a>
      <a class="join-card" href="emlakci-uyelik.html">
        <span class="step-ic">{I["users"]}</span>
        <h2>Emlak danışmanıyım</h2>
        <p>Yetki belgemle başvurup emlakçılar arası iş birliği ağına katılmak istiyorum.</p>
        <span class="link-gold">Emlakçı başvurusu{I["arrow"]}</span>
      </a>
    </div>
  </div>
</section>'''
    page("uye-ol.html", "Giriş Yap / Üye Ol", "Vatandaşlar ücretsiz talep oluşturur, emlak danışmanları yetki belgesiyle başvurup iş birliği ağına katılır. Üyeler Google hesabıyla giriş yapar.",
         body, P, None, schema=sch)

    # --- giriş
    ph, sch = page_head(P, "Üye girişi", "Google hesabınızla giriş yapın",
        "Şifre ve SMS gerekmez. Google hesabınızla giriş yapın; taleplerinizi, başvurunuzu ve üyeliğinizi Hesabım sayfasından yönetin.",
        None, [("index.html", "Ana Sayfa"), (None, "Giriş")])
    body = f'''{ph}
<section class="sec sec-tight"><div class="wrap narrow-sm">
  <div class="card form" data-giris>
    <button class="btn btn-google btn-lg btn-block" type="button" data-google-giris>{GOOGLE_G}<span>Google ile giriş yap</span></button>
    <p class="form-err" role="alert" hidden data-err></p>
    <p class="form-note">{I["lock"]} Hesabınız yoksa ilk girişte otomatik oluşturulur. Google'dan yalnızca adınız ve e-posta adresiniz alınır. Talep oluşturmak için <a class="link-gold" href="talep-olustur.html">buraya</a>, emlakçı başvurusu için <a class="link-gold" href="emlakci-uyelik.html">buraya</a> tıklayın.</p>
  </div>
</div></section>'''
    page("giris.html", "Üye Girişi", "İstanbul Emlak Ağı üye girişi: Google hesabınızla şifresiz ve ücretsiz giriş yapın.", body, P, None, schema=sch)

    # --- hesabım
    body = f'''<section class="page-head"><div class="wrap ph-in"><p class="kicker">Hesabım</p><h1>Hesabım</h1></div></section>
<section class="sec sec-tight"><div class="wrap" data-hesabim><p class="muted">Yükleniyor…</p></div></section>'''
    page("hesabim.html", "Hesabım", "Taleplerinizi, emlakçı başvurunuzu ve üyeliğinizi yönetin.", body, P, None, noindex=True,
         extra_js=ilce_js(P), son_js=f'<script src="{P}{asset_ver("assets/js/hesabim.js")}" defer></script>')

    # --- yönetici
    body = f'''<section class="page-head"><div class="wrap ph-in"><p class="kicker">Yönetim</p><h1>Yönetici paneli</h1></div></section>
<section class="sec sec-tight"><div class="wrap" data-yonetici><p class="muted">Yükleniyor…</p></div></section>'''
    page("yonetici.html", "Yönetici Paneli", "Yönetici paneli.", body, P, None, noindex=True,
         son_js=f'<script src="{P}{asset_ver("assets/js/admin.js")}" defer></script>')

# ------------------------------------------------------------------ PORTFÖY VE İŞ BİRLİĞİ
def build_isbirligi():
    P = ""
    ph, sch = page_head(P, "Portföy ve iş birliği", "Emlakçılar arası portföy ve müşteri paylaşımı",
        "Müşterinize uygun portföyü arayın, portföyünüze müşteri bulun. Onaylı emlak danışmanları ihtiyaçlarını paylaşır, diğer ofislerin talepleriyle kendi portföylerini eşleştirir.",
        "is-birligi", [("index.html", "Ana Sayfa"), (None, "Portföy ve İş Birliği")],
        f'<a class="btn btn-gold" href="#paylas">{I["plus"]}<span>Talep paylaş</span></a><a class="btn btn-line" href="emlakci-talepleri.html">Emlakçı taleplerini gör</a>')
    kats = "".join(f'<li>{I["check"]}<span>{e(v)}</span></li>' for v in KOD["emlakci_kategorileri"].values())
    ornekler = ["İstanbul genelinde 5 milyon TL bütçeli daire arıyorum.", "Kağıthane'de kiralık 2+1 daire arıyorum.",
                "Sultanbeyli'de 500 m² üzeri tek tapu arsa arıyorum.", "Kat karşılığı arsa arıyorum.",
                "Yatırımcıma uygun ticari gayrimenkul arıyorum.", "Portföyümdeki daireye müşteri arıyorum."]
    form = f'''<div id="paylas" class="paylas-alan">
<div class="card note-card" data-isb-kilit>
  {I["lock"]}
  <div>
    <h2>İş birliği paylaşımı onaylı emlakçılara açık</h2>
    <p data-isb-mesaj>Paylaşım yapmak için onaylı bir emlakçı hesabıyla giriş yapmanız gerekir.</p>
    <div class="actions"><a class="btn btn-gold btn-sm" href="giris.html?donus=portfoy-is-birligi.html">Giriş yap</a><a class="btn btn-line btn-sm" href="emlakci-uyelik.html">Emlakçı başvurusu</a></div>
  </div>
</div>
<form class="card form" data-db-form="isbirligi" hidden novalidate>
  <h2 class="form-h first">İş birliği talebi gönder</h2>
  <p class="small muted">Paylaşan: <strong data-isb-kim></strong>. Paylaşımınız kontrol edildikten sonra yayınlanır; iletişim bilgileriniz profilinizden alınır.</p>
  {talep_alanlari("i", "emlakci")}
  <label class="check consent"><input type="checkbox" name="onay" required>
    <span>Paylaşım özetinin yayınlanmasını ve iletişim bilgilerimin onaylı emlakçı üyelerle paylaşılmasını kabul ediyorum. <a href="kvkk-aydinlatma-metni.html" target="_blank">KVKK aydınlatma metnini</a> okudum.</span></label>
  <p class="form-err" role="alert" hidden data-err></p>
  <button class="btn btn-gold btn-lg btn-block" type="submit">{I["check"]}<span>Paylaşımı gönder</span></button>
</form>
{basari_paneli()}
</div>'''
    body = f'''{ph}
<section class="sec">
  <div class="wrap split">
    <div>
      <p class="kicker">Paylaşım kategorileri</p>
      <h2>Ne paylaşabilirsiniz?</h2>
      <ul class="ticks cols2">{kats}</ul>
    </div>
    <div class="card quote-card">
      <p class="kicker">Örnek iş birliği talepleri</p>
      <ul class="quotes">{"".join(f"<li>“{e(x)}”</li>" for x in ornekler)}</ul>
      <p class="small muted">Emlakçılar bu talepleri inceleyerek kendi portföyleriyle eşleştirir. İlerleyen aşamada otomatik talep eşleştirme ve bildirim sistemi eklenecektir.</p>
    </div>
  </div>
</section>
<section class="sec sec-alt">
  <div class="wrap">
    <div class="steps3">
      <div class="step-card"><span class="step-ic">{I["shield"]}</span><h3>Onaylı ağ</h3><p>Her emlakçı yetki belgesiyle başvurur, yönetici onayından sonra paylaşım yapar. Ağdaki herkes doğrulanmış profesyoneldir.</p></div>
      <div class="step-card"><span class="step-ic">{I["hand"]}</span><h3>Ücretsiz iş birliği</h3><p>Emlakçılar kendi aralarında portföy ve müşteri paylaşımını ücretsiz yapar. Komisyon paylaşımı taraflar arasında belirlenir.</p></div>
      <div class="step-card"><span class="step-ic">{I["lock"]}</span><h3>İletişim korunur</h3><p>Paylaşımın detayı ve emlakçının iletişim bilgisi yalnızca onaylı emlakçı üyelere görünür; ziyaretçiler yalnızca özeti görür.</p></div>
    </div>
  </div>
</section>
<section class="sec sec-tight"><div class="wrap narrow">{form}</div></section>'''
    page("portfoy-is-birligi.html", "Portföy ve İş Birliği — Emlakçılar Arası Paylaşım",
         "İstanbul'daki emlak danışmanları için portföy ve müşteri iş birliği alanı: satılık/kiralık portföy, alıcı ve kiracı müşteri, arsa ve kat karşılığı talepleri.",
         body, P, "portfoy-is-birligi.html", schema=sch, extra_js=ilce_js(P))

# ------------------------------------------------------------------ ÜYELİK PAKETLERİ
def build_paketler():
    P = ""
    paketler = [p for p in U["paketler"] if p.get("yayinda")]
    kartlar = ""
    for p in paketler:
        fiyat = e(p["fiyat"]) if p.get("fiyat") else "Fiyat için yazın"
        msg = f"Merhaba, İstanbul Emlak Ağı {p['ad']} ({p['sure_gun']} gün) almak istiyorum.\nAd soyad: \nEmlak ofisi: "
        if PAID:
            btn = f'<a class="btn btn-gold btn-block" href="{e(wa(msg))}" target="_blank" rel="noopener" data-track="whatsapp" data-ctx="paket-{p["id"]}">{I["wa"]}<span>Üyelik almak istiyorum</span></a>'
            rib = '<span class="ribbon">En avantajlı</span>' if p.get("one_cikan") else ""
        else:
            btn = f'<a class="btn btn-line btn-block" href="{e(wa("Merhaba, " + p["ad"] + " paketi açıldığında haber almak istiyorum.\nAd soyad: \nEmlak ofisi: "))}" target="_blank" rel="noopener" data-track="whatsapp" data-ctx="paket-haber-{p["id"]}">{I["wa"]}<span>Açılınca haber ver</span></a>'
            rib = '<span class="ribbon soon">Yakında</span>'
        kartlar += f'''<div class="plan{" featured" if p.get("one_cikan") else ""}" data-paket-kart>
  {rib}
  <h3>{e(p["ad"])}</h3>
  <p class="plan-days">{p["sure_gun"]} gün</p>
  <p class="plan-price">{fiyat}</p>
  <p class="plan-desc">{e(p["aciklama"])}</p>
  <ul class="ticks">{"".join(f"<li>{I['check']}{e(x)}</li>" for x in U["ucretli_ozellikler"])}</ul>
  {btn}
</div>'''
    free = f'''<div class="plan free">
  <span class="ribbon acik">{"Şimdi açık" if not PAID else "Her zaman"}</span>
  <h3>İş Birliği Üyeliği</h3>
  <p class="plan-days">Onaylı emlakçılar</p>
  <p class="plan-price">Ücretsiz</p>
  <p class="plan-desc">Ağa katılın, emlakçılar arası paylaşımlara başlayın.</p>
  <ul class="ticks">{"".join(f"<li>{I['check']}{e(x)}</li>" for x in U["ucretsiz_ozellikler"])}</ul>
  <a class="btn btn-gold btn-block" href="emlakci-uyelik.html">{I["users"]}<span>Ücretsiz başvur</span></a>
</div>'''
    banner = f'''<div class="notice" data-lansman{"" if not PAID else " hidden"}>{I["clock"]}<p><strong>Lansman dönemi:</strong> Emlakçı iş birliği üyeliği şu an ücretsizdir. Vatandaş taleplerinin tam detayına erişim sağlayan ücretli paketler, talepler biriktiğinde açılacaktır.</p></div>'''
    adimlar = ["Paketinizi seçip WhatsApp butonuna dokunun; adınız ve seçtiğiniz paket mesaja hazır yazılır.",
               "Ödeme bilgileri size WhatsApp üzerinden iletilir. Sitede kart veya online ödeme alınmaz.",
               "Ödemenizi yaparsınız; ödeme yönetici tarafından kontrol edilir.",
               "Üyeliğiniz yönetici tarafından manuel olarak açılır; başlangıç ve bitiş tarihi kaydedilir.",
               "Bitişe 3 gün kala WhatsApp üzerinden hatırlatma yapılır.",
               "Süre dolduğunda detay erişimi otomatik olarak kapanır; dilerseniz uzatabilirsiniz."]
    ph, sch = page_head(P, "Üyelik paketleri", "Emlakçı üyelik paketleri",
        "Ücretsiz iş birliği üyeliğiyle ağa katılın; vatandaş taleplerinin tam detayı ve iletişim bilgisi için aylık veya yıllık pakete geçin. Ödemeler WhatsApp üzerinden, manuel olarak alınır.",
        None, [("index.html", "Ana Sayfa"), (None, "Üyelik Paketleri")])
    body = f'''{ph}
<section class="sec sec-tight">
  <div class="wrap">
    {banner}
    <h2 class="sr">Üyelik paketleri</h2>
    <div class="plans" data-db-paketler>{free}{kartlar}</div>
  </div>
</section>
<section class="sec sec-alt">
  <div class="wrap split">
    <div>
      <p class="kicker">Ödeme nasıl yapılır?</p>
      <h2>Tamamen manuel ve güvenli</h2>
      <ol class="numlist big">{"".join(f"<li>{e(x)}</li>" for x in adimlar)}</ol>
    </div>
    <div>
      <p class="kicker">Erişim kuralları</p>
      <h2>Kim neyi görür?</h2>
      {kim_ne_gorur()}
    </div>
  </div>
</section>'''
    page("uyelik-paketleri.html", "Emlakçı Üyelik Paketleri — Aylık ve Yıllık",
         "Emlakçılar için ücretsiz iş birliği üyeliği ile aylık ve yıllık paketler. Vatandaş taleplerinde detay ve iletişime erişin; ödeme WhatsApp üzerinden alınır.",
         body, P, "uyelik-paketleri.html", schema=sch)

# ------------------------------------------------------------------ HAKKIMIZDA + İLETİŞİM
SSS = [
    ("İstanbul Emlak Ağı bir ilan sitesi mi?", "Hayır. Burası bir talep ve iş birliği platformudur. Vatandaşlar ne aradığını yazar, emlak danışmanları bu taleplere uygun portföylerle ulaşır; emlakçılar da kendi aralarında portföy ve müşteri paylaşır."),
    ("Vatandaşlar için ücret var mı?", "Hayır. Vatandaşlar talep oluşturmak için hiçbir ücret ödemez. Talep göndermek için Google hesabıyla giriş yapmak yeterlidir; şifre veya SMS gerekmez."),
    ("Adım ve telefonum herkese açık mı olacak?", "Hayır. Yayında yalnızca talebinizin özeti görünür. Adınız, telefonunuz ve tam açıklamanız yalnızca yönetici tarafından onaylanmış, aktif ücretli üyeliği olan emlak danışmanlarıyla, açık onayınıza dayanarak paylaşılır."),
    ("Talebim ne kadar süre yayında kalır?", f"Talepler {YAYIN_GUN} gün yayında kalır, süre dolunca otomatik olarak yayından kalkar. Daha önce kapatmak veya silinmesini istemek için WhatsApp'tan yazmanız yeterlidir."),
    ("Kimler emlakçı üyesi olabilir?", "Taşınmaz Ticareti Yetki Belgesi olan emlak danışmanları ve emlak ofisleri başvurabilir. Hesaplar yönetici onayından sonra aktif olur."),
    ("Üyelik ödemesi nasıl yapılır?", "Sitede kredi kartı veya online ödeme yoktur. Paketinizi WhatsApp'tan talep edersiniz, ödeme bilgileri size iletilir, ödemeniz kontrol edildikten sonra üyeliğiniz açılır."),
    ("Hangi bölgelerde hizmet veriyorsunuz?", "Yalnızca İstanbul'da, 39 ilçenin tamamında hizmet veriyoruz."),
]

def build_hakkimizda_iletisim():
    P = ""
    ph, sch = page_head(P, "Hakkımızda", "İstanbul'un gayrimenkul ve iş birliği ağı",
        "İstanbul Emlak Ağı; gayrimenkul arayan vatandaşları, müşterilerine portföy arayan emlak danışmanlarını ve iş birliği yapmak isteyen emlak ofislerini aynı platformda buluşturur.",
        "hero-bogaz", [("index.html", "Ana Sayfa"), (None, "Hakkımızda")])
    faq = "".join(f'<details class="faq"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in SSS)
    faq_schema = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in SSS]}
    body = f'''{ph}
<section class="sec">
  <div class="wrap split">
    <div class="prose">
      <p class="kicker">Neden buradayız?</p>
      <h2>Doğru talep, doğru eşleşme</h2>
      <p>İstanbul'da gayrimenkul arayan biri onlarca ilana bakmak, aynı numaraları tekrar tekrar aramak zorunda kalıyor. Emlak danışmanları ise müşterisine uygun portföyü çoğu zaman başka bir ofisin elinde buluyor, ama o ofise ulaşmanın düzenli bir yolu yok.</p>
      <p>İstanbul Emlak Ağı bu iki sorunu birlikte çözmek için kuruldu. Vatandaş ne aradığını bir kez yazar; doğru emlakçı ona ulaşır. Emlakçılar da portföy ve müşteri ihtiyaçlarını paylaşarak birbirleriyle iş birliği yapar.</p>
      <p>Platform bir ilan sitesi değildir. Odağımız talep, eşleşme ve güvenilir bir profesyonel ağdır.</p>
    </div>
    <div class="values">
      <div class="value">{I["map"]}<h3>Yalnızca İstanbul</h3><p>39 ilçe, mahalle mahalle. Tek şehre odaklanmak, doğru eşleşmeyi mümkün kılar.</p></div>
      <div class="value">{I["shield"]}<h3>Onaylı profesyoneller</h3><p>Emlakçı hesapları yetki belgesi ve yönetici onayıyla açılır.</p></div>
      <div class="value">{I["lock"]}<h3>Gizlilik ve KVKK</h3><p>Vatandaşın iletişim bilgisi herkese açık yayınlanmaz; yalnızca açık rızayla, yetkili üyelerle paylaşılır.</p></div>
      <div class="value">{I["hand"]}<h3>İş birliği kültürü</h3><p>Ofisler arası paylaşım ücretsizdir; kazanç birlikte büyür.</p></div>
    </div>
  </div>
</section>
<section class="sec sec-alt">
  <div class="wrap narrow">
    <div class="sec-head"><p class="kicker">Sık sorulan sorular</p><h2>Merak edilenler</h2></div>
    <div class="faqs">{faq}</div>
  </div>
</section>'''
    page("hakkimizda.html", "Hakkımızda", "İstanbul Emlak Ağı; vatandaşları, emlak danışmanlarını ve emlak ofislerini İstanbul'un 39 ilçesinde buluşturan talep ve iş birliği platformudur.",
         body, P, "hakkimizda.html", schema=[x for x in [sch, faq_schema] if x])

    ph, sch = page_head(P, "İletişim", "Bize WhatsApp'tan ulaşın",
        "Üyelik, talepler, platform ve destek konularındaki tüm sorularınız için WhatsApp hattımız açık. Konunuzu seçin, mesajınız hazır gelsin.",
        None, [("index.html", "Ana Sayfa"), (None, "İletişim")])
    kart_ic = {"uyelik": I["shield"], "bilgi": I["users"], "platform": I["home"], "destek": I["phone"]}
    kartlar = "".join(f'''<a class="contact-card" href="{e(wa(WA_MSG[k]))}" target="_blank" rel="noopener" data-track="whatsapp" data-ctx="iletisim-{k}">
  <span class="step-ic">{kart_ic[k]}</span><span><strong>{e(t)}</strong><small>WhatsApp'ta hazır mesajla açılır</small></span>{I["arrow"]}</a>''' for k, t in WA_SECENEK)
    body = f'''{ph}
<section class="sec sec-tight">
  <div class="wrap split">
    <div class="contact-cards">{kartlar}</div>
    <div class="card side-card">
      <h2>İletişim bilgileri</h2>
      <dl class="dl">
        <dt>WhatsApp ve telefon</dt><dd><a class="link-gold" href="tel:+{C["whatsapp"]}" data-track="telefon" data-ctx="iletisim" data-wa-gosterim>{e(C["telefon_gosterim"])}</a></dd>
        <dt>Konum</dt><dd>{e(C.get("konum", "İstanbul"))}</dd>
        <dt>Hizmet bölgesi</dt><dd>{e(C["hizmet_bolgesi"])}</dd>
        <dt>Talep ve veri silme</dt><dd>Talebinizi kapatmak veya verilerinizin silinmesini istemek için WhatsApp'tan “Destek almak istiyorum” seçeneğiyle yazın.</dd>
      </dl>
    </div>
  </div>
</section>'''
    page("iletisim.html", "İletişim", "İstanbul Emlak Ağı ile WhatsApp üzerinden iletişime geçin: üyelik satın alma, emlakçı üyeliği, platform bilgisi ve destek.",
         body, P, "iletisim.html", schema=sch)

# ------------------------------------------------------------------ İLÇE SAYFALARI
def build_ilceler():
    P = ""
    avrupa = [i for i in ILCELER if i["yaka"] == "Avrupa Yakası"]
    anadolu = [i for i in ILCELER if i["yaka"] == "Anadolu Yakası"]
    def satirlar(lst):
        return "".join(f'<a class="ilce-row" href="ilce/{i["slug"]}.html"><strong>{e(i["ad"])}</strong><span>{len(i["mahalleler"])} mahalle{f" · {SAYI[i["ad"]]} talep" if SAYI[i["ad"]] else ""}</span>{I["arrow"]}</a>' for i in lst)
    ph, sch = page_head(P, "İstanbul ilçeleri", "İstanbul'un 39 ilçesinde gayrimenkul talepleri",
        "İlçenizi seçin; o ilçedeki güncel talepleri görün, mahallenize göre ücretsiz talep oluşturun.",
        None, [("index.html", "Ana Sayfa"), (None, "İstanbul İlçeleri")])
    body = f'''{ph}
<section class="sec sec-tight">
  <div class="wrap">
    <div class="map-box big">{harita_svg(P)}</div>
    <div class="split mt">
      <div><h2 class="yaka-h lg">Avrupa Yakası <small>{len(avrupa)} ilçe</small></h2><div class="ilce-rows">{satirlar(avrupa)}</div></div>
      <div><h2 class="yaka-h lg">Anadolu Yakası <small>{len(anadolu)} ilçe</small></h2><div class="ilce-rows">{satirlar(anadolu)}</div></div>
    </div>
  </div>
</section>'''
    page("istanbul-ilceleri.html", "İstanbul İlçeleri — 39 İlçede Gayrimenkul Talepleri",
         "İstanbul'un Avrupa ve Anadolu yakasındaki 39 ilçesinde güncel gayrimenkul talepleri ve mahalle listeleri.",
         body, P, None, schema=sch)

    P = "../"
    for i in ILCELER:
        ad = i["ad"]; ad_de = de(ad)
        bilgi = ILCE_BILGI.get(ad, {})
        komsu = [x for x in ILCELER if x["yaka"] == i["yaka"] and x["ad"] != ad]
        vt = [t for t in VT if t.get("ilce") == ad]
        et = [t for t in ET if t.get("ilce") == ad]
        q = urllib.parse.quote(ad)
        one = [m for m in bilgi.get("one_cikan", []) if m in i["mahalleler"]]
        sirali = one + [m for m in i["mahalleler"] if m not in one]
        mah = "".join(f'<a class="chip{" chip-on" if m in one else ""}" rel="nofollow" href="{P}talep-olustur.html?ilce={q}&amp;mahalle={urllib.parse.quote(m)}">{e(m)}</a>' for m in sirali)
        kart = "".join(talep_kart(t, P) for t in vt) + "".join(talep_kart(t, P, "emlakci") for t in et)
        bos = bos_durum(f"{e(ad)} için henüz yayında talep yok. {e(ad_de)} gayrimenkul arıyorsanız ilk talebi siz oluşturun.", P).replace(
            f'href="{P}talep-olustur.html"', f'href="{P}talep-olustur.html?ilce={q}"')
        tgrid = (f'<div class="tgrid" data-db-list data-tip="hepsi" data-ilce="{e(ad)}" data-limit="12">{kart}</div>'
                 f'<div data-db-bos hidden>{bos}</div>'
                 + (ORNEK_NOT if any(t.get("ornek") for t in vt + et) else "")) if kart else (
                 f'<div class="tgrid" data-db-list data-tip="hepsi" data-ilce="{e(ad)}" data-limit="12"></div>'
                 f'<div data-db-bos>{bos}</div>')
        tanitim = bilgi.get("metin", "")
        ph, sch = page_head(P, i["yaka"], f"{e(ad)} gayrimenkul talepleri",
            f"{e(ad_de)} satılık veya kiralık konut, arsa, ofis ya da dükkân mı arıyorsunuz? Ücretsiz talebinizi oluşturun; {e(ad_de)} çalışan onaylı emlak danışmanları size ulaşsın. Emlakçılar için {e(ad)} bölgesindeki güncel talepler ve iş birliği fırsatları bu sayfada.",
            None, [("index.html", "Ana Sayfa"), ("istanbul-ilceleri.html", "İstanbul İlçeleri"), (None, ad)],
            f'<a class="btn btn-gold" href="{P}talep-olustur.html?ilce={q}">{I["plus"]}<span>{e(ad_de)} talep oluştur</span></a>'
            f'<a class="btn btn-line" href="{P}musteri-talepleri.html?ilce={q}">{e(ad)} talepleri</a>')
        hakkinda = f'''
<section class="sec sec-tight">
  <div class="wrap ilce-hakkinda">
    <div>
      <p class="kicker">{e(ad)} hakkında</p>
      <h2>{e(ad_de)} gayrimenkul arayışı</h2>
      <p>{e(tanitim)}</p>
      {f'<p class="muted">Öne çıkan mahalleler: {", ".join(e(m) for m in one)}.</p>' if one else ''}
    </div>
    <ul class="ilce-ozet">
      <li><strong>{len(i["mahalleler"])}</strong><span>mahalle</span></li>
      <li><strong>{e(i["yaka"].split()[0])}</strong><span>yakası</span></li>
      <li><strong>Ücretsiz</strong><span>talep oluşturma</span></li>
    </ul>
  </div>
</section>''' if tanitim else ""
        body = f'''{ph}{hakkinda}
<section class="sec sec-tight">
  <div class="wrap ilce-top">
    <div>
      <h2>{e(ad_de)}ki güncel talepler</h2>
      {liste_notu("vatandas")}
      {tgrid}
    </div>
    <aside class="card side-card ilce-mapcard">
      {harita_svg(P, vurgula=ad, etiket=True)}
      <dl class="dl">
        <dt>Yaka</dt><dd>{e(i["yaka"])}</dd>
        <dt>Mahalle sayısı</dt><dd>{len(i["mahalleler"])}</dd>
        <dt>Yayındaki talep</dt><dd data-db-sayi data-ilce="{e(ad)}">{SAYI[ad]}</dd>
      </dl>
    </aside>
  </div>
</section>
<section class="sec sec-alt">
  <div class="wrap">
    <div class="sec-head"><p class="kicker">{len(i["mahalleler"])} mahalle</p><h2>{e(ad)} mahalleleri</h2>
    <p>Mahallenize dokunun; talep formu {e(ad)} ve seçtiğiniz mahalle dolu olarak açılsın.</p></div>
    <div class="chips">{mah}</div>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <div class="sec-head"><p class="kicker">{e(i["yaka"])}</p><h2>{e(i["yaka"])}ndaki diğer ilçeler</h2></div>
    <div class="chips">{"".join(f'<a class="chip" href="{x["slug"]}.html">{e(x["ad"])}</a>' for x in komsu)}</div>
  </div>
</section>'''
        aciklama = (f"{ad_de} satılık ve kiralık konut, arsa, ofis ve dükkân talepleri. "
                    f"{len(i['mahalleler'])} mahallede ücretsiz talep oluşturun, onaylı emlak danışmanları size ulaşsın.")
        page(f"ilce/{i['slug']}.html", f"{ad} Gayrimenkul Talepleri — Satılık, Kiralık, Arsa",
             aciklama, body, P, None, schema=sch)

# ------------------------------------------------------------------ YASAL METİNLER
def md(text):
    def inline(s):
        s = e(s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a class="link-gold" href="\2">\1</a>', s)
        return s
    out, para, lst = [], [], []
    def flush():
        nonlocal para, lst
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if lst: out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in lst) + "</ul>"); lst = []
    for line in text.splitlines():
        s = line.strip()
        if not s: flush(); continue
        if s.startswith("## "): flush(); out.append(f"<h2>{inline(s[3:])}</h2>")
        elif s.startswith("### "): flush(); out.append(f"<h3>{inline(s[4:])}</h3>")
        elif s.startswith("- "):
            if para: flush()
            lst.append(s[2:])
        else:
            if lst: flush()
            para.append(s)
    flush()
    return "\n".join(out)

def build_yasal():
    P = ""
    vs = D["veri_sorumlusu"]
    vs_satir = ", ".join(x for x in [vs.get("unvan") or SITE, vs.get("adres"), vs.get("mersis_vergi_no") and f"Mersis/Vergi No: {vs['mersis_vergi_no']}"] if x)
    iletisim = f"WhatsApp: {C['telefon_gosterim']}" + (f", e-posta: {vs['eposta']}" if vs.get("eposta") else "")
    rep = {"{{site}}": SITE, "{{veri_sorumlusu}}": vs_satir, "{{iletisim}}": iletisim, "{{yayin_gun}}": str(YAYIN_GUN)}
    for slug, baslik, desc in [
        ("kvkk-aydinlatma-metni", "KVKK Aydınlatma Metni", "İstanbul Emlak Ağı kişisel verilerin işlenmesine ilişkin aydınlatma metni."),
        ("kullanim-kosullari", "Kullanım Koşulları", "İstanbul Emlak Ağı platformunun kullanım koşulları."),
        ("cerez-politikasi", "Çerez Politikası", "İstanbul Emlak Ağı çerez ve yerel depolama politikası."),
    ]:
        raw = open(os.path.join(ROOT, "data", "metinler", slug + ".md"), encoding="utf-8").read()
        for k, v in rep.items():
            raw = raw.replace(k, v)
        ph, sch = page_head(P, "Yasal", e(baslik), "", None, [("index.html", "Ana Sayfa"), (None, baslik)])
        ph = ph.replace('<p class="lead"></p>', "")
        body = f'''{ph}
<section class="sec sec-tight"><div class="wrap narrow"><article class="card prose legal" {'data-metin="kvkk"' if slug == "kvkk-aydinlatma-metni" else ('data-metin="kullanim"' if slug == "kullanim-kosullari" else "")}>{md(raw)}</article></div></section>'''
        page(f"{slug}.html", baslik, desc, body, P, None, schema=sch)

# ------------------------------------------------------------------ 404, PWA, sitemap
def build_misc():
    P = BASE_PATH
    body = f'''<section class="page-head"><div class="wrap ph-in">
  <p class="kicker">Hata 404</p><h1>Aradığınız sayfa bulunamadı</h1>
  <p class="lead">Sayfa taşınmış veya kaldırılmış olabilir. Ana sayfadan devam edebilir ya da ücretsiz talebinizi oluşturabilirsiniz.</p>
  <div class="actions"><a class="btn btn-gold" href="{P}index.html">Ana sayfa</a><a class="btn btn-line" href="{P}talep-olustur.html">Talep oluştur</a></div>
</div></section>'''
    page("404.html", "Sayfa bulunamadı", "Aradığınız sayfa bulunamadı.", body, P, None, noindex=True)

    # Çevrimdışı sayfası
    body = f'''<section class="page-head"><div class="wrap ph-in">
  <p class="kicker">Bağlantı yok</p><h1>Şu an çevrimdışısınız</h1>
  <p class="lead">İnternet bağlantınız geri geldiğinde sayfayı yenileyin.</p>
  <div class="actions"><a class="btn btn-gold" href="{P}index.html">Yeniden dene</a></div>
</div></section>'''
    page("cevrimdisi.html", "Çevrimdışı", "Çevrimdışı.", body, P, None, noindex=True)

    manifest = {
        "name": SITE, "short_name": "Emlak Ağı", "description": S["slogan"], "lang": "tr",
        "start_url": BASE_PATH, "scope": BASE_PATH, "display": "standalone", "orientation": "portrait",
        "background_color": "#0B1120", "theme_color": "#0B1120",
        "icons": [
            {"src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "assets/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
        "shortcuts": [
            {"name": "Talep oluştur", "url": "talep-olustur.html"},
            {"name": "Müşteri talepleri", "url": "musteri-talepleri.html"}]}
    open(os.path.join(ROOT, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps(manifest, ensure_ascii=False, indent=1))

    ver = hashlib.sha1((CSS + JS + TODAY.isoformat()).encode()).hexdigest()[:10]
    sw = f'''// {SITE} — service worker (otomatik üretilir)
const V = "iea-{ver}";
const CORE = ["./", "index.html", "cevrimdisi.html", "{CSS}", "{JS}", "{asset_ver("assets/js/ilceler.js")}",
  "assets/fonts/manrope-latin-wght-normal.woff2", "assets/fonts/playfair-display-latin-wght-normal.woff2",
  "assets/icons/logo-44.webp", "assets/icons/icon-192.png"];
self.addEventListener("install", e => {{ e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); }});
self.addEventListener("activate", e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener("fetch", e => {{
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  if (r.mode === "navigate") {{
    e.respondWith(fetch(r).then(res => {{ const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }})
      .catch(() => caches.match(r).then(m => m || caches.match("cevrimdisi.html"))));
    return;
  }}
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {{
    if (res.ok) {{ const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }}
    return res;
  }})));
}});
'''
    open(os.path.join(ROOT, "sw.js"), "w", encoding="utf-8").write(sw)

    urls = []
    for pth in PAGES:
        loc = BASE_URL + "/" + ("" if pth == "index.html" else pth)
        pr = "1.0" if pth == "index.html" else ("0.6" if pth.startswith("ilce/") else ("0.3" if pth in ("kvkk-aydinlatma-metni.html", "kullanim-kosullari.html", "cerez-politikasi.html") else "0.8"))
        urls.append(f"  <url><loc>{e(loc)}</loc><priority>{pr}</priority></url>")
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n")
    open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nAllow: /\n\nSitemap: {BASE_URL}/sitemap.xml\n")
    # Özel alan adı bağlandığında (site_url kök adres olduğunda) GitHub Pages için CNAME dosyası otomatik yazılır.
    host = urllib.parse.urlparse(BASE_URL).hostname or ""
    cname = os.path.join(ROOT, "CNAME")
    if BASE_PATH == "/" and not host.endswith(("github.io", "pages.dev")):
        open(cname, "w", encoding="utf-8").write(host + "\n")
    elif os.path.exists(cname):
        os.remove(cname)

def build_ilce_js():
    data = {i["ad"]: i["mahalleler"] for i in ILCELER}
    js = "/* Otomatik üretilir: data/istanbul.json */\nwindow.IEA_ILCELER=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(ROOT, "assets", "js", "ilceler.js"), "w", encoding="utf-8").write(js)

if __name__ == "__main__":
    build_ilce_js()
    build_index(); build_lists(); build_forms(); build_isbirligi(); build_paketler()
    build_hakkimizda_iletisim(); build_ilceler(); build_yasal(); build_misc()
    print(f"Tamam: {len(PAGES)} sayfa, {len(VT)} vatandaş + {len(ET)} emlakçı talebi yayında.")
