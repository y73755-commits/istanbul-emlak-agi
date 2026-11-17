-- =====================================================================
-- İstanbul Emlak Ağı — veritabanı şeması (1/4)
-- Tablolar, erişim kuralları (RLS) ve sunucu fonksiyonları.
-- Supabase SQL Editor'de bir kez çalıştırılır.
-- Gizlilik kuralı: vatandaşın adı, telefonu ve tam açıklaması ayrı
-- tabloda (talep_detaylari) tutulur; bu tabloya doğrudan erişim yoktur.
-- Yalnızca talep_detay() fonksiyonu, yetkiyi sunucuda kontrol edip
-- görüntülemeyi kaydederek verir.
-- =====================================================================

-- Fonksiyonlar varsayılan olarak herkese açık olmasın
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- TABLOLAR
-- ---------------------------------------------------------------------
create table public.ayarlar (
  anahtar    text primary key,
  deger      jsonb not null,
  guncelleme timestamptz not null default now()
);

create table public.ilceler (
  ad   text primary key,
  slug text not null unique,
  yaka text not null check (yaka in ('Avrupa Yakası', 'Anadolu Yakası'))
);

create table public.mahalleler (
  id    bigint generated always as identity primary key,
  ilce  text not null references public.ilceler(ad) on update cascade on delete cascade,
  ad    text not null check (char_length(ad) between 2 and 80),
  aktif boolean not null default true,
  unique (ilce, ad)
);

create table public.profiller (
  id              uuid primary key references auth.users(id) on delete cascade,
  rol             text not null default 'vatandas' check (rol in ('vatandas', 'emlakci', 'yonetici')),
  durum           text not null default 'aktif' check (durum in ('aktif', 'beklemede', 'onayli', 'reddedildi', 'engelli')),
  ad_soyad        text check (char_length(ad_soyad) <= 80),
  telefon         text,
  eposta          text check (char_length(eposta) <= 120),
  ofis_adi        text check (char_length(ofis_adi) <= 100),
  yetki_belge_no  text check (char_length(yetki_belge_no) <= 30),
  hizmet_ilceleri text[] not null default '{}',
  foto_url        text,
  red_nedeni      text,
  onay_tarihi     timestamptz,
  basvuru_tarihi  timestamptz,
  olusturma       timestamptz not null default now(),
  guncelleme      timestamptz not null default now()
);
create index on public.profiller (rol, durum);

create table public.paketler (
  id          text primary key,
  ad          text not null,
  sure_gun    int  not null check (sure_gun > 0),
  fiyat       numeric(12, 2),
  aciklama    text,
  aktif       boolean not null default true,
  one_cikan   boolean not null default false,
  sira        int not null default 0
);

create table public.uyelikler (
  id            bigint generated always as identity primary key,
  emlakci_id    uuid not null references public.profiller(id) on delete cascade,
  paket_id      text references public.paketler(id) on delete set null,
  baslangic     timestamptz not null,
  bitis         timestamptz not null,
  durum         text not null default 'aktif' check (durum in ('aktif', 'iptal')),
  tutar         numeric(12, 2),
  odeme_tarihi  date,
  odeme_durumu  text not null default 'odendi' check (odeme_durumu in ('bekliyor', 'odendi')),
  notlar        text,
  olusturan     uuid,
  olusturma     timestamptz not null default now(),
  check (bitis > baslangic)
);
create index on public.uyelikler (emlakci_id, bitis);

create table public.uyelik_hareketleri (
  id          bigint generated always as identity primary key,
  uyelik_id   bigint references public.uyelikler(id) on delete set null,
  emlakci_id  uuid,
  islem       text not null,
  detay       jsonb,
  yapan       uuid,
  zaman       timestamptz not null default now()
);

create table public.talepler (
  id           bigint generated always as identity primary key,
  no           text unique,
  tip          text not null check (tip in ('vatandas', 'emlakci')),
  sahip_id     uuid not null references public.profiller(id) on delete cascade,
  kategori     text not null,
  tur          text not null,
  islem        text not null check (islem in ('satilik', 'kiralik', 'kat-karsiligi')),
  ilce         text references public.ilceler(ad) on update cascade,
  mahalle      text,
  butce_min    bigint check (butce_min >= 0),
  butce_max    bigint check (butce_max >= 0),
  m2           int check (m2 > 0 and m2 < 10000000),
  oda          text,
  baslik       text not null check (char_length(baslik) between 5 and 120),
  ozet         text not null check (char_length(ozet) between 5 and 220),
  durum        text not null default 'inceleniyor'
               check (durum in ('inceleniyor', 'yayinda', 'sonuclandi', 'iptal', 'arsiv', 'reddedildi')),
  red_nedeni   text,
  yayin_tarihi timestamptz,
  yayin_bitis  timestamptz,
  olusturma    timestamptz not null default now(),
  guncelleme   timestamptz not null default now()
);
create index on public.talepler (durum, yayin_bitis);
create index on public.talepler (sahip_id);
create index on public.talepler (ilce);

create table public.talep_detaylari (
  talep_id    bigint primary key references public.talepler(id) on delete cascade,
  aciklama    text not null check (char_length(aciklama) <= 2000),
  ad_soyad    text not null,
  telefon     text not null
);

