-- Projects, applications, contracts and member assignment (test 11 and the Phase 1 workflow).
begin;
\ir fixture.psql
select plan(43);

-- Who can see the published project
select tests.login('mem1');
select is((select count(*)::int from projects), 0, 'Members do not see open jobs (#1)');
select tests.login('f1');
select is((select count(*)::int from projects), 1, 'direct freelancer sees the open job');
select tests.login('o2');
select is((select count(*)::int from projects), 1, 'active agency sees the open job');
select is((select count(*)::int from project_questions), 3, 'and its questions');
select is((select count(*)::int from project_contract_templates), 0, 'but not the contract before approval');
select tests.login('new1');
select is((select count(*)::int from projects), 0, 'an account that is not set up sees no jobs');

-- Applying with answers
select tests.login('f1');
select is(tests.err(format('select submit_application(%L, %L)', tests.id('proj'), '{}')), 'CG422', 'required answers are enforced');
select is(tests.err(format('select submit_application(%L, %L)', tests.id('proj'),
  jsonb_build_object(tests.id('q1'), 'Just me', tests.id('q2'), jsonb_build_array('Mars')))), 'CG422', 'choices must come from the options');
select submit_application(tests.id('proj'), jsonb_build_object(tests.id('q1'), 'Just me', tests.id('q2'), jsonb_build_array('India'), tests.id('q3'), true)) as app_f1 \gset
select is(tests.err(format('select submit_application(%L, %L)', tests.id('proj'),
  jsonb_build_object(tests.id('q1'), 'Again', tests.id('q2'), jsonb_build_array('India')))), 'CG409', 'cannot apply twice');
select is(tests.err(format('update application_answers set value = %L', '"changed"')), '42501', 'answers cannot be edited (#23)');

select tests.login('mem1');
select is(tests.err(format('select submit_application(%L, %L)', tests.id('proj'), '{}')), 'CG403', 'Members cannot apply');
select tests.login('m1');
select submit_application(tests.id('proj'), jsonb_build_object(tests.id('q1'), '120 people', tests.id('q2'), jsonb_build_array('India', 'Indonesia'))) as app_o1 \gset
select tests.login('o2');
select is((select count(*)::int from project_applications), 0, 'agencies cannot see each other''s applications');

