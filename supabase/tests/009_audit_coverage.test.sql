-- Every function that changes data writes an audit entry (plan B5, ID-50).
begin;
\ir fixture.psql
select plan(4);

select tests.as_owner();
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.prosrc ~* '(insert into|update public|delete from)'
     and p.prosrc !~* 'app\.(audit|swap_owner|apply_agency_profile)\('
     and p.proname not in ('mark_notifications_read')),
  '{}'::text[],
  'every function that changes data writes an audit entry');

select count(*) as before from audit_logs where action = 'user.profile_updated' and entity_id = tests.id('u_f1') \gset
select tests.login('f1');
select update_my_profile('{"full_name":"Fatima F","timezone":"Asia/Jakarta"}'::jsonb);
select tests.as_owner();
select is((select count(*)::int from audit_logs where action = 'user.profile_updated' and entity_id = tests.id('u_f1')), :before + 1, 'a profile update is recorded');
select is((select metadata->'fields' ? 'full_name' from audit_logs where action = 'user.profile_updated' and entity_id = tests.id('u_f1') order by id desc limit 1), true, 'the record names the fields, not the values');

select tests.as_service();
select sync_clerk_user('brandnew', 'brand.new@example.com', 'Brand New', null);
select sync_clerk_user('brandnew', 'brand.new@example.com', 'Brand New', null);
select tests.as_owner();
select is((select count(*)::int from audit_logs where action = 'user.signed_up' and summary like 'brand.new@example.com%'), 1, 'a new account is recorded once, not on every sign-in');

select * from finish();
rollback;
