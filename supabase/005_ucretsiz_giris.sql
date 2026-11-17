-- 005: Ücretsiz giriş (SMS kaldırıldı)
-- Giriş Google hesabıyla (ya da Supabase panelinden açılan doğrulanmış e-posta hesabıyla) yapılır.
-- Telefon yalnızca iletişim alanıdır; SMS ile doğrulanmadıkça "doğrulandı" sayılmaz (profilim.telefon_onayli).
-- Ücretli SMS hizmeti (İleti Merkezi) ve SMS kancası kaldırıldı; üyelik hatırlatmaları panelde ve WhatsApp ile yapılır.

-- Türkiye cep telefonu → 905XXXXXXXXX, geçersizse null
create or replace function public._telefon(t text) returns text
language sql immutable as $f$
  select case
    when d ~ '^905[0-9]{9}$' then d
    when d ~ '^05[0-9]{9}$' then '9' || d
    when d ~ '^5[0-9]{9}$' then '90' || d
    else null end
  from (select regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g') as d) x
$f$;

-- Oturum açan kullanıcının e-postası (Google) ya da telefonu doğrulanmış mı
create or replace function public._hesap_dogrulandi() returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select exists (select 1 from auth.users where id = auth.uid()
                 and (email_confirmed_at is not null or phone_confirmed_at is not null))
$f$;
revoke execute on function public._hesap_dogrulandi() from public, anon;
grant execute on function public._hesap_dogrulandi() to authenticated;

-- Yeni kullanıcı: Google'dan gelen ad ve e-posta profile yazılır
create or replace function public.auth_kullanici_olustu() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  insert into public.profiller (id, telefon, eposta, ad_soyad)
  values (new.id, public._telefon(new.phone), new.email,
          nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 80), ''))
  on conflict (id) do nothing;
  return new;
end $f$;

create or replace function public.auth_kullanici_guncellendi() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  if new.email is distinct from old.email then
    update public.profiller set eposta = new.email, guncelleme = now() where id = new.id;
  end if;
  return new;
end $f$;
drop trigger if exists profil_telefon on auth.users;
drop trigger if exists profil_eposta on auth.users;
create trigger profil_eposta after update of email on auth.users
  for each row execute function public.auth_kullanici_guncellendi();

-- Telefon: kullanıcı kendi profilinde düzenleyebilir, biçim veritabanında denetlenir
update public.profiller set telefon = public._telefon(telefon) where telefon is not null;
alter table public.profiller drop constraint if exists profiller_telefon_bicim;
alter table public.profiller add constraint profiller_telefon_bicim check (telefon is null or telefon ~ '^905[0-9]{9}$');
grant update (ad_soyad, eposta, ofis_adi, hizmet_ilceleri, foto_url, telefon) on public.profiller to authenticated;

create or replace function public.profilim() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.profiller; b timestamptz; telefon_onay boolean; yontem text;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiller where id = auth.uid();
  if not found then return null; end if;
  b := public.aktif_uyelik_bitis(auth.uid());
  select phone_confirmed_at is not null, coalesce(raw_app_meta_data ->> 'provider', 'email') into telefon_onay, yontem from auth.users where id = auth.uid();
  return jsonb_build_object(
    'id', p.id, 'rol', p.rol, 'durum', p.durum, 'ad_soyad', p.ad_soyad, 'telefon', p.telefon,
    'telefon_onayli', coalesce(telefon_onay, false), 'giris_yontemi', yontem, 'eposta', p.eposta, 'ofis_adi', p.ofis_adi,
    'yetki_belge_no', p.yetki_belge_no, 'hizmet_ilceleri', to_jsonb(p.hizmet_ilceleri), 'foto_url', p.foto_url,
    'red_nedeni', p.red_nedeni, 'uyelik_bitis', b,
    'kalan_gun', case when b is null then null else ceil(extract(epoch from (b - now())) / 86400)::int end,
    'ucretli_erisim_aktif', public.ayar_bool('ucretli_erisim_aktif'),
    'yonetici_aal2', public.yonetici_mi());
end $$;

