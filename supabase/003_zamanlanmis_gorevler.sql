-- =====================================================================
-- İstanbul Emlak Ağı — zamanlanmış görevler ve profil fotoğrafları (3/4)
-- =====================================================================
create extension if not exists pg_cron;

-- Her gece 03:15 (TR 06:15) — yayın süresi dolan talepleri arşivle
select cron.schedule('talep-arsivle', '15 3 * * *', $$select public.talepleri_arsivle()$$);

-- Profil fotoğrafları: herkes görür, kullanıcı yalnızca kendi klasörüne yükler (en fazla 2 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profil', 'profil', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "profil foto okuma" on storage.objects for select using (bucket_id = 'profil');
create policy "profil foto yukleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'profil' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profil foto guncelleme" on storage.objects for update to authenticated
  using (bucket_id = 'profil' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profil foto silme" on storage.objects for delete to authenticated
  using (bucket_id = 'profil' and (storage.foldername(name))[1] = auth.uid()::text);
