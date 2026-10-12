create index fb_workspaces_owner_idx on public.fb_workspaces(owner_id);
create index fb_cases_updated_by_idx on public.fb_cases(updated_by);

create or replace function private.fb_create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'Enter a team name of up to 80 characters'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 1));
  if (select count(*) from public.fb_workspaces where owner_id = auth.uid()) >= 3 then raise exception 'You can own up to three workspaces'; end if;
  insert into public.fb_workspaces(name, owner_id) values (trim(p_name), auth.uid()) returning id into wid;
  insert into public.fb_members values (wid, auth.uid(), 'owner');
  return wid;
end $$;

create or replace function private.fb_create_invite(p_workspace uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if auth.uid() is null or not exists(select 1 from public.fb_workspaces where id = p_workspace and owner_id = auth.uid()) then raise exception 'Only the team owner can create an invitation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text, 2));
  token := encode(extensions.gen_random_bytes(24), 'hex');
  delete from private.fb_invites where workspace_id = p_workspace;
  insert into private.fb_invites values (encode(extensions.digest(token, 'sha256'), 'hex'), p_workspace, now() + interval '7 days');
  return token;
end $$;

create or replace function private.fb_join_workspace(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(p_token) <> 48 then raise exception 'Check the invitation code'; end if;
  select workspace_id into wid from private.fb_invites where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if wid is null then raise exception 'This invitation is invalid or expired'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(wid::text, 2));
  if exists(select 1 from public.fb_members where workspace_id = wid and user_id = auth.uid()) then return wid; end if;
  if (select count(*) from public.fb_members where workspace_id = wid) >= 20 then raise exception 'This team has reached 20 members'; end if;
  insert into public.fb_members values (wid, auth.uid(), 'member') on conflict do nothing;
  return wid;
end $$;
