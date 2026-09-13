-- ============================================================================
-- RailMind migration — Supabase Auth (email/password) + assets + roles
--
-- Auth model:
--   • Every sign-in is a real Supabase Auth user (email/password grant).
--   • Login handles are plain usernames; the app maps them internally to
--     `<username>@railmind.app`. A full email typed at login works too.
--   • The seeded administrator: railadmin@  →  railadmin@railmind.app
--     password: byteforce_1   (linked staff row role = admin)
--   • Admin creates staff logins from User Management via SECURITY DEFINER
--     RPCs (admin_create_auth_user / admin_reset_password / admin_disable_user)
--     — regular users can never self-register.
--
-- Safe to re-run (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------- 1. link ---
alter table public.users add column if not exists auth_user_id uuid;

-- ------------------------------------------------------- 2. RLS for auth ---
-- The original policies only cover `anon`. Once users actually sign in,
-- queries run as `authenticated` and would be denied without these.
drop policy if exists "authenticated full access sections" on public.sections;
create policy "authenticated full access sections" on public.sections
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access trains" on public.trains;
create policy "authenticated full access trains" on public.trains
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access blocks" on public.blocks;
create policy "authenticated full access blocks" on public.blocks
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access complaints" on public.complaints;
create policy "authenticated full access complaints" on public.complaints
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access users" on public.users;
create policy "authenticated full access users" on public.users
  for all to authenticated using (true) with check (true);

-- Storage: allow authenticated uploads too (anon policy already exists)
drop policy if exists "authenticated upload complaint photos" on storage.objects;
create policy "authenticated upload complaint photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'complaint-photos');

-- ------------------------------------------- 3. admin user-management RPCs ---
-- These run as the schema owner (SECURITY DEFINER) so the browser client can
-- provision real auth.users rows. Only signed-in users may execute them, and
-- the app restricts the callers to the User Management screen (admin role).

create or replace function public.admin_create_auth_user(
  p_email text,
  p_password text,
  p_user_id uuid,
  p_name text default null,
  p_sections uuid[] default null
) returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'A valid email is required';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'An auth account with this email already exists';
  end if;
  if exists (select 1 from public.users where lower(email) = v_email and id <> p_user_id) then
    raise exception 'Another staff record already uses this email';
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    is_sso_user
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name),
    now(), now(),
    '', '', '', '', false
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  update public.users
     set auth_user_id = v_id,
         email = v_email,
         status = 'active',
         assigned_sections = coalesce(p_sections, assigned_sections)
   where id = p_user_id;

  return v_id;
end;
$$;

create or replace function public.admin_reset_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_auth uuid;
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  select auth_user_id into v_auth from public.users where id = p_user_id;
  if v_auth is null then
    raise exception 'This user has no auth account yet';
  end if;
  update auth.users
     set encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   where id = v_auth;
end;
$$;

create or replace function public.admin_disable_user(p_user_id uuid, p_disable boolean default true)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_auth uuid;
begin
  select auth_user_id into v_auth from public.users where id = p_user_id;
  if v_auth is not null then
    update auth.users
       set banned_until = case when p_disable then 'infinity'::timestamptz else null end,
           updated_at = now()
     where id = v_auth;
  end if;
  update public.users
     set status = case when p_disable then 'revoked' else 'active' end
   where id = p_user_id;
end;
$$;

revoke execute on function public.admin_create_auth_user(text, text, uuid, text, uuid[]) from anon;
revoke execute on function public.admin_reset_password(uuid, text) from anon;
revoke execute on function public.admin_disable_user(uuid, boolean) from anon;
grant execute on function public.admin_create_auth_user(text, text, uuid, text, uuid[]) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_disable_user(uuid, boolean) to authenticated;
grant usage on schema public to authenticated;

-- ------------------------------------------------- 4. seeded administrator ---
-- Fixed uuid keeps re-runs idempotent and the staff-row link stable.
-- Login handles that resolve here:  railadmin@ · railadmin@railmind.app
do $$
declare
  v_id uuid := '11111111-1111-1111-1111-111111111111';
  v_email text := 'railadmin@railmind.app';
