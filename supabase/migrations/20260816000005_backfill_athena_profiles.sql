-- athena_handle_new_user() only fires on INSERT into auth.users, so any
-- account that already existed before this feature was added (this Supabase
-- project is shared with an older app, so such accounts are expected) never
-- got a matching athena_profiles row and is stuck seeing "not authorized"
-- despite a valid session. Backfill once for every existing user matching
-- the same admin-allowlist / domain rules as the trigger.
do $$
declare
  admin_emails text[] := array[
    'jimmeey@physique57india.com',
    'saachi@physique57india.com',
    'mitali@physique57india.com',
    'anisha@physique57india.com'
  ];
  bengaluru_locations text[] := array['kenkere', 'copper'];
  mumbai_locations text[] := array['kwality', 'supreme', 'courtside'];
  all_locations text[] := array['kwality', 'supreme', 'kenkere', 'courtside', 'copper'];
  u record;
  resolved_role text;
  resolved_locations text[];
begin
  for u in select id, email from auth.users where email is not null loop
    if lower(u.email) = any(admin_emails) then
      resolved_role := 'admin';
      resolved_locations := all_locations;
    elsif lower(u.email) like '%@physique57bengaluru.com' then
      resolved_role := 'branch';
      resolved_locations := bengaluru_locations;
    elsif lower(u.email) like '%@physique57mumbai.com' then
      resolved_role := 'branch';
      resolved_locations := mumbai_locations;
    else
      continue;
    end if;

    insert into public.athena_profiles (id, email, role, locations)
    values (u.id, u.email, resolved_role, resolved_locations)
    on conflict (id) do update set email = excluded.email, role = excluded.role, locations = excluded.locations;
  end loop;
end;
$$;
