-- Phase 2D/2E: automatic checks, QC assignment, decisions, comments, resubmission (ID-56).
begin;
\ir fixture.psql
select plan(41);

\set cfg '{"intro":{"notice":"","instructions":"","videoUrl":""},"fields":[{"key":"full_name","label":"Full name","type":"text"},{"key":"email","label":"Email","type":"email","identity":true},{"key":"phone","label":"Phone","type":"phone"},{"key":"gender","label":"Gender","type":"select","options":["Male","Female"]}],"guides":[],"quotas":[],"consent":{"enabled":true,"title":"Consent","text":"I agree that CohortData may use my face video.","checkboxLabel":"I agree","signature":"either"},"files":[{"key":"video","label":"Your video","kind":"video","required":true,"maxMb":50,"minSeconds":10,"maxSeconds":30}],"ekyc":{"enabled":false,"note":"","backSide":"optional","maxMb":30},"limits":{"sessionHours":5,"maxPerContributor":5}}'
select tests.as_service();
select sync_clerk_user('qcr', 'qcr@cohortdata.com', 'Rina Reviewer', null);
select sync_clerk_user('pm2', 'pm2@cohortdata.com', 'Pia PM', null);
select tests.login('sa');
select (create_invitation('PLATFORM_STAFF', 'qcr@cohortdata.com', null, 'QC_REVIEWER')) ->> 'token' as tok_qcr \gset
select (create_invitation('PLATFORM_STAFF', 'pm2@cohortdata.com', null, 'PROJECT_MANAGER')) ->> 'token' as tok_pm2 \gset
select tests.login('qcr'); select accept_invitation(:'tok_qcr');
select tests.login('pm2'); select accept_invitation(:'tok_pm2');
select tests.login('pm');
select save_collection_setup(tests.id('proj'), :'cfg'::jsonb);
select tests.login('o1');
select submit_application(tests.id('proj'), jsonb_build_object(tests.id('q1'), '40', tests.id('q2'), jsonb_build_array('India'), tests.id('q3'), true)) as app_o1 \gset
select tests.login('f1');
select submit_application(tests.id('proj'), jsonb_build_object(tests.id('q1'), 'Me', tests.id('q2'), jsonb_build_array('India'), tests.id('q3'), true)) as app_f1 \gset
select tests.login('pm');
select decide_application(:'app_o1', true) as asg_o1 \gset
select decide_application(:'app_f1', true) as asg_f1 \gset
select tests.login('o1'); select sign_contract(:'asg_o1', 'Omar Owner');
select tests.login('f1'); select sign_contract(:'asg_f1', 'Fatima Freelancer');
select tests.login('pm'); select countersign_contract(:'asg_o1', 'Priya PM'); select countersign_contract(:'asg_f1', 'Priya PM');
select tests.login('o1'); select assign_member(:'asg_o1', tests.id('ms_mem1'));
select tests.as_owner();
select app.sha256('I agree that CohortData may use my face video.') as csha \gset
select id as u_qcr from users where clerk_user_id = 'qcr' \gset
select id as u_qcl from users where clerk_user_id = 'qcl' \gset
select id as u_o1 from users where clerk_user_id = 'o1' \gset

-- One whole session as the signed-in collector.
create or replace function tests.collect(p_profile jsonb, p_name text, p_email text, p_hash text, p_sha text, p_dur numeric default 20) returns uuid language plpgsql as $$
declare s uuid;
begin
  s := public.start_collection_session(tests.id('proj'), p_profile, p_name, p_email);
  perform public.sign_session_consent(s, p_sha, 'type', p_name);
  perform public.register_session_file(s, 'video', 'FILE', 'submissions', tests.id('proj') || '/' || s || '/v-' || p_hash || '.mp4', 'v-' || p_hash || '.mp4', 'video/mp4', 1000, p_dur, repeat(p_hash, 64));
  return public.submit_collection_session(s);
end $$;
grant execute on function tests.collect(jsonb, text, text, text, text, numeric) to public;

