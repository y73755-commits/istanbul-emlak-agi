#!/usr/bin/env python3
"""data/gorseller.json listesindeki Unsplash fotoğraflarını WebP olarak assets/img klasörüne indirir.
Var olan dosyalar atlanır. GitHub Actions içinde çalışır (yalnızca Python standart kütüphanesi)."""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = json.load(open(os.path.join(ROOT, "data", "gorseller.json"), encoding="utf-8"))
out = os.path.join(ROOT, "assets", "img")
os.makedirs(out, exist_ok=True)
hata = 0
for g in G["gorseller"]:
    w_, h_ = [int(x) for x in g["oran"].split(":")]
    for w in g["genislikler"]:
        dst = os.path.join(out, f'{g["ad"]}-{w}.webp')
        if os.path.exists(dst) and os.path.getsize(dst) > 1000:
            continue
        h = round(w * h_ / w_)
        q = 68 if w >= 1600 else 72
        url = f'https://images.unsplash.com/{g["unsplash"]}?w={w}&h={h}&fit=crop&crop=entropy&fm=webp&q={q}'
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "istanbul-emlak-agi-build"})
            data = urllib.request.urlopen(req, timeout=60).read()
            if len(data) < 1000:
                raise ValueError("boş yanıt")
            open(dst, "wb").write(data)
            print("indirildi:", os.path.basename(dst), len(data) // 1024, "KB")
        except Exception as ex:
            hata += 1
            print("HATA:", g["ad"], w, ex, file=sys.stderr)
print("bitti, hata:", hata)
