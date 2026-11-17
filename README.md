# İstanbul Emlak Ağı — web sitesi

İstanbul'un gayrimenkul talep ve emlakçı iş birliği platformunun **vitrin sitesi** (1. adım).
Statik HTML; GitHub Pages ile yayınlanır. Formlar WhatsApp üzerinden çalışır, sitede veritabanı yoktur.

## Bilgileri güncelleme
Tüm içerik `data/` klasöründedir. GitHub'da dosyayı açın → kalem simgesi → düzenleyin → *Commit changes*.
Birkaç dakika içinde site otomatik yeniden oluşturulur (Actions → "Siteyi oluştur"). Site her gece de bir kez yeniden oluşturulur; yayın süresi dolan talepler böylece listeden kalkar.

| Ne değişecek | Dosya / alan |
|---|---|
| WhatsApp numarası | `data/site.json` → `iletisim.whatsapp` (ör. `905017017908`) |
| Ana sayfa başlığı ve açıklaması | `data/site.json` → `ana_sayfa` |
| Paket adları, süreleri, fiyatları | `data/site.json` → `uyelik.paketler` (`fiyat`, `yayinda`) |
| Ücretli erişimi açma/kapama | `data/site.json` → `uyelik.ucretli_erisim_aktif` (`true` / `false`) |
| Talep yayın süresi | `data/site.json` → `talep_yayin_suresi_gun` |
| Yayındaki talepler | `data/talepler.json` → `vatandas_talepleri`, `emlakci_talepleri` |
| Örnek talepleri gizleme | `data/talepler.json` → `ornekleri_goster: false` |
| İlçe ve mahalleler | `data/istanbul.json` |
| KVKK, kullanım koşulları, çerez metinleri | `data/metinler/*.md` |
| KVKK'daki veri sorumlusu bilgisi | `data/site.json` → `veri_sorumlusu` |
| Fotoğraflar | `data/gorseller.json` (Unsplash kimliği ile) |
| Google Analytics | `data/site.json` → `olcum.ga4_id` (girilince çerez bandı otomatik çıkar) |

### Talep yayınlama (gizlilik kuralı)
`data/talepler.json` herkese açıktır. **Ad, soyad, telefon, e-posta veya adres asla yazılmaz.**
WhatsApp'tan gelen talebin yalnızca özetini girin (başlık, kategori, tür, işlem, ilçe, mahalle, bütçe, m², oda, kısa özet).
Kategori, tür ve işlem kodları aynı dosyanın `kodlar` bölümündedir.

## Alan adı alındığında
1. `data/site.json` → `site.site_url` değerini `https://alanadi.com` yapın.
2. Depoya `CNAME` adlı dosya ekleyin, içine yalnızca `alanadi.com` yazın.
3. DNS: `A` kayıtları 185.199.108.153 / .109.153 / .110.153 / .111.153, `www` için `CNAME` → `y73755-commits.github.io`.
4. Search Console'a alan adını yeni mülk olarak ekleyip `sitemap.xml` gönderin.

## 2. adım (tam platform)
Üye girişi, SMS doğrulama, sunucu tarafında gizlilik kuralı ve yönetici paneli için veritabanlı bir altyapı gerekir.
Bu sitenin tasarımı, sayfa yapısı ve `data/` dosyaları o aşamada aynen kullanılabilir.

## Kaynaklar
- Mahalle listesi: `turkey-neighbourhoods` 4.0.3 (PTT adres verisi tabanlı)
- İlçe haritası: github.com/ozanyerli/istanbul-districts-geojson (sadeleştirilmiş)
- Fotoğraflar: Unsplash (Unsplash Lisansı)
- Yazı tipleri: Playfair Display, Manrope (SIL Open Font License)

## Yerelde çalıştırma
`python3 build.py` (yalnızca Python 3 gerekir). Görselleri indirmek için: `python3 tools/gorselleri_indir.py`
