#!/usr/bin/env python3
"""Görselleri hazırlar: data/gorseller.json listesindeki her görsel için
  1) kaynağı bulur (kaynak/ klasöründeki dosya ya da Unsplash kimliği; Unsplash ise indirir),
  2) bütün fotoğraflara aynı renk tonunu uygular (sitenin koyu lacivert + altın paletiyle uyumlu),
  3) "odak" noktasına göre kırpar (mobil, tablet, masaüstünde önemli kısım kesilmesin),
  4) assets/img/<ad>-<genişlik>.webp dosyalarını üretir.
Ayrıca logo ve uygulama ikonlarını (kaynak/logo) ve sosyal medya paylaşım görselini (og.jpg) üretir.

Değişmeyen görseller atlanır (assets/img/.imza.json). GitHub Actions içinde çalışır; Pillow gerekir.
Elle çalıştırma: python3 tools/gorselleri_hazirla.py [--hepsi]
"""
import hashlib, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img")
ICON = os.path.join(ROOT, "assets", "icons")
INDIR = os.path.join(ROOT, "kaynak", "gorseller", "indirilen")   # .gitignore'da; yalnızca işlem sırasında kullanılır
IMZA_YOLU = os.path.join(OUT, ".imza.json")
TON_SURUMU = "ton-2"          # renk ayarı değişirse artırın; bütün görseller yeniden üretilir
LACI = (11, 17, 32)           # #0B1120
BEJ = (226, 212, 183)         # #E2D4B7

try:
    from PIL import Image, ImageEnhance, ImageFilter
except ImportError:
    print("Pillow kurulu değil: pip install pillow", file=sys.stderr)
    sys.exit(1)

G = json.load(open(os.path.join(ROOT, "data", "gorseller.json"), encoding="utf-8"))
os.makedirs(OUT, exist_ok=True); os.makedirs(INDIR, exist_ok=True)
imza = json.load(open(IMZA_YOLU, encoding="utf-8")) if os.path.exists(IMZA_YOLU) else {}
HEPSI = "--hepsi" in sys.argv


