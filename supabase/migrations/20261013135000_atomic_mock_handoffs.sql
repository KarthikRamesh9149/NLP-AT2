-- Check the same saved case version while the simulated handoff is committed.
create function private.fb_save_desk_for_case(p_workspace uuid,p_payload jsonb,p_version integer,p_actor uuid,p_case uuid,p_case_version integer) returns public.fb_desk
language plpgsql security definer set search_path='' as $$
declare record public.fb_cases;
begin
 if not exists(select 1 from public.fb_members where workspace_id=p_workspace and user_id=p_actor) then raise exception 'You do not have access to this team'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 select * into record from public.fb_cases where workspace_id=p_workspace and id=p_case and not archived for update;
 if record.id is null or record.version<>p_case_version then raise exception 'The enquiry changed. Reopen and approve its latest version.' using errcode='40001'; end if;
 return private.fb_save_desk_secure(p_workspace,p_payload,p_version,p_actor);
end $$;
create function public.fb_save_desk_for_case(p_workspace uuid,p_payload jsonb,p_version integer,p_actor uuid,p_case uuid,p_case_version integer) returns public.fb_desk language sql security invoker set search_path='' as $$select private.fb_save_desk_for_case(p_workspace,p_payload,p_version,p_actor,p_case,p_case_version);$$;
revoke all on function private.fb_save_desk_for_case(uuid,jsonb,integer,uuid,uuid,integer),public.fb_save_desk_for_case(uuid,jsonb,integer,uuid,uuid,integer) from public;
grant execute on function private.fb_save_desk_for_case(uuid,jsonb,integer,uuid,uuid,integer),public.fb_save_desk_for_case(uuid,jsonb,integer,uuid,uuid,integer) to service_role;
