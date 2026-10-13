create or replace function private.fb_submit_guest_review(p_token text,p_message text,p_changed boolean,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link private.fb_guest_reviews; record public.fb_cases; desk public.fb_desk; session jsonb; event jsonb; next_payload jsonb; workflow jsonb;
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
   session:=jsonb_set(jsonb_set(jsonb_set(session,'{messages}',session->'messages'||jsonb_build_array(jsonb_build_object('id','g_'||gen_random_uuid()::text,'speaker','customer','text',p_message))),'{pendingAnalysis}','true'::jsonb),'{brief,approvedRevision}','null'::jsonb);
   update public.fb_cases set payload=jsonb_set(record.payload,'{session}',session),version=version+1,updated_by=null,updated_at=now() where id=link.case_id;
 end if;
 select * into desk from public.fb_desk where workspace_id=link.workspace_id for update;
 if jsonb_array_length(coalesce(desk.payload->'inbox','[]'::jsonb))>=300 then raise exception 'The team inbox is full. Please contact the restaurant'; end if;
 event:=jsonb_build_object('id','review:'||gen_random_uuid()::text,'channel','guest_review','from','','name',coalesce(link.snapshot->'guestCare'->>'name','Guest'),'text',p_message,'caseId',link.case_id,'receivedAt',now(),'simulation',false,'read',false,'replies','[]'::jsonb);
 next_payload:=jsonb_set(desk.payload,'{inbox}',jsonb_build_array(event)||coalesce(desk.payload->'inbox','[]'::jsonb));
 if p_changed then
   workflow:=coalesce(next_payload->'workflows'->link.case_id::text,jsonb_build_object('stage','needs_reply','priority','normal','assigneeId',null,'dueAt',null,'task','','escalationMinutes',60,'guestId',null));
   workflow:=jsonb_set(workflow,'{stage}','"needs_reply"'::jsonb);
   next_payload:=jsonb_set(next_payload,'{workflows}',coalesce(next_payload->'workflows','{}'::jsonb)||jsonb_build_object(link.case_id::text,workflow));
 end if;
 update public.fb_desk set payload=next_payload,version=version+1,updated_at=now() where workspace_id=link.workspace_id;
 update private.fb_guest_reviews set submitted_at=now(),submission_hash=p_hash where token_hash=link.token_hash;
 return jsonb_build_object('submittedAt',now());
end $$;
