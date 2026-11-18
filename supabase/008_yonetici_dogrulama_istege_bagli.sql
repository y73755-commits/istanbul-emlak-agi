-- 008: Yönetici iki adımlı doğrulaması isteğe bağlı (18.11.2026, sahibin isteğiyle)
-- Yönetici hesabında doğrulanmış bir TOTP kaydı VARSA yönetici işlemleri yine aal2 (6 haneli kod) ister.
-- Kayıt YOKSA yönetici, Google girişiyle (aal1) paneli kullanabilir. Panelden kod yeniden kurulunca koruma kendiliğinden geri gelir.
create or replace function public.yonetici_mi() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiller p
                 where p.id = auth.uid() and p.rol = 'yonetici' and p.durum <> 'engelli')
     and (coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f
                         where f.user_id = auth.uid() and f.status = 'verified'));
$$;
