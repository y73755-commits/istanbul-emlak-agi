-- Yönetici paneli gösterimi için GEÇİCİ demo verisi (canlı veritabanı).
-- İki sahte Google hesabı açar: bir vatandaş (incelenecek talep) ve bir emlakçı adayı (onay bekliyor).
-- E-postalar @ornek.invalid uzantılıdır; gösterimden sonra en alttaki SİLME bölümüyle tamamen kaldırılır.
do $$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  v uuid := gen_random_uuid(); e uuid := gen_random_uuid(); j jsonb; sonuc text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (v, inst, 'authenticated', 'authenticated', 'demo-vatandas@ornek.invalid', now(), '{"provider":"google"}', '{"full_name":"DEMO Vatandaş"}', now(), now()),
    (e, inst, 'authenticated', 'authenticated', 'demo-emlakci@ornek.invalid', now(), '{"provider":"google"}', '{"full_name":"DEMO Emlakçı"}', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  j := public.talep_olustur(jsonb_build_object('kategori', 'satilik-konut', 'tur', 'daire', 'islem', 'satilik', 'ilce', 'Kadıköy',
        'baslik', 'DEMO – Kadıköy 3+1 satılık daire arıyorum', 'ozet', 'DEMO talebi: Kadıköy, 3+1, asansörlü',
        'aciklama', 'DEMO açıklaması (gösterimden sonra silinecek).', 'ad_soyad', 'DEMO Vatandaş', 'riza', true,
        'butce_max', 9000000, 'telefon', '0530 000 00 01'));
  sonuc := sonuc || 'talep ' || (j ->> 'no') || ' / ' || (j ->> 'durum');

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.emlakci_basvur(jsonb_build_object('ad_soyad', 'DEMO Emlakçı', 'ofis_adi', 'DEMO Emlak Ofisi', 'yetki_belge_no', '3400000',
        'eposta', 'demo-emlakci@ornek.invalid', 'hizmet_ilceleri', jsonb_build_array('Kadıköy', 'Üsküdar'), 'telefon', '0530 000 00 02'));
  sonuc := sonuc || ' | emlakçı başvurusu ' || (j ->> 'durum');
  execute 'reset role';
  raise notice '%', sonuc;
end $$;

select p.eposta, p.rol, p.durum, p.ad_soyad from public.profiller p where p.eposta like 'demo-%@ornek.invalid'
union all
select 'talep ' || t.no, t.durum, t.ilce, t.baslik from public.talepler t where t.baslik like 'DEMO%';

-- ===================== SİLME (gösterimden sonra) =====================
-- delete from auth.users where email in ('demo-vatandas@ornek.invalid', 'demo-emlakci@ornek.invalid');
-- (profil, talep, üyelik ve başvuru kayıtları kullanıcıya bağlı olduğu için birlikte silinir; kalan olursa:)
-- delete from public.talepler where baslik like 'DEMO%';
