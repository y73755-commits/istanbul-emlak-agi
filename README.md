# İstanbul Emlak Ağı

İstanbul'a özel gayrimenkul talep ve emlakçı iş birliği platformu: vatandaş talebi, emlakçı başvurusu ve onayı, ücretli/ücretsiz üyelik, yönetici paneli.
Altyapının tamamı ücretsiz planlarda çalışır (0 TL).

## Adresler

| Adres | Durum |
|---|---|
| **https://istanbul-emlak-agi.y73755.workers.dev** | Asıl adres. Cloudflare Workers (statik dosyalar), `worker` dalı |
| https://istanbul-emlak-agi.pages.dev | Eski adres. Her istek 301 ile asıl adrese gider (Cloudflare Pages, `yayin` dalı, `_redirects`) |
| https://y73755-commits.github.io/istanbul-emlak-agi/ | Eski adres. Yalnızca yönlendirme sayfaları (GitHub Pages, `github-yonlendirme` dalı); site burada barındırılmaz |

**Neden Cloudflare Workers?**
- `*.pages.dev` Türkiye'de bazı bağlantılarda engelli (Türk Telekom, Superonline İstanbul vb.; 19.11.2026 ölçümleri teslim raporunda).
- GitHub Pages'in kullanım koşulları, çevrim içi işletme ve ticari işlemlere aracılık eden siteleri kabul etmiyor; bu platform ücretli üyelik içerdiği için orada barındırılmaz.
- Cloudflare'ın ücretsiz planı işletmelere açıktır; Workers'ta statik dosya istekleri ücretsiz ve sınırsızdır, Worker kodu çalışmadığı için günlük istek kotası harcanmaz.
- `*.workers.dev` adresi 19.11.2026'da Türkiye'deki 39 ölçüm noktasının hepsinden (DNS, HTTPS IPv4 ve IPv6) açıldı.
- Kalan risk: `workers.dev` da paylaşılan bir uzantıdır; ileride engellenirse kalıcı çözüm siteye ait bir alan adıdır (aşağıya bakın).

## Mimari

| Parça | Hizmet | Plan |
|---|---|---|
| Sayfalar (statik HTML/CSS/JS) | Cloudflare Workers, yalnızca statik dosyalar (`dagitim/wrangler.jsonc`) | Workers Free |
| Eski adreslerden yönlendirme | Cloudflare Pages (`_redirects`) ve GitHub Pages (yönlendirme sayfaları) | Ücretsiz |
| Üyelik, talepler, başvurular, yönetici paneli | Supabase: Postgres + satır güvenliği (RLS) + sunucu fonksiyonları (RPC), Frankfurt | Free |
| Giriş | Supabase Auth, yalnızca Google (`openid`, `email`, `profile`) | Ücretsiz |
| Sayfa üretimi, gece yedeği, yedek geri yükleme testi, canlı tutma | GitHub Actions | Ücretsiz (açık depo) |
| Gece zamanlayıcısı (GitHub gecikirse) | Cloudflare Worker `iea-zamanlayici` (`zamanlayici/`) | Workers Free |

