-- Agency people, invitations, requests, onboarding and bootstrap rules (tests 4, 5, 7–10).
begin;
\ir fixture.psql
select plan(37);

-- One Manager per agency; only the Owner manages the Manager (#5)
select tests.login('o1');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MANAGER', 'second@alpha.io', tests.id('org1'))), 'CG409', 'a second Manager cannot be invited');
select tests.login('m1');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MANAGER', 'x@alpha.io', tests.id('org1'))), 'CG403', 'the Manager cannot invite a Manager');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'third@alpha.io', tests.id('org1'))), 'OK', 'the Manager can invite Members');
select is(tests.err(format('select remove_member(%L)', tests.id('ms_o1'))), 'CG403', 'the Manager cannot remove the Owner');
select is(tests.err(format('select remove_member(%L, %L)', tests.id('ms_mem1b'), 'Left the company')), 'OK', 'the Manager can remove a Member');
select tests.as_owner();
select is((select status from organization_memberships where id = tests.id('ms_mem1b')), 'REMOVED', 'removed membership is kept as history');

-- Members and other agencies cannot manage
select tests.login('mem1');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'y@alpha.io', tests.id('org1'))), 'CG403', 'Members cannot invite');
select tests.login('o2');
select is(tests.err(format('select remove_member(%L)', tests.id('ms_mem1'))), 'CG403', 'another agency cannot remove our Member');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'z@beta.io', tests.id('org1'))), 'CG403', 'another agency cannot invite into our agency');

-- Invitation eligibility
select tests.login('o1');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'free@lancer.com', tests.id('org1'))), 'CG409', 'direct freelancers cannot be invited');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'member@beta.io', tests.id('org1'))), 'CG409', 'people in another agency cannot be invited');
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'third@alpha.io', tests.id('org1'))), 'CG409', 'one pending invitation per email');
select (create_invitation('AGENCY_MEMBER', 'newbie@example.com', tests.id('org1'))) ->> 'token' as tok_new \gset
select tests.login('mem1');
select is(tests.err(format('select accept_invitation(%L)', :'tok_new')), 'CG403', 'an invitation only works for its email');
select tests.as_owner();
update invitations set expires_at = now() - interval '1 minute' where email = 'newbie@example.com';
select tests.login('new1');
select is(tests.err(format('select accept_invitation(%L)', :'tok_new')), 'CG409', 'expired invitations cannot be accepted');
select tests.login('o1');
select (resend_invitation((select id from invitations where email = 'newbie@example.com'))) ->> 'token' as tok_new2 \gset
select tests.login('new1');
select is(tests.err(format('select accept_invitation(%L)', :'tok_new')), 'CG404', 'the old token stops working after a resend');
select is(tests.err(format('select accept_invitation(%L)', :'tok_new2')), 'OK', 'the re-sent invitation works');
select is(tests.err(format('select accept_invitation(%L)', :'tok_new2')), 'CG409', 'an invitation works only once');
select tests.login('f1');
select is(tests.err($$select submit_agency_application('{"name":"Fake","legal_name":"Fake","country_code":"IN","tax_id":"1","contact_name":"F","contact_email":"f@x.com","contact_phone_e164":"+919876543210","website_url":"https://x.com"}')$$), 'CG409', 'a direct freelancer cannot also register an agency');

