"""Arayüz persona testi (Google ile giriş, SMS yok): gerçek supabase-js istemcisi, sahte (bellekte) Supabase sunucusuna konuşur.
Vatandaş, onaysız emlakçı, onaylı ücretsiz emlakçı, aktif ücretli emlakçı, süresi biten üye ve yönetici
akışlarını tarayıcıda uçtan uca dener. Ağ çağrıları yerel olarak yanıtlanır; dışarıya hiçbir veri gitmez."""
import asyncio, base64, json, time, re, urllib.parse
from playwright.async_api import async_playwright

BASE = __import__("os").environ.get("TEST_BASE", "http://127.0.0.1:8765/")
SB = "nmfttzejqkigcxdmwydt.supabase.co"
TOTP_KODU = "654321"
SONUC = []


def b64(o):
    return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")


class Sunucu:
    def __init__(self):
        now = time.time()
        self.ucretli_acik = True
        self.kullanicilar = {
            "vat": {"id": "u-vat", "rol": "vatandas", "durum": "aktif", "ad_soyad": "Google Vatandaş", "telefon": None},
            "bek": {"id": "u-bek", "rol": "vatandas", "durum": "aktif", "ad_soyad": None, "telefon": None},
            "ucz": {"id": "u-ucz", "rol": "emlakci", "durum": "onayli", "ad_soyad": "Ücretsiz Emlakçı", "ofis_adi": "B Emlak", "telefon": "905320000003"},
            "ucr": {"id": "u-ucr", "rol": "emlakci", "durum": "onayli", "ad_soyad": "Ücretli Emlakçı", "ofis_adi": "C Emlak", "bitis": now + 20 * 86400, "telefon": "905320000004"},
            "bit": {"id": "u-bit", "rol": "emlakci", "durum": "onayli", "ad_soyad": "Süresi Biten", "ofis_adi": "D Emlak", "bitis": now - 3600, "telefon": "905320000005"},
            "admin": {"id": "u-adm", "rol": "yonetici", "durum": "aktif", "ad_soyad": "Yönetici", "telefon": None, "faktor": None},
        }
        for ad, k in self.kullanicilar.items():
            k["eposta"] = ad + "@test.local"
        self.siradaki = None      # Google ekranında seçilecek hesap
        self.hata_ver = False     # talep_olustur sunucu hatası denemesi
        self.talepler = [{"id": 1, "no": "T-1001", "tip": "vatandas", "kategori": "satilik-konut", "tur": "daire", "islem": "satilik",
                          "ilce": "Kadıköy", "mahalle": "Göztepe", "butce_min": 5000000, "butce_max": 7000000, "m2": 110, "oda": "3+1",
                          "baslik": "Göztepe'de 3+1 daire arıyorum", "ozet": "Metroya yakın", "yayin_tarihi": "2026-11-15T10:00:00Z",
                          "olusturma": "2026-11-15T10:00:00Z", "durum": "yayinda", "sahip": "u-dis", "aciklama": "GİZLİ AÇIKLAMA",
                          "ad": "Ayşe Yılmaz", "tel": "905551112233"}]
        self.cagrilar = []

    def kul_id(self, uid):
        return next((k for k in self.kullanicilar.values() if k["id"] == uid), None)

    def kullanici_json(self, k):
        f = [k["faktor"]] if k.get("faktor") else []
        return {"id": k["id"], "aud": "authenticated", "role": "authenticated", "phone": "", "email": k.get("eposta") or "",
                "email_confirmed_at": "2026-11-17T10:00:00Z", "app_metadata": {"provider": "google"}, "user_metadata": {"full_name": k.get("ad_soyad")},
                "created_at": "2026-11-17T10:00:00Z", "factors": f}

    def oturum(self, k, aal="aal1"):
        now = int(time.time())
        tok = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({"sub": k["id"], "role": "authenticated", "aud": "authenticated", "aal": aal,
               "exp": now + 3600, "iat": now, "session_id": "s-" + k["id"], "amr": [{"method": "totp" if aal == "aal2" else "oauth", "timestamp": now}]}) + ".imza"
        return {"access_token": tok, "token_type": "bearer", "expires_in": 3600, "expires_at": now + 3600, "refresh_token": "r-" + k["id"], "user": self.kullanici_json(k)}

    def profil(self, k, aal):
        b = k.get("bitis")
        aktif = b and b > time.time()
        return {"id": k["id"], "rol": k["rol"], "durum": k["durum"], "ad_soyad": k.get("ad_soyad"), "telefon": k.get("telefon"), "telefon_onayli": False, "giris_yontemi": "google",
                "eposta": k.get("eposta"), "ofis_adi": k.get("ofis_adi"), "yetki_belge_no": k.get("yetki"), "hizmet_ilceleri": k.get("ilceler", []),
                "foto_url": None, "red_nedeni": None, "uyelik_bitis": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(b)) if aktif else None,
                "kalan_gun": int((b - time.time()) // 86400) + 1 if aktif else None, "ucretli_erisim_aktif": self.ucretli_acik,
                "yonetici_aal2": k["rol"] == "yonetici" and aal == "aal2"}

    def rpc(self, ad, arg, k, aal):
        self.cagrilar.append(ad)
        hata = lambda m: (400, {"code": "P0001", "message": m, "details": None, "hint": None})
        if ad == "profilim":
            return 200, self.profil(k, aal) if k else None
        if k is None:
            return 401, {"code": "42501", "message": "Giriş yapmanız gerekiyor."}
        admin = k["rol"] == "yonetici" and aal == "aal2"
        if ad.startswith("admin_") and not admin:
            return 403, {"code": "42501", "message": "Bu işlem için yönetici yetkisi gerekir."}
        if ad == "talep_olustur":
            p = arg["p"]
            if self.hata_ver:
                return hata("Bugün için talep sınırına ulaştınız. Lütfen yarın tekrar deneyin.")
            if k["rol"] == "emlakci" and k["durum"] != "onayli":
                return hata("İş birliği paylaşımı için emlakçı hesabınızın onaylanması gerekir.")
            for alan in ("kategori", "tur", "baslik", "ozet", "aciklama"):
                if not p.get(alan):
                    return hata("Eksik alan: " + alan)
            if k["rol"] != "emlakci" and not p.get("riza"):
                return hata("İletişim bilgilerinizin paylaşımına onay vermeniz gerekir.")
            if not k.get("ad_soyad"):
                k["ad_soyad"] = p.get("ad_soyad")
            tel = p.get("telefon") or k.get("telefon")
            if not tel:
                return hata("Lütfen iletişim telefonunuzu yazın.")
            k["telefon"] = k.get("telefon") or tel
            yid = len(self.talepler) + 1
            tip = "emlakci" if k["rol"] == "emlakci" else "vatandas"
            t = dict(p, id=yid, no=("E-" if tip == "emlakci" else "T-") + str(1000 + yid), tip=tip, durum="inceleniyor", sahip=k["id"],
                     ad=k.get("ad_soyad"), tel=tel, olusturma="2026-11-17T12:00:00Z", yayin_tarihi=None)
            self.talepler.append(t)
            return 200, {"id": yid, "no": t["no"], "durum": "inceleniyor"}
        if ad == "taleplerim":
            return 200, [dict({x: t.get(x) for x in t if x not in ("sahip", "ad", "tel")}, goruntulenme=0) for t in self.talepler if t["sahip"] == k["id"]]
        if ad == "talep_guncelle":
            t = next(t for t in self.talepler if t["id"] == arg["p_id"] and t["sahip"] == k["id"]); t.update({x: v for x, v in arg["p"].items() if v}); return 200, {"ok": True}
        if ad == "talep_kapat":
            t = next(t for t in self.talepler if t["id"] == arg["p_id"] and t["sahip"] == k["id"]); t["durum"] = arg["p_durum"]; return 200, {"ok": True}
        if ad == "talep_sil":
            self.talepler = [t for t in self.talepler if not (t["id"] == arg["p_id"] and t["sahip"] == k["id"])]; return 200, {"ok": True}
        if ad == "talep_detay":
            t = next((t for t in self.talepler if t["id"] == arg["p_id"]), None)
            if not t:
                return hata("Talep bulunamadı.")
            ok = t["sahip"] == k["id"] or admin
            if not ok and k["rol"] == "emlakci" and k["durum"] == "onayli" and t["durum"] == "yayinda":
                ok = t["tip"] == "emlakci" or (self.ucretli_acik and (k.get("bitis") or 0) > time.time())
            if not ok:
                return 403, {"code": "42501", "message": "Bu bilgiler yalnızca aktif ücretli üyeliği olan onaylı emlakçılara açıktır."}
            return 200, {"no": t["no"], "aciklama": t["aciklama"], "ad_soyad": t["ad"], "telefon": t["tel"], "ofis_adi": None}
        if ad == "emlakci_basvur":
            p = arg["p"]
            if not (p.get("ad_soyad") and p.get("ofis_adi") and p.get("yetki_belge_no") and "@" in (p.get("eposta") or "") and p.get("hizmet_ilceleri") and p.get("telefon")):
                return hata("Lütfen tüm zorunlu alanları doldurun.")
            k.update(rol="emlakci", durum="beklemede", telefon=p["telefon"], ad_soyad=p["ad_soyad"], ofis_adi=p["ofis_adi"], eposta=p["eposta"], yetki=p["yetki_belge_no"], ilceler=p["hizmet_ilceleri"])
            return 200, self.profil(k, aal)
        if ad == "admin_ozet":
            return 200, {"vatandas": 1, "emlakci": 4, "onay_bekleyen": sum(1 for x in self.kullanicilar.values() if x["durum"] == "beklemede"), "aktif_ucretli": 1,
                         "suresi_biten": 1, "yayindaki_vatandas": 1, "yayindaki_emlakci": 0, "incelenecek": sum(1 for t in self.talepler if t["durum"] == "inceleniyor"),
                         "acik_sikayet": 0, "ilce_dagilimi": {"Kadıköy": 1}}
        if ad == "admin_kullanicilar":
            rows = [dict(self.profil(x, "aal1"), olusturma="2026-11-17T10:00:00Z", talep_sayisi=0, son_uyelik_bitis=None)
                    for x in self.kullanicilar.values() if (not arg.get("p_rol") or x["rol"] == arg["p_rol"]) and (not arg.get("p_durum") or x["durum"] == arg["p_durum"])]
            return 200, rows
        if ad == "admin_kullanici_durum":
            x = self.kul_id(arg["p_id"]); x["durum"] = arg["p_durum"]; return 200, {"ok": True}
        if ad == "admin_uyelik_ekle":
            x = self.kul_id(arg["p"]["emlakci_id"])
            if x["durum"] != "onayli":
                return hata("Üyelik yalnızca onaylı emlakçıya tanımlanır.")
            x["bitis"] = time.time() + 30 * 86400; return 200, {"id": 9, "baslangic": "2026-11-17", "bitis": "2026-12-17"}
        if ad == "admin_talepler":
            return 200, [dict({x: t.get(x) for x in t if x not in ("sahip",)}, aciklama=t.get("aciklama"), ad_soyad=t.get("ad"), telefon=t.get("tel"), goruntulenme=0, sahip_ad=t.get("ad"))
                         for t in self.talepler if not arg.get("p_durum") or t["durum"] == arg["p_durum"]]
        if ad == "admin_hatirlatmalar":
            return 200, [{"uyelik_id": 7, "emlakci_id": "u-ucr", "ad_soyad": "Ücretli Emlakçı", "ofis_adi": "C Emlak", "telefon": "905320000004",
                          "bitis": "2026-11-20T10:00:00Z", "kalan_gun": 3, "isaretlendi": True}]
        if ad == "admin_talep_durum":
            t = next(t for t in self.talepler if t["id"] == arg["p_id"]); t["durum"] = arg["p_durum"]; return 200, {"ok": True}
        return 200, []

    async def yonlendir(self, route):
        req = route.request
        u = urllib.parse.urlparse(req.url); yol = u.path; q = urllib.parse.parse_qs(u.query)
        govde = {}
        try:
            govde = json.loads(req.post_data or "{}")
        except Exception:
            pass
        yetki = req.headers.get("authorization", "")
        k, aal = None, "aal1"
        if yetki.count(".") == 2:
            try:
                pl = json.loads(base64.urlsafe_b64decode(yetki.split(".")[1] + "==="))
                k = self.kul_id(pl.get("sub")); aal = pl.get("aal", "aal1")
            except Exception:
                pass

        def yanit(kod, veri=None):
            return route.fulfill(status=kod, body="" if veri is None else json.dumps(veri), headers={"content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"})
        if req.method == "OPTIONS":
            return await yanit(204)
        if yol == "/auth/v1/authorize":
            # Google hesap seçimi yerine: seçili test hesabıyla geri dön
            assert q.get("provider") == ["google"], q
            hedef = q["redirect_to"][0]
            hedef += ("&" if "?" in hedef else "?") + "code=kod-" + self.siradaki
            return await route.fulfill(status=302, headers={"location": hedef})
        if yol == "/auth/v1/token" and q.get("grant_type") == ["pkce"]:
            kim = (govde.get("auth_code") or "").replace("kod-", "")
            if kim not in self.kullanicilar or not govde.get("code_verifier"):
                return await yanit(400, {"code": 400, "error_code": "bad_code_verifier", "msg": "invalid"})
            return await yanit(200, self.oturum(self.kullanicilar[kim]))
        if yol == "/auth/v1/user":
            return await yanit(200, self.kullanici_json(k)) if k else await yanit(401, {"msg": "no"})
        if yol == "/auth/v1/factors" and req.method == "POST":
            k["faktor"] = {"id": "f1", "factor_type": "totp", "status": "unverified", "friendly_name": "test", "created_at": "2026-11-17T10:00:00Z", "updated_at": "2026-11-17T10:00:00Z"}
            return await yanit(200, {"id": "f1", "type": "totp", "friendly_name": "test", "totp": {"qr_code": '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><path fill="#000000" d="M0 0h7v7H0z"/></svg>', "secret": "TESTSECRET", "uri": "otpauth://totp/test"}})
        if re.match(r"/auth/v1/factors/f1/challenge", yol):
            return await yanit(200, {"id": "c1", "type": "totp", "expires_at": int(time.time()) + 300})
        if re.match(r"/auth/v1/factors/f1/verify", yol):
            if govde.get("code") != TOTP_KODU:
                return await yanit(422, {"code": 422, "error_code": "mfa_verification_failed", "msg": "Invalid TOTP code entered"})
            k["faktor"]["status"] = "verified"
            return await yanit(200, self.oturum(k, "aal2"))
        if yol.startswith("/auth/v1/factors/") and req.method == "DELETE":
            return await yanit(200, {"id": "f1"})
        if yol == "/auth/v1/logout":
            return await yanit(204)
        if yol.startswith("/rest/v1/rpc/"):
            kod, veri = self.rpc(yol.rsplit("/", 1)[1], govde, k, aal)
            return await yanit(kod, veri)
        if yol == "/rest/v1/ayarlar":
            return await yanit(200, [{"anahtar": "whatsapp", "deger": "905520928085"}, {"anahtar": "ucretli_erisim_aktif", "deger": self.ucretli_acik},
                                     {"anahtar": "talep_yayin_gun", "deger": 60}])
        if yol == "/rest/v1/talepler":
            sec = q.get("select", [""])[0]
            if "sahip" in sec or sec == "*":
                return await yanit(401, {"code": "42501", "message": "permission denied for table talepler"})
            alan = sec.split(",")
            rows = [{a: t.get(a) for a in alan} for t in self.talepler if t["durum"] == "yayinda"]
            return await yanit(200, rows)
        if yol in ("/rest/v1/paketler",):
            return await yanit(200, [{"id": "aylik", "ad": "Aylık Üyelik", "sure_gun": 30, "fiyat": 1500, "aciklama": "", "aktif": True, "sira": 1, "one_cikan": False}])
        if req.method in ("PATCH", "POST", "DELETE"):
            return await yanit(204)
        return await yanit(200, [])