create or replace function public.emlakci_basvur(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiller; ilceler text[];
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.'; end if;
  if not public._hesap_dogrulandi() then
    raise exception 'Önce Google hesabınızla giriş yapın.';
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
     or coalesce(array_length(ilceler, 1), 0) = 0 or public._telefon(p ->> 'telefon') is null then
    raise exception 'Lütfen tüm zorunlu alanları doldurun.';
  end if;
  update public.profiller set
    rol = 'emlakci', durum = 'beklemede', red_nedeni = null, basvuru_tarihi = now(),
    ad_soyad = public._metin(p, 'ad_soyad', 80), ofis_adi = public._metin(p, 'ofis_adi', 100),
    eposta = public._metin(p, 'eposta', 120), yetki_belge_no = public._metin(p, 'yetki_belge_no', 30),
    hizmet_ilceleri = ilceler, telefon = public._telefon(p ->> 'telefon'), guncelleme = now()
  where id = auth.uid();
  insert into public.rizalar (kullanici_id, tur, metin)
  values (auth.uid(), 'emlakci_basvuru', coalesce(public._metin(p, 'riza_metni', 600), 'KVKK aydınlatma metni ve kullanım koşulları kabul edildi.'));
  return public.profilim();
end $$;

create or replace function public.talep_olustur(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiller; v_tip text; v_id bigint; v_no text; v_durum text; gun int; v_tel text;
        v_ilce text; v_mah text; kat text;
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.'; end if;
  if not public._hesap_dogrulandi() then
    raise exception 'Önce Google hesabınızla giriş yapın.';
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
  v_tel := coalesce(public._telefon(p ->> 'telefon'), me.telefon);
  if p ->> 'telefon' is not null and trim(p ->> 'telefon') <> '' and public._telefon(p ->> 'telefon') is null then
    raise exception 'Telefon numarası geçersiz. 05XX XXX XX XX biçiminde yazın.';
  end if;
  if v_tel is null then raise exception 'Lütfen iletişim telefonunuzu yazın.'; end if;
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

  update public.profiller set ad_soyad = coalesce(ad_soyad, public._metin(p, 'ad_soyad', 80)),
         telefon = coalesce(telefon, v_tel), guncelleme = now() where id = auth.uid();

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
               else coalesce(public._metin(p, 'ad_soyad', 80), me.ad_soyad) end, v_tel);
  insert into public.rizalar (kullanici_id, talep_id, tur, metin)
  values (auth.uid(), v_id, case when v_tip = 'vatandas' then 'vatandas_talep' else 'emlakci_paylasim' end,
          coalesce(public._metin(p, 'riza_metni', 600), 'Talep paylaşım onayı'));
  return jsonb_build_object('id', v_id, 'no', v_no, 'durum', v_durum);
end $$;

-- SMS kaldırıldı: hatırlatma yalnızca kayıt altına alınır, yönetici panelden WhatsApp ile hatırlatır
create or replace function public.uyelik_hatirlatmalari() returns int
language plpgsql security definer set search_path = public, pg_temp as $f$
declare n int;
begin
  insert into public.hatirlatmalar (uyelik_id)
  select u.id from public.uyelikler u
  where u.durum = 'aktif' and u.bitis > now() and u.bitis <= now() + interval '3 days'
    and public.aktif_uyelik_bitis(u.emlakci_id) = u.bitis
    and not exists (select 1 from public.hatirlatmalar h where h.uyelik_id = u.id);
  get diagnostics n = row_count;
  return n;
end $f$;
revoke execute on function public.uyelik_hatirlatmalari() from public, anon, authenticated;

-- Yönetici: bitişi yaklaşan üyelikler (WhatsApp ile hatırlatma için)
create or replace function public.admin_hatirlatmalar() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
begin
  perform public._yonetici_gerekli();
  return coalesce((select jsonb_agg(jsonb_build_object('uyelik_id', u.id, 'emlakci_id', u.emlakci_id, 'ad_soyad', p.ad_soyad,
            'ofis_adi', p.ofis_adi, 'telefon', p.telefon, 'bitis', u.bitis,
            'kalan_gun', ceil(extract(epoch from (u.bitis - now())) / 86400)::int,
            'isaretlendi', exists (select 1 from public.hatirlatmalar h where h.uyelik_id = u.id)) order by u.bitis)
    from public.uyelikler u join public.profiller p on p.id = u.emlakci_id
    where u.durum = 'aktif' and u.bitis > now() and u.bitis <= now() + interval '7 days'
      and public.aktif_uyelik_bitis(u.emlakci_id) = u.bitis), '[]'::jsonb);
end $f$;
revoke execute on function public.admin_hatirlatmalar() from public, anon;
grant execute on function public.admin_hatirlatmalar() to authenticated;

drop function if exists public.sms_dogrulama_kancasi(jsonb);
drop function if exists public.sms_gonder(text, text, text);
delete from public.ayarlar where anahtar = 'sms';
