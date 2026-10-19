begin;
\ir fixture.psql
select plan(8);
select is((select count(*)::int from users), 11, 'eleven users exist');
select is((select count(*)::int from user_roles where role_code = 'SUPER_ADMIN' and revoked_at is null), 1, 'exactly one Super Admin');
select is((select status from organizations where id = tests.id('org1')), 'ACTIVE', 'agency 1 approved');
select is((select role from organization_memberships where id = tests.id('ms_m1')), 'AGENCY_MANAGER', 'manager joined agency 1');
select is((select count(*)::int from organization_memberships where organization_id = tests.id('org1') and status = 'ACTIVE'), 4, 'agency 1 has owner, manager, two members');
select is((select status from projects where id = tests.id('proj')), 'PUBLISHED', 'project is published');
select is((select count(*)::int from project_questions where project_id = tests.id('proj')), 3, 'three questions');
select ok(exists(select 1 from audit_logs where action = 'platform.bootstrap'), 'bootstrap is audited');
select * from finish();
rollback;