def kayit(ad, ok, ayrinti=""):
    SONUC.append((ad, ok, ayrinti))
    print(("✓ " if ok else "✗ ") + ad + (f" — {ayrinti}" if ayrinti else ""))


async def yeni(b, sunucu, w=1280):
    ctx = await b.new_context(viewport={"width": w, "height": 900})
    await ctx.route(f"**://{SB}/**", sunucu.yonlendir)
    pg = await ctx.new_page()
    hatalar = []
    pg.on("pageerror", lambda e: hatalar.append(str(e)))
    return ctx, pg, hatalar


async def google_ile(pg, s, kim):
    """Açılan 'Google ile devam edin' penceresinden girişi tamamlar ve sayfaya dönüşü bekler."""
    s.siradaki = kim
    await pg.wait_for_selector("dialog.modal[open] [data-google-git]", timeout=8000)
    async with pg.expect_navigation():
        await pg.click("[data-google-git]")
    await pg.wait_for_load_state("load"); await pg.wait_for_timeout(900)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        s = Sunucu()

        # 1) ZİYARETÇİ: detay düğmesi kuralı açıklar, gizli bilgi sayfaya gelmez
        ctx, pg, h = await yeni(b, s)
        await pg.goto(BASE + "musteri-talepleri"); await pg.wait_for_timeout(800)
        icerik = await pg.content()
        kayit("Ziyaretçi: listede veritabanı kaydı görünüyor", "Göztepe'de 3+1 daire arıyorum" in icerik)
        kayit("Ziyaretçi: sayfa kaynağında gizli açıklama/telefon yok", "GİZLİ AÇIKLAMA" not in icerik and "905551112233" not in icerik)
        await pg.click('[data-detay="1"]'); await pg.wait_for_timeout(500)
        m = await pg.inner_text("dialog.modal[open]")
        kayit("Ziyaretçi: Detay düğmesi giriş/üyelik kuralını gösteriyor", "ücretli" in m.lower() or "giriş" in m.lower(), m[:80].replace("\n", " "))
        kayit("Ziyaretçi: JS hatası yok", not h, "; ".join(h)[:120])
        await ctx.close()

        # 2) VATANDAŞ: formu doldurur → Google ile giriş → taslak geri gelir → gönderir; sunucu hatasında başarı mesajı çıkmaz
        ctx, pg, h = await yeni(b, s)
        await pg.goto(BASE + "talep-olustur")
        f = "form[data-db-form=vatandas]"
        async def doldur():
            await pg.select_option(f + " [name=kategori]", "satilik-konut")
            await pg.select_option(f + " [name=ilce]", "Beşiktaş"); await pg.wait_for_timeout(200)
            await pg.select_option(f + " [name=tur]", "daire")
            try: await pg.select_option(f + " [name=islem]", "satilik")
            except Exception: pass
            await pg.fill(f + " [name=bmax]", "8000000")
            await pg.fill(f + " [name=baslik]", "Beşiktaş'ta 2+1 daire arıyorum")
            await pg.fill(f + " [name=ozet]", "Deniz manzaralı olursa iyi olur")
            await pg.fill(f + " [name=aciklama]", "Asansörlü, otoparklı bina tercih ederim.")
            await pg.fill(f + " [name=ad]", "Test Vatandaş")
            await pg.fill(f + " [name=tel]", "0532 111 22 33")
            await pg.check(f + " [name=onay]")
        await doldur()
        await pg.click(f + " [type=submit]")
        await google_ile(pg, s, "vat")
        geri = await pg.input_value(f + " [name=aciklama]")
        kayit("Vatandaş: Google girişinden dönünce yazdıkları geri geldi", geri == "Asansörlü, otoparklı bina tercih ederim.", geri[:40])
        kayit("Vatandaş: adres çubuğunda giriş kodu kalmadı", "code=" not in pg.url, pg.url.split("/")[-1])
        s.hata_ver = True
        await pg.check(f + " [name=onay]")
        await pg.click(f + " [type=submit]"); await pg.wait_for_timeout(900)
        gizli = await pg.locator("[data-done]").is_hidden()
        hm = await pg.inner_text(f + " [data-err]")
        kayit("Vatandaş: sunucu kaydı reddedince başarı mesajı gösterilmiyor", gizli and "sınır" in hm, hm[:60])
        s.hata_ver = False
        await pg.click(f + " [type=submit]")
        await pg.wait_for_selector("[data-done]:not([hidden])", timeout=8000)
        done = await pg.inner_text("[data-done]")
        kayit("Vatandaş: talep kaydedildi, iletişim telefonu formdan alındı", "T-1002" in done and s.talepler[-1]["tel"] == "905321112233", done[:60].replace("\n", " "))
        await pg.goto(BASE + "hesabim"); await pg.wait_for_selector("[data-taleplerim] .satir", timeout=8000)
        t = await pg.inner_text("[data-hesabim]")
        kayit("Vatandaş: Hesabım'da talebi ve durumunu görüyor", "Beşiktaş'ta 2+1" in t and ("İnceleniyor" in t or "inceleniyor" in t.lower()))
        duz = pg.locator("[data-taleplerim] button", has_text=re.compile("Düzenle"))
        if await duz.count():
            await duz.first.click(); await pg.wait_for_selector("dialog.modal[open] form", timeout=5000)
            await pg.fill("dialog.modal[open] [name=baslik]", "Beşiktaş'ta 2+1 veya 3+1 daire")
            await pg.click("dialog.modal[open] [type=submit]"); await pg.wait_for_timeout(800)
            kayit("Vatandaş: talebini düzenledi", s.talepler[-1]["baslik"] == "Beşiktaş'ta 2+1 veya 3+1 daire")
        else:
            kayit("Vatandaş: Düzenle düğmesi bulunamadı", False)
        kap = pg.locator("[data-taleplerim] button", has_text=re.compile("Kapat|Sonuçlandı"))
        if await kap.count():
            pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
            await kap.first.click(); await pg.wait_for_timeout(600)
            if await pg.locator("dialog.modal[open] [data-kapat-tur], dialog.modal[open] button", has_text=re.compile("Sonuçlandı")).count():
                await pg.locator("dialog.modal[open] button", has_text=re.compile("Sonuçlandı")).first.click(); await pg.wait_for_timeout(600)
            kayit("Vatandaş: talebini kapattı", s.talepler[-1]["durum"] in ("sonuclandi", "iptal"), s.talepler[-1]["durum"])
        else:
            kayit("Vatandaş: Kapat düğmesi bulunamadı", False)
        kayit("Vatandaş: JS hatası yok", not h, "; ".join(h)[:160])
        await ctx.close()

        # 3) ONAYSIZ EMLAKÇI: başvurur, beklemede görür, detay alamaz
        ctx, pg, h = await yeni(b, s)
        await pg.goto(BASE + "emlakci-uyelik")
        f = "form[data-db-form=emlakci]"
        await pg.fill(f + " [name=ad]", "Test Başvuran"); await pg.fill(f + " [name=ofis]", "A Emlak")
        await pg.fill(f + " [name=tel]", "0533 444 55 66"); await pg.fill(f + " [name=eposta]", "a@test.local")
        await pg.fill(f + " [name=yetki]", "3400123")
        await pg.locator(f + " [name=ilceler]").first.check()
        for cb in await pg.locator(f + " input[type=checkbox][required], " + f + " [name=onay], " + f + " [name=kvkk]").all():
            if not await cb.is_checked(): await cb.check()
        await pg.click(f + " [type=submit]")
        await google_ile(pg, s, "bek")
        await pg.check(f + " [name=onay]")
        await pg.click(f + " [type=submit]")
        await pg.wait_for_selector("[data-done]:not([hidden])", timeout=8000)
        kayit("Onaysız emlakçı: Google girişiyle başvuru kaydedildi (telefon iletişim alanı)", s.kullanicilar["bek"]["durum"] == "beklemede" and s.kullanicilar["bek"]["telefon"] == "905334445566")
        await pg.goto(BASE + "hesabim"); await pg.wait_for_selector("[data-hesabim] .panel-head", timeout=8000)
        t = await pg.inner_text("[data-hesabim]")
        kayit("Onaysız emlakçı: panelde 'Başvurunuz inceleniyor' görünüyor", "inceleniyor" in t)
        await pg.goto(BASE + "musteri-talepleri"); await pg.wait_for_timeout(800)
        await pg.click('[data-detay="1"]'); await pg.wait_for_timeout(700)
        m = await pg.inner_text("dialog.modal[open]")
        kayit("Onaysız emlakçı: vatandaş iletişimini alamıyor", "905551112233" not in m and "555 111" not in m, m[:70].replace("\n", " "))
        kayit("Onaysız emlakçı: JS hatası yok", not h, "; ".join(h)[:160])
        await ctx.close()

        # 4-6) ONAYLI ÜCRETSİZ / AKTİF ÜCRETLİ / SÜRESİ BİTEN: giriş sayfasından SMS ile giriş
        for kim, ad, beklenen in [("ucz", "Onaylı ücretsiz emlakçı", False), ("ucr", "Aktif ücretli emlakçı", True), ("bit", "Süresi biten üye", False)]:
            ctx, pg, h = await yeni(b, s, 390)
            await pg.goto(BASE + "giris")
            s.siradaki = kim
            await pg.click("[data-google-giris]")
            await pg.wait_for_url("**/hesabim", timeout=10000)
            await pg.wait_for_selector("[data-hesabim] .panel-head", timeout=8000)
            t = await pg.inner_text("[data-hesabim]")
            if beklenen:
                kayit(f"{ad}: panelde üyelik bitiş tarihi ve kalan gün görünüyor", "Kalan" in t, re.sub(r"\s+", " ", t)[:120])
            await pg.goto(BASE + "musteri-talepleri"); await pg.wait_for_timeout(900)
            await pg.click('[data-detay="1"]'); await pg.wait_for_timeout(900)
            m = await pg.inner_text("dialog.modal[open]")
            gordu = "0555 111 22 33" in m or "905551112233" in m
            kayit(f"{ad}: vatandaş iletişimine erişim {'VAR' if beklenen else 'YOK'}", gordu == beklenen, m[:90].replace("\n", " "))
            kayit(f"{ad}: JS hatası yok", not h, "; ".join(h)[:160])
            await ctx.close()

        s.talepler.append(dict(s.talepler[0], id=len(s.talepler) + 1, no="T-1009", durum="inceleniyor", baslik="İncelenecek test talebi"))
        # 7) YÖNETİCİ: e-posta+şifre → iki adımlı doğrulama kurulumu → panel → onay ve üyelik
        ctx, pg, h = await yeni(b, s)
        await pg.goto(BASE + "yonetici")
        s.siradaki = "ucz"
        await pg.click("[data-a-google]"); await pg.wait_for_timeout(1500)
        t0 = await pg.inner_text("[data-yonetici]")
        kayit("Yönetici paneli: yönetici olmayan Google hesabı reddediliyor", "yetkisine sahip değil" in t0, t0[:70].replace("\n", " "))
        s.siradaki = "admin"
        await pg.click("[data-a-google]")
        await pg.wait_for_selector("input[name=kod]", timeout=10000)
        kayit("Yönetici: Google girişinden sonra iki adımlı doğrulama (QR) isteniyor; şifre yok", True)
        qr_ok = await pg.evaluate("""async () => { const i = document.querySelector('.qr img'); if (!i) return 'img yok'; try { await i.decode(); } catch (e) { return 'decode hata: ' + i.src.slice(0, 80); } return i.naturalWidth > 0 && !document.querySelector('[data-yonetici]').innerText.includes('alt=') ? true : 'genislik ' + i.naturalWidth }""")
        kayit("Yönetici: QR görseli bozulmadan yükleniyor (Supabase'in çift tırnaklı SVG biçimi)", qr_ok is True, "" if qr_ok is True else str(qr_ok))
        await pg.fill("input[name=kod]", "111111"); await pg.locator("input[name=kod]").press("Enter"); await pg.wait_for_timeout(700)
        kayit("Yönetici: yanlış doğrulama kodu reddediliyor", await pg.locator("[data-sekme]").count() == 0)
        await pg.fill("input[name=kod]", TOTP_KODU); await pg.locator("input[name=kod]").press("Enter")
        await pg.wait_for_selector("[data-sekme=emlakcilar]", timeout=8000)
        await pg.wait_for_selector(".stat-grid", timeout=8000)
        kayit("Yönetici: panel açıldı (özet sayıları görünüyor)", True)
        await pg.click("[data-sekme=emlakcilar]"); await pg.wait_for_selector("[data-liste] .satir", timeout=8000)
        await pg.click('[data-k-durum="onayli"][data-id="u-bek"]'); await pg.wait_for_timeout(900)
        if await pg.locator("dialog.modal[open]").count():
            btn = pg.locator("dialog.modal[open] button", has_text=re.compile("Onayla|Evet|Kaydet"))
            if await btn.count(): await btn.first.click(); await pg.wait_for_timeout(700)
        kayit("Yönetici: emlakçı başvurusunu onayladı", s.kullanicilar["bek"]["durum"] == "onayli")
        await pg.select_option("[data-f-durum]", "onayli"); await pg.wait_for_timeout(900)
        await pg.click('[data-uyelik-ekle="u-ucz"]'); await pg.wait_for_selector("dialog.modal[open] form", timeout=5000)
        await pg.click("dialog.modal[open] [type=submit]"); await pg.wait_for_timeout(900)
        kayit("Yönetici: ücretsiz emlakçıya elle üyelik tanımladı", (s.kullanicilar["ucz"].get("bitis") or 0) > time.time())
        await pg.click("[data-sekme=talepler]"); await pg.wait_for_timeout(900)
        yay = pg.locator('[data-t-durum="yayinda"]')
        if await yay.count():
            await yay.first.click(); await pg.wait_for_timeout(800)
            if await pg.locator("dialog.modal[open]").count():
                bt = pg.locator("dialog.modal[open] button", has_text=re.compile("Yayına al|Evet|Kaydet"))
                if await bt.count(): await bt.first.click(); await pg.wait_for_timeout(600)
            kayit("Yönetici: incelenen talebi yayına aldı", any(t["no"] == "T-1009" and t["durum"] == "yayinda" for t in s.talepler))
        else:
            kayit("Yönetici: 'Yayına al' düğmesi bulunamadı", False, "admin_talepler çağrıldı mı: " + str("admin_talepler" in s.cagrilar))
        await pg.click("[data-sekme=uyelikler]"); await pg.wait_for_timeout(800)
        wa = await pg.locator('[data-yaklasan] a[href*="wa.me/905320000004"]').count()
        kayit("Yönetici: bitişi yaklaşan üye için WhatsApp hatırlatma düğmesi var (SMS yok)", wa == 1)
        await pg.click("[data-sekme=ayarlar]"); await pg.wait_for_selector("[data-erisim-tablosu]", timeout=5000)
        tab = await pg.inner_text("[data-erisim-tablosu]")
        kayit("Yönetici: Ayarlar'da ücretli erişim durumuna göre rol/erişim tablosu görünüyor", "Onaylı emlakçı, aktif ücretli üye" in tab and ("AÇIK" in tab or "KAPALI" in tab), tab[:160].replace("\n", " | "))
        await pg.uncheck('[name="ucretli"]'); await pg.wait_for_timeout(200)
        tab2 = await pg.inner_text("[data-erisim-tablosu]")
        satir = [l for l in tab2.split("\n") if "aktif ücretli üye" in l]
        kayit("Yönetici: ücretli erişim kapatılınca tabloda ücretli üye 'Göremez' görünüyor", "KAPALI" in tab2 and satir and "Göremez" in satir[0], (satir or [""])[0][:90])
        kayit("Yönetici: SMS ayarı panelden kaldırıldı", await pg.locator("#ay-sms").count() == 0)
        for sek in ["uyelikler", "kullanicilar", "sikayetler", "paketler", "ayarlar", "mahalleler", "kayitlar"]:
            await pg.click(f"[data-sekme={sek}]"); await pg.wait_for_timeout(500)
        kayit("Yönetici: bütün sekmeler hatasız açılıyor", not h, "; ".join(h)[:200])
        await ctx.close()

        # 8) Onaysız→onaylanan emlakçı artık iş birliği paylaşımı yapabiliyor
        ctx, pg, h = await yeni(b, s)
        await pg.goto(BASE + "giris")
        s.siradaki = "bek"
        await pg.click("[data-google-giris]"); await pg.wait_for_url("**/hesabim", timeout=10000)
        await pg.goto(BASE + "portfoy-is-birligi"); await pg.wait_for_timeout(900)
        acik = await pg.locator("form[data-db-form=isbirligi]").is_visible()
        kayit("Onaylanan emlakçı: iş birliği formu açıldı", acik)
        await ctx.close()

        await b.close()
    gecen = sum(1 for x in SONUC if x[1])
    print(f"\nSONUÇ: {gecen}/{len(SONUC)} geçti")

asyncio.run(main())