Sitenin kendi sunucu kodu yoktur; tarayıcı doğrudan Supabase'e bağlanır. Vatandaşın adı, telefonu ve tam açıklaması gibi kişisel bilgiler sayfalara gömülmez,
yalnızca yetkili kullanıcıya sunucu tarafında yetki kontrolüyle verilir (`talep_detay` vb. RPC'ler). Yönetici yetkisi depoda değil, veritabanında tutulur.

### Yayın akışı
1. `main` dalına değişiklik gelir (veya gece zamanlayıcısı) → Actions "Siteyi oluştur" `build.py` ile sayfaları üretir.
2. Aynı iş akışı üç dalı günceller (ayrıntı: `dagitim/BENIOKU.md`):
   - `worker` → Cloudflare Workers Builds `npx wrangler deploy` ile asıl adrese yayınlar.
   - `yayin` → Cloudflare Pages (eski adres, yalnızca yönlendirme).
   - `github-yonlendirme` → GitHub Pages (eski adres, yalnızca yönlendirme).

### Klasörler
- `build.py` — `data/` dosyalarından bütün sayfaları üretir; canonical, `sitemap.xml`, `robots.txt`, yapılandırılmış veri, `manifest.webmanifest`, `sw.js`, `_redirects` ve (alan adı varsa) `CNAME` dosyalarını `site_url` değerine göre yazar.
- `data/` — site metinleri, paketler, ilçe/mahalle listesi, KVKK ve kullanım koşulları.
- `assets/` — stil, betikler ve görseller (`app.js` ortak Supabase işlemleri, `hesabim.js` kullanıcı paneli, `admin.js` yönetici paneli).
- `dagitim/` — Workers yayın ayarı (`wrangler.jsonc`) ve yayın dalları açıklaması.
- `tools/` — görsel hazırlama, eski GitHub Pages adresi için yönlendirme sayfaları (`yonlendirme_sayfalari.py`).
- `supabase/` — veritabanı kurulumu ve değişiklikleri (numara sırasıyla uygulanır) ve `AYARLAR.md` (panelden yapılan ayarların kaydı).
- `zamanlayici/` — gece zamanlayıcısı Worker'ı (kurulum ve anahtar yenileme: `zamanlayici/BENIOKU.md`).
- `testler/` — yerel testler.
- `.github/workflows/` — `build.yml` (sayfalar + yayın dalları), `yedek.yml` (şifreli gece yedeği, 30 gün saklanır), `yedek-geri-yukleme-testi.yml`, `canli-tut.yml`.

## Bilgileri güncelleme
GitHub'da dosyayı açın → kalem simgesi → düzenleyin → *Commit changes*. Actions → "Siteyi oluştur" birkaç dakikada sayfaları yeniden üretir; Cloudflare ardından kendiliğinden yayınlar.

| Ne değişecek | Dosya / yer |
|---|---|
| WhatsApp numarası | `data/site.json` → `iletisim.whatsapp` |
| Ana sayfa başlığı ve açıklaması | `data/site.json` → `ana_sayfa` |
| Paket adları, süreleri, fiyatları (sayfa metni) | `data/site.json` → `uyelik.paketler` |
| Ücretli erişimin gerçekten açık/kapalı olması | Yönetici paneli → Ayarlar (veritabanı). `data/site.json` içindeki `uyelik.ucretli_erisim_aktif` yalnızca sayfa metinlerini etkiler |
| Talep yayın süresi | `data/site.json` → `talep_yayin_suresi_gun` |
| Kullanıcı talepleri, emlakçı başvuruları, üyelikler | Yönetici paneli (sitedeki `yonetici` sayfası) |
| Sayfaya gömülü örnek talepler | `data/talepler.json` (kişisel bilgi yazılmaz; `ornekleri_goster: false` ile gizlenir) |
| İlçe ve mahalleler | `data/istanbul.json` |
| KVKK, kullanım koşulları, çerez metinleri | `data/metinler/*.md` |
| KVKK'daki veri sorumlusu | `data/site.json` → `veri_sorumlusu` |

## Adres değiştiğinde (ör. alan adı alınınca)
1. `data/site.json` → `site.site_url` değerini yeni adres yapın (sonunda `/` olmadan). Canonical, site haritası, robots, yapılandırılmış veri, PWA ve eski adreslerden yönlendirme kendiliğinden güncellenir.
2. Alan adını Cloudflare'a ekleyip Workers → `istanbul-emlak-agi` → Domains → Custom domain ile bağlayın (alan adı Cloudflare'da olmalıdır).
3. Supabase → Authentication → URL Configuration: **Site URL** yeni adres; **Redirect URLs** listesine `<yeni adres>/**` ekleyin (eski adresleri geçiş süresince silmeyin). Google Cloud tarafında değişiklik gerekmez; Google yalnızca Supabase'in dönüş adresini kullanır.
4. Search Console'a yeni adresi ekleyip `sitemap.xml` gönderin.

## Erişim kontrolü
Türkiye'deki operatörlerden erişimi denemek için [Globalping](https://globalping.io) ücretsiz ölçüm ağı kullanılabilir (konum `Turkey`, ölçüm türü `http` ve `dns`).
Not: Globalping'de Vodafone ve Türk Telekom mobil ölçüm noktası yoktur; mobil hatlar gerçek cihazla denenmelidir.

## Yerelde çalıştırma ve testler
```
python3 build.py
python3 testler/sunucu.py 8765          # Cloudflare adres kurallarını taklit eder
python3 testler/arayuz_persona_test.py  # TEST_BASE varsayılanı http://127.0.0.1:8765/
```
`arayuz_persona_test.py` gerçek Supabase istemcisini sahte (bellekte) bir sunucuyla çalıştırır, dışarıya veri göndermez. Diğerleri: `duyarli_test.py`, `sayfa_genisligi_test.py`, `axe_test.py`, `etkilesim_test.py`, `seo_denetim.py`.

## Kaynaklar
- Mahalle listesi: `turkey-neighbourhoods` 4.0.3 (PTT adres verisi tabanlı)
- İlçe haritası: github.com/ozanyerli/istanbul-districts-geojson (sadeleştirilmiş)
- Fotoğraflar: Unsplash (Unsplash Lisansı)
- Yazı tipleri: Playfair Display, Manrope (SIL Open Font License)