begin
  -- Remove the stray unconfirmed test user from earlier probing, if present
  delete from auth.users where email = 'railadmin.railmind.test@gmail.com';

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    is_sso_user
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt('byteforce_1', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RailMind Administrator"}'::jsonb,
    now(), now(),
    '', '', '', '', false
  )
  on conflict (id) do nothing;

  -- Guarantee the exact credentials even if re-seeded later
  update auth.users
     set encrypted_password = crypt('byteforce_1', gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         banned_until = null,
         updated_at = now()
   where id = v_id;

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

  -- Link the administrator staff row (the admin user in User Management)
  update public.users
     set auth_user_id = v_id,
         email = v_email,
         status = 'active'
   where role = 'admin';
end;
$$;

-- --------------------------------------------- 5. assets registry (AI input) ---
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references public.sections(id) on delete set null,
  asset_code text not null unique,
  name text not null,
  asset_type text not null,
  status text not null default 'operational'
    check (status in ('operational','degraded','maintenance','offline')),
  health_score int not null default 100 check (health_score between 0 and 100),
  last_serviced_at date,
  created_at timestamptz not null default now()
);
alter table public.assets enable row level security;

drop policy if exists "anon full access assets" on public.assets;
create policy "anon full access assets" on public.assets
  for all to anon using (true) with check (true);
drop policy if exists "authenticated full access assets" on public.assets;
create policy "authenticated full access assets" on public.assets
  for all to authenticated using (true) with check (true);

insert into public.assets (section_id, asset_code, name, asset_type, status, health_score, last_serviced_at)
select s.id, v.acode, v.name, v.type, v.status, v.health, v.serviced
from (values
  ('MMR-PUNE', 'RGM-07',   'Rail grinding machine RGM-07',  'machine',   'maintenance', 88, date '2026-08-21'),
  ('MMR-PUNE', 'OHV-12',   'OHE inspector car OHV-12',      'vehicle',   'operational', 94, date '2026-09-01'),
  ('MMR-PUNE', 'MP-KM142', 'Track section MP-KM142',        'track',     'degraded',    61, date '2026-07-14'),
  ('NDLS-AGC', 'SR-AGC-03','Signal relay rack SR-AGC-03',   'signal',    'operational', 91, date '2026-08-30'),
  ('NDLS-AGC', 'TC-AGC-118','Track circuit TC-AGC-118',     'track',     'operational', 90, date '2026-09-05'),
  ('NDLS-AGC', 'OA-NDLS-77','OHE span assembly OA-NDLS-77', 'overhead',  'maintenance', 72, date '2026-06-28'),
  ('HWH-BWN',  'BC-HWH-02','Ballast cleaner BC-HWH-02',     'machine',   'operational', 96, date '2026-09-03'),
  ('HWH-BWN',  'LG-HWH-21','Level crossing gate LG-HWH-21', 'gate',      'operational', 98, date '2026-09-08'),
  ('MAS-SBC',  'BG-MAS-09','Bridge girder BG-MAS-09',       'bridge',    'degraded',    58, date '2026-05-19'),
  ('MAS-SBC',  'SC-MAS-40','Signal cable route SC-MAS-40',  'signal',    'degraded',    45, date '2026-06-02'),
  ('MAS-SBC',  'CG-SBC-14','Cattle guard CG-SBC-14',        'safety',    'offline',     30, date '2026-04-11'),
  ('ADI-BRC',  'PM-ADI-31','Point machine PM-ADI-31',       'point',     'operational', 93, date '2026-08-17'),
  ('ADI-BRC',  'WI-BRC-05','Weld inspection set WI-BRC-05', 'equipment', 'operational', 89, date '2026-08-25'),
  ('LKO-CNB',  'TM-LKO-04','Tamping machine TM-LKO-04',     'machine',   'operational', 90, date '2026-09-06'),
  ('LKO-CNB',  'PL-CNB-08','Platform lighting PL-CNB-08',   'lighting',  'operational', 92, date '2026-08-12')
) as v(scode, acode, name, type, status, health, serviced)
join public.sections s on s.code = v.scode
where not exists (select 1 from public.assets a where a.asset_code = v.acode);

-- ----------------------------------------------- 6. roles catalog (admin) ---
alter table public.users drop constraint if exists users_role_check;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.roles enable row level security;

drop policy if exists "anon full access roles" on public.roles;
create policy "anon full access roles" on public.roles
  for all to anon using (true) with check (true);
drop policy if exists "authenticated full access roles" on public.roles;
create policy "authenticated full access roles" on public.roles
  for all to authenticated using (true) with check (true);

insert into public.roles (name, is_default) values
  ('Admin', true),
  ('Section Controller', true),
  ('Maintenance Engineer', true),
  ('Viewer', true)
on conflict (name) do nothing;
