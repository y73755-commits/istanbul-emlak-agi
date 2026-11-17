-- =====================================================================
-- İstanbul Emlak Ağı — İleti Merkezi SMS bağlantısı (4/4)
-- 1) SMS doğrulama kodları (Supabase "Send SMS" kancası)
-- 2) Üyelik bitişine 3 gün kala SMS hatırlatması
-- API Key ve API Hash, Supabase Vault'ta saklanır (bu dosyada yoktur):
--   select vault.create_secret('<API KEY>',  'iletimerkezi_key');
--   select vault.create_secret('<API HASH>', 'iletimerkezi_hash');
-- Onaylı SMS başlığı: ayarlar tablosunda 'sms' → {"baslik": "..."}
-- =====================================================================
create extension if not exists pg_net with schema extensions;

insert into public.ayarlar (anahtar, deger) values ('sms', '{"baslik": "APITEST"}'::jsonb)
on conflict (anahtar) do nothing;

create table if not exists public.sms_kayitlari (
  id        bigint generated always as identity primary key,
  telefon   text not null,
  tur       text not null,
  istek_id  bigint,
  hata      text,
  zaman     timestamptz not null default now()
);
alter table public.sms_kayitlari enable row level security;
create policy sms_kayit_yonetici on public.sms_kayitlari for select using (public.yonetici_mi());
grant select on public.sms_kayitlari to authenticated;

create table if not exists public.hatirlatmalar (
  uyelik_id bigint primary key references public.uyelikler(id) on delete cascade,
  zaman     timestamptz not null default now()
);
alter table public.hatirlatmalar enable row level security;
create policy hatirlatma_yonetici on public.hatirlatmalar for select using (public.yonetici_mi());
grant select on public.hatirlatmalar to authenticated;

-- İç kullanım: SMS gönderir (kullanıcılar çağıramaz)
create or replace function public.sms_gonder(p_telefon text, p_metin text, p_tur text) returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_key text; v_hash text; v_baslik text; v_id bigint;
begin
  select decrypted_secret into v_key  from vault.decrypted_secrets where name = 'iletimerkezi_key';
  select decrypted_secret into v_hash from vault.decrypted_secrets where name = 'iletimerkezi_hash';
  v_baslik := coalesce(public.ayar('sms') ->> 'baslik', 'APITEST');
  if v_key is null or v_hash is null then
    insert into public.sms_kayitlari (telefon, tur, hata) values (p_telefon, p_tur, 'İleti Merkezi anahtarları girilmemiş');
    return null;
  end if;
  select net.http_post(
    url := 'https://api.iletimerkezi.com/v1/send-sms/json',
    body := jsonb_build_object('request', jsonb_build_object(
      'authentication', jsonb_build_object('key', v_key, 'hash', v_hash),
      'order', jsonb_build_object('sender', v_baslik, 'iys', '0',
        'message', jsonb_build_object('text', p_metin, 'receipents', jsonb_build_object('number', jsonb_build_array(p_telefon)))))),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000) into v_id;
  insert into public.sms_kayitlari (telefon, tur, istek_id) values (p_telefon, p_tur, v_id);
  return v_id;
end $$;
revoke execute on function public.sms_gonder(text, text, text) from public, anon, authenticated;

-- Supabase Auth → "Send SMS" kancası (Postgres fonksiyonu)
create or replace function public.sms_dogrulama_kancasi(event jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_tel text := event -> 'user' ->> 'phone'; v_otp text := event -> 'sms' ->> 'otp'; v_id bigint;
begin
  v_id := public.sms_gonder(v_tel, 'İstanbul Emlak Ağı doğrulama kodunuz: ' || v_otp || '. Bu kodu kimseyle paylaşmayın.', 'dogrulama');
  if v_id is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 503, 'message', 'SMS servisi henüz bağlı değil.'));
  end if;
  return '{}'::jsonb;
end $$;
revoke execute on function public.sms_dogrulama_kancasi(jsonb) from public, anon, authenticated;
grant execute on function public.sms_dogrulama_kancasi(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- Üyelik bitişine 3 gün kala hatırlatma (her gün 07:05 UTC = 10:05 TR)
create or replace function public.uyelik_hatirlatmalari() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in
    select u.id, u.bitis, p.telefon, p.ad_soyad from public.uyelikler u join public.profiller p on p.id = u.emlakci_id
    where u.durum = 'aktif' and u.bitis > now() + interval '2 days' and u.bitis <= now() + interval '3 days'
      and public.aktif_uyelik_bitis(u.emlakci_id) = u.bitis
      and not exists (select 1 from public.hatirlatmalar h where h.uyelik_id = u.id)
      and p.telefon is not null
  loop
    perform public.sms_gonder(r.telefon,
      'İstanbul Emlak Ağı: Üyeliğiniz ' || to_char(r.bitis at time zone 'Europe/Istanbul', 'DD.MM.YYYY') ||
      ' tarihinde sona eriyor. Uzatmak için WhatsApp: ' || coalesce(public.ayar('whatsapp') ->> 'gosterim', ''), 'hatirlatma');
    insert into public.hatirlatmalar (uyelik_id) values (r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.uyelik_hatirlatmalari() from public, anon, authenticated;

select cron.schedule('uyelik-hatirlat', '5 7 * * *', $$select public.uyelik_hatirlatmalari()$$);
