-- Security tests 1–3, 6, 7 (docs/architecture.md 6.7): anonymous access, unknown users,
-- cross-agency isolation, direct writes, secrets, audit visibility.
begin;
\ir fixture.psql
select plan(28);

-- 1. anon gets nothing
select tests.as_anon();
select is(tests.err('select count(*) from public.users'), '42501', 'anon cannot read users');
select is(tests.err('select count(*) from public.projects'), '42501', 'anon cannot read projects');
select is(tests.err('select get_my_context()'), '42501', 'anon cannot call functions');

-- 2. a Clerk user with no users row sees nothing
select tests.login('ghost');
select is((select count(*)::int from organizations), 0, 'unknown user sees no organizations');
select is((select count(*)::int from users), 0, 'unknown user sees no users');
select is(tests.err($$select create_project('{"code":"X1","title":"Hack"}')$$), 'CG401', 'unknown user cannot act');

-- 3. agency isolation
select tests.login('o1');
select is((select count(*)::int from organizations where type = 'AGENCY'), 1, 'owner sees only their own agency');
select is((select count(*)::int from organizations where id = tests.id('org2')), 0, 'owner cannot see agency 2 by id');
select is((select count(*)::int from organization_memberships), 4, 'owner sees their 4 memberships only');
select is((select count(*)::int from users where id = tests.id('u_mem2')), 0, 'owner cannot see agency 2 member');
select is((select count(*)::int from invitations where organization_id = tests.id('org2')), 0, 'owner cannot see agency 2 invitations');
select is((select count(*)::int from agency_profiles), 1, 'owner sees one agency profile');

select tests.login('mem1');
select is((select count(*)::int from organization_memberships), 1, 'member sees only their own membership');
select is((select count(*)::int from agency_profiles), 0, 'member cannot see the agency profile');
select is((select count(*)::int from users), 1, 'member sees only themselves');

select tests.login('f1');
select is((select count(*)::int from organizations), 0, 'direct freelancer sees no organizations');

-- 6. no direct writes, even to own rows
select tests.login('o1');
select is(tests.err($$update organizations set name = 'Renamed'$$), '42501', 'no direct UPDATE on organizations');
select is(tests.err(format('insert into organization_memberships (organization_id, user_id, role) values (%L, %L, %L)',
  tests.id('org2'), tests.id('u_o1'), 'AGENCY_OWNER')), '42501', 'no direct INSERT into memberships');
select is(tests.err($$update users set registration_path = 'STAFF'$$), '42501', 'cannot change own registration path');
select is(tests.err($$delete from audit_logs$$), '42501', 'cannot delete audit logs');
select is(tests.err($$select * from invitation_tokens$$), '42501', 'invitation token hashes are unreadable');
select is(tests.err($$select * from email_outbox$$), '42501', 'email outbox is unreadable');
select is(tests.err($$select bootstrap_super_admin('owner@alpha.io')$$), '42501', 'users cannot call bootstrap');

-- Audit visibility (#30, #31)
select tests.login('o1');
select is((select count(*)::int from audit_logs where organization_id is distinct from tests.id('org1')), 0, 'owner sees only their agency audit');
select ok((select count(*)::int from audit_logs) > 0, 'owner sees some audit history');
select tests.login('mem1');
select is((select count(*)::int from audit_logs), 0, 'members see no audit history');
select tests.login('pm');
select is((select count(*)::int from audit_logs), 0, 'project managers do not see the audit log');
select tests.as_owner();
select count(*)::int as all_audit from audit_logs \gset
select tests.login('sa');
select is((select count(*)::int from audit_logs), :all_audit, 'super admin sees the whole audit log');

select * from finish();
rollback;
