alter table public.fb_members drop constraint fb_members_role_check;
alter table public.fb_members add constraint fb_members_role_check check(role in ('owner','manager','staff','member'));
alter table public.fb_members add column display_name text not null default '' check(length(display_name)<=80);
alter table public.fb_cases alter column updated_by drop not null;

create table public.fb_desk (
  workspace_id uuid primary key references public.fb_workspaces(id),
  slug text unique not null default encode(extensions.gen_random_bytes(8),'hex'),
  payload jsonb not null default '{}'::jsonb check(octet_length(payload::text)<=1000000),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.fb_desk enable row level security;
grant select on public.fb_desk to authenticated;
create policy desk_members_read on public.fb_desk for select to authenticated using(private.fb_is_member(workspace_id));
create table private.fb_guest_reviews (
  token_hash text primary key,
  workspace_id uuid not null references public.fb_workspaces(id),
  case_id uuid not null references public.fb_cases(id),
  case_version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '72 hours',
  revoked boolean not null default false,
  submitted_at timestamptz,
  submission_hash text
);
alter table private.fb_guest_reviews enable row level security;
create policy no_client_guest_tokens on private.fb_guest_reviews for all to authenticated using(false) with check(false);
create index fb_guest_reviews_case_idx on private.fb_guest_reviews(case_id);
create index fb_guest_reviews_workspace_idx on private.fb_guest_reviews(workspace_id);

create function private.fb_save_desk(p_workspace uuid,p_payload jsonb,p_version integer) returns public.fb_desk
language plpgsql security definer set search_path='' as $$
declare previous public.fb_desk; saved public.fb_desk; member_role text;
begin
 select role into member_role from public.fb_members where workspace_id=p_workspace and user_id=auth.uid();
 if member_role is null then raise exception 'You do not have access to this team'; end if;
 if coalesce(jsonb_typeof(p_payload),'null')<>'object' or octet_length(p_payload::text)>1000000 then raise exception 'The workspace is too large'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 select * into previous from public.fb_desk where workspace_id=p_workspace for update;
 if member_role not in ('owner','manager') and ((p_payload->'restaurant') is distinct from (previous.payload->'restaurant') or (p_payload->'connectors') is distinct from (previous.payload->'connectors')) then raise exception 'Only an owner or manager can change restaurant information and connections'; end if;
 if previous.workspace_id is null then
   if p_version<>0 then raise exception 'Refresh the workspace before saving' using errcode='40001'; end if;
   insert into public.fb_desk(workspace_id,payload) values(p_workspace,p_payload) returning * into saved;
 else
   if previous.version<>p_version then raise exception 'A teammate updated the workspace. Refresh and retry your change.' using errcode='40001'; end if;
   update public.fb_desk set payload=p_payload,version=version+1,updated_at=now() where workspace_id=p_workspace returning * into saved;
 end if;
 return saved;
end $$;
create function public.fb_save_desk(p_workspace uuid,p_payload jsonb,p_version integer) returns public.fb_desk language sql security invoker set search_path='' as $$select private.fb_save_desk(p_workspace,p_payload,p_version);$$;

create function private.fb_set_member(p_workspace uuid,p_user uuid,p_role text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
 if p_user=auth.uid() and p_role is null then
   if length(trim(p_name)) not between 1 and 80 then raise exception 'Enter a display name'; end if;
   update public.fb_members set display_name=trim(p_name) where workspace_id=p_workspace and user_id=p_user;
 else
   if not exists(select 1 from public.fb_workspaces where id=p_workspace and owner_id=auth.uid()) then raise exception 'Only the owner can change roles'; end if;
   if p_role not in ('manager','staff') or p_role is null then raise exception 'Choose manager or staff'; end if;
   if exists(select 1 from public.fb_workspaces where id=p_workspace and owner_id=p_user) then raise exception 'The owner role cannot be changed'; end if;
   update public.fb_members set role=p_role where workspace_id=p_workspace and user_id=p_user;
   if not found then raise exception 'This teammate is not in the workspace'; end if;
 end if;
end $$;
create function public.fb_set_member(p_workspace uuid,p_user uuid,p_role text,p_name text) returns void language sql security invoker set search_path='' as $$select private.fb_set_member(p_workspace,p_user,p_role,p_name);$$;

create function private.fb_create_guest_review(p_workspace uuid,p_case uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare record public.fb_cases; token text; summary jsonb; session jsonb;
begin
 if not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
 select * into record from public.fb_cases where id=p_case and workspace_id=p_workspace for update;
 if record.id is null or record.version<>p_version or record.archived then raise exception 'Reopen and save the current enquiry before sharing'; end if;
 session:=record.payload->'session';
 if coalesce((session->>'pendingAnalysis')::boolean,false) or (session->'brief'->>'approvedRevision') is null or (session->'brief'->>'approvedRevision') is distinct from (session->'brief'->>'revision') or exists(select 1 from jsonb_each(session->'brief'->'fields') where value->>'status'<>'resolved' or coalesce(value->>'value','')='' or coalesce(value->'review','null'::jsonb)<>'null'::jsonb) then raise exception 'Approve the complete brief before creating a guest review link'; end if;
 select jsonb_object_agg(key,value->'value') into summary from jsonb_each(session->'brief'->'fields');
 summary:=summary||jsonb_build_object('guestCare',jsonb_build_object('name',coalesce(session->'guestCare'->>'name',''),'dietary',coalesce(session->'guestCare'->>'dietary',''),'seating',coalesce(session->'guestCare'->>'seating',''),'occasion',coalesce(session->'guestCare'->>'occasion','')));
 token:=encode(extensions.gen_random_bytes(32),'hex');
 update private.fb_guest_reviews set revoked=true where case_id=p_case and not revoked;
 insert into private.fb_guest_reviews(token_hash,workspace_id,case_id,case_version,snapshot) values(encode(extensions.digest(token,'sha256'),'hex'),p_workspace,p_case,p_version,summary);
 return jsonb_build_object('token',token,'expiresAt',now()+interval '72 hours');
end $$;
create function public.fb_create_guest_review(p_workspace uuid,p_case uuid,p_version integer) returns jsonb language sql security invoker set search_path='' as $$select private.fb_create_guest_review(p_workspace,p_case,p_version);$$;
create function private.fb_revoke_guest_reviews(p_workspace uuid,p_case uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
 update private.fb_guest_reviews set revoked=true where workspace_id=p_workspace and case_id=p_case;
end $$;
create function public.fb_revoke_guest_reviews(p_workspace uuid,p_case uuid) returns void language sql security invoker set search_path='' as $$select private.fb_revoke_guest_reviews(p_workspace,p_case);$$;

create function private.fb_receive_enquiry(p_workspace uuid,p_case uuid,p_title text,p_payload jsonb,p_event jsonb,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare desk public.fb_desk; existing text; workflow jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 select * into desk from public.fb_desk where workspace_id=p_workspace for update;
 if desk.workspace_id is null then raise exception 'Set up the restaurant workspace first'; end if;
 if p_actor is not null and not exists(select 1 from public.fb_members where workspace_id=p_workspace and user_id=p_actor) then raise exception 'You do not have access to this team'; end if;
 if p_actor is null and not coalesce((desk.payload->'restaurant'->>'published')::boolean,false) then raise exception 'This restaurant is not accepting website enquiries'; end if;
 select item->>'caseId' into existing from jsonb_array_elements(coalesce(desk.payload->'inbox','[]'::jsonb)) item where item->>'id'=p_event->>'id';
 if existing is not null then return existing::uuid; end if;
 if (select count(*) from public.fb_cases where workspace_id=p_workspace)>=200 or jsonb_array_length(coalesce(desk.payload->'inbox','[]'::jsonb))>=300 then raise exception 'This restaurant has reached its enquiry limit'; end if;
 if octet_length(p_payload::text)>250000 or length(p_title) not between 1 and 80 or jsonb_typeof(p_payload->'session')<>'object' then raise exception 'Check the enquiry'; end if;
 insert into public.fb_cases(id,workspace_id,title,payload,updated_by) values(p_case,p_workspace,p_title,p_payload,p_actor);
 workflow:=jsonb_build_object('stage','needs_reply','priority','normal','assigneeId',null,'dueAt',null,'task','','escalationMinutes',60,'guestId',null);
 update public.fb_desk set payload=jsonb_set(jsonb_set(desk.payload,'{inbox}',jsonb_build_array(p_event)||coalesce(desk.payload->'inbox','[]'::jsonb)),'{workflows}',coalesce(desk.payload->'workflows','{}'::jsonb)||jsonb_build_object(p_case::text,workflow)),version=version+1,updated_at=now() where workspace_id=p_workspace;
 return p_case;
end $$;
create function public.fb_receive_enquiry(p_workspace uuid,p_case uuid,p_title text,p_payload jsonb,p_event jsonb,p_actor uuid) returns uuid language sql security invoker set search_path='' as $$select private.fb_receive_enquiry(p_workspace,p_case,p_title,p_payload,p_event,p_actor);$$;

create function private.fb_view_guest_review(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link private.fb_guest_reviews; version integer;
begin
 if length(p_token)<>64 then raise exception 'This review link is invalid or expired'; end if;
 select * into link from private.fb_guest_reviews where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not revoked and expires_at>now();
 if link.token_hash is null then raise exception 'This review link is invalid or expired'; end if;
 select c.version into version from public.fb_cases c where c.id=link.case_id and not c.archived;
 if version is null or (link.submitted_at is null and version<>link.case_version) then raise exception 'The enquiry changed. Ask the team for a new review link'; end if;
 return jsonb_build_object('snapshot',link.snapshot,'expiresAt',link.expires_at,'submittedAt',link.submitted_at);
end $$;
create function public.fb_view_guest_review(p_token text) returns jsonb language sql security invoker set search_path='' as $$select private.fb_view_guest_review(p_token);$$;

create function private.fb_submit_guest_review(p_token text,p_message text,p_changed boolean,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link private.fb_guest_reviews; record public.fb_cases; desk public.fb_desk; session jsonb; event jsonb;
begin
 select * into link from private.fb_guest_reviews where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not revoked and expires_at>now() for update;
 if link.token_hash is null then raise exception 'This review link is invalid or expired'; end if;
 if link.submitted_at is not null then
   if link.submission_hash=p_hash then return jsonb_build_object('submittedAt',link.submitted_at); end if;
   raise exception 'These details have already been sent to the team';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(link.workspace_id::text,0));
 select * into record from public.fb_cases where id=link.case_id and not archived for update;
 if record.id is null or record.version<>link.case_version then raise exception 'The enquiry changed. Ask the team for a new review link'; end if;
 if length(p_message) not between 1 and 1000 or length(p_hash)<>64 then raise exception 'Check your changes'; end if;
 session:=record.payload->'session';
 if p_changed then
   if jsonb_array_length(session->'messages')>=30 then raise exception 'The team needs to reopen this enquiry before accepting another change'; end if;
   session:=jsonb_set(jsonb_set(jsonb_set(session,'{messages}',session->'messages'||jsonb_build_array(jsonb_build_object('id','guest_'||gen_random_uuid()::text,'speaker','customer','text',p_message))),'{pendingAnalysis}','true'::jsonb),'{brief,approvedRevision}','null'::jsonb);
   update public.fb_cases set payload=jsonb_set(payload,'{session}',session),version=version+1,updated_by=null,updated_at=now() where id=link.case_id;
 end if;
 select * into desk from public.fb_desk where workspace_id=link.workspace_id for update;
 if jsonb_array_length(coalesce(desk.payload->'inbox','[]'::jsonb))>=300 then raise exception 'The team inbox is full. Please contact the restaurant'; end if;
 event:=jsonb_build_object('id','review:'||gen_random_uuid()::text,'channel','guest_review','from','','name',coalesce(link.snapshot->'guestCare'->>'name','Guest'),'text',p_message,'caseId',link.case_id,'receivedAt',now(),'simulation',false,'read',false,'replies','[]'::jsonb);
 update public.fb_desk set payload=jsonb_set(desk.payload,'{inbox}',jsonb_build_array(event)||coalesce(desk.payload->'inbox','[]'::jsonb)),version=version+1,updated_at=now() where workspace_id=link.workspace_id;
 update private.fb_guest_reviews set submitted_at=now(),submission_hash=p_hash where token_hash=link.token_hash;
 return jsonb_build_object('submittedAt',now());
end $$;
create function public.fb_submit_guest_review(p_token text,p_message text,p_changed boolean,p_hash text) returns jsonb language sql security invoker set search_path='' as $$select private.fb_submit_guest_review(p_token,p_message,p_changed,p_hash);$$;

revoke all on function private.fb_save_desk(uuid,jsonb,integer),public.fb_save_desk(uuid,jsonb,integer),private.fb_set_member(uuid,uuid,text,text),public.fb_set_member(uuid,uuid,text,text),private.fb_create_guest_review(uuid,uuid,integer),public.fb_create_guest_review(uuid,uuid,integer),private.fb_revoke_guest_reviews(uuid,uuid),public.fb_revoke_guest_reviews(uuid,uuid) from public;
grant execute on function private.fb_save_desk(uuid,jsonb,integer),public.fb_save_desk(uuid,jsonb,integer),private.fb_set_member(uuid,uuid,text,text),public.fb_set_member(uuid,uuid,text,text),private.fb_create_guest_review(uuid,uuid,integer),public.fb_create_guest_review(uuid,uuid,integer),private.fb_revoke_guest_reviews(uuid,uuid),public.fb_revoke_guest_reviews(uuid,uuid) to authenticated;
revoke all on function private.fb_receive_enquiry(uuid,uuid,text,jsonb,jsonb,uuid),public.fb_receive_enquiry(uuid,uuid,text,jsonb,jsonb,uuid),private.fb_view_guest_review(text),public.fb_view_guest_review(text),private.fb_submit_guest_review(text,text,boolean,text),public.fb_submit_guest_review(text,text,boolean,text) from public;
grant execute on function private.fb_receive_enquiry(uuid,uuid,text,jsonb,jsonb,uuid),public.fb_receive_enquiry(uuid,uuid,text,jsonb,jsonb,uuid),private.fb_view_guest_review(text),public.fb_view_guest_review(text),private.fb_submit_guest_review(text,text,boolean,text),public.fb_submit_guest_review(text,text,boolean,text) to service_role;
