-- Phase 2B/2C: sessions, files, submissions and public links (ID-55).
begin;
\ir fixture.psql
select plan(32);

-- Setup: collection rules, Alpha (org1) and Fatima (f1) approved and signed, Mo (mem1) assigned.
\set cfg '{"intro":{"notice":"","instructions":"","videoUrl":""},"fields":[{"key":"full_name","label":"Full name","type":"text"},{"key":"email","label":"Email","type":"email","identity":true},{"key":"gender","label":"Gender","type":"select","options":["Male","Female"]}],"guides":[],"quotas":[{"id":"qm","when":[{"field":"gender","value":"Male"}],"target":1},{"id":"qf","when":[{"field":"gender","value":"Female"}],"target":2}],"consent":{"enabled":true,"title":"Consent","text":"I agree that CohortData may use my face video.","checkboxLabel":"I agree","signature":"either"},"files":[{"key":"video","label":"Your video","kind":"video","required":true,"maxMb":50}],"ekyc":{"enabled":true,"note":"","backSide":"optional","maxMb":30},"limits":{"sessionHours":5,"maxPerContributor":1}}'
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
select app.sha256('I agree that CohortData may use my face video.') as consent_sha \gset

-- 2B: who can start
select tests.login('mem1b');
select is(tests.err(format('select start_collection_session(%L, %L, %L, %L)', tests.id('proj'), '{"gender":"Male"}', 'Mina Member', 'member2@alpha.io')),
  'CG403', 'a member who is not assigned cannot collect');
select tests.login('mem1');
select start_collection_session(tests.id('proj'), '{"full_name":"Mo Member","email":"member1@alpha.io","gender":"Male"}'::jsonb, 'Mo Member', 'member1@alpha.io') as s1 \gset
select is(start_collection_session(tests.id('proj'), '{"gender":"Male"}'::jsonb, 'Mo Member', 'member1@alpha.io'), :'s1'::uuid, 'starting again returns the open session');
select ok((select ends_at between now() + interval '4 hours 59 minutes' and now() + interval '5 hours 1 minute' from collection_sessions where id = :'s1'), 'a session lasts 5 hours');

-- Consent
select is(tests.err(format('select sign_session_consent(%L, %L, %L, %L)', :'s1', 'wrong', 'type', 'Mo Member')), 'CG409', 'consent must match the text shown');
select is(tests.err(format('select sign_session_consent(%L, %L, %L, %L)', :'s1', :'consent_sha', 'type', 'M')), 'CG422', 'a typed signature needs a name');
select is(tests.err(format('select sign_session_consent(%L, %L, %L, %L)', :'s1', :'consent_sha', 'type', 'Mo Member')), 'OK', 'consent signed');

-- Files
select is(tests.err(format('select submit_collection_session(%L)', :'s1')), 'CG422', 'cannot submit without the video');
select is(tests.err(format('select register_session_file(%L, %L, %L, %L, %L, %L, %L, %L, %L)', :'s1', 'video', 'FILE', 'submissions', 'elsewhere/v.mp4', 'v.mp4', 'video/mp4', 1000, 20)),
  'CG422', 'files must be stored under the session');
select register_session_file(:'s1', 'video', 'FILE', 'submissions', tests.id('proj') || '/' || :'s1' || '/video-1.mp4', 'first.mp4', 'video/mp4', 1000, 20);
select is((select replaced_path from register_session_file(:'s1', 'video', 'FILE', 'submissions', tests.id('proj') || '/' || :'s1' || '/video-2.mp4', 'mo.mp4', 'video/mp4', 2000, 21)),
  tests.id('proj') || '/' || :'s1' || '/video-1.mp4', 'a new video replaces the old one and returns its path for deletion');
select is(tests.err(format('select submit_collection_session(%L)', :'s1')), 'CG422', 'cannot submit without the ID document');
select register_session_file(:'s1', 'id_front', 'ID_FRONT', 'submissions', tests.id('proj') || '/' || :'s1' || '/id-front.jpg', 'id.jpg', 'image/jpeg', 500);
select tests.login('mem1b');
select is(tests.err(format('select register_session_file(%L, %L, %L, %L, %L, %L, %L, %L)', :'s1', 'video', 'FILE', 'submissions', tests.id('proj') || '/' || :'s1' || '/x.mp4', 'x.mp4', 'video/mp4', 10)),
  'CG403', 'nobody else can add files to the session');