def sha(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for blok in iter(lambda: f.read(1 << 16), b""):
            h.update(blok)
    return h.hexdigest()[:16]


def kaynak_bul(g):
    """(dosya yolu, kimlik) döndürür. Unsplash görseli gerekirse indirilir."""
    if g.get("kaynak"):
        yol = os.path.join(ROOT, g["kaynak"])
        return yol, "dosya:" + sha(yol)
    uid = g["unsplash"]
    return os.path.join(INDIR, f'{g["ad"]}-{uid}.jpg'), "unsplash:" + uid


def indir(g, yol):
    if os.path.exists(yol) and os.path.getsize(yol) > 5000:
        return
    url = f'https://images.unsplash.com/{g["unsplash"]}?w=2400&fm=jpg&q=88'
    req = urllib.request.Request(url, headers={"User-Agent": "istanbul-emlak-agi-build"})
    data = urllib.request.urlopen(req, timeout=90).read()
    if len(data) < 5000:
        raise ValueError("boş yanıt")
    open(yol, "wb").write(data)


def egri(kanal_hedefi, golge=0.16, isik=0.07):
    """Tek kanal için ton eğrisi: gölgeler laciverte, ışıklar bej tona hafifçe yaklaşır."""
    lac, bej = kanal_hedefi
    lut = []
    for v in range(256):
        t = v / 255
        x = v + (lac - v) * golge * (1 - t) ** 2 + (bej - v) * isik * t ** 2
        lut.append(max(0, min(255, round(x))))
    return lut


def ton(im, g):
    im = im.convert("RGB")
    guc = g.get("ton", 1.0)
    if guc <= 0:
        return im
    im = ImageEnhance.Color(im).enhance(1 - 0.12 * guc)
    im = ImageEnhance.Contrast(im).enhance(1 + 0.04 * guc)
    if g.get("parlaklik"):
        im = ImageEnhance.Brightness(im).enhance(g["parlaklik"])
    lut = []
    for c in range(3):
        lut += egri((LACI[c], BEJ[c]), 0.16 * guc, 0.07 * guc)
    return im.point(lut)


def kirp(im, oran, odak):
    W, H = im.size
    ow, oh = [float(x) for x in oran.split(":")]
    hedef = ow / oh
    if W / H > hedef:   # fazla geniş: yanlardan kırp
        w, h = round(H * hedef), H
    else:               # fazla uzun: alttan/üstten kırp
        w, h = W, round(W / hedef)
    fx, fy = odak
    x = min(max(round(fx * W - w / 2), 0), W - w)
    y = min(max(round(fy * H - h / 2), 0), H - h)
    return im.crop((x, y, x + w, y + h))


def uret(g):
    yol, kimlik = kaynak_bul(g)
    ayar = json.dumps([kimlik, g["oran"], g["genislikler"], g.get("odak", [.5, .5]), g.get("ton", 1.0), g.get("parlaklik"), TON_SURUMU])
    anahtar = hashlib.sha1(ayar.encode()).hexdigest()[:16]
    ciktilar = [os.path.join(OUT, f'{g["ad"]}-{w}.webp') for w in g["genislikler"]]
    if not HEPSI and imza.get(g["ad"]) == anahtar and all(os.path.exists(c) for c in ciktilar):
        return False
    if g.get("unsplash"):
        indir(g, yol)
    im = Image.open(yol)
    im = kirp(ton(im, g), g["oran"], g.get("odak", [.5, .5]))
    for w, c in zip(g["genislikler"], ciktilar):
        h = round(w * im.height / im.width)
        k = im if im.width == w else im.resize((w, h), Image.LANCZOS)
        if w < im.width * .6:
            k = k.filter(ImageFilter.UnsharpMask(radius=0.8, percent=40, threshold=2))
        k.save(c, "WEBP", quality=70 if w >= 1600 else 74, method=6)
        print(f'  {os.path.basename(c)}  {w}x{h}  {os.path.getsize(c) // 1024} KB')
    imza[g["ad"]] = anahtar
    return True


def ikonlar():
    lg = os.path.join(ROOT, "kaynak", "logo")
    kimlik = sha(os.path.join(lg, "uygulama-ikonu-512.png")) + sha(os.path.join(lg, "istanbul-emlak-agi-logo-seffaf.png")) + TON_SURUMU
    if not HEPSI and imza.get("_ikonlar") == kimlik and os.path.exists(os.path.join(ICON, "logo-88.webp")):
        return
    os.makedirs(ICON, exist_ok=True)
    ik = Image.open(os.path.join(lg, "uygulama-ikonu-512.png")).convert("RGB")
    ik.save(os.path.join(ICON, "icon-512.png"), optimize=True)
    Image.open(os.path.join(lg, "uygulama-ikonu-192.png")).convert("RGB").save(os.path.join(ICON, "icon-192.png"), optimize=True)
    ik.resize((180, 180), Image.LANCZOS).save(os.path.join(ICON, "apple-touch-icon.png"), optimize=True)
    ik.resize((32, 32), Image.LANCZOS).save(os.path.join(ICON, "favicon-32.png"), optimize=True)
    with open(os.path.join(lg, "favicon.ico"), "rb") as f:
        open(os.path.join(ROOT, "favicon.ico"), "wb").write(f.read())
    # maskeli ikon: içerik güvenli alana (%80) sığsın
    m = Image.new("RGB", (512, 512), LACI)
    k = ik.resize((410, 410), Image.LANCZOS)
    m.paste(k, (51, 51))
    m.save(os.path.join(ICON, "maskable-512.png"), optimize=True)
    # üst menü logosu (şeffaf): 44 px ve 2x 88 px yükseklik
    logo = Image.open(os.path.join(lg, "istanbul-emlak-agi-logo-seffaf.png")).convert("RGBA")
    logo = logo.crop(logo.getchannel("A").getbbox())
    for h in (44, 88):
        w = round(logo.width * h / logo.height)
        logo.resize((w, h), Image.LANCZOS).save(os.path.join(ICON, f"logo-{h}.webp"), "WEBP", quality=90, method=6)
        print(f"  logo-{h}.webp  {w}x{h}")
    imza["_ikonlar"] = kimlik
    print("  ikonlar güncellendi")


def og_gorseli():
    """1200x630 paylaşım görseli: ana görsel + koyu geçiş + logo."""
    hero = next(g for g in G["gorseller"] if g["ad"] == "hero-bogaz")
    yol, kimlik = kaynak_bul(hero)
    lg = os.path.join(ROOT, "kaynak", "logo", "istanbul-emlak-agi-logo-seffaf.png")
    anahtar = hashlib.sha1((kimlik + sha(lg) + TON_SURUMU + "og2").encode()).hexdigest()[:16]
    hedef = os.path.join(OUT, "og.jpg")
    if not HEPSI and imza.get("_og") == anahtar and os.path.exists(hedef):
        return
    if hero.get("unsplash"):
        indir(hero, yol)
    im = kirp(ton(Image.open(yol), hero), "1200:630", hero.get("odak", [.5, .5])).resize((1200, 630), Image.LANCZOS)
    # alttan koyulaşan geçiş
    gec = Image.new("L", (1, 630))
    for y in range(630):
        t = max(0, (y - 230) / 400)
        gec.putpixel((0, y), round(235 * min(1, t) ** 1.2))
    gec = gec.resize((1200, 630))
    im = Image.composite(Image.new("RGB", im.size, LACI), im, gec)
    logo = Image.open(lg).convert("RGBA")
    logo = logo.crop(logo.getchannel("A").getbbox())
    w = 760; h = round(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)
    im.paste(logo, ((1200 - w) // 2, 630 - h - 70), logo)
    im.save(hedef, "JPEG", quality=84, optimize=True, progressive=True)
    imza["_og"] = anahtar
    print("  og.jpg güncellendi")


hata = degisen = 0
for g in G["gorseller"]:
    try:
        if uret(g):
            degisen += 1
            print("hazırlandı:", g["ad"])
    except Exception as ex:
        hata += 1
        print("HATA:", g["ad"], ex, file=sys.stderr)
for is_ in (ikonlar, og_gorseli):
    try:
        is_()
    except Exception as ex:
        hata += 1
        print("HATA:", is_.__name__, ex, file=sys.stderr)
json.dump(imza, open(IMZA_YOLU, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
print(f"bitti: {degisen} görsel yenilendi, hata: {hata}")
