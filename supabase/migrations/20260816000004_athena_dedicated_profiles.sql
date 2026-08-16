-- Undo the parts of this feature's earlier migrations that touched the
-- SHARED `public.profiles` table (it turned out to belong to a different,
-- already-running app in this same Supabase project — confirmed via its
-- pre-existing policies "Profiles are readable by owner, managers, or
-- admins" etc. and its `manager`/`executive` role rows). Athena Scheduler
-- gets its own table instead so it never touches that app's data again.

-- Redundant with that app's existing "Profiles are readable by owner,
-- managers, or admins" policy (Postgres OR's permissive policies together,
-- so this never actually restricted anything) — dropped for cleanliness.
drop policy if exists "profiles_select_own" on public.profiles;

-- Unused now; added in error before this table was known to be shared.
alter table public.profiles drop column if exists locations;

-- This trigger/function pair (created by an earlier migration in this
-- feature) would still fire on every signup and try to insert role='branch'
-- into the shared table, which violates that table's own
-- profiles_role_check (admin/manager/executive only) — detaching it so
-- branch signups stop failing. The function itself is left in place
-- (untouched) in case anything still references it by name.
drop trigger if exists on_auth_user_created on auth.users;

-- Athena Scheduler's own table: role + which studio locations this account
-- may view/edit. Populated exclusively by athena_handle_new_user() below.
create table if not exists public.athena_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'branch')),
  locations text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.athena_profiles enable row level security;

drop policy if exists "athena_profiles_select_own" on public.athena_profiles;
create policy "athena_profiles_select_own" on public.athena_profiles
  for select using (auth.uid() = id);

-- Domain / allowlist enforcement lives in this one trigger so it applies
-- identically to email+password signup and Google OAuth. Distinctly named
-- (athena_ prefix) so it can never collide with the other app's trigger of
-- the same purpose on the same auth.users table.
create or replace function public.athena_handle_new_user()
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
  resolved_role text;
  resolved_locations text[];
begin
  if user_email = any(admin_emails) then
    resolved_role := 'admin';
    resolved_locations := all_locations;
  elsif user_email like '%@physique57bengaluru.com' then
    resolved_role := 'branch';
    resolved_locations := bengaluru_locations;
  elsif user_email like '%@physique57mumbai.com' then
    resolved_role := 'branch';
    resolved_locations := mumbai_locations;
  else
    raise exception 'This email is not authorized for Athena Scheduler access.';
  end if;

  insert into public.athena_profiles (id, email, role, locations)
  values (new.id, new.email, resolved_role, resolved_locations)
  on conflict (id) do update set email = excluded.email, role = excluded.role, locations = excluded.locations;

  return new;
end;
$$;

drop trigger if exists athena_on_auth_user_created on auth.users;
create trigger athena_on_auth_user_created
  after insert on auth.users
  for each row execute function public.athena_handle_new_user();
