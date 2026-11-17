"""Duyarlı tasarım testi: 320/390/768/1024/1440/1920 genişliklerde taşma, bozuk görsel,
WhatsApp düğmesi çakışması, konsol hatası; menü ve harita etkileşimi."""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8765/istanbul-emlak-agi/"
SAYFALAR = ["index.html", "musteri-talepleri.html", "emlakci-talepleri.html", "portfoy-is-birligi.html", "uyelik-paketleri.html",
            "talep-olustur.html", "emlakci-uyelik.html", "uye-ol.html", "giris.html", "hesabim.html", "yonetici.html",
            "istanbul-ilceleri.html", "ilce/kadikoy.html", "ilce/besiktas.html", "hakkimizda.html", "iletisim.html",
            "kvkk-aydinlatma-metni.html", "404.html"]
GENISLIK = [(320, 640), (390, 844), (768, 1024), (1024, 768), (1440, 900), (1920, 1080)]

DENETIM = """() => {
 const W = innerWidth, sorun = [];
 if (document.documentElement.scrollWidth > W + 1) {
   const tas = [];
   for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect();
     if (r.width && r.right > W + 1) { let p = el.parentElement, kirpik = false;
       while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== 'visible' && p.getBoundingClientRect().right <= W + 1) { kirpik = true; break; } p = p.parentElement; }
       if (!kirpik) tas.push(el.tagName + '.' + (el.className.baseVal ?? el.className)); } }
   sorun.push('yatay taşma ' + document.documentElement.scrollWidth + ' ' + tas.slice(0, 4).join(', '));
 }
 for (const i of document.images) if (i.complete && i.naturalWidth === 0 && i.getAttribute('src')) sorun.push('bozuk görsel ' + i.getAttribute('src'));
 const h1 = document.querySelectorAll('h1').length; if (h1 !== 1) sorun.push('h1 sayısı ' + h1);
 // kesilen metin: tek satırlık düğmelerde taşma
 for (const b of document.querySelectorAll('.btn, .nav ul a, .chip')) { const r = b.getBoundingClientRect(); if (r.width && b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow === 'hidden') sorun.push('kesik metin ' + b.textContent.trim().slice(0, 30)); }
 // küçük dokunma hedefi (yalnızca dar ekranda)
 if (W <= 400) { let k = 0, kk = []; for (const a of document.querySelectorAll('main a.btn, main button, .nav-toggle, [data-wa]:not(.away) .wa-btn')) { const r = a.getBoundingClientRect(); if (r.width && r.height && (r.height < 44 || r.width < 44)) { k++; kk.push((a.className||a.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height)); } } if (k) sorun.push(k + ' küçük dokunma hedefi: ' + kk.join(',')); }
 return sorun; }"""

WA = """() => { const box = document.querySelector('[data-wa]'); if (!box) return null;
 if (box.classList.contains('away')) return null;
 const b0 = box.querySelector(".wa-btn"), g = b0.getBoundingClientRect(), cx = g.left + g.width/2, cy = g.top + g.height/2, r = {left: cx - b0.offsetWidth/2, right: cx + b0.offsetWidth/2, top: cy - b0.offsetHeight/2, bottom: cy + b0.offsetHeight/2};
 const sec = 'a[href], button, input, select, textarea, summary';
 for (const el of document.querySelectorAll(sec)) { if (box.contains(el)) continue; const q = el.getBoundingClientRect();
   if (!q.width || !q.height) continue; const st = getComputedStyle(el); if (st.visibility === 'hidden') continue;
   if (q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom) return (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40); }
 return null; }"""


async def main():
    hatalar = 0
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in GENISLIK:
            ctx = await b.new_context(viewport={"width": w, "height": h}, has_touch=w < 800, is_mobile=w < 800)
            await ctx.route("**/*supabase.co/**", lambda r: r.fulfill(status=200, body="[]", headers={"content-type": "application/json", "access-control-allow-origin": "*"}))
            pg = await ctx.new_page()
            konsol = []
            pg.on("console", lambda m: konsol.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: konsol.append("JS: " + str(e)))
            for s in SAYFALAR:
                konsol.clear()
                await pg.goto(BASE + s, wait_until="load"); await pg.wait_for_timeout(250)
                sorun = await pg.evaluate(DENETIM)
                cak = set()
                yuk = await pg.evaluate("document.documentElement.scrollHeight")
                for y in range(0, yuk, max(200, h // 2)):
                    await pg.evaluate(f"window.scrollTo({{top:{y},behavior:'instant'}})"); await pg.wait_for_timeout(150)
                    c = await pg.evaluate(WA)
                    if c: cak.add(c)
                if cak: sorun.append("WhatsApp düğmesi üstüne biniyor: " + "; ".join(sorted(cak))[:160])
                kon = [k for k in konsol if "favicon" not in k]
                if kon: sorun.append("konsol: " + " | ".join(kon)[:200])
                if sorun:
                    hatalar += len(sorun); print(f"[{w}] {s}: " + " || ".join(sorun))
            await ctx.close()
        print("TOPLAM SORUN:", hatalar)
        await b.close()

asyncio.run(main())
