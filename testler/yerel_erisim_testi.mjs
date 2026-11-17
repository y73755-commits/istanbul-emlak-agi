import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const root = process.argv[2];
const db = new PGlite();
const ok = (m) => console.log('  ✔ ' + m);
const bad = (m) => { console.log('  ✘ ' + m); process.exitCode = 1; };
async function exec(sql) { return db.exec(sql); }

// --- Supabase ortamının küçük bir taklidi
await exec(`
create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), phone text, email text, phone_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
`);
await exec(fs.readFileSync(root + '/supabase/001_sema.sql', 'utf8'));
await exec(fs.readFileSync(root + '/supabase/002_baslangic_verileri.sql', 'utf8'));
console.log('Şema ve başlangıç verileri yüklendi.');

const users = {};
async function mkUser(name, phone, confirmed = true) {
  const r = await db.query(`insert into auth.users (phone, phone_confirmed_at) values ($1, ${confirmed ? 'now()' : 'null'}) returning id`, [phone]);
  users[name] = r.rows[0].id; return users[name];
}
async function as(name, fn, aal = 'aal1') {
  await exec('reset role');
  if (name === 'anon') { await exec(`set request.jwt.claims = '{"role":"anon"}'; set role anon;`); }
  else { await exec(`set request.jwt.claims = '${JSON.stringify({ sub: users[name], role: 'authenticated', aal })}'; set role authenticated;`); }
  try { return await fn(); } finally { await exec('reset role'); await exec(`set request.jwt.claims = ''`); }
}
async function q(sql, params) { return (await db.query(sql, params)).rows; }
async function expectErr(label, fn, re) {
  try { await fn(); bad(label + ' — hata bekleniyordu'); }
  catch (e) { if (!re || re.test(e.message)) ok(label + ' → engellendi (' + e.message.slice(0, 70) + ')'); else bad(label + ' — beklenmeyen hata: ' + e.message); }
}

await mkUser('vatandas', '905321112233');
await mkUser('vatandas2', '905321112244');
await mkUser('dogrulanmamis', '905329999999', false);
await mkUser('ucretli', '905551110001');
await mkUser('ucretsiz', '905551110002');
await mkUser('bekleyen', '905551110003');
await mkUser('yonetici', '905520928085');
await exec(`update public.profiller set rol='yonetici' where id='${users.yonetici}'`);
console.log('Kullanıcılar ve profiller (tetikleyiciyle):', (await q('select count(*)::int n from public.profiller'))[0].n);

const basvuru = (ad) => ({ ad_soyad: ad, ofis_adi: ad + ' Emlak', eposta: 'a@b.co', yetki_belge_no: '3400001', hizmet_ilceleri: ['Kadıköy', 'Şişli', 'Yok'] });
for (const n of ['ucretli', 'ucretsiz', 'bekleyen']) await as(n, () => q('select public.emlakci_basvur($1)', [basvuru(n)]));
const pb = await q(`select rol, durum, hizmet_ilceleri from public.profiller where id='${users.bekleyen}'`);
pb[0].durum === 'beklemede' && pb[0].hizmet_ilceleri.length === 2 ? ok('Emlakçı başvurusu beklemede, geçersiz ilçe ayıklandı') : bad('başvuru ' + JSON.stringify(pb));

console.log('\n1) Yönetici yetkisi ve iki adımlı doğrulama');
await expectErr('Yönetici aal1 ile onay', () => as('yonetici', () => q(`select public.admin_kullanici_durum('${users.ucretli}','onayli')`)), /iki adımlı/);
await expectErr('Vatandaş admin_ozet', () => as('vatandas', () => q('select public.admin_ozet()'), 'aal2'), /iki adımlı/);
await as('yonetici', async () => {
  await q(`select public.admin_kullanici_durum('${users.ucretli}','onayli')`);
  await q(`select public.admin_kullanici_durum('${users.ucretsiz}','onayli')`);
}, 'aal2');
ok('Yönetici (aal2) iki emlakçıyı onayladı');
await expectErr('Bekleyen emlakçıya üyelik', () => as('yonetici', () => q('select public.admin_uyelik_ekle($1)', [{ emlakci_id: users.bekleyen, paket_id: 'aylik' }]), 'aal2'), /onaylı/);
const uy = await as('yonetici', () => q('select public.admin_uyelik_ekle($1) r', [{ emlakci_id: users.ucretli, paket_id: 'aylik', tutar: '1000', odeme_tarihi: '2026-11-17' }]), 'aal2');
ok('Ücretli üyelik tanımlandı: ' + JSON.stringify(uy[0].r).slice(0, 90));

