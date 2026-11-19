import asyncio, json
from playwright.async_api import async_playwright
BASE = __import__("os").environ.get("TEST_BASE", "http://127.0.0.1:8765/")
AXE=open('/home/claude/axe/node_modules/axe-core/axe.min.js').read()
SAYFALAR=["index.html","musteri-talepleri.html","emlakci-talepleri.html","portfoy-is-birligi.html","uyelik-paketleri.html","talep-olustur.html","emlakci-uyelik.html","uye-ol.html","giris.html","istanbul-ilceleri.html","ilce/kadikoy.html","hakkimizda.html","iletisim.html","kvkk-aydinlatma-metni.html"]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for w,h in [(390,844),(1440,900)]:
            ctx=await b.new_context(viewport={"width":w,"height":h})
            await ctx.route("**/*supabase.co/**", lambda r: r.fulfill(status=200, body="[]", headers={"content-type":"application/json","access-control-allow-origin":"*"}))
            pg=await ctx.new_page()
            for s in SAYFALAR:
                await pg.goto(BASE+s, wait_until="load"); await pg.wait_for_timeout(600)
                await pg.add_script_tag(content=AXE)
                r=await pg.evaluate("""async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','best-practice']}});
                  return r.violations.map(v=>({id:v.id,n:v.nodes.length,ornek:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.any[0]?.message||'').slice(0,110))}))}""")
                if r: print(f"[{w}] {s}: "+json.dumps(r,ensure_ascii=False)[:900])
            await ctx.close()
        await b.close()
asyncio.run(main())