-- 2D: automatic checks
select tests.login('mem1');
select tests.collect('{"full_name":"Mo Member","email":"a@x.io","phone":"+62 811 1111","gender":"Male"}', 'Mo Member', 'a@x.io', 'a', :'csha') as sub_a \gset
select is((select status from submissions where id = :'sub_a'), 'READY_FOR_QC', 'a clean submission goes to the QC queue');
select tests.login('f1');
select tests.collect('{"full_name":"Fatima","email":"a@x.io","phone":"+91 9999","gender":"Female"}', 'Fatima', 'a@x.io', 'b', :'csha') as sub_dup \gset
select is((select status from submissions where id = :'sub_dup'), 'REJECTED', 'the same email in a duplicate-check field is rejected automatically');
select ok((select remark like 'Rejected automatically: Duplicate email%' from submissions where id = :'sub_dup'), 'with the reason as remark');
select tests.collect('{"full_name":"Fatima","email":"b@x.io","phone":"+91 9999","gender":"Female"}', 'Fatima', 'b@x.io', 'a', :'csha') as sub_file \gset
select tests.as_owner();
select is((select check_code from submission_checks where submission_id = :'sub_file' and result = 'FAIL'), 'duplicate_file', 'the same file twice is rejected automatically');
select tests.login('f1');
select tests.collect('{"full_name":"Fatima","email":"c@x.io","phone":"+91 9999","gender":"Female"}', 'Fatima', 'c@x.io', 'c', :'csha', 5) as sub_short \gset
select tests.as_owner();
select is((select check_code from submission_checks where submission_id = :'sub_short' and result = 'FAIL'), 'file_length', 'a video outside the length range is rejected');
select tests.login('f1');
select tests.login('mem1');
select tests.collect('{"full_name":"Mo Member","email":"d@x.io","phone":"+628111111","gender":"Male"}', 'Mo Member', 'd@x.io', 'd', :'csha') as sub_flag \gset
select is((select status || '/' || flag_count from submissions where id = :'sub_flag'), 'READY_FOR_QC/1', 'same name and phone with another email is flagged, not rejected');
select is((select count(*)::int from workflow_events where entity_id = :'sub_a' and actor_user_id is null and to_status = 'READY_FOR_QC'), 1, 'the checks are recorded as done by the system');

-- 2E: who can assign, to whom
select tests.login('qcr');
select is((select count(*)::int from submissions), 0, 'a QC Reviewer sees nothing before assignment');
select is(tests.err(format('select * from qc_reviewers(%L)', tests.id('proj'))), 'CG403', 'and cannot assign');
select tests.login('o1');
select is(tests.err(format('select assign_submissions(%L, %L)', array[:'sub_a']::uuid[], :'u_qcr')), 'CG403', 'agencies cannot assign QC');
select tests.login('pm2');
select is(tests.err(format('select assign_submissions(%L, %L)', array[:'sub_a']::uuid[], :'u_qcr')), 'CG403', 'a PM of another project cannot assign');
select tests.login('pm');
select is(tests.err(format('select assign_submissions(%L, %L)', array[:'sub_a']::uuid[], :'u_o1')), 'CG422', 'only reviewers can be assigned');
select is((select count(*)::int from qc_reviewers(tests.id('proj')) where email in ('qcr@cohortdata.com', 'qcl@cohortdata.com', 'pm@cohortdata.com')), 3, 'the PM can pick reviewers, QC Leads and themself');
select is((select count(*)::int from qc_reviewers(tests.id('proj')) where email = 'pm2@cohortdata.com'), 0, 'but not a PM of another project');
select is(assign_submissions(array[:'sub_a']::uuid[], :'u_qcr'), 1, 'the project''s PM assigns a reviewer');
select is((select status from submissions where id = :'sub_a'), 'IN_REVIEW', 'assigned submissions are in review');

select tests.login('qcr');
select is((select count(*)::int from submissions), 1, 'the reviewer sees the assigned submission');
select is((select count(*)::int from submission_files where submission_id = :'sub_a' and role = 'FILE'), 1, 'and its video');
select is((select count(*)::int from project_collection_versions where project_id = tests.id('proj')) > 0, true, 'and the project''s setup');
select is((select count(*)::int from notifications where kind = 'qc.assigned'), 1, 'and was told');

-- Decisions
select tests.login('qcl');
select is(tests.err(format('select decide_submission(%L, %L, %L)', :'sub_a', 'APPROVED', null)), 'CG403', 'only the assignee decides');
select tests.login('qcr');
select is(tests.err(format('select decide_submission(%L, %L, %L)', :'sub_a', 'REJECTED', '')), 'CG422', 'a rejection needs a remark');
select decide_submission(:'sub_a', 'RESUBMIT_REQUESTED', 'Face is cut off at the top. Hold the phone a little further away.', '{FACE_CUT}');
select is((select status from submissions where id = :'sub_a'), 'RESUBMIT_REQUESTED', 'the reviewer asks for a resubmission');

