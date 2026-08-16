-- One-off exception: grants jimmeeygondaa@gmail.com branch access scoped to
-- the Mumbai locations, for testing the branch role without owning a real
-- @physique57mumbai.com mailbox.
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
  extra_mumbai_emails text[] := array['jimmeeygondaa@gmail.com'];
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
  elsif user_email = any(extra_mumbai_emails) then
    resolved_role := 'branch';
    resolved_locations := mumbai_locations;
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
