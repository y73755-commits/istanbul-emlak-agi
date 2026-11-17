-- Canlı veritabanında rol bazlı erişim testi (Google/e-posta girişi, SMS yok).
-- Test kullanıcıları ve kayıtları bu blok içinde oluşturulur; blok sonunda bilerek hata verilir,
-- böylece HİÇBİR DEĞİŞİKLİK KALICI OLMAZ (her şey geri alınır). Sonuçlar hata mesajında görünür.
do $$
declare
  r text := E'PERSONA TESTİ (tüm değişiklikler geri alınacak)\n';
  gecti int := 0; kaldi int := 0;
  vat uuid := gen_random_uuid(); bek uuid := gen_random_uuid(); ucz uuid := gen_random_uuid(); dog uuid := gen_random_uuid(); vat2 uuid := gen_random_uuid();
  ucr uuid := gen_random_uuid(); bit uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  tid bigint; eid bigint; j jsonb; n int; m int;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- yardımcı: sonuç satırı
  -- (plpgsql içinde alt fonksiyon olmadığı için her test aynı kalıpla yazıldı)

  -- Google ile giriş yapmış gibi: e-posta doğrulanmış, telefon yok
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (vat, inst, 'authenticated', 'authenticated', 'test-vat@ornek.invalid', now(), '{"provider":"google"}', '{"full_name":"Test Vatandaş"}', now(), now()),
    (bek, inst, 'authenticated', 'authenticated', 'test-bek@ornek.invalid', now(), '{"provider":"google"}', '{}', now(), now()),
    (ucz, inst, 'authenticated', 'authenticated', 'test-ucz@ornek.invalid', now(), '{"provider":"google"}', '{}', now(), now()),
    (ucr, inst, 'authenticated', 'authenticated', 'test-ucr@ornek.invalid', now(), '{"provider":"google"}', '{}', now(), now()),
    (bit, inst, 'authenticated', 'authenticated', 'test-bit@ornek.invalid', now(), '{"provider":"google"}', '{}', now(), now()),
    (adm, inst, 'authenticated', 'authenticated', 'test-adm@ornek.invalid', now(), '{"provider":"google"}', '{}', now(), now()),
    (vat2, inst, 'authenticated', 'authenticated', 'test-vat2@ornek.invalid', now(), '{"provider":"google"}', '{}', now(), now()),
    (dog, inst, 'authenticated', 'authenticated', 'test-dog@ornek.invalid', null, '{"provider":"email"}', '{}', now(), now());
  update public.profiller set ad_soyad = 'Test Vatandaş' where id = vat;
  update public.profiller set rol = 'emlakci', durum = 'beklemede', ad_soyad = 'Test Onaysız Emlakçı', ofis_adi = 'Test Ofis A' , telefon = '905320000002' where id = bek;
  update public.profiller set rol = 'emlakci', durum = 'onayli', ad_soyad = 'Test Ücretsiz Emlakçı', ofis_adi = 'Test Ofis B' , telefon = '905320000003' where id = ucz;
  update public.profiller set rol = 'emlakci', durum = 'onayli', ad_soyad = 'Test Ücretli Emlakçı', ofis_adi = 'Test Ofis C' , telefon = '905320000004' where id = ucr;
  update public.profiller set rol = 'emlakci', durum = 'onayli', ad_soyad = 'Test Süresi Biten', ofis_adi = 'Test Ofis D' , telefon = '905320000005' where id = bit;
  update public.profiller set rol = 'yonetici', durum = 'aktif', ad_soyad = 'Test Yönetici' where id = adm;
  insert into public.uyelikler (emlakci_id, paket_id, baslangic, bitis, durum) values
    (ucr, (select id from public.paketler order by sira limit 1), now() - interval '1 day', now() + interval '30 days', 'aktif'),
    (bit, (select id from public.paketler order by sira limit 1), now() - interval '40 days', now() - interval '1 hour', 'aktif');
  update public.ayarlar set deger = 'false'::jsonb where anahtar = 'ucretli_erisim_aktif';

  ---------------------------------------------------------------- 1) VATANDAŞ talep oluşturur
  perform set_config('request.jwt.claims', json_build_object('sub', vat, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_olustur(jsonb_build_object('kategori', 'satilik-konut', 'tur', 'daire', 'islem', 'satilik', 'ilce', 'Kadıköy',
          'baslik', 'Test talebi', 'ozet', 'Test özeti', 'aciklama', 'GIZLI ACIKLAMA', 'ad_soyad', 'Test Vatandaş', 'riza', true, 'butce_max', 5000000,
          'telefon', '0532 111 22 33'));
    tid := (j ->> 'id')::bigint;
    r := r || '✓ Vatandaş talep oluşturdu: ' || (j ->> 'no') || ' (durum: ' || (j ->> 'durum') || E')\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Vatandaş talep oluşturamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  begin
    j := public.taleplerim();
    if j::text like '%GIZLI ACIKLAMA%' then r := r || E'✓ Vatandaş kendi talebinin açıklamasını görüyor\n'; gecti := gecti + 1;
    else r := r || E'✗ Vatandaş kendi talebini göremedi\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ taleplerim: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  begin
    j := public.profilim();
    if (j ->> 'telefon_onayli')::boolean = false and j ->> 'giris_yontemi' = 'google' and j ->> 'ad_soyad' = 'Test Vatandaş' then
      r := r || E'✓ Google hesabı: ad profile geldi, telefon "doğrulanmadı" olarak duruyor\n'; gecti := gecti + 1;
    else r := r || '✗ Profil beklenen gibi değil: ' || j::text || E'\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ profilim: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 1b) BAŞKA KULLANICI ve DOĞRULANMAMIŞ HESAP
  perform set_config('request.jwt.claims', json_build_object('sub', vat2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_guncelle(tid, jsonb_build_object('baslik', 'Ele geçirildi'));
    r := r || E'✗ Başka kullanıcı talebi değiştirebildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Başka kullanıcı talebi değiştiremiyor\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_kapat(tid, 'iptal');
    r := r || E'✗ Başka kullanıcı talebi kapatabildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Başka kullanıcı talebi kapatamıyor\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_sil(tid);
    r := r || E'✗ Başka kullanıcı talebi silebildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Başka kullanıcı talebi silemiyor\n'; gecti := gecti + 1; end;
  begin
    execute format('update public.talepler set baslik = %L where id = %s', 'Ele geçirildi', tid);
    get diagnostics n = row_count;
    if n = 0 then r := r || E'✓ Tabloya doğrudan yazma da engelli\n'; gecti := gecti + 1;
    else r := r || E'✗ Tabloya doğrudan yazılabildi\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || E'✓ Tabloya doğrudan yazma da engelli\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Başka vatandaş iletişim bilgisini gördü\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Başka vatandaş iletişim bilgisini göremiyor\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_olustur(jsonb_build_object('kategori', 'kiralik-konut', 'tur', 'daire', 'islem', 'kiralik', 'ilce', 'Şişli',
          'baslik', 'Telefon testi', 'ozet', 'Telefon testi özeti', 'aciklama', 'x', 'ad_soyad', 'Test İki', 'riza', true, 'telefon', '12345'));
    r := r || E'✗ Geçersiz telefonla talep kabul edildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Geçersiz telefon numarası reddediliyor (kayıt oluşmuyor)\n'; gecti := gecti + 1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', dog, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_olustur(jsonb_build_object('kategori', 'kiralik-konut', 'tur', 'daire', 'islem', 'kiralik', 'ilce', 'Şişli',
          'baslik', 'Doğrulanmamış', 'ozet', 'Doğrulanmamış hesap', 'aciklama', 'x', 'ad_soyad', 'X', 'riza', true, 'telefon', '05321112244'));
    r := r || E'✗ E-postası doğrulanmamış hesap talep oluşturdu\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Doğrulanmamış hesap talep oluşturamıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 2) YÖNETİCİ: MFA'sız erişemez, MFA ile yayınlar
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_ozet();
    r := r || E'✗ Yönetici iki adımlı doğrulama olmadan panele erişti\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Yönetici, iki adımlı doğrulama (aal2) olmadan reddedildi\n'; gecti := gecti + 1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_talep_durum(tid, 'yayinda');
    r := r || E'✓ Yönetici (aal2) talebi yayına aldı\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Yönetici yayına alamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 3) ZİYARETÇİ (anon)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.talepler where id = tid;
    r := r || '✓ Ziyaretçi talep özetini görüyor (' || n || E' satır)\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Ziyaretçi özet göremedi: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  begin
    execute 'select count(sahip_id) from public.talepler' into n;
    r := r || E'✗ Ziyaretçi sahip_id sütununu okuyabildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Ziyaretçi sahip kimliğini okuyamıyor (sütun izni yok)\n'; gecti := gecti + 1; end;
  begin
    execute 'select count(*) from public.talep_detaylari' into n;
    if n = 0 then r := r || E'✓ Ziyaretçi gizli detay tablosundan hiçbir satır alamıyor\n'; gecti := gecti + 1;
    else r := r || E'✗ Ziyaretçi gizli detayları gördü\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || E'✓ Ziyaretçi gizli detay tablosuna erişemiyor\n'; gecti := gecti + 1; end;
  begin
    execute 'select count(*) from public.profiller where telefon is not null' into n;
    if n = 0 then r := r || E'✓ Ziyaretçi kullanıcı telefonlarını göremiyor\n'; gecti := gecti + 1;
    else r := r || E'✗ Ziyaretçi telefon gördü\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || E'✓ Ziyaretçi profil tablosuna erişemiyor\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Ziyaretçi detay/iletişim aldı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Ziyaretçi detay ve iletişimi alamıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 3b) EMLAKÇI BAŞVURUSU (vat2 ile)
  perform set_config('request.jwt.claims', json_build_object('sub', vat2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.emlakci_basvur(jsonb_build_object('ad_soyad', 'Test Aday', 'ofis_adi', 'Aday Emlak', 'yetki_belge_no', '3400999',
          'eposta', 'aday@ornek.invalid', 'hizmet_ilceleri', jsonb_build_array('Kadıköy')));
    r := r || E'✗ Telefonsuz emlakçı başvurusu kabul edildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ İletişim telefonu olmadan emlakçı başvurusu yapılamıyor\n'; gecti := gecti + 1; end;
  begin
    j := public.emlakci_basvur(jsonb_build_object('ad_soyad', 'Test Aday', 'ofis_adi', 'Aday Emlak', 'yetki_belge_no', '3400999',
          'eposta', 'aday@ornek.invalid', 'hizmet_ilceleri', jsonb_build_array('Kadıköy'), 'telefon', '0533 444 55 66'));
    if j ->> 'durum' = 'beklemede' and j ->> 'telefon' = '905334445566' then r := r || E'✓ Emlakçı başvurusu alındı, onay bekliyor\n'; gecti := gecti + 1;
    else r := r || '✗ Başvuru: ' || j::text || E'\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ Başvuru: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 4) ONAYSIZ EMLAKÇI
  perform set_config('request.jwt.claims', json_build_object('sub', bek, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Onaysız emlakçı detay aldı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Onaysız emlakçı vatandaş detayını alamıyor\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_olustur(jsonb_build_object('kategori', 'alici', 'tur', 'daire', 'aciklama', 'x', 'baslik', 'x'));
    r := r || E'✗ Onaysız emlakçı iş birliği paylaşımı yapabildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Onaysız emlakçı iş birliği paylaşımı yapamıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 5) ONAYLI ÜCRETSİZ EMLAKÇI
  perform set_config('request.jwt.claims', json_build_object('sub', ucz, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Ücretsiz emlakçı vatandaş iletişimini aldı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Onaylı ücretsiz emlakçı vatandaş iletişimini alamıyor\n'; gecti := gecti + 1; end;
  begin
    j := public.talep_olustur(jsonb_build_object('kategori', 'alici', 'tur', 'daire', 'islem', 'satilik', 'ilce', 'Beşiktaş',
          'baslik', 'Test paylaşımı', 'ozet', 'Test paylaşım özeti', 'aciklama', 'EMLAKCI GIZLI'));
    eid := (j ->> 'id')::bigint;
    r := r || '✓ Onaylı ücretsiz emlakçı iş birliği paylaşımı yaptı: ' || (j ->> 'no') || E'\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Ücretsiz emlakçı paylaşım yapamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';
  update public.talepler set durum = 'yayinda', yayin_tarihi = now(), yayin_bitis = now() + interval '60 days' where id = eid;

  ---------------------------------------------------------------- 6) AKTİF ÜCRETLİ EMLAKÇI
  perform set_config('request.jwt.claims', json_build_object('sub', ucr, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(eid);
    if j ->> 'aciklama' = 'EMLAKCI GIZLI' then r := r || E'✓ Emlakçılar arası paylaşım detayı onaylı emlakçıya ücretsiz açık\n'; gecti := gecti + 1;
    else r := r || E'✗ Paylaşım detayı eksik\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ Emlakçı paylaşım detayını alamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Lansman modunda (ücretli erişim kapalı) vatandaş iletişimi açıldı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Ücretli erişim kapalıyken ücretli üye de vatandaş iletişimini alamıyor (lansman modu)\n'; gecti := gecti + 1; end;
  execute 'reset role';
  update public.ayarlar set deger = 'true'::jsonb where anahtar = 'ucretli_erisim_aktif';
  select count(*) into m from public.goruntulemeler where talep_id = tid;
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(tid);
    if j ->> 'telefon' = '905321112233' and j ->> 'aciklama' = 'GIZLI ACIKLAMA' then
      r := r || E'✓ Ücretli erişim açıkken aktif ücretli üye ad, telefon ve açıklamayı aldı\n'; gecti := gecti + 1;
    else r := r || '✗ Detay eksik: ' || j::text || E'\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ Ücretli üye detay alamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';
  select count(*) into n from public.goruntulemeler where talep_id = tid;
  if n = m + 1 then r := r || E'✓ İletişim görüntülemesi kayda geçti\n'; gecti := gecti + 1;
  else r := r || E'✗ Görüntüleme kaydı oluşmadı\n'; kaldi := kaldi + 1; end if;

  ---------------------------------------------------------------- 7) SÜRESİ BİTMİŞ ÜYE
  perform set_config('request.jwt.claims', json_build_object('sub', bit, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Süresi biten üye vatandaş iletişimini aldı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Üyelik süresi bitince erişim otomatik kapandı\n'; gecti := gecti + 1; end;
  begin
    j := public.profilim();
    r := r || '✓ Süresi biten üye panelinde: uyelik_bitis=' || coalesce(j ->> 'uyelik_bitis', 'yok') || E'\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ profilim: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 8) YÖNETİCİ üyelik tanımlar → ücretsiz üye ücretli olur
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.admin_uyelik_ekle(jsonb_build_object('emlakci_id', ucz, 'paket_id', (select id from public.paketler order by sira limit 1), 'tutar', 1));
    r := r || '✓ Yönetici elle üyelik tanımladı (bitiş ' || left(j ->> 'bitis', 10) || E')\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Üyelik tanımlanamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  begin
    j := public.admin_uyelik_ekle(jsonb_build_object('emlakci_id', bek, 'paket_id', (select id from public.paketler order by sira limit 1)));
    r := r || E'✗ Onaysız emlakçıya üyelik tanımlanabildi\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Onaysız emlakçıya üyelik tanımlanamıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ucz, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(tid);
    r := r || E'✓ Üyelik tanımlanan emlakçı artık vatandaş iletişimini alıyor\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Üyelikten sonra erişim açılmadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  begin
    perform public.admin_ozet();
    r := r || E'✗ Emlakçı yönetici fonksiyonunu çalıştırdı\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Emlakçı yönetici fonksiyonlarını çalıştıramıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 9) Sahibi talebini kapatınca erişim biter
  perform set_config('request.jwt.claims', json_build_object('sub', vat, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.talep_kapat(tid, 'sonuclandi');
    r := r || E'✓ Vatandaş talebini kapattı\n'; gecti := gecti + 1;
  exception when others then r := r || '✗ Kapatılamadı: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ucr, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.talep_detay(tid);
    r := r || E'✗ Kapanan talebin iletişimi hâlâ açık\n'; kaldi := kaldi + 1;
  exception when others then r := r || E'✓ Kapanan talebin iletişimi artık açılmıyor\n'; gecti := gecti + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 10) Arşivleme görevi
  update public.talepler set yayin_bitis = now() - interval '1 minute' where id = eid;
  begin
    perform public.talepleri_arsivle();
    select count(*) into n from public.talepler where id = eid and durum <> 'yayinda';
    if n = 1 then r := r || E'✓ Yayın süresi dolan talep gece görevinde arşivlendi\n'; gecti := gecti + 1;
    else r := r || E'✗ Arşivleme çalışmadı\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ Arşivleme: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;

  ---------------------------------------------------------------- 11) Üyelik bitiş hatırlatması (SMS yok, panelde listelenir)
  insert into public.uyelikler (emlakci_id, paket_id, baslangic, bitis, durum) values
    (bit, (select id from public.paketler order by sira limit 1), now() - interval '27 days', now() + interval '60 hours', 'aktif');
  begin
    n := public.uyelik_hatirlatmalari();
    m := public.uyelik_hatirlatmalari();
    if n >= 1 and m = 0 then r := r || E'✓ Bitişine 3 gün kalan üyelik gece görevinde işaretlendi, tekrar işaretlenmiyor\n'; gecti := gecti + 1;
    else r := r || '✗ Hatırlatma işaretleme (n=' || n || ', m=' || m || E')\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ Hatırlatma: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  begin
    j := public.admin_hatirlatmalar();
    if jsonb_array_length(j) >= 1 then r := r || E'✓ Yönetici panelinde bitişi yaklaşan üyeler WhatsApp hatırlatması için listeleniyor\n'; gecti := gecti + 1;
    else r := r || E'✗ Yaklaşan üyelik listesi boş\n'; kaldi := kaldi + 1; end if;
  exception when others then r := r || '✗ admin_hatirlatmalar: ' || sqlerrm || E'\n'; kaldi := kaldi + 1; end;
  execute 'reset role';

  r := r || E'\nSONUÇ: ' || gecti || ' geçti, ' || kaldi || ' kaldı. (Test kayıtları geri alındı.)';
  raise exception '%', r;
end $$;
