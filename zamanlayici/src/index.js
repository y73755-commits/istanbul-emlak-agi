// İstanbul Emlak Ağı — ücretsiz zamanlayıcı (Cloudflare Workers Free)
// 1) Her çalışmada Supabase'e küçük bir okuma isteği gönderir (ücretsiz projenin duraklamasına karşı).
// 2) Gece çalışmasında GitHub'daki "Veritabanı yedeği" ve "Siteyi oluştur" iş akışlarını başlatır.
//    Bunun için GITHUB_TOKEN gizli değeri gerekir: yalnızca bu depo, yalnızca "Actions: Read and write" izni.
const SB_URL = "https://nmfttzejqkigcxdmwydt.supabase.co";
const SB_KEY = "sb_publishable_LbvZg4J7o-MAsazXJBPZug_r8n2_Bqy"; // herkese açık anahtar, gizli değildir
const REPO = "y73755-commits/istanbul-emlak-agi";
const GECE = "41 0 * * *";
const DENEME = "35 9 18 11 *"; // tek seferlik kabul denemesi, sonra silinecek

async function canliTut() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/paketler?select=id&limit=1`, { headers: { apikey: SB_KEY } });
    return `supabase ${r.status}`;
  } catch (e) {
    return `supabase hata: ${e.message}`;
  }
}

async function isAkisi(env, dosya) {
  if (!env.GITHUB_TOKEN) return `${dosya}: GITHUB_TOKEN tanımlı değil`;
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${dosya}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "iea-zamanlayici",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { kaynak: "cloudflare-zamanlayici" } }),
  });
  return `${dosya}: ${r.status === 204 ? "başlatıldı" : "hata " + r.status + " " + (await r.text()).slice(0, 200)}`;
}

export default {
  async scheduled(event, env, ctx) {
    const sonuc = [await canliTut()];
    if (event.cron === GECE || event.cron === DENEME) {
      sonuc.push(await isAkisi(env, "yedek.yml"));
      sonuc.push(await isAkisi(env, "build.yml"));
    }
    console.log(`[${event.cron}] ${sonuc.join(" | ")}`);
  },
  async fetch() {
    return new Response("İstanbul Emlak Ağı zamanlayıcısı çalışıyor.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
