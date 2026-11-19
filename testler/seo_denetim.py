import glob, re, os, json, html
from collections import Counter
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE = json.load(open(os.path.join(ROOT, "data", "site.json"), encoding="utf-8"))["site"]["site_url"].rstrip("/")
BASE_PATH = re.sub(r"^https?://[^/]+", "", SITE).rstrip("/") + "/"   # proje sitesinde /istanbul-emlak-agi/
def temiz(f):
    f = re.sub(r"(^|/)index\.html$", r"\1", f)
    return re.sub(r"\.html$", "", f)
os.chdir(ROOT)
sayfalar = sorted(f for f in glob.glob("**/*.html", recursive=True) if not f.startswith(("kaynak/", "node_modules/", "google")))
basliklar, aciklamalar, sorun = Counter(), Counter(), []
smap = open("sitemap.xml", encoding="utf-8").read()
for f in sayfalar:
    t = open(f, encoding="utf-8").read()
    noindex = 'name="robots" content="noindex' in t
    tt = re.search(r"<title>(.*?)</title>", t, re.S); d = re.search(r'<meta name="description" content="([^"]*)"', t)
    c = re.search(r'<link rel="canonical" href="([^"]*)"', t)
    if not tt: sorun.append(f"{f}: title yok")
    else: basliklar[tt.group(1)] += 1
    if not d: sorun.append(f"{f}: description yok")
    else:
        aciklamalar[d.group(1)] += 1
        if not (50 <= len(html.unescape(d.group(1))) <= 170): sorun.append(f"{f}: description uzunluğu {len(html.unescape(d.group(1)))}")
    if not c and not noindex: sorun.append(f"{f}: canonical yok")
    if c and not noindex and c.group(1) != SITE + "/" + temiz(f): sorun.append(f"{f}: canonical nihai adresle aynı değil ({c.group(1)})")
    for a in re.findall(r'(?:href|action)="([^"]*\.html[^"]*)"', t):
        if not a.startswith(("http", "//")) or a.startswith(SITE): sorun.append(f"{f}: .html uzantılı iç bağlantı {a}")
    if SITE + "/" in t and re.search(re.escape(SITE) + r"/[\w\-/]*\.html", t): sorun.append(f"{f}: .html uzantılı tam adres")
    if '<html lang="tr"' not in t: sorun.append(f"{f}: lang tr değil")
    h1 = len(re.findall(r"<h1[\s>]", t))
    if h1 != 1: sorun.append(f"{f}: h1={h1}")
    # başlık sırası: h1'den sonra h3'e atlanmasın (h2 olmadan)
    seviyeler = [int(x) for x in re.findall(r"<h([1-6])[\s>]", t)]
    for a, b in zip(seviyeler, seviyeler[1:]):
        if b > a + 1: sorun.append(f"{f}: başlık atlama h{a}→h{b}"); break
    for img in re.findall(r"<img\b[^>]*>", t):
        if " alt=" not in img: sorun.append(f"{f}: alt eksik {img[:60]}")
    if 'og:image' not in t: sorun.append(f"{f}: og:image yok")
    if not noindex and "application/ld+json" not in t: sorun.append(f"{f}: yapılandırılmış veri yok")
    for blok in re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
        try: json.loads(blok)
        except Exception as ex: sorun.append(f"{f}: JSON-LD bozuk {ex}")
    if not noindex and c and c.group(1) not in smap and not f.startswith("404"): sorun.append(f"{f}: sitemap'te yok")
    # iç bağlantılar
    base = os.path.dirname(f)
    for h in re.findall(r'href="([^"#?]*)(?:[#?][^"]*)?"', t):
        if h.startswith(("http", "mailto:", "tel:", "data:", "//", "javascript")) or h.endswith((".webmanifest",)): continue
        if h == "": continue
        hedef = (h[len(BASE_PATH):] if h.startswith(BASE_PATH) else h.lstrip("/")) if h.startswith("/") else os.path.normpath(os.path.join(base, h))
        if hedef in (".", "") or h.endswith("/"): hedef = os.path.join(hedef if hedef not in (".", "") else "", "index.html")
        if not (os.path.isfile(hedef) or os.path.isfile(hedef + ".html")): sorun.append(f"{f}: kırık bağlantı {h}")
for k, v in basliklar.items():
    if v > 1: sorun.append(f"tekrarlanan title ({v}): {k}")
for k, v in aciklamalar.items():
    if v > 1: sorun.append(f"tekrarlanan description ({v}): {k[:60]}")
smap_urls = re.findall(r"<loc>(.*?)</loc>", smap)
for u in smap_urls:
    yol = u[len(SITE) + 1:]
    if ".html" in u: sorun.append(f"sitemap: .html uzantılı adres {u}")
    if not (os.path.isfile((yol or "index") + ".html") or os.path.isfile(os.path.join(yol, "index.html"))): sorun.append(f"sitemap: dosyası olmayan adres {u}")
print(f"{len(sayfalar)} sayfa, sitemap {len(smap_urls)} adres")
print("robots.txt:", open("robots.txt").read().strip().replace("\n", " | "))
print("\n".join(sorted(set(sorun))) or "SEO SORUNU YOK")
