-- The automatic-RLS event trigger is not a public RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- These internal tables are reachable only through the authorised functions.
create policy clients_cannot_read_invites on private.fb_invites for all to authenticated using (false) with check (false);
create policy clients_cannot_read_quota_policy on private.fb_quota_policy for all to authenticated using (false) with check (false);
create policy clients_cannot_read_quota_period on private.fb_quota_period for all to authenticated using (false) with check (false);
create policy clients_cannot_read_rate on private.fb_rate for all to authenticated using (false) with check (false);
create policy clients_cannot_read_reservations on private.fb_reservations for all to authenticated using (false) with check (false);
