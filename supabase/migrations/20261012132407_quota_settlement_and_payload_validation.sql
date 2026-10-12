create or replace function private.fb_save_case(p_workspace uuid, p_id uuid, p_title text, p_payload jsonb, p_archived boolean, p_expected_version integer) returns public.fb_cases
language plpgsql security definer set search_path = '' as $$
declare previous public.fb_cases; saved public.fb_cases;
begin
  if auth.uid() is null or not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
  if length(trim(p_title)) not between 1 and 80 or octet_length(p_payload::text) > 250000 or coalesce(jsonb_typeof(p_payload->'session'), 'null') <> 'object' then raise exception 'Check the case name and booking details'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text, 0));
  select * into previous from public.fb_cases where id = p_id for update;
  if previous.id is not null then
    if previous.workspace_id <> p_workspace then raise exception 'This case belongs to another team'; end if;
    if previous.version <> p_expected_version and previous.payload = p_payload and previous.title = trim(p_title) and previous.archived = p_archived then return previous; end if;
    if previous.version <> p_expected_version then raise exception 'Another teammate updated this case. Reopen the latest version before saving.' using errcode = '40001'; end if;
    update public.fb_cases set title = trim(p_title), payload = p_payload, archived = p_archived, version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_id returning * into saved;
  else
    if p_expected_version <> 0 then raise exception 'This case no longer exists. Reopen your case list.'; end if;
    if (select count(*) from public.fb_cases where workspace_id = p_workspace) >= 200 then raise exception 'This team has reached 200 saved cases'; end if;
    insert into public.fb_cases(id, workspace_id, title, payload, archived, updated_by) values (p_id, p_workspace, trim(p_title), p_payload, p_archived, auth.uid()) returning * into saved;
  end if;
  return saved;
end $$;
