-- Serialise guest review and channel changes with staff saves.
create or replace function private.fb_create_guest_review(p_workspace uuid,p_case uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare record public.fb_cases; token text; summary jsonb; session jsonb;
begin
 if not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 select * into record from public.fb_cases where id=p_case and workspace_id=p_workspace for update;
 if record.id is null or record.version<>p_version or record.archived then raise exception 'Reopen and save the current enquiry before sharing'; end if;
 session:=record.payload->'session';
 if coalesce(jsonb_typeof(session->'brief'->'fields'),'null')<>'object' or not (session->'brief'->'fields' ?& array['restaurantName','city','date','time','partySize']) or (select count(*) from jsonb_object_keys(session->'brief'->'fields'))<>5 then raise exception 'Approve the complete brief before creating a guest review link'; end if;
 if coalesce((session->>'pendingAnalysis')::boolean,false) or (session->'brief'->>'approvedRevision') is null or (session->'brief'->>'approvedRevision') is distinct from (session->'brief'->>'revision') or exists(select 1 from jsonb_each(session->'brief'->'fields') where (value->>'status') is distinct from 'resolved' or coalesce(value->>'value','')='' or coalesce(value->'review','null'::jsonb)<>'null'::jsonb) then raise exception 'Approve the complete brief before creating a guest review link'; end if;
 select jsonb_object_agg(key,value->'value') into summary from jsonb_each(session->'brief'->'fields');
 summary:=summary||jsonb_build_object('guestCare',jsonb_build_object('name',coalesce(session->'guestCare'->>'name',''),'dietary',coalesce(session->'guestCare'->>'dietary',''),'seating',coalesce(session->'guestCare'->>'seating',''),'occasion',coalesce(session->'guestCare'->>'occasion','')));
 token:=encode(extensions.gen_random_bytes(32),'hex');
 update private.fb_guest_reviews set revoked=true where case_id=p_case and not revoked;
 insert into private.fb_guest_reviews(token_hash,workspace_id,case_id,case_version,snapshot) values(encode(extensions.digest(token,'sha256'),'hex'),p_workspace,p_case,p_version,summary);
 return jsonb_build_object('token',token,'expiresAt',now()+interval '72 hours');
end $$;

create or replace function private.fb_submit_guest_review(p_token text,p_message text,p_changed boolean,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link private.fb_guest_reviews; record public.fb_cases; desk public.fb_desk; session jsonb; event jsonb;
begin
 select * into link from private.fb_guest_reviews where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not revoked and expires_at>now();
 if link.token_hash is null then raise exception 'This review link is invalid or expired'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(link.workspace_id::text,0));
 select * into link from private.fb_guest_reviews where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not revoked and expires_at>now() for update;
 if link.token_hash is null then raise exception 'This review link is invalid or expired'; end if;
 if link.submitted_at is not null then
   if link.submission_hash=p_hash then return jsonb_build_object('submittedAt',link.submitted_at); end if;
   raise exception 'These details have already been sent to the team';
 end if;
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

create or replace function private.fb_revoke_guest_reviews(p_workspace uuid,p_case uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.fb_is_member(p_workspace) then raise exception 'You do not have access to this team'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 update private.fb_guest_reviews set revoked=true where workspace_id=p_workspace and case_id=p_case;
end $$;

create function private.fb_append_channel_message(p_workspace uuid,p_case uuid,p_case_version integer,p_desk_version integer,p_event jsonb,p_reply boolean,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare desk public.fb_desk; record public.fb_cases; session jsonb; inbox jsonb; workflow jsonb; matched boolean;
begin
 if not exists(select 1 from public.fb_members where workspace_id=p_workspace and user_id=p_actor) then raise exception 'You do not have access to this team'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 select * into desk from public.fb_desk where workspace_id=p_workspace for update;
 select * into record from public.fb_cases where workspace_id=p_workspace and id=p_case and not archived for update;
 if desk.workspace_id is null or record.id is null then raise exception 'This enquiry could not be found in your team'; end if;
 inbox:=coalesce(desk.payload->'inbox','[]'::jsonb);
 if not p_reply and exists(select 1 from jsonb_array_elements(inbox) item where item->>'id'=p_event->>'id') then return p_case; end if;
 if p_reply and exists(select 1 from jsonb_array_elements(inbox) item, jsonb_array_elements(item->'replies') reply where reply->>'id'=p_event->>'id') then return p_case; end if;
 if desk.version<>p_desk_version or record.version<>p_case_version then raise exception 'A teammate updated the enquiry. Refresh before replying.' using errcode='40001'; end if;
 if length(p_event->>'text') not between 1 and 1000 then raise exception 'Write a message of up to 1000 characters'; end if;
 session:=record.payload->'session';
 if coalesce(jsonb_typeof(session->'messages'),'null')<>'array' or jsonb_array_length(session->'messages')>=30 then raise exception 'This enquiry has reached its message limit. Start a new enquiry.'; end if;
 if p_reply then
   select exists(select 1 from jsonb_array_elements(inbox) item where item->>'id'=p_event->>'inboxId' and item->>'caseId'=p_case::text and (item->>'simulation')::boolean and item->>'channel' in ('email','whatsapp') and jsonb_array_length(item->'replies')<30) into matched;
   if not matched then raise exception 'Choose an email or WhatsApp simulation with room for another reply'; end if;
   select jsonb_agg(case when item->>'id'=p_event->>'inboxId' then jsonb_set(jsonb_set(item,'{read}','true'::jsonb),'{replies}',item->'replies'||jsonb_build_array(p_event-'inboxId')) else item end) into inbox from jsonb_array_elements(inbox) item;
 else
   if jsonb_array_length(inbox)>=300 then raise exception 'This restaurant has reached its enquiry limit'; end if;
   inbox:=jsonb_build_array(p_event)||inbox;
 end if;
 session:=jsonb_set(jsonb_set(jsonb_set(session,'{messages}',session->'messages'||jsonb_build_array(jsonb_build_object('id','channel_'||gen_random_uuid()::text,'speaker',case when p_reply then 'staff' else 'customer' end,'text',p_event->>'text'))),'{pendingAnalysis}','true'::jsonb),'{brief,approvedRevision}','null'::jsonb);
 update public.fb_cases set payload=jsonb_set(payload,'{session}',session),version=version+1,updated_by=p_actor,updated_at=now() where id=p_case;
 workflow:=coalesce(desk.payload->'workflows'->p_case::text,jsonb_build_object('stage','needs_reply','priority','normal','assigneeId',null,'dueAt',null,'task','','escalationMinutes',60,'guestId',null));
 workflow:=jsonb_set(workflow,'{stage}',to_jsonb(case when p_reply then 'under_review' else 'needs_reply' end));
 update public.fb_desk set payload=jsonb_set(jsonb_set(desk.payload,'{inbox}',inbox),'{workflows}',coalesce(desk.payload->'workflows','{}'::jsonb)||jsonb_build_object(p_case::text,workflow)),version=version+1,updated_at=now() where workspace_id=p_workspace;
 return p_case;
end $$;
create function public.fb_append_channel_message(p_workspace uuid,p_case uuid,p_case_version integer,p_desk_version integer,p_event jsonb,p_reply boolean,p_actor uuid) returns uuid language sql security invoker set search_path='' as $$select private.fb_append_channel_message(p_workspace,p_case,p_case_version,p_desk_version,p_event,p_reply,p_actor);$$;
revoke all on function private.fb_append_channel_message(uuid,uuid,integer,integer,jsonb,boolean,uuid),public.fb_append_channel_message(uuid,uuid,integer,integer,jsonb,boolean,uuid) from public;
grant execute on function private.fb_append_channel_message(uuid,uuid,integer,integer,jsonb,boolean,uuid),public.fb_append_channel_message(uuid,uuid,integer,integer,jsonb,boolean,uuid) to service_role;
