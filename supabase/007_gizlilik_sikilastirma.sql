-- 007: Profil fotoğrafı listesini kısıtla (18.11.2026, canlıya uygulandı)
-- Depo "profil" herkese açık olduğu için fotoğraflar adresle görüntülenmeye devam eder.
-- Bu kural yalnızca dosya LİSTELEMEYİ kısıtlar: herkes değil, sadece dosyanın sahibi ve yönetici listeler.
drop policy if exists "profil foto okuma" on storage.objects;
create policy "profil foto okuma" on storage.objects for select
  using (bucket_id = 'profil' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.yonetici_mi()));
