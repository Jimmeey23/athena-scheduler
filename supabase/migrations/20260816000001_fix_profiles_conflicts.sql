-- Fixes discovered after the first push: `public.profiles` already existed from
-- unrelated earlier work (columns full_name/studio/team/thread_id, no
-- `locations` column), and an old trigger `create_profile_on_signup` on
-- auth.users also inserts into profiles on signup — both caused real signups
-- to fail with "Database error saving new user".

alter table public.profiles add column if not exists locations text[] not null default '{}';

-- The old trigger raced with ours (it inserts a bare profiles row too, would
-- hit the primary key our insert also targets). It predates this feature and
-- app code never referenced it (confirmed no supabase.auth.* / profiles
-- usage anywhere in src/ before this change) — safe to detach.
drop trigger if exists create_profile_on_signup on auth.users;

-- Re-create handle_new_user with ON CONFLICT so it's idempotent regardless of
-- trigger ordering or any other pre-existing row for this user id.
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

  insert into public.profiles (id, email, role, locations)
  values (new.id, new.email, resolved_role, resolved_locations)
  on conflict (id) do update set email = excluded.email, role = excluded.role, locations = excluded.locations;

  return new;
end;
$$;
