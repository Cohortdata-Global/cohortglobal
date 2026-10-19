-- Operations Manager assigns Project Managers; a PM sees only assigned projects (ID-52).
begin;
\ir fixture.psql
select plan(21);

select tests.as_service();
select sync_clerk_user('ops', 'ops@cohortdata.com', 'Olu Ops', null);
select sync_clerk_user('pm2', 'pm2@cohortdata.com', 'Pia PM', null);
select tests.login('sa');
select (create_invitation('PLATFORM_STAFF', 'ops@cohortdata.com', null, 'OPERATIONS_MANAGER')) ->> 'token' as tok_ops \gset
select (create_invitation('PLATFORM_STAFF', 'pm2@cohortdata.com', null, 'PROJECT_MANAGER')) ->> 'token' as tok_pm2 \gset
select tests.login('ops'); select accept_invitation(:'tok_ops');
select tests.login('pm2'); select accept_invitation(:'tok_pm2');
select tests.as_owner();
select id as u_pm2 from users where clerk_user_id = 'pm2' \gset
select id as u_qcl from users where clerk_user_id = 'qcl' \gset

-- The creator of the fixture project manages it; the other PM does not see it
select tests.login('pm');
select is((select count(*)::int from projects where id = tests.id('proj')), 1, 'the PM who created a project sees it');
select tests.login('pm2');
select is((select count(*)::int from projects), 0, 'another PM sees no projects that are not assigned to them');
select is(tests.err(format('select update_project(%L, %L)', tests.id('proj'), '{"title":"Hijack"}')), 'CG403', 'and cannot edit one');
select is(tests.err(format('select set_project_status(%L, %L)', tests.id('proj'), 'PAUSED')), 'CG403', 'or change its status');

-- A PM's own new project is assigned to them only
select create_project('{"code":"PM2A","title":"Voice Collection"}'::jsonb) as proj2 \gset
select is((select count(*)::int from projects), 1, 'a PM sees the project they created');
select tests.login('pm');
select is((select count(*)::int from projects where id = :'proj2'), 0, 'the first PM does not see it');

-- Only the Super Admin and Operations Manager assign managers
select is(tests.err(format('select assign_project_manager(%L, %L)', tests.id('proj'), :'u_pm2')), 'CG403', 'a PM cannot assign managers');
select tests.login('ops');
select is((select count(*)::int from projects where id in (tests.id('proj'), :'proj2')), 2, 'the Operations Manager sees every project');
select is(tests.err(format('select assign_project_manager(%L, %L)', tests.id('proj'), :'u_qcl')), 'CG422', 'only Project Managers can be assigned');
select is(tests.err(format('select assign_project_manager(%L, %L)', tests.id('proj'), :'u_pm2')), 'OK', 'the Operations Manager assigns a PM');
select is(tests.err(format('select assign_project_manager(%L, %L)', tests.id('proj'), :'u_pm2')), 'CG409', 'not twice');
select is((select count(*)::int from project_managers where project_id = tests.id('proj') and removed_at is null), 2, 'the Operations Manager sees who manages the project');

select tests.login('pm2');
select is((select count(*)::int from projects where id = tests.id('proj')), 1, 'the assigned PM now sees the project');
select is(tests.err(format('select update_project(%L, %L)', tests.id('proj'), '{"title":"Face Motion Video Collection v2"}')), 'OK', 'and can edit it');
select is((select count(*)::int from notifications where kind = 'project.assigned'), 1, 'and was told');

-- New applications notify only the managers of that project (and all-projects staff)
select tests.login('f1');
select submit_application(tests.id('proj'), jsonb_build_object(tests.id('q1'), 'Just me', tests.id('q2'), jsonb_build_array('India'), tests.id('q3'), true)) as app_f1 \gset
select tests.login('pm2');
select is((select count(*)::int from project_applications where id = :'app_f1'), 1, 'the assigned PM sees the application');
select is((select count(*)::int from notifications where kind = 'application.new'), 1, 'and is notified');

-- Removing the assignment closes access again
select tests.login('ops');
select remove_project_manager(tests.id('proj'), :'u_pm2');
select tests.login('pm2');
select is((select count(*)::int from projects where id = tests.id('proj')), 0, 'after removal the PM no longer sees the project');
select is((select count(*)::int from project_applications), 0, 'or its applications');
select is(tests.err(format('select decide_application(%L, true)', :'app_f1')), 'CG403', 'and cannot decide them');
select tests.login('ops');
select is(tests.err(format('select decide_application(%L, true)', :'app_f1')), 'OK', 'the Operations Manager can decide on any project');

select * from finish();
rollback;