console.log('\n2) Talep oluşturma, spam ve doğrulama');
const talep = (o = {}) => ({ kategori: 'satilik-konut', tur: 'daire', islem: 'satilik', ilce: 'Kadıköy', mahalle: 'Göztepe', butce_min: '9000000', butce_max: '12000000', m2: '110', oda: '3+1', baslik: 'Göztepe 3+1 daire arıyorum', ozet: 'Metroya yakın, otoparklı', aciklama: 'Gizli tam açıklama: 2. kat ve üzeri', ad_soyad: 'Ayşe Vatandaş', riza: true, ...o });
await expectErr('Telefonu doğrulanmamış kullanıcı talep', () => as('dogrulanmamis', () => q('select public.talep_olustur($1)', [talep()])), /doğrulayın/);
await expectErr('Rıza olmadan talep', () => as('vatandas', () => q('select public.talep_olustur($1)', [talep({ riza: false })])), /onay/);
await expectErr('Geçersiz mahalle', () => as('vatandas', () => q('select public.talep_olustur($1)', [talep({ mahalle: 'Uydurma' })])), /mahalle/);
const t1 = (await as('vatandas', () => q('select public.talep_olustur($1) r', [talep()])))[0].r;
ok('Vatandaş talebi: ' + JSON.stringify(t1));
await expectErr('Aynı talep tekrar', () => as('vatandas', () => q('select public.talep_olustur($1)', [talep()])), /zaten açık/);
await as('vatandas', () => q('select public.talep_olustur($1)', [talep({ mahalle: 'Caferağa' })]));
await as('vatandas', () => q('select public.talep_olustur($1)', [talep({ mahalle: 'Osmanağa' })]));
await expectErr('Günlük 4. talep', () => as('vatandas', () => q('select public.talep_olustur($1)', [talep({ mahalle: 'Suadiye' })])), /sınır/);
await expectErr('Doğrudan tabloya ekleme', () => as('vatandas', () => q(`insert into public.talepler (tip,sahip_id,kategori,tur,islem,baslik,ozet) values ('vatandas','${users.vatandas}','diger','daire','satilik','Deneme talep','Deneme özet')`)), /permission/);
await expectErr('Kendi rolünü yönetici yapma', () => as('vatandas', () => q(`update public.profiller set rol='yonetici' where id='${users.vatandas}'`)), /permission/);
await as('vatandas', () => q(`update public.profiller set ad_soyad='Ayşe V.' where id='${users.vatandas}'`));
ok('Kullanıcı izinli alanını (ad) güncelleyebildi');

console.log('\n3) Yayın ve herkese açık özet');
let pub = await as('anon', () => q('select id, baslik from public.talepler'));
pub.length === 0 ? ok('İncelemedeki talep herkese görünmüyor') : bad('incelemedeki talep görünüyor');
await as('yonetici', () => q(`select public.admin_talep_durum(${t1.id}, 'yayinda')`), 'aal2');
pub = await as('anon', () => q('select id, no, baslik, ozet, ilce, mahalle, butce_min from public.talepler'));
pub.length === 1 ? ok('Yayındaki talep özeti herkese açık: ' + JSON.stringify(pub[0])) : bad('yayın görünmüyor');
await expectErr('Ziyaretçi sahip_id okuma', () => as('anon', () => q('select sahip_id from public.talepler')), /permission/);
await expectErr('Ziyaretçi gizli tablo okuma', () => as('anon', () => q('select * from public.talep_detaylari')), /permission/);
await expectErr('Ziyaretçi talep_detay', () => as('anon', () => q(`select public.talep_detay(${t1.id})`)), /permission|giriş/i);
const gizliUcretsiz = await as('ucretsiz', () => q('select * from public.talep_detaylari'));
gizliUcretsiz.length === 0 ? ok('Onaylı ama ücretsiz emlakçı gizli tabloda 0 satır görüyor') : bad('ücretsiz gizliyi görüyor');

console.log('\n4) Ücretli erişim kuralı');
await expectErr('Ücretli üye — ücretli erişim kapalıyken', () => as('ucretli', () => q(`select public.talep_detay(${t1.id})`)), /ücretli/);
await as('yonetici', () => q(`select public.admin_ayar_kaydet('ucretli_erisim_aktif', 'true'::jsonb)`), 'aal2');
const det = await as('ucretli', () => q(`select public.talep_detay(${t1.id}) r`));
det[0].r.telefon === '905321112233' ? ok('Ücretli aktif üye detay + telefon aldı: ' + JSON.stringify(det[0].r)) : bad('detay ' + JSON.stringify(det));
await expectErr('Ücretsiz onaylı emlakçı', () => as('ucretsiz', () => q(`select public.talep_detay(${t1.id})`)), /ücretli/);
await expectErr('Onay bekleyen emlakçı', () => as('bekleyen', () => q(`select public.talep_detay(${t1.id})`)), /ücretli/);
await expectErr('Başka vatandaş', () => as('vatandas2', () => q(`select public.talep_detay(${t1.id})`)), /ücretli/);
const log = await q(`select count(*)::int n from public.goruntulemeler where talep_id=${t1.id} and emlakci_id='${users.ucretli}'`);
log[0].n === 1 ? ok('Görüntüleme kaydı tutuldu (kim/hangi talep/ne zaman)') : bad('log yok');
const kendi = await as('vatandas', () => q(`select public.talep_detay(${t1.id}) r`));
kendi[0].r.aciklama ? ok('Talep sahibi kendi detayını görüyor (kayıt tutulmadan)') : bad('sahip göremiyor');