create table public.goruntulemeler (
  id         bigint generated always as identity primary key,
  emlakci_id uuid not null,
  talep_id   bigint not null references public.talepler(id) on delete cascade,
  zaman      timestamptz not null default now()
);
create index on public.goruntulemeler (talep_id);
create index on public.goruntulemeler (emlakci_id);

create table public.favoriler (
  kullanici_id uuid not null references public.profiller(id) on delete cascade,
  talep_id     bigint not null references public.talepler(id) on delete cascade,
  zaman        timestamptz not null default now(),
  primary key (kullanici_id, talep_id)
);

create table public.sikayetler (
  id           bigint generated always as identity primary key,
  talep_id     bigint references public.talepler(id) on delete cascade,
  sikayet_eden uuid,
  neden        text not null check (char_length(neden) between 2 and 60),
  aciklama     text check (char_length(aciklama) <= 600),
  durum        text not null default 'acik' check (durum in ('acik', 'incelendi')),
  zaman        timestamptz not null default now()
);

create table public.rizalar (
  id           bigint generated always as identity primary key,
  kullanici_id uuid not null,
  talep_id     bigint,
  tur          text not null,
  metin        text not null,
  zaman        timestamptz not null default now()
);

create table public.yonetici_kayitlari (
  id     bigint generated always as identity primary key,
  yapan  uuid,
  islem  text not null,
  hedef  text,
  detay  jsonb,
  zaman  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.ayarlar            enable row level security;
alter table public.ilceler            enable row level security;
alter table public.mahalleler         enable row level security;
alter table public.profiller          enable row level security;
alter table public.paketler           enable row level security;
alter table public.uyelikler          enable row level security;
alter table public.uyelik_hareketleri enable row level security;
alter table public.talepler           enable row level security;
alter table public.talep_detaylari    enable row level security;
alter table public.goruntulemeler     enable row level security;
alter table public.favoriler          enable row level security;
alter table public.sikayetler         enable row level security;
alter table public.rizalar            enable row level security;
alter table public.yonetici_kayitlari enable row level security;

-- ---------------------------------------------------------------------
-- YARDIMCI FONKSİYONLAR
-- ---------------------------------------------------------------------
create or replace function public.yonetici_mi() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiller p
                 where p.id = auth.uid() and p.rol = 'yonetici' and p.durum <> 'engelli')
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.ayar(p_anahtar text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select deger from public.ayarlar where anahtar = p_anahtar;
$$;

create or replace function public.ayar_bool(p_anahtar text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select deger from public.ayarlar where anahtar = p_anahtar)::text = 'true', false);
$$;