select tests.login('pm');
select comment_on_submission(:'sub_a', 'Internal note: lighting was fine.', false);
select tests.login('o1');
select is((select count(*)::int from submission_comments where submission_id = :'sub_a'), 1, 'the agency sees the shared remark but not the internal note');
select is((select remark from submissions where id = :'sub_a'), 'Face is cut off at the top. Hold the phone a little further away.', 'and the remark on the submission');
select tests.login('mem1');
select is((select count(*)::int from notifications where kind = 'submission.resubmit_requested'), 1, 'the contributor is told');

-- Resubmission replaces the old one and passes the duplicate check
select tests.collect('{"full_name":"Mo Member","email":"a@x.io","phone":"+62 811 1111","gender":"Male"}', 'Mo Member', 'a@x.io', 'e', :'csha') as sub_a2 \gset
select is((select status from submissions where id = :'sub_a2'), 'READY_FOR_QC', 'the resubmission goes to the queue');
select is((select status from submissions where id = :'sub_a'), 'REPLACED', 'and replaces the old submission');

-- The QC Lead takes one themself and approves
select tests.login('qcl');
select is(assign_submissions(array[:'sub_a2']::uuid[], :'u_qcl'), 1, 'the QC Lead can assign to themself');
select decide_submission(:'sub_a2', 'APPROVED');
select is((select status from submissions where id = :'sub_a2'), 'APPROVED', 'and approve');
select ok((select count(*) from workflow_events where entity_id = :'sub_flag') > 0, 'the QC Lead sees the status history of any submission');

-- Back to the queue, and comments from outsiders
select tests.login('pm');
select assign_submissions(array[:'sub_flag']::uuid[], :'u_qcr');
select unassign_submission(:'sub_flag');
select is((select status || '/' || coalesce(qc_assignee::text, 'none') from submissions where id = :'sub_flag'), 'READY_FOR_QC/none', 'a review can be returned to the queue');
select tests.login('qcr');
select is(tests.err(format('select comment_on_submission(%L, %L)', :'sub_flag', 'hi')), 'CG403', 'a reviewer cannot comment on work not assigned to them');

-- Checks again after the original went away
select tests.login('pm');
select is(rerun_submission_checks(:'sub_file'), 'READY_FOR_QC', 'checks run again pass once the duplicate is gone');

-- Pre-launch hardening (ID-57)
select id as u_pm from users where clerk_user_id = 'pm' \gset
select tests.login('o1');
select is((select count(*)::int from submission_checks where submission_id = :'sub_flag'), 0, 'agencies do not see the automatic check results');
select tests.login('mem1');
select is((select count(*)::int from submission_checks where submission_id = :'sub_flag'), 0, 'nor does the contributor');
select start_collection_session(tests.id('proj'), '{"full_name":"Mo Member","email":"h@x.io","phone":"+62 1","gender":"Male"}', 'Mo Member', 'h@x.io') as s_h \gset
select is(tests.err(format('select register_session_file(%L, %L, %L, %L, %L, %L, %L, 10, 20)', :'s_h', 'video', 'FILE', 'collection-assets', tests.id('proj') || '/' || :'s_h' || '/v.mp4', 'v.mp4', 'video/mp4')), '23514', 'files can only be registered in the submissions bucket');
select is(tests.err(format('select register_session_file(%L, %L, %L, %L, %L, %L, %L, 10, 20)', :'s_h', 'video', 'FILE', 'submissions', tests.id('proj') || '/' || :'s_h' || '/../x/v.mp4', 'v.mp4', 'video/mp4')), '23514', 'and never with .. in the path');
select tests.login('pm');
select ok((select count(*) from submission_checks where submission_id = :'sub_flag') > 0, 'the project''s PM sees the check results');
select is(tests.err(format('select register_project_asset(%L, %L, %L, %L, %L, 10)', tests.id('proj'), 'a.png', 'submissions', tests.id('proj') || '/a.png', 'image/png')), '23514', 'guide images only go to the guide bucket');
select assign_submissions(array[:'sub_flag']::uuid[], :'u_pm');
select is(tests.err(format('select decide_submission(%L, %L, %L, %L)', :'sub_flag', 'REJECTED', 'Bad lighting here.', '{MADE_UP}')), '23514', 'reason codes must be on the list');

select * from finish();
rollback;
