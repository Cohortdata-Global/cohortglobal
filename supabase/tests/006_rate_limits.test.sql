-- Invitation flood protection (plan item S4).
begin;
\ir fixture.psql
select plan(3);

select tests.as_owner();
-- Fill the Owner's hourly allowance up to exactly 100 invitations.
insert into invitations (purpose, email, organization_id, invited_by, expires_at)
select 'AGENCY_MEMBER', 'flood' || g || '@example.com', tests.id('org1'), tests.id('u_o1'), now() + interval '7 days'
from generate_series(1, 100 - (select count(*)::int from invitations where invited_by = tests.id('u_o1') and created_at > now() - interval '1 hour')) g;
select is(tests.err(format($q$insert into invitations (purpose, email, organization_id, invited_by, expires_at)
  values ('AGENCY_MEMBER', 'one-more@example.com', %L, %L, now() + interval '7 days')$q$, tests.id('org1'), tests.id('u_o1'))),
  'CG429', 'the 101st invitation within an hour is refused');

update invitations set send_count = 5 where email = 'flood1@example.com';
select is(tests.err($q$update invitations set send_count = 6 where email = 'flood1@example.com'$q$),
  'CG429', 'an invitation cannot be sent more than 5 times');

select tests.as_service();
select sync_clerk_user('nm1', 'named@example.com', null, null);
select tests.login('o2');
select (create_invitation('AGENCY_MEMBER', 'Named@Example.com', tests.id('org2'), null, null, null, '  Darshan Kumar ')) ->> 'id' as inv_named \gset
select tests.as_owner();
select is((select email || '|' || invitee_name from invitations where id = :'inv_named'), 'named@example.com|Darshan Kumar', 'an invitation keeps the invitee''s name');

select * from finish();
rollback;
