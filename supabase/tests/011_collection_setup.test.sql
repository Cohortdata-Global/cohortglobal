-- Phase 2A: collection setup and guide images (ID-53).
begin;
\ir fixture.psql
select plan(11);

select tests.as_service();
select sync_clerk_user('pm2', 'pm2@cohortdata.com', 'Pia PM', null);
select tests.login('sa');
select (create_invitation('PLATFORM_STAFF', 'pm2@cohortdata.com', null, 'PROJECT_MANAGER')) ->> 'token' as tok_pm2 \gset
select tests.login('pm2'); select accept_invitation(:'tok_pm2');

\set cfg '{"intro":{"notice":"","instructions":"Record a video","videoUrl":""},"fields":[{"key":"full_name","label":"Full name","type":"text"}],"guides":[],"quotas":[],"consent":{"enabled":false},"files":[{"key":"video","label":"Video","kind":"video","maxMb":50}],"ekyc":{"enabled":false},"limits":{"sessionHours":5}}'

select tests.login('pm');
select is(tests.err(format('select save_collection_setup(%L, %L)', tests.id('proj'), :'cfg')), 'OK', 'the project''s manager saves the setup');
select is((select collection_version from projects where id = tests.id('proj')), 1, 'it becomes version 1');
select save_collection_setup(tests.id('proj'), :'cfg'::jsonb);
select is((select count(*)::int from project_collection_versions where project_id = tests.id('proj')), 2, 'every save keeps the earlier version');
select is(tests.err(format('select save_collection_setup(%L, %L)', tests.id('proj'), '{"fields":"x"}')), 'CG422', 'an incomplete setup is refused');

select tests.login('pm2');
select is(tests.err(format('select save_collection_setup(%L, %L)', tests.id('proj'), :'cfg')), 'CG403', 'a PM not assigned to the project cannot save');

-- Guide images
select tests.login('pm');
select is(tests.err(format('select register_project_asset(%L, %L, %L, %L, %L, %L)', tests.id('proj'), 'x.png', 'collection-assets', 'elsewhere/x.png', 'image/png', 100)),
  'CG422', 'images must be stored under the project');
select register_project_asset(tests.id('proj'), 'light.png', 'collection-assets', tests.id('proj') || '/light.png', 'image/png', 100) as img \gset
select is(tests.err(format('select save_collection_setup(%L, %L)', tests.id('proj'),
  jsonb_set(:'cfg'::jsonb, '{guides}', jsonb_build_array(jsonb_build_object('id','g1','title','Light','when','[]'::jsonb,'imageIds', jsonb_build_array(:'img')))))),
  'OK', 'a guide can use the project''s own image');
select is(tests.err(format('select save_collection_setup(%L, %L)', tests.id('proj'),
  jsonb_set(:'cfg'::jsonb, '{guides}', jsonb_build_array(jsonb_build_object('id','g1','title','Light','when','[]'::jsonb,'imageIds', jsonb_build_array(gen_random_uuid())))))),
  'CG422', 'but not an image from elsewhere');

-- Who reads the setup
select tests.login('o2');
select is((select count(*)::int from project_collection_versions where project_id = tests.id('proj')) > 0, true, 'an agency that can see the job reads its setup');
select tests.login('mem1');
select is((select count(*)::int from project_collection_versions), 0, 'an unassigned member does not');
select tests.login('pm');
select remove_project_asset(:'img');
select tests.login('o2');
select is((select count(*)::int from project_assets), 0, 'removed images disappear');

select * from finish();
rollback;
