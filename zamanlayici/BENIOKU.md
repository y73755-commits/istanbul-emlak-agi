# Ücretsiz zamanlayıcı (Cloudflare Workers)

GitHub'ın zamanlanmış iş akışları yeni depolarda gecikebildiği için gece işleri buradan da başlatılır.

- **Ne yapar:** Her gün 03:41 (Türkiye) GitHub'daki "Veritabanı yedeği", "Siteyi oluştur" ve "Veritabanını canlı tut" iş akışlarını başlatır, Supabase'e küçük bir okuma isteği gönderir. 15:24'te yalnızca Supabase isteği gönderir.
- **Maliyet:** Cloudflare Workers Free (günde 100.000 istek; bu Worker günde 2 kez çalışır). 0 TL.
- **Kurulum:** Cloudflare > Workers & Pages > iea-zamanlayici, bu klasöre bağlıdır (Workers Builds). `main` dalına gelen değişiklikle kendiliğinden yeniden yayınlanır.
- **Gizli değer:** `GITHUB_TOKEN` (Worker > Settings > Variables and Secrets, tür: Secret). Yalnızca `istanbul-emlak-agi` deposu, yalnızca **Actions: Read and write** izni (Metadata: Read otomatik gelir). Süresi dolarsa aynı izinlerle yenisi oluşturulup bu gizli değer güncellenir.
- **Kayıtlar:** Worker > Observability > Logs, her çalışmada `[cron] supabase 200 | yedek.yml: başlatıldı | build.yml: başlatıldı | canli-tut.yml: başlatıldı` satırı yazar.
- **Süre:** Anahtar 18.11.2027'de dolar. Yenilemek için GitHub > Settings > Developer settings > Fine-grained tokens > iea-zamanlayici > Regenerate token; yeni değeri Worker'daki `GITHUB_TOKEN` gizli değerine yapıştırın.
- **Kontrol:** GitHub > Actions'ta çalışma adı "(cloudflare-zamanlayici)" ile biter. Elle başlatılanlar "(elle)" yazar.
