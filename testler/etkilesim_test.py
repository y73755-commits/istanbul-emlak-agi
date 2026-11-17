"""Menü (aç/kapat/Escape/bağlantı/odak) ve harita ipucu (fare/dokunma) testleri; birden çok tarayıcı motoru."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = __import__("os").environ.get("TEST_BASE", "http://127.0.0.1:8765/")
async def menu_test(b, ad, w, h):
    ctx = await b.new_context(viewport={"width": w, "height": h}, **({"has_touch": True, "is_mobile": True} if w < 800 and ad == "chromium" else {}))
    pg = await ctx.new_page(); await pg.goto(BASE + "index.html")
    sonuc = []
    t = pg.locator("[data-nav-toggle]")
    if not await t.is_visible():
        await ctx.close(); return f"{ad} {w}: menü düğmesi görünmüyor (masaüstü menü)"
    await t.click(); await pg.wait_for_timeout(350)
    r = await pg.evaluate("""() => { const n = document.querySelector('[data-nav]'); const b = n.getBoundingClientRect();
      const links = [...n.querySelectorAll('a')]; const gor = links.filter(a => { const q = a.getBoundingClientRect(); return q.width > 0 && q.bottom <= innerHeight + 1 && q.top >= b.top - 1; }).length;
      return { yukseklik: Math.round(b.height), genislik: Math.round(b.width), link: links.length, gorunen: gor, acik: n.classList.contains('open'), aria: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'), odak: document.activeElement && document.activeElement.closest('[data-nav]') ? 'menüde' : 'dışarıda', wa: document.querySelector('[data-wa]').classList.contains('away') }; }""")
    sonuc.append(f"açık={r['acik']} aria={r['aria']} boyut={r['genislik']}x{r['yukseklik']} bağlantı {r['gorunen']}/{r['link']} odak {r['odak']} WA gizli={r['wa']}")
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(250)
    k = await pg.evaluate("() => [document.querySelector('[data-nav]').classList.contains('open'), document.activeElement === document.querySelector('[data-nav-toggle]')]")
    sonuc.append(f"Escape→kapalı={not k[0]} odak düğmede={k[1]}")
    await t.click(); await pg.wait_for_timeout(300)
    await pg.locator("[data-nav] a", has_text="Hakkımızda").click(); await pg.wait_for_load_state("load")
    sonuc.append("bağlantı→" + pg.url.split("/")[-1])
    await ctx.close()
    return f"{ad} {w}x{h}: " + "; ".join(sonuc)

async def harita_test(b, ad):
    out = []
    ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page()
    await pg.goto(BASE + "istanbul-ilceleri.html")
    a = pg.locator('.imap a[data-ad="Kadıköy"] path'); await a.hover(); await pg.wait_for_timeout(200)
    out.append("fare: " + (await pg.evaluate("() => { const t = document.querySelector('.imap-tip'); return t.hidden ? 'ipucu yok' : t.textContent; }")))
    etiket = await pg.evaluate("document.querySelectorAll('.imap-l text').length")
    out.append(f"sabit etiket sayısı={etiket}")
    await ctx.close()
    if ad == "chromium":
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
        await pg.goto(BASE + "istanbul-ilceleri.html")
        p = pg.locator('.imap a[data-ad="Üsküdar"] path'); await p.scroll_into_view_if_needed()
        await p.tap(); await pg.wait_for_timeout(250)
        out.append("1. dokunuş: " + (await pg.evaluate("() => { const t = document.querySelector('.imap-tip'); return (t.hidden ? 'ipucu yok' : t.textContent) + ' | ' + location.pathname.split('/').pop(); }")))
        await p.tap(); await pg.wait_for_load_state("load"); await pg.wait_for_timeout(200)
        out.append("2. dokunuş: " + pg.url.split("/")[-1])
        await ctx.close()
    return f"{ad} harita: " + "; ".join(out)

async def main():
    async with async_playwright() as p:
        for ad in ["chromium", "firefox", "webkit"]:
            try:
                b = await getattr(p, ad).launch()
            except Exception as ex:
                print(f"{ad}: başlatılamadı ({str(ex).splitlines()[0][:80]})"); continue
            for w, h in [(1024, 768), (390, 844), (768, 1024), (320, 640)]:
                print(await menu_test(b, ad, w, h))
            print(await harita_test(b, ad))
            await b.close()
asyncio.run(main())
