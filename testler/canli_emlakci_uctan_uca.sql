-- İstanbul Emlak Ağı — CANLI emlakçı uçtan uca testi (tamamı geri alınır, canlıda iz bırakmaz)
-- Sitenin çağırdığı gerçek veritabanı fonksiyonları, gerçek roller ve gerçek yönetici hesabı (iki adımlı = aal2) ile çalışır.
-- Akış: vatandaş talebi → yönetici yayını; ikinci emlakçının başvurusu → onay → iş birliği paylaşımı → yayın;
-- test emlakçısı: onaysız → onaylı ücretsiz → aktif ücretli → süresi bitmiş. Her durumda ücretli erişim KAPALI ve AÇIK denenir.
-- Sonuç tablosu hata mesajı olarak döner; ardından her şey geri alınır (ücretli erişim ayarı lansman değerine döner).
do $$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  adm uuid := (select id from auth.users where email = 'y73755@gmail.com');
  vat uuid := gen_random_uuid(); emb uuid := gen_random_uuid(); ema uuid := gen_random_uuid();
  j jsonb; tid bigint; eid bigint; aid bigint; uid bigint; ilk boolean;
  r text := ''; gecti int := 0; kaldi int := 0; durum text; acik boolean; vat_ok boolean; ema_ok boolean; sonuc text;
