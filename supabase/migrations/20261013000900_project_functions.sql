-- =============================================================================
-- CohortGlobal — 0900 Projects, applications, contracts, member assignment (Module 1D)
-- =============================================================================

create or replace function app.snapshot_project(p_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
begin
  select coalesce(max(version), 0) + 1 into v_next from public.project_versions where project_id = p_project;
  insert into public.project_versions (project_id, version, snapshot, created_by)
  select p.id, v_next,
         to_jsonb(p) || jsonb_build_object(
           'questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.position) from public.project_questions q
                                  where q.project_id = p.id and q.version = p.question_version), '[]'::jsonb),
           'contract_version', (select max(version) from public.project_contract_templates t where t.project_id = p.id)),
         app.current_user_id()
  from public.projects p where p.id = p_project;
end;
$$;

-- Validates and normalizes editable project fields.
create or replace function app.validate_project(p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  k text;
  allowed text[] := array['code', 'title', 'summary', 'description', 'data_type', 'applicant_type', 'visibility',
                          'opens_at', 'closes_at', 'required_languages', 'required_countries', 'requires_ekyc',
                          'target_count', 'collection_settings'];
begin
  for k in select jsonb_object_keys(coalesce(p, '{}'::jsonb)) loop
    if not k = any(allowed) then perform app.fail('CG422', format('Unknown project field: %s.', k)); end if;
  end loop;
  if p ? 'code' and upper(coalesce(app.jtext(p, 'code'), '')) !~ '^[A-Z0-9][A-Z0-9_-]{1,23}$' then
    perform app.fail('CG422', 'Project code must be 2 to 24 letters, numbers, - or _.');
  end if;
  if p ? 'title' and length(coalesce(app.jtext(p, 'title'), '')) < 3 then
    perform app.fail('CG422', 'Title must be at least 3 characters.');
  end if;
  if p ? 'collection_settings' and jsonb_typeof(p -> 'collection_settings') <> 'object' then
    perform app.fail('CG422', 'Collection settings must be an object.');
  end if;
end;
$$;

create or replace function public.create_project(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_permission('project.manage');
  v_id uuid;
begin
  perform app.validate_project(p);
  if app.jtext(p, 'code') is null or app.jtext(p, 'title') is null then
    perform app.fail('CG422', 'Project code and title are required.');
  end if;
  if exists (select 1 from public.projects where code = upper(app.jtext(p, 'code'))) then
    perform app.fail('CG409', 'Another project already uses this code.');
  end if;
  insert into public.projects (code, title, summary, description, data_type, applicant_type, visibility, opens_at, closes_at,
    required_languages, required_countries, requires_ekyc, target_count, collection_settings, created_by, updated_by)
  values (
    upper(app.jtext(p, 'code')), app.jtext(p, 'title'), coalesce(app.jtext(p, 'summary'), ''), coalesce(p ->> 'description', ''),
    coalesce(app.jtext(p, 'data_type'), 'VIDEO'), coalesce(app.jtext(p, 'applicant_type'), 'BOTH'),
    coalesce(app.jtext(p, 'visibility'), 'PUBLIC'),
    (app.jtext(p, 'opens_at'))::timestamptz, (app.jtext(p, 'closes_at'))::timestamptz,
    coalesce(app.jtext_array(p, 'required_languages'), '{}'), coalesce(app.jtext_array(p, 'required_countries'), '{}'),
    coalesce((p ->> 'requires_ekyc')::boolean, false), (p ->> 'target_count')::int,
    coalesce(p -> 'collection_settings', '{}'::jsonb), v_user, v_user)
  returning id into v_id;
  perform app.audit('project.created', 'project', v_id, null, format('Project %s created', upper(app.jtext(p, 'code'))));
  return v_id;
end;
$$;

create or replace function public.update_project(p_project uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_permission('project.manage');
  v_project public.projects;
begin
  perform app.validate_project(p);
  select * into v_project from public.projects where id = p_project for update;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if v_project.status = 'ARCHIVED' then perform app.fail('CG409', 'Archived projects cannot be edited.'); end if;
  -- Confirmed #20: the applicant-type tag is fixed once applications exist.
  if p ? 'applicant_type' and app.jtext(p, 'applicant_type') <> v_project.applicant_type
     and exists (select 1 from public.project_applications where project_id = p_project) then
    perform app.fail('CG409', 'The applicant type cannot change after applications have been received.');
  end if;
  if p ? 'code' and upper(app.jtext(p, 'code')) <> v_project.code
     and exists (select 1 from public.projects where code = upper(app.jtext(p, 'code'))) then
    perform app.fail('CG409', 'Another project already uses this code.');
  end if;

  update public.projects x set
    code               = case when p ? 'code' then upper(app.jtext(p, 'code')) else x.code end,
    title              = case when p ? 'title' then app.jtext(p, 'title') else x.title end,
    summary            = case when p ? 'summary' then coalesce(app.jtext(p, 'summary'), '') else x.summary end,
    description        = case when p ? 'description' then coalesce(p ->> 'description', '') else x.description end,
    data_type          = case when p ? 'data_type' then app.jtext(p, 'data_type') else x.data_type end,
    applicant_type     = case when p ? 'applicant_type' then app.jtext(p, 'applicant_type') else x.applicant_type end,
    visibility         = case when p ? 'visibility' then app.jtext(p, 'visibility') else x.visibility end,
    opens_at           = case when p ? 'opens_at' then (app.jtext(p, 'opens_at'))::timestamptz else x.opens_at end,
    closes_at          = case when p ? 'closes_at' then (app.jtext(p, 'closes_at'))::timestamptz else x.closes_at end,
    required_languages = case when p ? 'required_languages' then coalesce(app.jtext_array(p, 'required_languages'), '{}') else x.required_languages end,
    required_countries = case when p ? 'required_countries' then coalesce(app.jtext_array(p, 'required_countries'), '{}') else x.required_countries end,
    requires_ekyc      = case when p ? 'requires_ekyc' then coalesce((p ->> 'requires_ekyc')::boolean, false) else x.requires_ekyc end,
    target_count       = case when p ? 'target_count' then (p ->> 'target_count')::int else x.target_count end,
    collection_settings = case when p ? 'collection_settings' then p -> 'collection_settings' else x.collection_settings end,
    updated_by         = v_user
  where x.id = p_project;

  if v_project.status <> 'DRAFT' then
    perform app.snapshot_project(p_project);
  end if;
  perform app.audit('project.updated', 'project', p_project, null, format('Project %s updated', v_project.code), jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
end;
$$;

create or replace function public.set_project_status(p_project uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
begin
  perform app.require_permission('project.manage');
  select * into v_project from public.projects where id = p_project for update;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if not (
    (v_project.status = 'DRAFT' and p_status in ('PUBLISHED', 'ARCHIVED'))
    or (v_project.status = 'PUBLISHED' and p_status in ('PAUSED', 'COMPLETED', 'ARCHIVED'))
    or (v_project.status = 'PAUSED' and p_status in ('PUBLISHED', 'COMPLETED', 'ARCHIVED'))
    or (v_project.status = 'COMPLETED' and p_status in ('PUBLISHED', 'ARCHIVED'))
  ) then
    perform app.fail('CG409', format('A project cannot move from %s to %s.', v_project.status, p_status));
  end if;
  if p_status = 'PUBLISHED' then
    if length(trim(v_project.description)) < 20 then
      perform app.fail('CG409', 'Add a description of at least 20 characters before publishing.');
    end if;
    if not exists (select 1 from public.project_contract_templates where project_id = p_project) then
      perform app.fail('CG409', 'Add a contract before publishing. Approved applicants must sign it before they can start.');
    end if;
  end if;
  if p_status = 'ARCHIVED' and nullif(trim(p_reason), '') is null then
    perform app.fail('CG422', 'Give a reason for archiving.');
  end if;
  update public.projects set status = p_status, status_reason = nullif(trim(p_reason), ''),
    published_at = case when p_status = 'PUBLISHED' then coalesce(published_at, now()) else published_at end
  where id = p_project;
  perform app.transition('project', p_project, null, null, v_project.status, p_status, p_reason);
  perform app.snapshot_project(p_project);
  perform app.audit('project.status_changed', 'project', p_project, null,
    format('Project %s moved from %s to %s', v_project.code, v_project.status, p_status), jsonb_build_object('reason', p_reason));

  if p_status = 'PUBLISHED' and v_project.status = 'DRAFT' then
    insert into public.notifications (user_id, kind, title, body, href)
    select m.user_id, 'project.invited', 'You are invited to a project', v_project.title, '/agency/jobs/' || p_project
    from public.project_invitations pi
    join public.organization_memberships m on m.organization_id = pi.organization_id
      and m.status = 'ACTIVE' and m.role in ('AGENCY_OWNER', 'AGENCY_MANAGER')
    where pi.project_id = p_project;
  end if;
end;
$$;

-- Replaces the application questions (#21, #22).
create or replace function public.save_project_questions(p_project uuid, p_questions jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_version int;
  q jsonb;
  i int := 0;
  v_type text;
begin
  perform app.require_permission('project.manage');
  if jsonb_typeof(p_questions) <> 'array' then perform app.fail('CG422', 'Questions must be a list.'); end if;
  if jsonb_array_length(p_questions) > 30 then perform app.fail('CG422', 'A project can have at most 30 questions.'); end if;
  select * into v_project from public.projects where id = p_project for update;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if v_project.status = 'ARCHIVED' then perform app.fail('CG409', 'Archived projects cannot be edited.'); end if;

  for q in select * from jsonb_array_elements(p_questions) loop
    v_type := app.jtext(q, 'answer_type');
    if app.jtext(q, 'prompt') is null then perform app.fail('CG422', 'Every question needs text.'); end if;
    if v_type not in ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO') then
      perform app.fail('CG422', 'Unknown answer type.');
    end if;
    if v_type in ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') and
       (jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') < 2) then
      perform app.fail('CG422', format('"%s" needs at least two options.', app.jtext(q, 'prompt')));
    end if;
  end loop;

  if exists (select 1 from public.project_applications where project_id = p_project) then
    -- Questions are locked once applications exist; only the Super Admin can create a new version.
    if not app.has_permission('project.questions.relock') then
      perform app.fail('CG403', 'Applications already exist. Only the Super Admin can change the questions now.');
    end if;
    v_version := v_project.question_version + 1;
    update public.projects set question_version = v_version where id = p_project;
  else
    v_version := v_project.question_version;
    delete from public.project_questions where project_id = p_project and version = v_version;
  end if;

  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    insert into public.project_questions (project_id, version, position, prompt, help_text, answer_type, options, required)
    values (p_project, v_version, i, app.jtext(q, 'prompt'), app.jtext(q, 'help_text'), app.jtext(q, 'answer_type'),
            case when app.jtext(q, 'answer_type') in ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') then q -> 'options' else '[]'::jsonb end,
            coalesce((q ->> 'required')::boolean, true));
  end loop;

  if v_project.status <> 'DRAFT' then perform app.snapshot_project(p_project); end if;
  perform app.audit('project.questions_saved', 'project', p_project, null,
    format('%s questions saved for %s (version %s)', i, v_project.code, v_version));
  return v_version;
end;
$$;

-- Saves the contract. Edits in place until someone has signed or been offered it, then versions (#27).
create or replace function public.save_contract_template(p_project uuid, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_permission('project.manage');
  v_project public.projects;
  v_current public.project_contract_templates;
  v_id uuid;
begin
  select * into v_project from public.projects where id = p_project for update;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if v_project.status = 'ARCHIVED' then perform app.fail('CG409', 'Archived projects cannot be edited.'); end if;
  if nullif(trim(p_title), '') is null or length(trim(coalesce(p_body, ''))) < 20 then
    perform app.fail('CG422', 'The contract needs a title and at least 20 characters of text.');
  end if;

  select * into v_current from public.project_contract_templates where project_id = p_project order by version desc limit 1;

  if v_current.id is not null and not exists (
      select 1 from public.contract_signatures s where s.template_id = v_current.id) then
    update public.project_contract_templates
      set title = trim(p_title), body = p_body, body_sha256 = app.sha256(p_body), created_by = v_user, created_at = now()
      where id = v_current.id;
    v_id := v_current.id;
  else
    insert into public.project_contract_templates (project_id, version, title, body, body_sha256, created_by)
    values (p_project, coalesce(v_current.version, 0) + 1, trim(p_title), p_body, app.sha256(p_body), v_user)
    returning id into v_id;
    -- Applicants who have not signed yet move to the new version.
    update public.project_assignments set contract_template_id = v_id
      where project_id = p_project and status = 'AWAITING_SIGNATURE';
  end if;
  perform app.audit('project.contract_saved', 'project', p_project, null, format('Contract saved for %s', v_project.code));
  return v_id;
end;
$$;

create or replace function public.invite_agency_to_project(p_project uuid, p_org uuid, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_permission('project.invite_agency');
  v_project public.projects;
  v_org public.organizations;
  v_owner_email text;
begin
  select * into v_project from public.projects where id = p_project;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if v_project.status in ('COMPLETED', 'ARCHIVED') then perform app.fail('CG409', 'This project is closed.'); end if;
  if v_project.applicant_type = 'INDIVIDUAL' then perform app.fail('CG409', 'This project is for individuals only.'); end if;
  select * into v_org from public.organizations where id = p_org and type = 'AGENCY';
  if not found then perform app.fail('CG404', 'Agency not found.'); end if;
  if v_org.status <> 'ACTIVE' then perform app.fail('CG409', 'Only active agencies can be invited.'); end if;

  insert into public.project_invitations (project_id, organization_id, invited_by, message)
  values (p_project, p_org, v_user, nullif(trim(p_message), ''))
  on conflict (project_id, organization_id) do nothing;
  if not found then perform app.fail('CG409', 'This agency is already invited.'); end if;

  perform app.audit('project.agency_invited', 'project', p_project, p_org, format('%s invited to %s', v_org.name, v_project.code));
  if v_project.status in ('PUBLISHED', 'PAUSED') then
    perform app.notify_org_admins(p_org, 'project.invited', 'You are invited to a project', v_project.title, '/agency/jobs/' || p_project);
    select u.email into v_owner_email from public.organization_memberships m join public.users u on u.id = m.user_id
      where m.organization_id = p_org and m.role = 'AGENCY_OWNER' and m.status = 'ACTIVE';
    if v_owner_email is not null then
      perform app.queue_email(v_owner_email, 'project_invited',
        jsonb_build_object('agency_name', v_org.name, 'project_title', v_project.title, 'project_id', p_project, 'message', p_message));
    end if;
  end if;
end;
$$;

-- Validates answers against the project's current question version.
create or replace function app.validate_answers(p_project uuid, p_version int, p_answers jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q public.project_questions;
  v jsonb;
  k text;
  opt_count int;
begin
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then perform app.fail('CG422', 'Answers must be an object.'); end if;
  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    if not exists (select 1 from public.project_questions where id::text = k and project_id = p_project and version = p_version) then
      perform app.fail('CG422', 'An answer refers to an unknown question. Reload the page and try again.');
    end if;
  end loop;

  for q in select * from public.project_questions where project_id = p_project and version = p_version order by position loop
    v := p_answers -> q.id::text;
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if q.required then perform app.fail('CG422', format('Answer "%s".', q.prompt)); end if;
      continue;
    end if;
    if q.answer_type = 'SHORT_TEXT' and (jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 300) then
      perform app.fail('CG422', format('"%s" needs a short text answer (up to 300 characters).', q.prompt));
    elsif q.answer_type = 'LONG_TEXT' and (jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 5000) then
      perform app.fail('CG422', format('"%s" needs a text answer (up to 5000 characters).', q.prompt));
    elsif q.answer_type = 'YES_NO' and jsonb_typeof(v) <> 'boolean' then
      perform app.fail('CG422', format('"%s" needs yes or no.', q.prompt));
    elsif q.answer_type = 'SINGLE_CHOICE' and (jsonb_typeof(v) <> 'string' or not (q.options ? (v #>> '{}'))) then
      perform app.fail('CG422', format('Choose one of the options for "%s".', q.prompt));
    elsif q.answer_type = 'MULTIPLE_CHOICE' then
      if jsonb_typeof(v) <> 'array' then perform app.fail('CG422', format('Choose options for "%s".', q.prompt)); end if;
      select count(*) into opt_count from jsonb_array_elements_text(v) x where not (q.options ? x);
      if opt_count > 0 then perform app.fail('CG422', format('Choose only listed options for "%s".', q.prompt)); end if;
    end if;
  end loop;
end;
$$;

create or replace function public.submit_application(p_project uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_project public.projects;
  v_org public.organizations;
  v_kind text;
  v_invited boolean := false;
  v_id uuid;
  k text;
  v_label text;
begin
  select * into v_project from public.projects where id = p_project for update;
  if not found or v_project.status = 'DRAFT' then perform app.fail('CG404', 'Project not found.'); end if;
  if v_project.status <> 'PUBLISHED' then perform app.fail('CG409', 'This project is not accepting applications.'); end if;
  if v_project.opens_at is not null and now() < v_project.opens_at then perform app.fail('CG409', 'Applications have not opened yet.'); end if;
  if v_project.closes_at is not null and now() > v_project.closes_at then perform app.fail('CG409', 'Applications are closed.'); end if;

  select o.* into v_org from public.organizations o where o.id = app.current_org_id() and o.type = 'AGENCY';
  if v_org.id is not null then
    if not app.has_org_permission(v_org.id, 'org.projects.apply') then
      perform app.fail('CG403', 'Only the Agency Owner or Manager can apply for the agency.');
    end if;
    if v_org.status <> 'ACTIVE' then perform app.fail('CG409', 'Your agency must be approved and active to apply.'); end if;
    if v_project.applicant_type = 'INDIVIDUAL' then perform app.fail('CG409', 'This project is for individuals only.'); end if;
    v_invited := exists (select 1 from public.project_invitations where project_id = p_project and organization_id = v_org.id);
    if v_project.visibility = 'INVITE_ONLY' and not v_invited then perform app.fail('CG403', 'This project is by invitation only.'); end if;
    if exists (select 1 from public.project_applications where project_id = p_project and organization_id = v_org.id and status in ('PENDING', 'APPROVED')) then
      perform app.fail('CG409', 'Your agency has already applied to this project.');
    end if;
    v_kind := 'AGENCY';
    v_label := v_org.name;
  elsif app.has_permission('individual.projects.apply') then
    if v_project.applicant_type = 'AGENCY' then perform app.fail('CG409', 'This project is for agencies only.'); end if;
    if v_project.visibility = 'INVITE_ONLY' then perform app.fail('CG403', 'This project is by invitation only.'); end if;
    if exists (select 1 from public.project_applications where project_id = p_project and user_id = v_user and status in ('PENDING', 'APPROVED')) then
      perform app.fail('CG409', 'You have already applied to this project.');
    end if;
    v_kind := 'INDIVIDUAL';
    select coalesce(full_name, email) into v_label from public.users where id = v_user;
  else
    perform app.fail('CG403', 'Your account cannot apply to projects.');
  end if;

  perform app.validate_answers(p_project, v_project.question_version, p_answers);

  insert into public.project_applications (project_id, applicant_kind, organization_id, user_id, submitted_by, question_version, via_invitation)
  values (p_project, v_kind, case when v_kind = 'AGENCY' then v_org.id end, case when v_kind = 'INDIVIDUAL' then v_user end,
          v_user, v_project.question_version, v_invited)
  returning id into v_id;

  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    insert into public.application_answers (application_id, question_id, value) values (v_id, k::uuid, p_answers -> k);
  end loop;

  perform app.transition('application', v_id, v_org.id, case when v_kind = 'INDIVIDUAL' then v_user end, null, 'PENDING', null);
  perform app.audit('application.submitted', 'application', v_id, v_org.id, format('%s applied to %s', v_label, v_project.code));
  perform app.notify_permission_holders('application.decide', 'application.new', 'New application',
    format('%s applied to %s.', v_label, v_project.title), '/admin/projects/' || p_project || '/applications');
  return v_id;
end;
$$;

create or replace function app.require_applicant(p_app public.project_applications)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_app.applicant_kind = 'AGENCY' then
    if not app.has_org_permission(p_app.organization_id, 'org.projects.apply') then
      perform app.fail('CG403', 'Your role does not allow this action.');
    end if;
  elsif p_app.user_id <> app.current_user_id() then
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;
end;
$$;

create or replace function public.withdraw_application(p_application uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.project_applications;
begin
  perform app.require_user();
  select * into v_app from public.project_applications where id = p_application for update;
  if not found then perform app.fail('CG404', 'Application not found.'); end if;
  perform app.require_applicant(v_app);
  if v_app.status <> 'PENDING' then perform app.fail('CG409', 'Only pending applications can be withdrawn.'); end if;
  update public.project_applications set status = 'WITHDRAWN' where id = p_application;
  perform app.transition('application', p_application, v_app.organization_id, v_app.user_id, 'PENDING', 'WITHDRAWN', null);
  perform app.audit('application.withdrawn', 'application', p_application, v_app.organization_id, 'Application withdrawn');
end;
$$;

create or replace function app.notify_applicant(p_app public.project_applications, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_app.applicant_kind = 'AGENCY' then
    perform app.notify_org_admins(p_app.organization_id, p_kind, p_title, p_body, p_href);
  else
    perform app.notify(p_app.user_id, p_kind, p_title, p_body, p_href);
  end if;
end;
$$;

create or replace function app.applicant_email(p_app public.project_applications)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_app.applicant_kind = 'AGENCY' then
    (select u.email from public.organization_memberships m join public.users u on u.id = m.user_id
     where m.organization_id = p_app.organization_id and m.role = 'AGENCY_OWNER' and m.status <> 'REMOVED' limit 1)
  else (select email from public.users where id = p_app.user_id) end;
$$;

create or replace function public.decide_application(p_application uuid, p_approve boolean, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.project_applications;
  v_project public.projects;
  v_template uuid;
  v_assignment uuid;
  v_href text;
begin
  perform app.require_permission('application.decide');
  select * into v_app from public.project_applications where id = p_application for update;
  if not found then perform app.fail('CG404', 'Application not found.'); end if;
  if v_app.status <> 'PENDING' then perform app.fail('CG409', 'This application has already been decided.'); end if;
  select * into v_project from public.projects where id = v_app.project_id;
  v_href := case when v_app.applicant_kind = 'AGENCY' then '/agency/jobs/' else '/work/jobs/' end || v_app.project_id;

  if p_approve then
    select id into v_template from public.project_contract_templates where project_id = v_app.project_id order by version desc limit 1;
    if v_template is null then perform app.fail('CG409', 'Add a contract to the project before approving applicants.'); end if;
    update public.project_applications set status = 'APPROVED', decided_by = app.current_user_id(), decided_at = now(),
      decision_reason = nullif(trim(p_reason), '') where id = p_application;
    insert into public.project_assignments (project_id, application_id, organization_id, user_id, contract_template_id)
    values (v_app.project_id, v_app.id, v_app.organization_id, v_app.user_id, v_template)
    returning id into v_assignment;
    perform app.transition('application', p_application, v_app.organization_id, v_app.user_id, 'PENDING', 'APPROVED', p_reason);
    perform app.transition('assignment', v_assignment, v_app.organization_id, v_app.user_id, null, 'AWAITING_SIGNATURE', null);
    perform app.audit('application.approved', 'application', p_application, v_app.organization_id, format('Application to %s approved', v_project.code));
    perform app.notify_applicant(v_app, 'application.approved', 'Application approved',
      format('You were approved for %s. Sign the contract to start.', v_project.title), v_href);
    perform app.queue_email(app.applicant_email(v_app), 'application_approved',
      jsonb_build_object('project_title', v_project.title, 'href', v_href));
    return v_assignment;
  else
    if nullif(trim(p_reason), '') is null then perform app.fail('CG422', 'Give a reason for the rejection.'); end if;
    update public.project_applications set status = 'REJECTED', decided_by = app.current_user_id(), decided_at = now(),
      decision_reason = trim(p_reason) where id = p_application;
    perform app.transition('application', p_application, v_app.organization_id, v_app.user_id, 'PENDING', 'REJECTED', p_reason);
    perform app.audit('application.rejected', 'application', p_application, v_app.organization_id,
      format('Application to %s rejected', v_project.code), jsonb_build_object('reason', p_reason));
    perform app.notify_applicant(v_app, 'application.rejected', 'Application not approved', trim(p_reason), v_href);
    perform app.queue_email(app.applicant_email(v_app), 'application_rejected',
      jsonb_build_object('project_title', v_project.title, 'reason', trim(p_reason)));
    return null;
  end if;
end;
$$;

-- Applicant signs (#24, #25, #26).
create or replace function public.sign_contract(p_assignment uuid, p_signer_name text, p_ip text default null, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_assignment public.project_assignments;
  v_template public.project_contract_templates;
  v_role text;
begin
  select * into v_assignment from public.project_assignments where id = p_assignment for update;
  if not found then perform app.fail('CG404', 'Contract not found.'); end if;
  if v_assignment.status <> 'AWAITING_SIGNATURE' then perform app.fail('CG409', 'This contract is not waiting for your signature.'); end if;

  if v_assignment.organization_id is not null then
    if not app.has_org_permission(v_assignment.organization_id, 'org.contract.sign') then
      perform app.fail('CG403', 'Only the Agency Owner can sign contracts for the agency.');
    end if;
    if not exists (select 1 from public.organizations where id = v_assignment.organization_id and status = 'ACTIVE') then
      perform app.fail('CG409', 'Your agency must be active to sign.');
    end if;
    v_role := 'Agency Owner';
  else
    if v_assignment.user_id <> v_user or not app.has_permission('individual.contract.sign') then
      perform app.fail('CG403', 'You can only sign your own contract.');
    end if;
    v_role := 'Direct Freelancer';
  end if;
  if length(trim(coalesce(p_signer_name, ''))) < 2 then perform app.fail('CG422', 'Type your full name to sign.'); end if;

  select * into v_template from public.project_contract_templates where id = v_assignment.contract_template_id;
  insert into public.contract_signatures (assignment_id, template_id, party, signer_user_id, signer_name, signer_role, body_sha256, ip_address, user_agent)
  values (p_assignment, v_template.id, 'APPLICANT', v_user, trim(p_signer_name), v_role, v_template.body_sha256, p_ip, left(p_user_agent, 400));
  update public.project_assignments set status = 'AWAITING_COUNTERSIGNATURE' where id = p_assignment;
  perform app.transition('assignment', p_assignment, v_assignment.organization_id, v_assignment.user_id,
    'AWAITING_SIGNATURE', 'AWAITING_COUNTERSIGNATURE', null);
  perform app.audit('contract.signed', 'assignment', p_assignment, v_assignment.organization_id,
    format('Contract signed by %s (%s)', trim(p_signer_name), v_role), jsonb_build_object('template_version', v_template.version));
  perform app.notify_permission_holders('contract.countersign', 'contract.signed', 'Contract waiting for countersignature',
    format('%s signed. Countersign to activate.', trim(p_signer_name)), '/admin/contracts');
end;
$$;

-- CohortData countersigns (#28). The project opens to the applicant only after this (#29).
create or replace function public.countersign_contract(p_assignment uuid, p_signer_name text, p_ip text default null, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_permission('contract.countersign');
  v_assignment public.project_assignments;
  v_template public.project_contract_templates;
  v_app public.project_applications;
  v_project public.projects;
  v_href text;
begin
  select * into v_assignment from public.project_assignments where id = p_assignment for update;
  if not found then perform app.fail('CG404', 'Contract not found.'); end if;
  if v_assignment.status <> 'AWAITING_COUNTERSIGNATURE' then perform app.fail('CG409', 'This contract is not waiting for a countersignature.'); end if;
  if length(trim(coalesce(p_signer_name, ''))) < 2 then perform app.fail('CG422', 'Type your full name to sign.'); end if;
  select * into v_template from public.project_contract_templates where id = v_assignment.contract_template_id;
  insert into public.contract_signatures (assignment_id, template_id, party, signer_user_id, signer_name, signer_role, body_sha256, ip_address, user_agent)
  values (p_assignment, v_template.id, 'COHORTDATA', v_user, trim(p_signer_name), 'CohortData', v_template.body_sha256, p_ip, left(p_user_agent, 400));
  update public.project_assignments set status = 'ACTIVE', activated_at = now() where id = p_assignment;
  perform app.transition('assignment', p_assignment, v_assignment.organization_id, v_assignment.user_id,
    'AWAITING_COUNTERSIGNATURE', 'ACTIVE', null);
  perform app.audit('contract.countersigned', 'assignment', p_assignment, v_assignment.organization_id,
    format('Contract countersigned by %s', trim(p_signer_name)));
  select * into v_app from public.project_applications where id = v_assignment.application_id;
  select * into v_project from public.projects where id = v_assignment.project_id;
  v_href := case when v_assignment.organization_id is not null then '/agency/jobs/' else '/work/jobs/' end || v_assignment.project_id;
  perform app.notify_applicant(v_app, 'assignment.active', 'Project is open',
    format('CohortData countersigned. You can start on %s.', v_project.title), v_href);
  perform app.queue_email(app.applicant_email(v_app), 'contract_countersigned',
    jsonb_build_object('project_title', v_project.title, 'href', v_href));
end;
$$;

create or replace function public.revoke_assignment(p_assignment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.project_assignments;
  v_app public.project_applications;
begin
  perform app.require_permission('assignment.revoke');
  if nullif(trim(p_reason), '') is null then perform app.fail('CG422', 'Give a reason.'); end if;
  select * into v_assignment from public.project_assignments where id = p_assignment for update;
  if not found then perform app.fail('CG404', 'Assignment not found.'); end if;
  if v_assignment.status in ('REVOKED', 'COMPLETED') then perform app.fail('CG409', 'This assignment is already closed.'); end if;
  update public.project_assignments set status = 'REVOKED', revoked_at = now(), revoked_by = app.current_user_id(),
    revoke_reason = trim(p_reason) where id = p_assignment;
  update public.member_assignments set status = 'UNASSIGNED', unassigned_at = now(), unassigned_by = app.current_user_id()
    where project_assignment_id = p_assignment and status = 'ASSIGNED';
  perform app.transition('assignment', p_assignment, v_assignment.organization_id, v_assignment.user_id, v_assignment.status, 'REVOKED', p_reason);
  perform app.audit('assignment.revoked', 'assignment', p_assignment, v_assignment.organization_id, 'Project access revoked', jsonb_build_object('reason', p_reason));
  select * into v_app from public.project_applications where id = v_assignment.application_id;
  perform app.notify_applicant(v_app, 'assignment.revoked', 'Project access revoked', trim(p_reason), null);
end;
$$;

-- Agency assigns its own Members to an ACTIVE project (agency-internal; #1).
create or replace function public.assign_member(p_assignment uuid, p_membership uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_assignment public.project_assignments;
  v_member public.organization_memberships;
  v_project public.projects;
  v_id uuid;
begin
  select * into v_assignment from public.project_assignments where id = p_assignment for update;
  if not found or v_assignment.organization_id is null then perform app.fail('CG404', 'Agency project not found.'); end if;
  perform app.require_org_or_platform(v_assignment.organization_id, 'org.members.assign', 'agency.manage');
  if v_assignment.status <> 'ACTIVE' then
    perform app.fail('CG409', 'Members can be assigned only after the contract is signed and countersigned.');
  end if;
  select * into v_project from public.projects where id = v_assignment.project_id;
  if v_project.status in ('COMPLETED', 'ARCHIVED') then perform app.fail('CG409', 'This project is closed.'); end if;
  select * into v_member from public.organization_memberships where id = p_membership;
  if not found or v_member.organization_id <> v_assignment.organization_id then perform app.fail('CG404', 'Member not found in this agency.'); end if;
  if v_member.status <> 'ACTIVE' then perform app.fail('CG409', 'Only active members can be assigned.'); end if;
  if v_member.role <> 'AGENCY_MEMBER' then perform app.fail('CG422', 'Only Agency Members are assigned to projects.'); end if;
  if exists (select 1 from public.member_assignments where project_assignment_id = p_assignment and user_id = v_member.user_id and status = 'ASSIGNED') then
    perform app.fail('CG409', 'This member is already assigned.');
  end if;
  insert into public.member_assignments (project_assignment_id, organization_id, membership_id, user_id, assigned_by)
  values (p_assignment, v_assignment.organization_id, p_membership, v_member.user_id, v_user)
  returning id into v_id;
  perform app.audit('member.assigned', 'member_assignment', v_id, v_assignment.organization_id,
    format('%s assigned to %s', (select email from public.users where id = v_member.user_id), v_project.code));
  perform app.notify(v_member.user_id, 'member.assigned', 'New project assigned', v_project.title, '/work/projects/' || v_project.id);
  return v_id;
end;
$$;

create or replace function public.unassign_member(p_member_assignment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assignments;
begin
  perform app.require_user();
  select * into v_ma from public.member_assignments where id = p_member_assignment for update;
  if not found then perform app.fail('CG404', 'Assignment not found.'); end if;
  perform app.require_org_or_platform(v_ma.organization_id, 'org.members.assign', 'agency.manage');
  if v_ma.status <> 'ASSIGNED' then perform app.fail('CG409', 'This member is not assigned.'); end if;
  update public.member_assignments set status = 'UNASSIGNED', unassigned_at = now(), unassigned_by = app.current_user_id()
    where id = p_member_assignment;
  perform app.audit('member.unassigned', 'member_assignment', p_member_assignment, v_ma.organization_id,
    format('%s unassigned', (select email from public.users where id = v_ma.user_id)));
end;
$$;
