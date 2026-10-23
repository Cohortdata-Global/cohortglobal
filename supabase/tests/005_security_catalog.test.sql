-- Structural security checks over the whole schema (plan item S1).
-- These fail if a future migration forgets RLS, grants writes, or opens a helper.
begin;
\ir fixture.psql
select plan(9);

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'app') and not c.relrowsecurity), 0,
  'every table has row-level security');

select is((select count(*)::int from information_schema.role_table_grants
  where grantee in ('anon', 'authenticated', 'PUBLIC') and table_schema in ('public', 'app') and privilege_type <> 'SELECT'), 0,
  'signed-in and anonymous users cannot insert, update or delete any table directly');

select is((select count(*)::int from information_schema.role_table_grants
  where grantee = 'anon' and table_schema in ('public', 'app')), 0,
  'anonymous users cannot read any table');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'EXECUTE')), 0,
  'anonymous users cannot run any function');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.prosecdef
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))), 0,
  'every SECURITY DEFINER function pins its search_path');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname not in ('clerk_sub', 'current_user_id', 'current_org_id', 'has_permission', 'has_org_permission',
                          'is_member_of', 'is_direct_freelancer', 'can_view_user', 'can_view_project',
                          'is_project_manager', 'is_project_staff', 'pm_can_see_event', 'pm_manages_assignment',
                          'is_qc_assignee', 'has_qc_work_in')), 0,
  'signed-in users can run only the read-only access helpers in app');

select ok(not has_function_privilege('authenticated', 'public.bootstrap_super_admin(text)', 'EXECUTE'),
  'the Super Admin bootstrap is not callable by signed-in users');

select ok(not has_function_privilege('authenticated', 'public.sync_clerk_user(text, text, text, text)', 'EXECUTE'),
  'user sync is not callable by signed-in users');

select is((select count(*)::int from pg_policy where 0 = any(polroles) or (select oid from pg_roles where rolname = 'anon') = any(polroles)), 0,
  'no row-level policy applies to anonymous users');

select * from finish();
rollback;