console.log('\n5) Üyelik süresi bitince erişim otomatik kapanır');
await exec(`update public.uyelikler set baslangic = now() - interval '40 days', bitis = now() - interval '1 minute' where emlakci_id='${users.ucretli}'`);
await expectErr('Süresi dolmuş üye', () => as('ucretli', () => q(`select public.talep_detay(${t1.id})`)), /ücretli/);
const pr = await as('ucretli', () => q('select public.profilim() r'));
pr[0].r.uyelik_bitis === null ? ok('profilim(): aktif üyelik yok olarak görünüyor') : bad('profilim ' + JSON.stringify(pr[0].r));
await as('yonetici', () => q('select public.admin_uyelik_ekle($1)', [{ emlakci_id: users.ucretli, paket_id: 'yillik' }]), 'aal2');
const pr2 = await as('ucretli', () => q('select public.profilim() r'));
pr2[0].r.kalan_gun >= 364 ? ok('Yıllık paket tanımlandı, kalan gün: ' + pr2[0].r.kalan_gun) : bad('kalan ' + pr2[0].r.kalan_gun);
const hareket = await q(`select count(*)::int n from public.uyelik_hareketleri where emlakci_id='${users.ucretli}'`);
hareket[0].n === 2 ? ok('Üyelik hareket geçmişi tutuluyor (2 kayıt)') : bad('hareket ' + hareket[0].n);

console.log('\n6) Emlakçılar arası iş birliği (ücretsiz)');
await expectErr('Vatandaş emlakçı kategorisiyle', () => as('vatandas2', () => q('select public.talep_olustur($1)', [talep({ kategori: 'alici' })])), /Geçersiz/);
await expectErr('Onay bekleyen emlakçı paylaşım', () => as('bekleyen', () => q('select public.talep_olustur($1)', [talep({ kategori: 'alici' })])), /onaylanması/);
const e1 = (await as('ucretli', () => q('select public.talep_olustur($1) r', [talep({ kategori: 'alici', ilce: null, mahalle: null, riza: true })])))[0].r;
await as('yonetici', () => q(`select public.admin_talep_durum(${e1.id}, 'yayinda')`), 'aal2');
const ed = await as('ucretsiz', () => q(`select public.talep_detay(${e1.id}) r`));
ed[0].r.ofis_adi ? ok('Ücretsiz onaylı emlakçı iş birliği detayını görüyor: ' + JSON.stringify(ed[0].r)) : bad('ed');
await expectErr('Vatandaş iş birliği detayı', () => as('vatandas', () => q(`select public.talep_detay(${e1.id})`)), /ücretli/);

console.log('\n7) Talep kapatma, şikâyet, favori, arşiv, silme');
await as('anon', () => q(`select public.sikayet_et(${t1.id}, 'Sahte talep', 'deneme')`));
ok('Ziyaretçi şikâyet bırakabildi');
await as('ucretsiz', () => q(`insert into public.favoriler (kullanici_id, talep_id) values ('${users.ucretsiz}', ${t1.id})`));
await expectErr('Başkası adına favori', () => as('ucretsiz', () => q(`insert into public.favoriler (kullanici_id, talep_id) values ('${users.ucretli}', ${t1.id})`)), /row-level security/);
const oz = (await as('yonetici', () => q('select public.admin_ozet() r'), 'aal2'))[0].r;
ok('Yönetici özeti: ' + JSON.stringify(oz));
await exec(`update public.talepler set yayin_bitis = now() - interval '1 second' where id=${e1.id}`);
pub = await as('anon', () => q('select no from public.talepler'));
pub.length === 1 ? ok('Süresi dolan talep listeden hemen kalktı') : bad('süre dolan görünüyor');
const ar = await q('select public.talepleri_arsivle() n');
ar[0].n === 1 ? ok('Gece arşiv görevi süresi dolan 1 talebi arşivledi') : bad('arşiv ' + ar[0].n);
await as('vatandas', () => q(`select public.talep_kapat(${t1.id}, 'sonuclandi')`));
pub = await as('anon', () => q('select no from public.talepler'));
pub.length === 0 ? ok('Sonuçlandı yapılan talep yayından kalktı') : bad('kapanan görünüyor');
const mine = (await as('vatandas', () => q('select public.taleplerim() r')))[0].r;
ok('Vatandaş panelinde ' + mine.length + ' talep, ilkinin görüntülenmesi: ' + mine.find(x => x.id === t1.id).goruntulenme);
await as('vatandas2', () => q('select public.hesabimi_sil()'));
const kalan = await q(`select count(*)::int n from auth.users where id='${users.vatandas2}'`);
kalan[0].n === 0 ? ok('Hesap ve verileri silindi (KVKK)') : bad('hesap silinmedi');
await expectErr('Yönetici kendini engelleme', () => as('yonetici', () => q(`select public.admin_kullanici_durum('${users.yonetici}','engelli')`), 'aal2'), /Yönetici/);
await expectErr('Anon fonksiyon (profilim)', () => as('anon', () => q('select public.profilim()')), /permission/);
console.log(process.exitCode ? '\nBAZI TESTLER BAŞARISIZ' : '\nTÜM TESTLER GEÇTİ');