-- Submit
select tests.login('mem1');
select submit_collection_session(:'s1') as sub1 \gset
select is((select status from submissions where id = :'sub1'), 'READY_FOR_QC', 'the submission passes the automatic checks and waits for QC');
select is((select organization_id from submissions where id = :'sub1'), tests.id('org1'), 'it is credited to the agency from the assignment');
select is((select main_file_name from submissions where id = :'sub1'), 'mo.mp4', 'the latest video is the main file');
select is(tests.err(format('select submit_collection_session(%L)', :'s1')), 'CG409', 'a session is submitted once');

-- Who sees it
select tests.login('o1');
select is((select count(*)::int from submissions), 1, 'the agency Owner sees the agency''s submission');
select is((select count(*)::int from submission_files where submission_id = :'sub1'), 1, 'the agency sees the video but not the ID document');
select is((select count(*)::int from workflow_events where entity_type = 'submission' and entity_id = :'sub1'), 2, 'and its status history');
select tests.login('mem1');
select is((select count(*)::int from submission_files where submission_id = :'sub1'), 2, 'the collector sees their own files, ID included');
select tests.login('o2');
select is((select count(*)::int from submissions), 0, 'another agency sees nothing');
select tests.login('mem1b');
select is((select count(*)::int from submissions), 0, 'another member of the same agency sees nothing');
select tests.login('pm');
select is((select count(*)::int from submission_files where submission_id = :'sub1'), 2, 'the project''s PM sees every file');

-- Quotas and limits
select tests.login('f1');
select is(tests.err(format('select start_collection_session(%L, %L, %L, %L)', tests.id('proj'), '{"gender":"Male"}', 'Fatima F', 'free@lancer.com')),
  'CG409', 'a full quota group cannot start');
select tests.login('mem1');
select is(tests.err(format('select start_collection_session(%L, %L, %L, %L)', tests.id('proj'), '{"gender":"Female"}', 'Mo Member', 'member1@alpha.io')),
  'CG409', 'the same person cannot go over the limit per person');

-- 2C: public links
select is(tests.err(format('select create_submission_link(%L, %L)', tests.id('proj'), 'x')), 'CG403', 'members cannot create links');
select tests.login('o1');
select create_submission_link(tests.id('proj'), 'Lina, Jakarta') ->> 'token' as tok \gset
select id as link1 from submission_links where label = 'Lina, Jakarta' \gset
select tests.login('o2');
select is(tests.err(format('select revoke_submission_link(%L)', :'link1')), 'CG403', 'another agency cannot turn off the link');
select ok(not has_function_privilege('authenticated', 'public.link_lookup(text)', 'EXECUTE'), 'signed-in users cannot look up link tokens');

select tests.as_service();
select is((select organization_name from link_lookup(:'tok')), 'Alpha Data', 'the server finds the link and its agency');
select start_link_session(:'tok', '{"full_name":"Lina","email":"lina@mail.com","gender":"Female"}'::jsonb, 'Lina', 'lina@mail.com', 'cookiehash1') as ls \gset
select is((select organization_id from collection_sessions where id = :'ls'), tests.id('org1'), 'a link session belongs to the link''s agency');
select cancel_collection_session(:'ls');
select is(tests.err(format('select start_link_session(%L, %L, %L, %L, %L)', :'tok', '{"gender":"Female"}', 'Other', 'other@mail.com', 'cookiehash2')),
  'CG403', 'one freelancer per link');
select tests.login('o2');
select is(tests.err(format('select sign_session_consent(%L, %L, %L, %L)', :'ls', :'consent_sha', 'type', 'Bea')), 'CG403', 'a signed-in user cannot act on a link session');
select tests.login('o1');
select revoke_submission_link(:'link1');
select tests.as_service();
select is(tests.err(format('select start_link_session(%L, %L, %L, %L, %L)', :'tok', '{"gender":"Female"}', 'Lina', 'lina@mail.com', 'cookiehash3')),
  'CG404', 'a turned-off link stops working');

select * from finish();
rollback;
