-- 006: Veritabanı içi canlı tutma kaydı (ücretsiz plan duraklatmasına karşı ek önlem)
-- Asıl canlı tutma dışarıdan gelen isteklerdir (GitHub "Veritabanını canlı tut" iş akışı, gerçek kullanıcılar).
-- Bu görev her 6 saatte bir küçük bir yazma yapar; tek başına garanti değildir.
create table if not exists public.canli_tut (
  id int primary key default 1 check (id = 1),
  son timestamptz not null default now()
);
alter table public.canli_tut enable row level security;   -- politika yok: API'den erişilemez
insert into public.canli_tut (id) values (1) on conflict (id) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'canli-tut';
select cron.schedule('canli-tut', '17 */6 * * *', $$update public.canli_tut set son = now() where id = 1$$);

select jobname, schedule, active from cron.job order by jobname;
