"""Her sayfanın 320–1920 px genişliklerde yatay taşma yapmadığını ölçer (document.scrollWidth). Sunucu: testler/sunucu.py"""
import asyncio, glob, os
from playwright.async_api import async_playwright
KOK=__import__("os").path.abspath(__import__("os").path.join(__import__("os").path.dirname(__file__), ".."))
BASE=__import__("os").environ.get("TEST_BASE", "http://127.0.0.1:8765/")
sayfalar=sorted(set(os.path.relpath(p,KOK)[:-5] for p in glob.glob(KOK+"/*.html")+glob.glob(KOK+"/ilce/*.html")) - {"googlec62b32cd99ad9f96"})
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); sorun=0
        for w in (320, 360, 390, 768, 1024, 1280, 1366, 1440, 1920):
            ctx = await b.new_context(viewport={"width": w, "height": 800}); pg = await ctx.new_page()
            for s in sayfalar:
                u = BASE + ("" if s=="index" else s)
                await pg.goto(u); await pg.wait_for_timeout(150)
                sw = await pg.evaluate("document.documentElement.scrollWidth")
                if sw > w: sorun+=1; print(w, s, sw)
            await ctx.close()
        print("sayfa:", len(sayfalar), "sorun:", sorun); await b.close()
asyncio.run(main())