create or replace function public.aktif_uyelik_bitis(p_uid uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select max(u.bitis) from public.uyelikler u
  where u.emlakci_id = p_uid and u.durum = 'aktif' and u.baslangic <= now() and u.bitis > now();
$$;

create or replace function public.onayli_emlakci_mi(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiller where id = p_uid and rol = 'emlakci' and durum = 'onayli');
$$;

create or replace function public.talep_sahibi_mi(p_talep bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.talepler where id = p_talep and sahip_id = auth.uid());
$$;

create or replace function public.yonetici_kaydet(p_islem text, p_hedef text, p_detay jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.yonetici_kayitlari (yapan, islem, hedef, detay) values (auth.uid(), p_islem, p_hedef, p_detay);
$$;

create or replace function public._yonetici_gerekli() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.yonetici_mi() then
    raise exception 'Bu işlem için iki adımlı doğrulamayla yönetici girişi gerekir.' using errcode = '42501';
  end if;
end $$;

create or replace function public._metin(p jsonb, k text, maks int default 600) returns text
language sql immutable as $$
  select nullif(left(btrim(coalesce(p ->> k, '')), maks), '');
$$;

create or replace function public._sayi(p jsonb, k text) returns bigint
language sql immutable as $$
  select case when coalesce(p ->> k, '') ~ '^[0-9]{1,15}$' then (p ->> k)::bigint end;
$$;

-- ---------------------------------------------------------------------
-- YENİ KULLANICI → PROFİL
-- ---------------------------------------------------------------------
create or replace function public.auth_kullanici_olustu() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiller (id, telefon, eposta)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.auth_kullanici_guncellendi() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.phone is distinct from old.phone then
    update public.profiller set telefon = new.phone, guncelleme = now() where id = new.id;
  end if;
  return new;
end $$;

create trigger profil_olustur after insert on auth.users
  for each row execute function public.auth_kullanici_olustu();
create trigger profil_telefon after update of phone on auth.users
  for each row execute function public.auth_kullanici_guncellendi();

-- ---------------------------------------------------------------------
-- ERİŞİM KURALLARI (POLİTİKALAR)
-- ---------------------------------------------------------------------
create policy ayarlar_okuma on public.ayarlar for select using (true);
create policy ayarlar_yonetici on public.ayarlar for all using (public.yonetici_mi()) with check (public.yonetici_mi());

create policy ilceler_okuma on public.ilceler for select using (true);
create policy ilceler_yonetici on public.ilceler for all using (public.yonetici_mi()) with check (public.yonetici_mi());

create policy mahalleler_okuma on public.mahalleler for select using (aktif or public.yonetici_mi());
create policy mahalleler_yonetici on public.mahalleler for all using (public.yonetici_mi()) with check (public.yonetici_mi());

create policy paketler_okuma on public.paketler for select using (aktif or public.yonetici_mi());
create policy paketler_yonetici on public.paketler for all using (public.yonetici_mi()) with check (public.yonetici_mi());

create policy profil_kendi on public.profiller for select using (id = auth.uid() or public.yonetici_mi());
create policy profil_guncelle on public.profiller for update using (id = auth.uid()) with check (id = auth.uid());

create policy uyelik_kendi on public.uyelikler for select using (emlakci_id = auth.uid() or public.yonetici_mi());
create policy uyelik_hareket_okuma on public.uyelik_hareketleri for select using (emlakci_id = auth.uid() or public.yonetici_mi());

-- Herkes yalnızca yayındaki taleplerin ÖZETİNİ görür (sahip_id sütununa erişim yok, aşağıda)
create policy talep_ozet on public.talepler for select
  using ((durum = 'yayinda' and yayin_bitis > now()) or sahip_id = auth.uid() or public.yonetici_mi());

-- Gizli bilgiler: yalnızca talep sahibi ve yönetici doğrudan okur; emlakçılar talep_detay() ile
create policy detay_sahip on public.talep_detaylari for select
  using (public.yonetici_mi() or public.talep_sahibi_mi(talep_id));

create policy goruntuleme_yonetici on public.goruntulemeler for select using (public.yonetici_mi());

create policy favori_kendi on public.favoriler for all using (kullanici_id = auth.uid()) with check (kullanici_id = auth.uid());

create policy sikayet_yonetici on public.sikayetler for select using (public.yonetici_mi());

create policy riza_okuma on public.rizalar for select using (kullanici_id = auth.uid() or public.yonetici_mi());

create policy kayit_yonetici on public.yonetici_kayitlari for select using (public.yonetici_mi());

-- ---------------------------------------------------------------------
-- YETKİLER (Data API)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.ayarlar, public.ilceler, public.mahalleler, public.paketler to anon, authenticated;
grant insert, update, delete on public.ayarlar, public.mahalleler, public.paketler to authenticated;
grant select (id, no, tip, kategori, tur, islem, ilce, mahalle, butce_min, butce_max, m2, oda, baslik, ozet,
              durum, yayin_tarihi, yayin_bitis, olusturma, guncelleme)
  on public.talepler to anon, authenticated;
grant select on public.profiller, public.uyelikler, public.uyelik_hareketleri, public.talep_detaylari,
                public.goruntulemeler, public.sikayetler, public.rizalar, public.yonetici_kayitlari to authenticated;
grant update (ad_soyad, eposta, ofis_adi, hizmet_ilceleri, foto_url) on public.profiller to authenticated;
grant select, insert, delete on public.favoriler to authenticated;

-- ---------------------------------------------------------------------
-- KULLANICI FONKSİYONLARI
-- ---------------------------------------------------------------------

-- Giriş yapan kullanıcının profili, üyelik durumu ve kalan gün
create or replace function public.profilim() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.profiller; b timestamptz; telefon_onay boolean;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiller where id = auth.uid();
  if not found then return null; end if;
  b := public.aktif_uyelik_bitis(auth.uid());
  select phone_confirmed_at is not null into telefon_onay from auth.users where id = auth.uid();
  return jsonb_build_object(
    'id', p.id, 'rol', p.rol, 'durum', p.durum, 'ad_soyad', p.ad_soyad, 'telefon', p.telefon,
    'telefon_onayli', coalesce(telefon_onay, false), 'eposta', p.eposta, 'ofis_adi', p.ofis_adi,
    'yetki_belge_no', p.yetki_belge_no, 'hizmet_ilceleri', to_jsonb(p.hizmet_ilceleri), 'foto_url', p.foto_url,
    'red_nedeni', p.red_nedeni, 'uyelik_bitis', b,
    'kalan_gun', case when b is null then null else ceil(extract(epoch from (b - now())) / 86400)::int end,
    'ucretli_erisim_aktif', public.ayar_bool('ucretli_erisim_aktif'),
    'yonetici_aal2', public.yonetici_mi());
end $$;

-- Emlakçı başvurusu (telefonu SMS ile doğrulanmış kullanıcı)
create or replace function public.emlakci_basvur(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiller; ilceler text[];
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.'; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and phone_confirmed_at is not null) then
    raise exception 'Önce telefonunuzu SMS koduyla doğrulayın.';
  end if;
  select * into me from public.profiller where id = auth.uid() for update;
  if me.durum = 'engelli' then raise exception 'Hesabınız engellenmiş.'; end if;
  if me.rol = 'yonetici' then raise exception 'Yönetici hesabıyla başvuru yapılamaz.'; end if;
  if me.rol = 'emlakci' and me.durum = 'onayli' then raise exception 'Hesabınız zaten onaylı.'; end if;
  select coalesce(array_agg(x), '{}') into ilceler
    from jsonb_array_elements_text(coalesce(p -> 'hizmet_ilceleri', '[]')) x
    where x in (select ad from public.ilceler);
  if public._metin(p, 'ad_soyad', 80) is null or public._metin(p, 'ofis_adi', 100) is null
     or public._metin(p, 'yetki_belge_no', 30) is null or public._metin(p, 'eposta', 120) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(array_length(ilceler, 1), 0) = 0 then
    raise exception 'Lütfen tüm zorunlu alanları doldurun.';
  end if;
  update public.profiller set
    rol = 'emlakci', durum = 'beklemede', red_nedeni = null, basvuru_tarihi = now(),
    ad_soyad = public._metin(p, 'ad_soyad', 80), ofis_adi = public._metin(p, 'ofis_adi', 100),
    eposta = public._metin(p, 'eposta', 120), yetki_belge_no = public._metin(p, 'yetki_belge_no', 30),
    hizmet_ilceleri = ilceler, guncelleme = now()
  where id = auth.uid();
  insert into public.rizalar (kullanici_id, tur, metin)
  values (auth.uid(), 'emlakci_basvuru', coalesce(public._metin(p, 'riza_metni', 600), 'KVKK aydınlatma metni ve kullanım koşulları kabul edildi.'));
  return public.profilim();
end $$;

-- Talep oluşturma (vatandaş veya onaylı emlakçı)
create or replace function public.talep_olustur(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiller; v_tip text; v_id bigint; v_no text; v_durum text; gun int;
        v_ilce text; v_mah text; kat text;
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.'; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and phone_confirmed_at is not null) then
    raise exception 'Önce telefonunuzu SMS koduyla doğrulayın.';
  end if;
  select * into me from public.profiller where id = auth.uid();
  if me.durum = 'engelli' then raise exception 'Hesabınız engellenmiş.'; end if;
  v_tip := case when me.rol = 'emlakci' then 'emlakci' else 'vatandas' end;
  if v_tip = 'emlakci' and me.durum <> 'onayli' then
    raise exception 'İş birliği paylaşımı için emlakçı hesabınızın onaylanması gerekir.';
  end if;
  kat := public._metin(p, 'kategori', 40);
  if v_tip = 'vatandas' and kat not in ('satilik-konut','kiralik-konut','satilik-arsa','tarla','ofis-dukkan','villa','kat-karsiligi','satmak','kiraya-vermek','diger') then
    raise exception 'Geçersiz talep türü.';
  end if;
  if v_tip = 'emlakci' and kat not in ('satilik-portfoy','kiralik-portfoy','alici','kiraci','arsa-tarla','kat-karsiligi','ofis-dukkan','takas','portfoyum-var','diger') then
    raise exception 'Geçersiz paylaşım türü.';
  end if;
  if public._metin(p, 'tur', 20) not in ('daire','rezidans','villa','mustakil','arsa','tarla','ofis','dukkan','depo','bina','diger') then
    raise exception 'Geçersiz gayrimenkul türü.';
  end if;
  v_ilce := public._metin(p, 'ilce', 40);
  if v_ilce is not null and not exists (select 1 from public.ilceler where ad = v_ilce) then raise exception 'Geçersiz ilçe.'; end if;
  if v_tip = 'vatandas' and v_ilce is null then raise exception 'Lütfen ilçe seçin.'; end if;
  v_mah := public._metin(p, 'mahalle', 80);
  if v_mah is not null and not exists (select 1 from public.mahalleler where ilce = v_ilce and ad = v_mah and aktif) then
    raise exception 'Geçersiz mahalle.';
  end if;
  if public._metin(p, 'aciklama', 2000) is null then raise exception 'Lütfen açıklama yazın.'; end if;
  if public._metin(p, 'ad_soyad', 80) is null and me.ad_soyad is null then raise exception 'Lütfen adınızı yazın.'; end if;
  if v_tip = 'vatandas' and coalesce((p ->> 'riza')::boolean, false) is not true then
    raise exception 'İletişim bilgilerinizin paylaşımına onay vermeniz gerekir.';
  end if;

  -- Spam ve tekrar koruması
  if (select count(*) from public.talepler where sahip_id = auth.uid() and olusturma > now() - interval '24 hours')
       >= (case when v_tip = 'vatandas' then 3 else 20 end) then
    raise exception 'Bugün için talep sınırına ulaştınız. Lütfen yarın tekrar deneyin.';
  end if;
  if exists (select 1 from public.talepler where sahip_id = auth.uid() and durum in ('inceleniyor', 'yayinda')
             and kategori = kat and tur = p ->> 'tur' and coalesce(ilce, '') = coalesce(v_ilce, '')
             and coalesce(mahalle, '') = coalesce(v_mah, '')) then
    raise exception 'Aynı talep zaten açık. Mevcut talebinizi panelinizden düzenleyebilirsiniz.';
  end if;

  if me.ad_soyad is null then
    update public.profiller set ad_soyad = public._metin(p, 'ad_soyad', 80) where id = auth.uid();
  end if;

  gun := coalesce((public.ayar('talep_yayin_gun'))::text::int, 60);
  v_durum := case when public.ayar_bool('talep_otomatik_yayin') then 'yayinda' else 'inceleniyor' end;
  insert into public.talepler (tip, sahip_id, kategori, tur, islem, ilce, mahalle, butce_min, butce_max, m2, oda,
                               baslik, ozet, durum, yayin_tarihi, yayin_bitis)
  values (v_tip, auth.uid(), kat, p ->> 'tur', p ->> 'islem', v_ilce, v_mah,
          public._sayi(p, 'butce_min'), public._sayi(p, 'butce_max'), public._sayi(p, 'm2')::int,
          public._metin(p, 'oda', 20), public._metin(p, 'baslik', 120), public._metin(p, 'ozet', 220), v_durum,
          case when v_durum = 'yayinda' then now() end,
          case when v_durum = 'yayinda' then now() + make_interval(days => gun) end)
  returning id into v_id;
  v_no := case when v_tip = 'vatandas' then 'T-' else 'E-' end || (1000 + v_id);
  update public.talepler set no = v_no where id = v_id;
  insert into public.talep_detaylari (talep_id, aciklama, ad_soyad, telefon)
  values (v_id, public._metin(p, 'aciklama', 2000),
          case when v_tip = 'emlakci' then coalesce(me.ad_soyad, public._metin(p, 'ad_soyad', 80))
               else coalesce(public._metin(p, 'ad_soyad', 80), me.ad_soyad) end, me.telefon);
  insert into public.rizalar (kullanici_id, talep_id, tur, metin)
  values (auth.uid(), v_id, case when v_tip = 'vatandas' then 'vatandas_talep' else 'emlakci_paylasim' end,
          coalesce(public._metin(p, 'riza_metni', 600), 'Talep paylaşım onayı'));
  return jsonb_build_object('id', v_id, 'no', v_no, 'durum', v_durum);
end $$;

-- Sahibin kendi talepleri (gizli bilgileriyle)
create or replace function public.taleplerim() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t) - 'sahip_id' || jsonb_build_object(
           'aciklama', d.aciklama,
           'goruntulenme', (select count(*) from public.goruntulemeler g where g.talep_id = t.id))
         order by t.olusturma desc), '[]'::jsonb)
  from public.talepler t left join public.talep_detaylari d on d.talep_id = t.id
  where t.sahip_id = auth.uid();
$$;

-- Sahibin talebini düzenlemesi (yeniden incelemeye düşer)
create or replace function public.talep_guncelle(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.talepler; v_ilce text; v_mah text;
begin
  select * into t from public.talepler where id = p_id for update;
  if not found or t.sahip_id <> auth.uid() then raise exception 'Talep bulunamadı.'; end if;
  if t.durum not in ('inceleniyor', 'yayinda', 'reddedildi') then raise exception 'Kapatılmış talep düzenlenemez.'; end if;
  v_ilce := coalesce(public._metin(p, 'ilce', 40), t.ilce);
  if v_ilce is not null and not exists (select 1 from public.ilceler where ad = v_ilce) then raise exception 'Geçersiz ilçe.'; end if;
  v_mah := public._metin(p, 'mahalle', 80);
  if v_mah is not null and not exists (select 1 from public.mahalleler where ilce = v_ilce and ad = v_mah and aktif) then
    raise exception 'Geçersiz mahalle.';
  end if;
  update public.talepler set
    tur = coalesce(public._metin(p, 'tur', 20), tur), islem = coalesce(public._metin(p, 'islem', 20), islem),
    ilce = v_ilce, mahalle = v_mah,
    butce_min = public._sayi(p, 'butce_min'), butce_max = public._sayi(p, 'butce_max'),
    m2 = public._sayi(p, 'm2')::int, oda = public._metin(p, 'oda', 20),
    baslik = coalesce(public._metin(p, 'baslik', 120), baslik), ozet = coalesce(public._metin(p, 'ozet', 220), ozet),
    durum = case when public.ayar_bool('talep_otomatik_yayin') and durum = 'yayinda' then 'yayinda' else 'inceleniyor' end,
    red_nedeni = null, guncelleme = now()
  where id = p_id;
  update public.talep_detaylari set aciklama = coalesce(public._metin(p, 'aciklama', 2000), aciklama) where talep_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Sahibin talebini kapatması: sonuclandi / iptal
create or replace function public.talep_kapat(p_id bigint, p_durum text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_durum not in ('sonuclandi', 'iptal') then raise exception 'Geçersiz durum.'; end if;
  update public.talepler set durum = p_durum, guncelleme = now()
  where id = p_id and sahip_id = auth.uid() and durum in ('inceleniyor', 'yayinda');
  if not found then raise exception 'Talep bulunamadı veya zaten kapalı.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Sahibin talebini ve verilerini kalıcı olarak silmesi (KVKK)
create or replace function public.talep_sil(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.talepler where id = p_id and (sahip_id = auth.uid() or public.yonetici_mi());
  if not found then raise exception 'Talep bulunamadı.'; end if;
  if public.yonetici_mi() then perform public.yonetici_kaydet('talep_sil', p_id::text, null); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Hesabı ve tüm verileri silme (KVKK)
create or replace function public.hesabimi_sil() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.'; end if;
  if exists (select 1 from public.profiller where id = auth.uid() and rol = 'yonetici') then
    raise exception 'Yönetici hesabı buradan silinemez.';
  end if;
  delete from public.rizalar where kullanici_id = auth.uid();
  delete from auth.users where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- EN ÖNEMLİ KURAL: tam detay ve iletişim bilgisi yalnızca yetkili kullanıcıya, sunucudan
create or replace function public.talep_detay(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.talepler; d public.talep_detaylari; sahip public.profiller; ok boolean := false;
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.' using errcode = '42501'; end if;
  select * into t from public.talepler where id = p_id;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  if t.sahip_id = auth.uid() or public.yonetici_mi() then
    ok := true;
  elsif public.onayli_emlakci_mi(auth.uid()) and t.durum = 'yayinda' and t.yayin_bitis > now() then
    if t.tip = 'emlakci' then
      ok := true;
    else
      ok := public.ayar_bool('ucretli_erisim_aktif') and public.aktif_uyelik_bitis(auth.uid()) is not null;
    end if;
  end if;
  if not ok then
    raise exception 'Bu bilgiler yalnızca aktif ücretli üyeliği olan onaylı emlakçılara açıktır.' using errcode = '42501';
  end if;
  select * into d from public.talep_detaylari where talep_id = p_id;
  select * into sahip from public.profiller where id = t.sahip_id;
  if t.sahip_id <> auth.uid() then
    insert into public.goruntulemeler (emlakci_id, talep_id) values (auth.uid(), p_id);
  end if;
  return jsonb_build_object(
    'no', t.no, 'aciklama', d.aciklama, 'ad_soyad', d.ad_soyad, 'telefon', d.telefon,
    'ofis_adi', case when t.tip = 'emlakci' then sahip.ofis_adi end);
end $$;

-- Şikâyet (giriş gerekmez, kısa aralıklarla sınırlı)
create or replace function public.sikayet_et(p_talep bigint, p_neden text, p_aciklama text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.talepler where id = p_talep and durum = 'yayinda') then raise exception 'Talep bulunamadı.'; end if;
  if (select count(*) from public.sikayetler where talep_id = p_talep and zaman > now() - interval '1 hour') >= 10 then
    raise exception 'Bu talep için çok sayıda şikâyet alındı, inceleniyor.';
  end if;
  insert into public.sikayetler (talep_id, sikayet_eden, neden, aciklama)
  values (p_talep, auth.uid(), left(btrim(p_neden), 60), nullif(left(btrim(coalesce(p_aciklama, '')), 600), ''));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- YÖNETİCİ FONKSİYONLARI (rol = yonetici + iki adımlı doğrulama)
-- ---------------------------------------------------------------------
create or replace function public.admin_ozet() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  return jsonb_build_object(
    'vatandas', (select count(*) from public.profiller where rol = 'vatandas'),
    'emlakci', (select count(*) from public.profiller where rol = 'emlakci'),
    'onay_bekleyen', (select count(*) from public.profiller where rol = 'emlakci' and durum = 'beklemede'),
    'aktif_ucretli', (select count(distinct emlakci_id) from public.uyelikler where durum = 'aktif' and baslangic <= now() and bitis > now()),
    'suresi_biten', (select count(distinct u.emlakci_id) from public.uyelikler u where u.bitis <= now()
                      and public.aktif_uyelik_bitis(u.emlakci_id) is null),
    'yayindaki_vatandas', (select count(*) from public.talepler where tip = 'vatandas' and durum = 'yayinda' and yayin_bitis > now()),
    'yayindaki_emlakci', (select count(*) from public.talepler where tip = 'emlakci' and durum = 'yayinda' and yayin_bitis > now()),
    'incelenecek', (select count(*) from public.talepler where durum = 'inceleniyor'),
    'acik_sikayet', (select count(*) from public.sikayetler where durum = 'acik'),
    'ilce_dagilimi', (select coalesce(jsonb_object_agg(ilce, n), '{}') from
                       (select ilce, count(*) n from public.talepler where durum = 'yayinda' and yayin_bitis > now() and ilce is not null group by ilce) s));
end $$;

create or replace function public.admin_kullanicilar(p_arama text default null, p_rol text default null, p_durum text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  return coalesce((select jsonb_agg(x order by x ->> 'olusturma' desc) from (
    select to_jsonb(p) || jsonb_build_object(
      'uyelik_bitis', public.aktif_uyelik_bitis(p.id),
      'son_uyelik_bitis', (select max(bitis) from public.uyelikler u where u.emlakci_id = p.id and u.durum = 'aktif'),
      'talep_sayisi', (select count(*) from public.talepler t where t.sahip_id = p.id)) x
    from public.profiller p
    where (p_rol is null or p.rol = p_rol) and (p_durum is null or p.durum = p_durum)
      and (p_arama is null or p.ad_soyad ilike '%' || p_arama || '%' or p.telefon ilike '%' || p_arama || '%'
           or p.ofis_adi ilike '%' || p_arama || '%' or p.eposta ilike '%' || p_arama || '%')
    limit 500) s), '[]'::jsonb);
end $$;

create or replace function public.admin_kullanici_durum(p_id uuid, p_durum text, p_neden text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.profiller;
begin
  perform public._yonetici_gerekli();
  select * into p from public.profiller where id = p_id for update;
  if not found then raise exception 'Kullanıcı bulunamadı.'; end if;
  if p.rol = 'yonetici' then raise exception 'Yönetici hesabının durumu buradan değiştirilemez.'; end if;
  if p_durum not in ('aktif', 'onayli', 'reddedildi', 'engelli', 'beklemede') then raise exception 'Geçersiz durum.'; end if;
  if p_durum = 'onayli' and p.rol <> 'emlakci' then raise exception 'Yalnızca emlakçı hesapları onaylanır.'; end if;
  update public.profiller set durum = p_durum, red_nedeni = case when p_durum = 'reddedildi' then p_neden end,
         onay_tarihi = case when p_durum = 'onayli' then now() else onay_tarihi end, guncelleme = now()
  where id = p_id;
  if p_durum = 'engelli' then
    update public.talepler set durum = 'arsiv', guncelleme = now() where sahip_id = p_id and durum in ('inceleniyor', 'yayinda');
  end if;
  perform public.yonetici_kaydet('kullanici_durum', p_id::text, jsonb_build_object('durum', p_durum, 'neden', p_neden));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_kullanici_sil(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  if exists (select 1 from public.profiller where id = p_id and rol = 'yonetici') then raise exception 'Yönetici silinemez.'; end if;
  delete from public.rizalar where kullanici_id = p_id;
  delete from auth.users where id = p_id;
  perform public.yonetici_kaydet('kullanici_sil', p_id::text, null);
  return jsonb_build_object('ok', true);
end $$;

-- Üyelik tanımlama: bitiş verilmezse paket süresi; aktif üyelik varsa onun bitişinden itibaren uzatır
create or replace function public.admin_uyelik_ekle(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_emlakci uuid := (p ->> 'emlakci_id')::uuid; pk public.paketler; bas timestamptz; bit timestamptz; v_id bigint; mevcut timestamptz;
begin
  perform public._yonetici_gerekli();
  if not public.onayli_emlakci_mi(v_emlakci) then raise exception 'Üyelik yalnızca onaylı emlakçıya tanımlanır.'; end if;
  select * into pk from public.paketler where id = p ->> 'paket_id';
  if not found then raise exception 'Paket bulunamadı.'; end if;
  mevcut := public.aktif_uyelik_bitis(v_emlakci);
  bas := coalesce(nullif(p ->> 'baslangic', '')::timestamptz, greatest(now(), coalesce(mevcut, now())));
  bit := coalesce(nullif(p ->> 'bitis', '')::timestamptz, bas + make_interval(days => pk.sure_gun));
  insert into public.uyelikler (emlakci_id, paket_id, baslangic, bitis, tutar, odeme_tarihi, odeme_durumu, notlar, olusturan)
  values (v_emlakci, pk.id, bas, bit, nullif(p ->> 'tutar', '')::numeric, nullif(p ->> 'odeme_tarihi', '')::date,
          coalesce(nullif(p ->> 'odeme_durumu', ''), 'odendi'), public._metin(p, 'notlar', 500), auth.uid())
  returning id into v_id;
  insert into public.uyelik_hareketleri (uyelik_id, emlakci_id, islem, detay, yapan)
  values (v_id, v_emlakci, 'tanimlandi', p || jsonb_build_object('baslangic', bas, 'bitis', bit), auth.uid());
  return jsonb_build_object('id', v_id, 'baslangic', bas, 'bitis', bit);
end $$;

create or replace function public.admin_uyelik_guncelle(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.uyelikler;
begin
  perform public._yonetici_gerekli();
  select * into u from public.uyelikler where id = p_id for update;
  if not found then raise exception 'Üyelik bulunamadı.'; end if;
  update public.uyelikler set
    bitis = coalesce(nullif(p ->> 'bitis', '')::timestamptz, bitis),
    durum = coalesce(nullif(p ->> 'durum', ''), durum),
    tutar = case when p ? 'tutar' then nullif(p ->> 'tutar', '')::numeric else tutar end,
    odeme_tarihi = case when p ? 'odeme_tarihi' then nullif(p ->> 'odeme_tarihi', '')::date else odeme_tarihi end,
    odeme_durumu = coalesce(nullif(p ->> 'odeme_durumu', ''), odeme_durumu),
    notlar = case when p ? 'notlar' then public._metin(p, 'notlar', 500) else notlar end
  where id = p_id;
  insert into public.uyelik_hareketleri (uyelik_id, emlakci_id, islem, detay, yapan)
  values (p_id, u.emlakci_id, coalesce(nullif(p ->> 'islem', ''), 'guncellendi'), p, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_uyelikler(p_emlakci uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  return coalesce((select jsonb_agg(to_jsonb(u) || jsonb_build_object(
            'ad_soyad', p.ad_soyad, 'ofis_adi', p.ofis_adi, 'telefon', p.telefon, 'paket_ad', k.ad,
            'aktif_mi', (u.durum = 'aktif' and u.baslangic <= now() and u.bitis > now()))
          order by u.olusturma desc)
    from public.uyelikler u join public.profiller p on p.id = u.emlakci_id left join public.paketler k on k.id = u.paket_id
    where p_emlakci is null or u.emlakci_id = p_emlakci), '[]'::jsonb);
end $$;

create or replace function public.admin_talepler(p_durum text default null, p_tip text default null, p_arama text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  return coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object(
            'aciklama', d.aciklama, 'ad_soyad', d.ad_soyad, 'telefon', d.telefon, 'ofis_adi', p.ofis_adi,
            'sikayet', (select count(*) from public.sikayetler s where s.talep_id = t.id and s.durum = 'acik'),
            'goruntulenme', (select count(*) from public.goruntulemeler g where g.talep_id = t.id))
          order by t.olusturma desc)
    from public.talepler t left join public.talep_detaylari d on d.talep_id = t.id left join public.profiller p on p.id = t.sahip_id
    where (p_durum is null or t.durum = p_durum) and (p_tip is null or t.tip = p_tip)
      and (p_arama is null or t.baslik ilike '%' || p_arama || '%' or t.no ilike '%' || p_arama || '%'
           or d.ad_soyad ilike '%' || p_arama || '%' or d.telefon ilike '%' || p_arama || '%')), '[]'::jsonb);
end $$;

create or replace function public.admin_talep_durum(p_id bigint, p_durum text, p_neden text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare gun int := coalesce((public.ayar('talep_yayin_gun'))::text::int, 60);
begin
  perform public._yonetici_gerekli();
  if p_durum not in ('inceleniyor', 'yayinda', 'sonuclandi', 'iptal', 'arsiv', 'reddedildi') then raise exception 'Geçersiz durum.'; end if;
  update public.talepler set durum = p_durum, guncelleme = now(),
    red_nedeni = case when p_durum = 'reddedildi' then p_neden end,
    yayin_tarihi = case when p_durum = 'yayinda' then now() else yayin_tarihi end,
    yayin_bitis = case when p_durum = 'yayinda' then now() + make_interval(days => gun) else yayin_bitis end
  where id = p_id;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  perform public.yonetici_kaydet('talep_durum', p_id::text, jsonb_build_object('durum', p_durum, 'neden', p_neden));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_talep_guncelle(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  update public.talepler set
    kategori = coalesce(public._metin(p, 'kategori', 40), kategori), tur = coalesce(public._metin(p, 'tur', 20), tur),
    islem = coalesce(public._metin(p, 'islem', 20), islem),
    ilce = case when p ? 'ilce' then public._metin(p, 'ilce', 40) else ilce end,
    mahalle = case when p ? 'mahalle' then public._metin(p, 'mahalle', 80) else mahalle end,
    butce_min = case when p ? 'butce_min' then public._sayi(p, 'butce_min') else butce_min end,
    butce_max = case when p ? 'butce_max' then public._sayi(p, 'butce_max') else butce_max end,
    m2 = case when p ? 'm2' then public._sayi(p, 'm2')::int else m2 end,
    oda = case when p ? 'oda' then public._metin(p, 'oda', 20) else oda end,
    baslik = coalesce(public._metin(p, 'baslik', 120), baslik), ozet = coalesce(public._metin(p, 'ozet', 220), ozet),
    yayin_bitis = coalesce(nullif(p ->> 'yayin_bitis', '')::timestamptz, yayin_bitis),
    guncelleme = now()
  where id = p_id;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  if p ? 'aciklama' then
    update public.talep_detaylari set aciklama = coalesce(public._metin(p, 'aciklama', 2000), aciklama) where talep_id = p_id;
  end if;
  perform public.yonetici_kaydet('talep_duzenle', p_id::text, p);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_sikayetler() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  return coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('talep_no', t.no, 'talep_baslik', t.baslik, 'talep_durum', t.durum)
                   order by s.durum, s.zaman desc)
    from public.sikayetler s left join public.talepler t on t.id = s.talep_id), '[]'::jsonb);
end $$;

create or replace function public.admin_sikayet_durum(p_id bigint, p_durum text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  update public.sikayetler set durum = p_durum where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_goruntulemeler(p_talep bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  return coalesce((select jsonb_agg(jsonb_build_object('zaman', g.zaman, 'talep_no', t.no, 'talep_baslik', t.baslik,
                     'emlakci', p.ad_soyad, 'ofis_adi', p.ofis_adi, 'telefon', p.telefon) order by g.zaman desc)
    from (select * from public.goruntulemeler where p_talep is null or talep_id = p_talep order by zaman desc limit 500) g
    left join public.talepler t on t.id = g.talep_id left join public.profiller p on p.id = g.emlakci_id), '[]'::jsonb);
end $$;

create or replace function public.admin_ayar_kaydet(p_anahtar text, p_deger jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._yonetici_gerekli();
  insert into public.ayarlar (anahtar, deger, guncelleme) values (p_anahtar, p_deger, now())
  on conflict (anahtar) do update set deger = excluded.deger, guncelleme = now();
  perform public.yonetici_kaydet('ayar', p_anahtar, p_deger);
  return jsonb_build_object('ok', true);
end $$;

-- Otomatik arşiv (zamanlanmış görevle her gece çalışır)
create or replace function public.talepleri_arsivle() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.talepler set durum = 'arsiv', guncelleme = now() where durum = 'yayinda' and yayin_bitis <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Fonksiyon yetkileri
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.profilim(), public.emlakci_basvur(jsonb), public.talep_olustur(jsonb), public.taleplerim(),
  public.talep_guncelle(bigint, jsonb), public.talep_kapat(bigint, text), public.talep_sil(bigint),
  public.hesabimi_sil(), public.talep_detay(bigint),
  public.admin_ozet(), public.admin_kullanicilar(text, text, text), public.admin_kullanici_durum(uuid, text, text),
  public.admin_kullanici_sil(uuid), public.admin_uyelik_ekle(jsonb), public.admin_uyelik_guncelle(bigint, jsonb),
  public.admin_uyelikler(uuid), public.admin_talepler(text, text, text), public.admin_talep_durum(bigint, text, text),
  public.admin_talep_guncelle(bigint, jsonb), public.admin_sikayetler(), public.admin_sikayet_durum(bigint, text),
  public.admin_goruntulemeler(bigint), public.admin_ayar_kaydet(text, jsonb)
to authenticated;
grant execute on function public.sikayet_et(bigint, text, text) to anon, authenticated;
-- RLS politikalarında kullanılan yardımcılar
grant execute on function public.yonetici_mi(), public.talep_sahibi_mi(bigint) to anon, authenticated;