-- Profile changes need Super Admin approval (#7)
select tests.login('mem1');
select is(tests.err($$select request_agency_change('PROFILE_CHANGE', '{"changes":{"website_url":"https://new.alpha.io"}}')$$), 'CG403', 'Members cannot request profile changes');
select tests.login('m1');
select request_agency_change('PROFILE_CHANGE', '{"changes":{"website_url":"https://new.alpha.io"}}') as req_profile \gset
select is(tests.err($$select request_agency_change('DEACTIVATION', '{}')$$), 'CG403', 'only the Owner requests deactivation');
select is(tests.err($$select request_agency_change('PROFILE_CHANGE', '{"changes":{"website_url":"https://other.io"}}')$$), 'CG409', 'one pending request per type');
select is(tests.err($$select request_agency_change('PROFILE_CHANGE', '{"changes":{"evil":"x"}}')$$), 'CG422', 'unknown profile fields are rejected');
select is(tests.err(format('select decide_agency_request(%L, true)', :'req_profile')), 'CG403', 'agencies cannot approve their own requests');
select tests.login('sa');
select decide_agency_request(:'req_profile', true, 'Looks good');
select is((select website_url from agency_profiles where organization_id = tests.id('org1')), 'https://new.alpha.io', 'approved change is applied');

-- Ownership transfer: Owner requests, Super Admin approves (#9)
select tests.login('o1');
select request_agency_change('OWNERSHIP_TRANSFER', '{}') as req_transfer \gset
select tests.login('sa');
select decide_agency_request(:'req_transfer', true);
select tests.as_owner();
select is((select role from organization_memberships where id = tests.id('ms_m1')), 'AGENCY_OWNER', 'the Manager became Owner');
select is((select role from organization_memberships where id = tests.id('ms_o1')), 'AGENCY_MANAGER', 'the old Owner became Manager');
select tests.login('m1');
select is(tests.err(format('select remove_member(%L, %L)', tests.id('ms_o1'), 'test')), 'OK', 'the new Owner can remove the Manager');

-- Agency rejection and the 3-day wait (#13)
select tests.login('new1');
select is(tests.err($$select 1$$), 'OK', 'newbie is already in agency 1 (accepted above)');
select tests.as_service();
select sync_clerk_user('new2', 'founder@gamma.ai', 'Gil Founder', null);
select tests.login('new2');
select tests.apply_agency('{"name":"Gamma AI","legal_name":"Gamma AI FZ-LLC","country_code":"AE","registration_number":"DMCC-1",
  "contact_name":"Gil","contact_email":"founder@gamma.ai","contact_phone_e164":"+971501234567","website_url":"https://gamma.ai"}'::jsonb) as org3 \gset
select is(tests.err(format('select create_invitation(%L, %L, %L)', 'AGENCY_MEMBER', 'a@gamma.ai', :'org3')), 'CG409', 'pending agencies cannot invite');
select tests.login('sa');
select is(tests.err(format('select decide_agency(%L, %L)', :'org3', 'REJECT')), 'CG422', 'a rejection needs a reason');
select decide_agency(:'org3', 'REJECT', 'Registration document missing');
select tests.login('new2');
select is(tests.err($$select submit_agency_application('{"name":"Gamma AI","legal_name":"Gamma AI FZ-LLC","country_code":"AE","registration_number":"DMCC-1","contact_name":"Gil","contact_email":"founder@gamma.ai","contact_phone_e164":"+971501234567","website_url":"https://gamma.ai"}')$$), 'CG409', 'cannot re-apply within 3 days');
select tests.as_owner();
update organizations set reapply_after = now() - interval '1 second' where id = :'org3';
select tests.login('new2');
select is(tests.err($$select submit_agency_application('{"name":"Gamma AI","legal_name":"Gamma AI FZ-LLC","country_code":"AE","registration_number":"DMCC-1","contact_name":"Gil","contact_email":"founder@gamma.ai","contact_phone_e164":"+971501234567","website_url":"https://gamma.ai"}')$$), 'OK', 're-apply works after 3 days');
select tests.as_owner();
select is((select status from organizations where id = :'org3'), 'PENDING_VERIFICATION', 'the agency is pending again');

-- Super Admin and bootstrap (#16, test 10)
select tests.as_service();
select is(tests.err($$select bootstrap_super_admin('pm@cohortdata.com')$$), 'CG409', 'bootstrap refuses when a Super Admin exists');
select tests.as_owner();
select is(tests.err(format('insert into user_roles (user_id, role_code, role_scope) values (%L, %L, %L)', tests.id('u_pm'), 'SUPER_ADMIN', 'PLATFORM')), '23505', 'the database allows only one Super Admin');
select is(tests.err(format('insert into organization_memberships (organization_id, user_id, role) values (%L, %L, %L)', tests.id('org2'), tests.id('u_mem1'), 'AGENCY_MEMBER')), '23505', 'the database allows one organization per user');
select tests.login('pm');
select is(tests.err($$select create_invitation('PLATFORM_STAFF', 'x@cohortdata.com', null, 'QC_REVIEWER')$$), 'CG403', 'only the Super Admin invites staff');

select * from finish();
rollback;
