-- Repair: an earlier migration in this batch mistakenly dropped the
-- pre-existing `create_profile_on_signup` trigger, believing it was unused
-- scaffolding. It was not — `public.create_profile_for_new_user()` (which it
-- called) is live logic belonging to a different, already-running
-- application that shares this Supabase project's `profiles` table. The
-- underlying function was never touched/dropped, only this trigger's
-- binding — restoring it here.
create trigger create_profile_on_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();