begin
  ilk := public.ayar_bool('ucretli_erisim_aktif');
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (vat, inst, 'authenticated', 'authenticated', 'uctan-vatandas@ornek.invalid', now(), '{"provider":"google"}', '{"full_name":"Uçtan Vatandaş"}', now(), now()),
    (emb, inst, 'authenticated', 'authenticated', 'uctan-emlakci-b@ornek.invalid', now(), '{"provider":"google"}', '{"full_name":"Uçtan Emlakçı B"}', now(), now()),
    (ema, inst, 'authenticated', 'authenticated', 'uctan-emlakci-a@ornek.invalid', now(), '{"provider":"google"}', '{"full_name":"Uçtan Emlakçı A"}', now(), now());

  -- 1) Vatandaş talebi ve yönetici yayını
  perform set_config('request.jwt.claims', json_build_object('sub', vat, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  j := public.talep_olustur(jsonb_build_object('kategori', 'satilik-konut', 'tur', 'daire', 'islem', 'satilik', 'ilce', 'Üsküdar',
        'baslik', 'Uçtan uca vatandaş talebi', 'ozet', 'Uçtan uca özet', 'aciklama', 'VATANDAS GIZLI', 'ad_soyad', 'Uçtan Vatandaş',
        'riza', true, 'telefon', '0530 111 22 33'));
  tid := (j ->> 'id')::bigint;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  perform public.admin_talep_durum(tid, 'yayinda');
  execute 'reset role';
  r := r || '✓ Vatandaş talebi oluşturuldu ve yönetici tarafından yayına alındı (' || (j ->> 'no') || E')\n'; gecti := gecti + 1;

  -- 2) İkinci emlakçı: başvuru → yönetici onayı → iş birliği paylaşımı → yayın
  perform set_config('request.jwt.claims', json_build_object('sub', emb, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  perform public.emlakci_basvur(jsonb_build_object('ad_soyad', 'Uçtan Emlakçı B', 'ofis_adi', 'B Ofis', 'yetki_belge_no', '3400001',
        'eposta', 'uctan-emlakci-b@ornek.invalid', 'hizmet_ilceleri', jsonb_build_array('Beşiktaş'), 'telefon', '0530 111 22 44'));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  perform public.admin_kullanici_durum(emb, 'onayli');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', emb, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  j := public.talep_olustur(jsonb_build_object('kategori', 'alici', 'tur', 'daire', 'islem', 'satilik', 'ilce', 'Beşiktaş',
        'baslik', 'Uçtan uca iş birliği', 'ozet', 'İş birliği özeti', 'aciklama', 'EMLAKCI PAYLASIM GIZLI'));
  eid := (j ->> 'id')::bigint;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  perform public.admin_talep_durum(eid, 'yayinda');
  execute 'reset role';
  r := r || '✓ Emlakçı başvurusu → yönetici onayı → ücretsiz iş birliği paylaşımı → yayın (' || (j ->> 'no') || E')\n'; gecti := gecti + 1;

  -- 3) Test emlakçısı A başvurur (onaysız)
  perform set_config('request.jwt.claims', json_build_object('sub', ema, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  perform public.emlakci_basvur(jsonb_build_object('ad_soyad', 'Uçtan Emlakçı A', 'ofis_adi', 'A Ofis', 'yetki_belge_no', '3400002',
        'eposta', 'uctan-emlakci-a@ornek.invalid', 'hizmet_ilceleri', jsonb_build_array('Üsküdar'), 'telefon', '0530 111 22 55'));
  begin
    perform public.talep_olustur(jsonb_build_object('kategori', 'alici', 'tur', 'daire', 'islem', 'satilik', 'ilce', 'Beşiktaş', 'baslik', 'x', 'ozet', 'x', 'aciklama', 'x'));
    r := r || E'✗ Onaysız emlakçı iş birliği paylaşımı yapabildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Onaysız emlakçı iş birliği paylaşımı yapamıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  r := r || E'\nDURUM | ÜCRETLİ ERİŞİM | VATANDAŞ İLETİŞİMİ | EMLAKÇI PAYLAŞIMI İLETİŞİMİ | SONUÇ\n';
  foreach durum in array array['onaysiz', 'ucretsiz', 'aktif-ucretli', 'suresi-bitmis'] loop
    -- duruma geçiş (yönetici işlemleri)
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    execute 'set local role authenticated';
    if durum = 'ucretsiz' then perform public.admin_kullanici_durum(ema, 'onayli'); end if;
    if durum = 'aktif-ucretli' then
      perform public.admin_uyelik_ekle(jsonb_build_object('emlakci_id', ema, 'paket_id', 'aylik', 'odeme_durumu', 'odendi', 'notlar', 'uçtan uca test'));
    end if;
    execute 'reset role';
    if durum = 'aktif-ucretli' then select max(id) into uid from public.uyelikler where emlakci_id = ema; end if;
    if durum = 'suresi-bitmis' then
      -- 30 günlük üyeliğin süresinin dolduğu an: başlangıç 31 gün önce, bitiş dün
      update public.uyelikler set baslangic = now() - interval '31 days', bitis = now() - interval '1 day' where id = uid;
    end if;
    foreach acik in array array[false, true] loop
      perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
      execute 'set local role authenticated';
      perform public.admin_ayar_kaydet('ucretli_erisim_aktif', to_jsonb(acik));
      execute 'reset role';
      perform set_config('request.jwt.claims', json_build_object('sub', ema, 'role', 'authenticated', 'aal', 'aal1')::text, true);
      execute 'set local role authenticated';
      begin j := public.talep_detay(tid); vat_ok := (j ->> 'aciklama') = 'VATANDAS GIZLI' and (j ->> 'telefon') is not null; exception when others then vat_ok := false; end;
      begin j := public.talep_detay(eid); ema_ok := (j ->> 'aciklama') = 'EMLAKCI PAYLASIM GIZLI'; exception when others then ema_ok := false; end;
      execute 'reset role';
      -- beklenen: vatandaş iletişimi yalnızca "aktif ücretli + erişim açık"; paylaşım iletişimi onaylı her emlakçıya (ücretsiz, ücretli, süresi bitmiş)
      sonuc := case when vat_ok = (durum = 'aktif-ucretli' and acik) and ema_ok = (durum <> 'onaysiz') then '✓' else '✗' end;
      if sonuc = '✓' then gecti := gecti + 1; else kaldi := kaldi + 1; end if;
      r := r || durum || ' | ' || case when acik then 'AÇIK' else 'KAPALI' end || ' | ' || case when vat_ok then 'görür' else 'göremez' end
             || ' | ' || case when ema_ok then 'görür' else 'göremez' end || ' | ' || sonuc || E'\n';
    end loop;
  end loop;

  -- 4) Giriş yapmamış ziyaretçi
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.talep_detay(tid); r := r || E'✗ Ziyaretçi vatandaş detayını aldı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'\n✓ Giriş yapmamış ziyaretçi vatandaş ve paylaşım detayını alamıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  r := r || E'\nücretli erişim test öncesi: ' || case when ilk then 'AÇIK' else 'KAPALI' end || ' (test geri alınınca bu değere döner)';
  raise exception E'SONUÇ: %/% geçti\n%', gecti, gecti + kaldi, r;
end $$;

-- Geri alındıktan sonra kontrol (ayrı çalıştırın):
-- select public.ayar_bool('ucretli_erisim_aktif') as ucretli_erisim, (select count(*) from auth.users where email like 'uctan-%') as test_kullanici;