-- Tag and question locks (#20, #22)
select tests.login('pm');
select is(tests.err(format('select update_project(%L, %L)', tests.id('proj'), '{"applicant_type":"AGENCY"}')), 'CG409', 'applicant type is fixed once applications exist');
select is(tests.err(format('select save_project_questions(%L, %L)', tests.id('proj'), '[{"prompt":"New?","answer_type":"YES_NO"}]')), 'CG403', 'PMs cannot change questions after applications');
select tests.login('sa');
select is(save_project_questions(tests.id('proj'), '[{"prompt":"New?","answer_type":"YES_NO"}]'), 2, 'the Super Admin creates question version 2');
select tests.as_owner();
select is((select count(*)::int from project_questions where project_id = tests.id('proj') and version = 1), 3, 'version 1 questions are kept');

-- Decisions
select tests.login('o1');
select is(tests.err(format('select decide_application(%L, true)', :'app_f1')), 'CG403', 'agencies cannot decide applications');
select tests.login('pm');
select is(tests.err(format('select decide_application(%L, false)', :'app_f1')), 'CG422', 'a rejection needs a reason');
select decide_application(:'app_o1', true) as asg_o1 \gset
select decide_application(:'app_f1', true) as asg_f1 \gset
select tests.as_owner();
select is((select status from project_assignments where id = :'asg_o1'), 'AWAITING_SIGNATURE', 'approval creates an assignment waiting for signature');

-- Contract signing (#24–#29)
select tests.login('o1');
select is((select count(*)::int from project_contract_templates), 1, 'the approved agency can now read the contract');
select is(tests.err(format('select assign_member(%L, %L)', :'asg_o1', tests.id('ms_mem1'))), 'CG409', 'members cannot be assigned before both signatures');
select tests.login('m1');
select is(tests.err(format('select sign_contract(%L, %L)', :'asg_o1', 'Maya Manager')), 'CG403', 'only the Owner signs for the agency');
select tests.login('o1');
select is(tests.err(format('select sign_contract(%L, %L)', :'asg_o1', 'O')), 'CG422', 'a typed full name is required');
select sign_contract(:'asg_o1', 'Omar Owner', '203.0.113.7', 'test-agent');
select is(tests.err(format('select countersign_contract(%L, %L)', :'asg_o1', 'Omar Owner')), 'CG403', 'agencies cannot countersign');
select tests.login('f1');
select is(tests.err(format('select sign_contract(%L, %L)', :'asg_o1', 'Fatima')), 'CG409', 'cannot sign someone else''s contract');
select sign_contract(:'asg_f1', 'Fatima Freelancer');

-- Contract edits after a signature create a new version
select tests.login('pm');
select save_contract_template(tests.id('proj'), 'OC03 Collection Agreement v2', 'Updated terms for the face motion video collection project.') as tpl2 \gset
select tests.as_owner();
select is((select version from project_contract_templates where id = :'tpl2'), 2, 'editing a signed contract creates version 2');
select is((select t.version from project_assignments a join project_contract_templates t on t.id = a.contract_template_id where a.id = :'asg_o1'), 1,
  'the signed assignment keeps the text that was signed');

select tests.login('pm');
select countersign_contract(:'asg_o1', 'Priya PM', '198.51.100.2', 'test-agent');
select tests.as_owner();
select is((select status from project_assignments where id = :'asg_o1'), 'ACTIVE', 'both signatures make the assignment active');
select is((select count(distinct body_sha256)::int from contract_signatures where assignment_id = :'asg_o1'), 1, 'both parties signed the same text');

-- Member assignment
select tests.login('m1');
select assign_member(:'asg_o1', tests.id('ms_mem1')) as ma1 \gset
select is(tests.err(format('select assign_member(%L, %L)', :'asg_o1', tests.id('ms_mem1'))), 'CG409', 'cannot assign the same member twice');
select is(tests.err(format('select assign_member(%L, %L)', :'asg_o1', tests.id('ms_m1'))), 'CG422', 'only Agency Members are assigned');
select is(tests.err(format('select assign_member(%L, %L)', :'asg_o1', tests.id('ms_mem2'))), 'CG404', 'members of another agency cannot be assigned');
select tests.login('mem1');
select is((select count(*)::int from projects), 1, 'the assigned member now sees the project');
select is((select count(*)::int from member_assignments), 1, 'and their own assignment');
select is((select count(*)::int from project_applications), 0, 'but not the agency application');
select tests.login('mem1b');
select is((select count(*)::int from projects), 0, 'an unassigned member still sees nothing');
select tests.login('m1');
select unassign_member(:'ma1');
select tests.login('mem1');
select is((select count(*)::int from projects), 0, 'after unassignment the member loses the project');

-- Invite-only projects (#19)
select tests.login('pm');
select create_project('{"code":"UB03","title":"Code-switching audio","description":"Record natural bilingual conversations in two languages.",
  "applicant_type":"AGENCY","visibility":"INVITE_ONLY"}'::jsonb) as proj2 \gset
select is(tests.err(format('select set_project_status(%L, %L)', :'proj2', 'PUBLISHED')), 'CG409', 'cannot publish without a contract');
select save_contract_template(:'proj2', 'UB03 Agreement', 'Terms for recording bilingual conversations for CohortData.');
select set_project_status(:'proj2', 'PUBLISHED');
select tests.login('o2');
select is((select count(*)::int from projects where id = :'proj2'), 0, 'invite-only project is hidden');
select tests.login('pm');
select invite_agency_to_project(:'proj2', tests.id('org2'), 'We would love Beta on this one.');
select tests.login('o2');
select is((select count(*)::int from projects where id = :'proj2'), 1, 'the invited agency sees it');
select tests.login('f1');
select is((select count(*)::int from projects where id = :'proj2'), 0, 'freelancers do not see agency-only invite projects');

-- Suspension pauses member assignment (ID-31)
select tests.login('sa');
select set_agency_status(tests.id('org1'), 'SUSPENDED', 'Document check');
select tests.login('o1');
select is(tests.err(format('select assign_member(%L, %L)', :'asg_o1', tests.id('ms_mem1'))), 'CG409', 'a suspended agency cannot assign members');
select tests.login('sa');
select set_agency_status(tests.id('org1'), 'ACTIVE', null);
select tests.login('o1');
select isnt(assign_member(:'asg_o1', tests.id('ms_mem1')), null, 'after reactivation assignment works again');

select * from finish();
rollback;
