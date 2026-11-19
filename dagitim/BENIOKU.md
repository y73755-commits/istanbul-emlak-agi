# Yayın dalları

`build.yml` sayfaları ürettikten sonra üç dalı kendiliğinden günceller:

| Dal | Kim yayınlar | Adres | İçerik |
|---|---|---|---|
| `worker` | Cloudflare Workers Builds (`istanbul-emlak-agi` Worker'ı) | **https://istanbul-emlak-agi.y73755.workers.dev** (asıl adres) | `wrangler.jsonc` + `public/` (site, `_headers`) |
| `yayin` | Cloudflare Pages | https://istanbul-emlak-agi.pages.dev | Site + `_redirects` → her istek asıl adrese 301 |
| `github-yonlendirme` | GitHub Pages | https://y73755-commits.github.io/istanbul-emlak-agi/ | Yalnızca yönlendirme sayfaları (site GitHub'da barındırılmaz) |

GitHub Pages'in kullanım koşulları ticari işlemlere aracılık eden siteleri kabul etmediği için site GitHub Pages'te barındırılmaz.
Cloudflare'ın ücretsiz planı işletme kullanımına açıktır; Workers'ta statik dosya istekleri ücretsiz ve sınırsızdır.
