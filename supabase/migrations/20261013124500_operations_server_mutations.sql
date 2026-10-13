-- Operations mutations run through the authenticated application boundary.
-- Only the application service can supply the verified actor identity.
revoke execute on function private.fb_save_desk(uuid,jsonb,integer),public.fb_save_desk(uuid,jsonb,integer) from authenticated;
create function private.fb_save_desk_secure(p_workspace uuid,p_payload jsonb,p_version integer,p_actor uuid) returns public.fb_desk
language plpgsql security definer set search_path='' as $$
declare previous public.fb_desk; saved public.fb_desk; member_role text;
begin
 select role into member_role from public.fb_members where workspace_id=p_workspace and user_id=p_actor;
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
create function public.fb_save_desk_secure(p_workspace uuid,p_payload jsonb,p_version integer,p_actor uuid) returns public.fb_desk language sql security invoker set search_path='' as $$select private.fb_save_desk_secure(p_workspace,p_payload,p_version,p_actor);$$;
revoke all on function private.fb_save_desk_secure(uuid,jsonb,integer,uuid),public.fb_save_desk_secure(uuid,jsonb,integer,uuid) from public;
grant execute on function private.fb_save_desk_secure(uuid,jsonb,integer,uuid),public.fb_save_desk_secure(uuid,jsonb,integer,uuid) to service_role;
