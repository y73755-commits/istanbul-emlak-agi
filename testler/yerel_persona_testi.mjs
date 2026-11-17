import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const root = '/home/claude/site';
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, phone text, email text, phone_confirmed_at timestamptz, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
`);
await db.exec(fs.readFileSync(root + '/supabase/001_sema.sql', 'utf8'));
await db.exec(fs.readFileSync(root + '/supabase/002_baslangic_verileri.sql', 'utf8'));
await db.exec(`create table if not exists public.hatirlatmalar (uyelik_id bigint primary key references public.uyelikler(id) on delete cascade, zaman timestamptz not null default now());
  alter table public.hatirlatmalar enable row level security;`);
await db.exec(fs.readFileSync(root + '/supabase/005_ucretsiz_giris.sql', 'utf8'));
try { await db.exec(fs.readFileSync('/home/claude/site/testler/canli_persona_testi.sql', 'utf8')); console.log('beklenmedik: hata yok'); }
catch (e) { console.log(e.message); }
const n = await db.query('select count(*)::int n from auth.users'); console.log('geri alındı mı? auth.users =', n.rows[0].n);
