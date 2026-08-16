-- Auth + role/branch scoping for Athena Scheduler.
-- Apply with `supabase db push`, or paste into the Supabase SQL editor.

-- Defensive create — these two tables already back src/supabase.ts in the live
-- project; `if not exists` keeps this migration safe to run against an
-- environment where they were created by hand.
create table if not exists public.athena_state (
  id text primary key,
  settings jsonb,
  drafts jsonb,
  sessions jsonb,
  schedule_sessions jsonb,
  schedule_report jsonb,
  updated_at timestamptz
);

create table if not exists public.athena_finalized_schedules (
  week_start text primary key,
  sessions jsonb,
  report jsonb,
  finalized_at timestamptz
);

-- One row per authenticated user: role + which studio locations they may
-- view/edit. Populated exclusively by the handle_new_user() trigger below —
-- never written directly by the client.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'branch')),
  locations text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Domain / allowlist enforcement lives in this one trigger so it applies
-- identically to email+password signup and Google OAuth — both create an
-- auth.users row the same way, and this fires on either. Any email that
-- doesn't match the admin allowlist or one of the two branch domains raises,
-- which aborts the auth.users insert and fails the signup/OAuth flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_emails text[] := array[
    'jimmeey@physique57india.com',
    'saachi@physique57india.com',
    'mitali@physique57india.com',
    'anisha@physique57india.com'
  ];
  user_email text := lower(new.email);
  bengaluru_locations text[] := array['kenkere', 'copper'];
  mumbai_locations text[] := array['kwality', 'supreme', 'courtside'];
  all_locations text[] := array['kwality', 'supreme', 'kenkere', 'courtside', 'copper'];
begin
  if user_email = any(admin_emails) then
    insert into public.profiles (id, email, role, locations) values (new.id, new.email, 'admin', all_locations);
  elsif user_email like '%@physique57bengaluru.com' then
    insert into public.profiles (id, email, role, locations) values (new.id, new.email, 'branch', bengaluru_locations);
  elsif user_email like '%@physique57mumbai.com' then
    insert into public.profiles (id, email, role, locations) values (new.id, new.email, 'branch', mumbai_locations);
  else
    raise exception 'This email is not authorized for Athena Scheduler access.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- App data moves from open anon access to "any authenticated user" — branch
-- scoping is enforced in the UI, not here (see brainstorm decision: app-level
-- scoping only, no per-location row partitioning).
alter table public.athena_state enable row level security;
alter table public.athena_finalized_schedules enable row level security;

drop policy if exists "athena_state_authenticated" on public.athena_state;
create policy "athena_state_authenticated" on public.athena_state
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "athena_finalized_schedules_authenticated" on public.athena_finalized_schedules;
create policy "athena_finalized_schedules_authenticated" on public.athena_finalized_schedules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Manual step (cannot be scripted): in the Supabase dashboard, Authentication →
-- Providers → Google, enable it and paste a Google OAuth "Web application"
-- client id/secret whose authorized redirect URI is
-- https://<project-ref>.supabase.co/auth/v1/callback. Also add this app's
-- URL(s) to Authentication → URL Configuration → Redirect URLs.
