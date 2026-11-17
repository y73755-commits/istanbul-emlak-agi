# Supabase ve servis ayarları (yapılandırma kaydı)

Bu dosya, panelden yapılan ve veritabanı yedeğinde yer almayan ayarların kaydıdır. Yeni bir projeye taşırken veya geri yüklerken bu listeyi izleyin. Gizli değerler (şifre, anahtar, client secret) burada **yazılmaz**.

## Supabase projesi
- Ad: istanbul-emlak-agi · Bölge: Frankfurt (eu-central-1) · Plan: Free (0 TL)
- Veritabanı kurulumu, sırasıyla: `001_sema.sql`, `002_baslangic_verileri.sql`, `003_zamanlanmis_gorevler.sql`, `004_sms_iletimerkezi.sql` (yalnızca tablolar için; SMS kısmı 005 ile kaldırıldı), `005_ucretsiz_giris.sql`
- Zamanlanmış görevler (pg_cron): `talep-arsivle` her gece 03:15 UTC, `uyelik-hatirlat` her gün 07:05 UTC (yalnızca işaretler, SMS göndermez)
- Dosya deposu: `profil` (herkese açık, en fazla 2 MB, jpeg/png/webp; her kullanıcı yalnızca kendi klasörüne yazar)

## Authentication
- **Sign In / Providers**
  - Google: **açık**. Client ID ve Client Secret, Google Cloud Console > APIs & Services > Credentials'taki "İstanbul Emlak Ağı" OAuth istemcisinden girilir.
  - Phone: **kapalı** (ücretli SMS kullanılmıyor). Test numarası tanımlı değil.
  - Email: e-posta ile kayıt **kapalı** tutulur (Supabase'in varsayılan e-posta hizmeti genel kullanıma uygun değil). Gerekirse yalnızca yönetici, panelden "Add user" ile e-posta hesabı açabilir.
- **URL Configuration**
  - Site URL: sitenin yayın adresi (şu an Cloudflare Pages adresi; alan adı alınınca o adres)
  - Redirect URLs: `<site adresi>/**` (ör. `https://istanbul-emlak-agi.pages.dev/**`)
- **Hooks**: yok (SMS kancası kaldırıldı)
- **Multi-Factor**: TOTP açık (yönetici girişinde zorunlu, `yonetici_mi()` aal2 ister)

## Google Cloud (OAuth istemcisi)
- Proje: İstanbul Emlak Ağı · OAuth consent screen: External, yayın durumu "In production"
- Kapsamlar: yalnızca `openid`, `email`, `profile` (Google doğrulaması gerektirmez)
- Authorized JavaScript origins: site adresi
- Authorized redirect URIs: `https://nmfttzejqkigcxdmwydt.supabase.co/auth/v1/callback`

## Yayın (Cloudflare Pages Free)
- Proje Git deposuna bağlıdır; **production branch: `yayin`**, build command: boş, output directory: `/`
- `yayin` dalı GitHub Actions ("Siteyi oluştur") tarafından otomatik güncellenir; kaynak kod `main` dalındadır.
- Yanıt başlıkları ve önbellek süreleri: depo kökündeki `_headers`

## GitHub Actions gizli değerleri (Settings > Secrets and variables > Actions)
- `SUPABASE_DB_URL`: Supabase > Connect > Session pooler adresi (veritabanı şifresiyle)
- `YEDEK_PAROLASI`: yedek şifreleme parolası (yalnızca sahibinde)

## Yönetici
- Yönetici yetkisi depo dosyalarında değil, veritabanında `profiller.rol = 'yonetici'` olarak tutulur.
- Yeni yönetici: kişi sitede bir kez Google ile giriş yapar, ardından SQL Editor'da
  `update public.profiller set rol = 'yonetici', durum = 'aktif' where eposta = '<e-posta>';`
  İlk panel girişinde telefondaki doğrulama uygulamasına QR okutulur.
