-- 009: Yönetici işlem geçmişi yalnızca eklenebilir (18.11.2026)
-- Kayıtlar silinemez, değiştirilemez, tablo boşaltılamaz. Yeni kayıt eklemek (panel işlemleri) normal çalışır.
-- Yedekten geri yükleme etkilenmez (geri yükleme ekleme yapar).
create or replace function public._yonetici_kaydi_degismez() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Yönetici işlem geçmişi korunur: kayıtlar silinemez veya değiştirilemez.' using errcode = '42501';
end $$;

drop trigger if exists yonetici_kayitlari_koru on public.yonetici_kayitlari;
create trigger yonetici_kayitlari_koru before update or delete on public.yonetici_kayitlari
  for each row execute function public._yonetici_kaydi_degismez();

drop trigger if exists yonetici_kayitlari_bosaltma on public.yonetici_kayitlari;
create trigger yonetici_kayitlari_bosaltma before truncate on public.yonetici_kayitlari
  for each statement execute function public._yonetici_kaydi_degismez();
