create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table public.fb_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.fb_members (
  workspace_id uuid not null references public.fb_workspaces(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);
create index fb_members_user_idx on public.fb_members(user_id);
create table public.fb_cases (
  id uuid primary key,
  workspace_id uuid not null references public.fb_workspaces(id),
  title text not null check (char_length(title) between 1 and 80),
  payload jsonb not null check (octet_length(payload::text) <= 250000),
  archived boolean not null default false,
  version integer not null default 1,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create index fb_cases_workspace_idx on public.fb_cases(workspace_id, updated_at desc);
create table private.fb_invites (
  token_hash text primary key,
  workspace_id uuid not null references public.fb_workspaces(id),
  expires_at timestamptz not null
);
create index fb_invites_workspace_idx on private.fb_invites(workspace_id);

alter table public.fb_workspaces enable row level security;
alter table public.fb_members enable row level security;
alter table public.fb_cases enable row level security;
alter table private.fb_invites enable row level security;

create function private.fb_is_member(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.fb_members where workspace_id = wid and user_id = auth.uid());
$$;
revoke all on function private.fb_is_member(uuid) from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.fb_is_member(uuid) to authenticated;
grant select on public.fb_workspaces, public.fb_members, public.fb_cases to authenticated;
create policy workspace_members_read on public.fb_workspaces for select to authenticated using (private.fb_is_member(id));
create policy members_read on public.fb_members for select to authenticated using (private.fb_is_member(workspace_id));
create policy cases_read on public.fb_cases for select to authenticated using (private.fb_is_member(workspace_id));

create function private.fb_create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'Enter a team name of up to 80 characters'; end if;
  if (select count(*) from public.fb_workspaces where owner_id = auth.uid()) >= 3 then raise exception 'You can own up to three workspaces'; end if;
  insert into public.fb_workspaces(name, owner_id) values (trim(p_name), auth.uid()) returning id into wid;
  insert into public.fb_members values (wid, auth.uid(), 'owner');
  return wid;
end $$;
create function public.fb_create_workspace(p_name text) returns uuid
language sql security invoker set search_path = '' as $$ select private.fb_create_workspace(p_name); $$;

create function private.fb_create_invite(p_workspace uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if auth.uid() is null or not exists(select 1 from public.fb_workspaces where id = p_workspace and owner_id = auth.uid()) then raise exception 'Only the team owner can create an invitation'; end if;
  token := encode(extensions.gen_random_bytes(24), 'hex');
  delete from private.fb_invites where workspace_id = p_workspace;
  insert into private.fb_invites values (encode(extensions.digest(token, 'sha256'), 'hex'), p_workspace, now() + interval '7 days');
  return token;
end $$;
create function public.fb_create_invite(p_workspace uuid) returns text
language sql security invoker set search_path = '' as $$ select private.fb_create_invite(p_workspace); $$;

create function private.fb_join_workspace(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(p_token) <> 48 then raise exception 'Check the invitation code'; end if;
  select workspace_id into wid from private.fb_invites where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if wid is null then raise exception 'This invitation is invalid or expired'; end if;
  if (select count(*) from public.fb_members where workspace_id = wid) >= 20 then raise exception 'This team has reached 20 members'; end if;
  insert into public.fb_members values (wid, auth.uid(), 'member') on conflict do nothing;
  return wid;
end $$;
create function public.fb_join_workspace(p_token text) returns uuid
language sql security invoker set search_path = '' as $$ select private.fb_join_workspace(p_token); $$;

create function private.fb_save_case(p_workspace uuid, p_id uuid, p_title text, p_payload jsonb, p_archived boolean, p_expected_version integer) returns public.fb_cases
language plpgsql security definer set search_path = '' as $$
declare previous public.fb_cases; saved public.fb_cases;
begin
  if auth.uid() is null or not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
  if length(trim(p_title)) not between 1 and 80 or octet_length(p_payload::text) > 250000 or jsonb_typeof(p_payload->'session') <> 'object' then raise exception 'Check the case name and booking details'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text, 0));
  select * into previous from public.fb_cases where id = p_id for update;
  if previous.id is not null then
    if previous.workspace_id <> p_workspace then raise exception 'This case belongs to another team'; end if;
    if previous.version <> p_expected_version then raise exception 'Another teammate updated this case. Reopen the latest version before saving.' using errcode = '40001'; end if;
    update public.fb_cases set title = trim(p_title), payload = p_payload, archived = p_archived, version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_id returning * into saved;
  else
    if p_expected_version <> 0 then raise exception 'This case no longer exists. Reopen your case list.'; end if;
    if (select count(*) from public.fb_cases where workspace_id = p_workspace) >= 200 then raise exception 'This team has reached 200 saved cases'; end if;
    insert into public.fb_cases(id, workspace_id, title, payload, archived, updated_by) values (p_id, p_workspace, trim(p_title), p_payload, p_archived, auth.uid()) returning * into saved;
  end if;
  return saved;
end $$;
create function public.fb_save_case(p_workspace uuid, p_id uuid, p_title text, p_payload jsonb, p_archived boolean, p_expected_version integer) returns public.fb_cases
language sql security invoker set search_path = '' as $$ select private.fb_save_case(p_workspace, p_id, p_title, p_payload, p_archived, p_expected_version); $$;

revoke all on function private.fb_create_workspace(text), public.fb_create_workspace(text), private.fb_create_invite(uuid), public.fb_create_invite(uuid), private.fb_join_workspace(text), public.fb_join_workspace(text), private.fb_save_case(uuid,uuid,text,jsonb,boolean,integer), public.fb_save_case(uuid,uuid,text,jsonb,boolean,integer) from public;
grant execute on function private.fb_create_workspace(text), public.fb_create_workspace(text), private.fb_create_invite(uuid), public.fb_create_invite(uuid), private.fb_join_workspace(text), public.fb_join_workspace(text), private.fb_save_case(uuid,uuid,text,jsonb,boolean,integer), public.fb_save_case(uuid,uuid,text,jsonb,boolean,integer) to authenticated;

create table private.fb_quota_policy (
  singleton boolean primary key default true check (singleton),
  daily_micro_usd bigint not null default 1000000,
  monthly_micro_usd bigint not null default 5000000,
  requests_per_minute integer not null default 30
);
insert into private.fb_quota_policy(singleton) values(true);
create table private.fb_quota_period (period text primary key, spent bigint not null default 0 check (spent >= 0));
create table private.fb_rate (identity text not null, minute timestamptz not null, calls integer not null, primary key (identity,minute));
create table private.fb_reservations (id uuid primary key default gen_random_uuid(), cost bigint not null, day text not null, month text not null, settled boolean not null default false, created_at timestamptz not null default now());
alter table private.fb_quota_policy enable row level security;
alter table private.fb_quota_period enable row level security;
alter table private.fb_rate enable row level security;
alter table private.fb_reservations enable row level security;

create function private.fb_reserve_usage(p_identity text, p_max_cost bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare policy private.fb_quota_policy; daily text := to_char(now() at time zone 'UTC','YYYY-MM-DD'); monthly text := to_char(now() at time zone 'UTC','YYYY-MM'); calls integer; reservation uuid;
begin
  if p_max_cost < 0 or p_max_cost > 1000000 or length(p_identity) <> 64 then raise exception 'Invalid usage reservation'; end if;
  perform pg_advisory_xact_lock(612013042);
  select * into policy from private.fb_quota_policy;
  delete from private.fb_rate where minute < now() - interval '1 day';
  delete from private.fb_reservations where settled and created_at < now() - interval '90 days';
  insert into private.fb_rate values(p_identity,date_trunc('minute',now()),1) on conflict(identity,minute) do update set calls = private.fb_rate.calls + 1 returning private.fb_rate.calls into calls;
  if calls > policy.requests_per_minute then return jsonb_build_object('allowed',false,'reason','rate','retryAfter',60); end if;
  insert into private.fb_quota_period(period) values(daily),(monthly) on conflict do nothing;
  if (select spent from private.fb_quota_period where period = daily) + p_max_cost > policy.daily_micro_usd or (select spent from private.fb_quota_period where period = monthly) + p_max_cost > policy.monthly_micro_usd then return jsonb_build_object('allowed',false,'reason','budget','retryAfter',3600); end if;
  update private.fb_quota_period set spent = spent + p_max_cost where period in (daily,monthly);
  insert into private.fb_reservations(cost,day,month) values(p_max_cost,daily,monthly) returning id into reservation;
  return jsonb_build_object('allowed',true,'reservationId',reservation);
end $$;
create function public.fb_reserve_usage(p_identity text, p_max_cost bigint) returns jsonb language sql security invoker set search_path = '' as $$ select private.fb_reserve_usage(p_identity,p_max_cost); $$;
create function private.fb_settle_usage(p_id uuid, p_actual_cost bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare reservation private.fb_reservations;
begin
  if p_actual_cost < 0 then raise exception 'Invalid usage cost'; end if;
  perform pg_advisory_xact_lock(612013042);
  select * into reservation from private.fb_reservations where id = p_id for update;
  if reservation.id is null or reservation.settled then return; end if;
  update private.fb_quota_period set spent = greatest(0, spent + p_actual_cost - reservation.cost) where period in (reservation.day,reservation.month);
  update private.fb_reservations set settled = true, cost = p_actual_cost where id = p_id;
end $$;
create function public.fb_settle_usage(p_id uuid,p_actual_cost bigint) returns void language sql security invoker set search_path = '' as $$ select private.fb_settle_usage(p_id,p_actual_cost); $$;
revoke all on function private.fb_reserve_usage(text,bigint), public.fb_reserve_usage(text,bigint), private.fb_settle_usage(uuid,bigint), public.fb_settle_usage(uuid,bigint) from public;
grant execute on function private.fb_reserve_usage(text,bigint), public.fb_reserve_usage(text,bigint), private.fb_settle_usage(uuid,bigint), public.fb_settle_usage(uuid,bigint) to service_role;
