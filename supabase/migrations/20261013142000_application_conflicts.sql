-- An outdated application version is an HTTP conflict, not a database
-- serialization failure. PostgREST may retry SQLSTATE 40001 indefinitely.
do $$
declare routine record;
begin
  for routine in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.prokind='f'
      and p.proname in ('fb_save_case','fb_save_desk','fb_save_desk_secure','fb_append_channel_message','fb_save_desk_for_case')
      and p.prosrc like '%40001%'
  loop
    execute replace(pg_get_functiondef(routine.oid), '''40001''', '''PT409''');
  end loop;
end $$;
