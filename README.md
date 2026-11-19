# İstanbul Emlak Ağı

İstanbul'a özel gayrimenkul talep ve emlakçı iş birliği platformu: vatandaş talebi, emlakçı başvurusu ve onayı, ücretli/ücretsiz üyelik, yönetici paneli.
Altyapının tamamı ücretsiz planlarda çalışır (0 TL).

## Adresler

| Adres | Durum |
|---|---|
| **https://y73755-commits.github.io/istanbul-emlak-agi/** | Asıl adres (GitHub Pages, `main` dalının kökü) |
| https://istanbul-emlak-agi.pages.dev/ | Eski adres. Her istek 301 ile asıl adrese aktarılır (Cloudflare Pages, `yayin` dalı, `_redirects`) |

**Neden GitHub Pages?** 19.11.2026'da Türkiye'den yapılan ölçümlerde `*.pages.dev` adresleri bazı bağlantılarda açılmadı:
Türk Telekom'da alan adı yanlış bir adrese çözülüyor veya güvenli bağlantı (TLS) kuruluşu kesiliyordu, Superonline İstanbul'da TLS el sıkışması zaman aşımına uğruyordu (`ERR_CONNECTION_TIMED_OUT`).
Aynı ölçümlerde `github.io`, Supabase ve Google giriş adresleri tüm Türkiye ölçüm noktalarından açıldı. Ayrıntılar teslim raporundadır.

## Mimari

| Parça | Hizmet | Plan |
|---|---|---|
| Sayfalar (statik HTML/CSS/JS) | GitHub Pages | Ücretsiz (açık depo) |
| Eski adresten yönlendirme | Cloudflare Pages | Free |
| Üyelik, talepler, başvurular, yönetici paneli | Supabase: Postgres + satır güvenliği (RLS) + sunucu fonksiyonları (RPC), Frankfurt | Free |
| Giriş | Supabase Auth, yalnızca Google (`openid`, `email`, `profile`) | Ücretsiz |
| Sayfa üretimi, gece yedeği, yedek geri yükleme testi, canlı tutma | GitHub Actions | Ücretsiz (açık depo) |
| Gece zamanlayıcısı (GitHub gecikirse) | Cloudflare Worker `iea-zamanlayici` (`zamanlayici/`) | Workers Free |

Sitenin kendi sunucu kodu yoktur; tarayıcı doğrudan Supabase'e bağlanır. Vatandaşın adı, telefonu ve tam açıklaması gibi kişisel bilgiler sayfalara gömülmez,
yalnızca yetkili kullanıcıya sunucu tarafında yetki kontrolüyle verilir (`talep_detay` vb. RPC'ler). Yönetici yetkisi depoda değil, veritabanında tutulur.

### Klasörler
- `build.py` — `data/` dosyalarından bütün sayfaları üretir; canonical, `sitemap.xml`, `robots.txt`, yapılandırılmış veri, `manifest.webmanifest`, `sw.js`, `_redirects` ve (alan adı varsa) `CNAME` dosyalarını `site_url` değerine göre yazar.
- `data/` — site metinleri, paketler, ilçe/mahalle listesi, KVKK ve kullanım koşulları.
- `assets/` — stil, betikler ve görseller (`app.js` ortak Supabase işlemleri, `hesabim.js` kullanıcı paneli, `admin.js` yönetici paneli).
- `supabase/` — veritabanı kurulumu ve değişiklikleri (numara sırasıyla uygulanır) ve `AYARLAR.md` (panelden yapılan ayarların kaydı).
- `zamanlayici/` — Cloudflare Worker (kurulum ve anahtar yenileme: `zamanlayici/BENIOKU.md`).
- `testler/` — yerel testler.
- `.github/workflows/` — `build.yml` (sayfaları üretir, `yayin` dalını günceller), `yedek.yml` (şifreli gece yedeği, 30 gün saklanır), `yedek-geri-yukleme-testi.yml`, `canli-tut.yml`.

## Bilgileri güncelleme
GitHub'da dosyayı açın → kalem simgesi → düzenleyin → *Commit changes*. Actions → "Siteyi oluştur" birkaç dakikada sayfaları yeniden üretir; GitHub Pages ardından kendiliğinden yayınlar.

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
1. `data/site.json` → `site.site_url` değerini yeni adres yapın (sonunda `/` olmadan). Canonical, site haritası, robots, yapılandırılmış veri, PWA, `CNAME` ve eski adreslerden yönlendirme kendiliğinden güncellenir.
2. Supabase → Authentication → URL Configuration: **Site URL** yeni adres; **Redirect URLs** listesine `<yeni adres>/**` ekleyin (eski adresleri geçiş süresince silmeyin). Google Cloud tarafında değişiklik gerekmez; Google yalnızca Supabase'in dönüş adresini kullanır.
3. Alan adı GitHub Pages'e bağlanacaksa DNS: `A` kayıtları 185.199.108.153 / .109.153 / .110.153 / .111.153, `www` için `CNAME` → `y73755-commits.github.io`. Depo Settings → Pages → Custom domain + Enforce HTTPS.
4. Search Console'a yeni adresi ekleyip `sitemap.xml` gönderin. (Proje sitesi adresinde `robots.txt` alt klasörde olduğu için arama motorları onu okumaz; site haritası Search Console'dan gönderilir.)

## Erişim kontrolü
Türkiye'deki operatörlerden erişimi denemek için [Globalping](https://globalping.io) ücretsiz ölçüm ağı kullanılabilir (konum `Turkey`, ölçüm türü `http` ve `dns`).
Not: Globalping'de mobil operatör (Turkcell, Vodafone, Türk Telekom mobil) ölçüm noktası yoktur; mobil hatlar gerçek cihazla denenmelidir.

## Yerelde çalıştırma ve testler
```
python3 build.py
mkdir -p /tmp/ghp && ln -sfn "$PWD" /tmp/ghp/istanbul-emlak-agi && ln -sfn "$PWD/404.html" /tmp/ghp/404.html
python3 testler/sunucu.py 8765 /tmp/ghp
TEST_BASE=http://127.0.0.1:8765/istanbul-emlak-agi/ python3 testler/arayuz_persona_test.py
```
`arayuz_persona_test.py` gerçek Supabase istemcisini sahte (bellekte) bir sunucuyla çalıştırır, dışarıya veri göndermez. Diğerleri: `duyarli_test.py`, `sayfa_genisligi_test.py`, `axe_test.py`, `etkilesim_test.py`, `seo_denetim.py`.

## Kaynaklar
- Mahalle listesi: `turkey-neighbourhoods` 4.0.3 (PTT adres verisi tabanlı)
- İlçe haritası: github.com/ozanyerli/istanbul-districts-geojson (sadeleştirilmiş)
- Fotoğraflar: Unsplash (Unsplash Lisansı)
- Yazı tipleri: Playfair Display, Manrope (SIL Open Font License)
