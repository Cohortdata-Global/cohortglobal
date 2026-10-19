-- =============================================================================
-- Operations Manager and project managers per project (ID-52, owner 2026-10-19)
--
-- New parent-team role OPERATIONS_MANAGER, below the Super Admin and above
-- Project Managers. It sees every project and assigns Project Managers to them.
-- A Project Manager now sees and manages ONLY the projects assigned to them
-- (drafts, questions, contract, applications, contracts to countersign,
-- invitations, revocations). Agencies are not affected.
--
-- How it works:
--   project_managers                 who manages which project
--   project.view_all                 Super Admin, Operations Manager, QC roles: every project
--   project.view_assigned (new)      Project Manager: only rows in project_managers
--   app.has_project_permission()     the permission AND (view_all OR assigned)
-- A Project Manager who creates a project is assigned to it automatically.
-- =============================================================================

insert into public.roles (code, scope, name, description, sort_order) values
  ('OPERATIONS_MANAGER', 'PLATFORM', 'Operations Manager', 'Sees every project and assigns Project Managers to them.', 15);

insert into public.permissions (code, scope, description) values
  ('project.view_assigned',   'PLATFORM', 'View and manage only the projects assigned to you'),
  ('project.assign_managers', 'PLATFORM', 'Assign Project Managers to projects');

-- Super Admin has every platform permission.
insert into public.role_permissions (role_code, permission_code) values
  ('SUPER_ADMIN', 'project.assign_managers'),
  ('SUPER_ADMIN', 'project.view_assigned');

-- Operations Manager: everything a Project Manager does, on every project, plus assigning.
insert into public.role_permissions (role_code, permission_code) values
  ('OPERATIONS_MANAGER', 'user.view_all'),
  ('OPERATIONS_MANAGER', 'agency.view_all'),
  ('OPERATIONS_MANAGER', 'project.view_all'),
  ('OPERATIONS_MANAGER', 'project.manage'),
  ('OPERATIONS_MANAGER', 'project.invite_agency'),
  ('OPERATIONS_MANAGER', 'project.assign_managers'),
  ('OPERATIONS_MANAGER', 'application.view_all'),
  ('OPERATIONS_MANAGER', 'application.decide'),
  ('OPERATIONS_MANAGER', 'contract.countersign'),
  ('OPERATIONS_MANAGER', 'assignment.revoke'),
  ('OPERATIONS_MANAGER', 'qc.queue.view');

-- Project Manager: assigned projects only.
delete from public.role_permissions where role_code = 'PROJECT_MANAGER' and permission_code in ('project.view_all', 'application.view_all');
insert into public.role_permissions (role_code, permission_code) values ('PROJECT_MANAGER', 'project.view_assigned');

-- Staff invitations and role changes can now name the Operations Manager.
alter table public.invitations drop constraint invitations_shape;
alter table public.invitations add constraint invitations_shape check (
  (purpose = 'PLATFORM_STAFF' and organization_id is null and role_code in ('OPERATIONS_MANAGER', 'PROJECT_MANAGER', 'QC_LEAD', 'QC_REVIEWER'))
  or (purpose = 'AGENCY_OWNER' and organization_id is null and agency_name is not null and role_code is null)
  or (purpose in ('AGENCY_MANAGER', 'AGENCY_MEMBER') and organization_id is not null and role_code is null)
);

-- -----------------------------------------------------------------------------
-- Who manages which project
-- -----------------------------------------------------------------------------
create table public.project_managers (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  removed_by  uuid references public.users(id),
  removed_at  timestamptz
);
create unique index project_managers_active_uidx on public.project_managers (project_id, user_id) where removed_at is null;
create index project_managers_user_idx on public.project_managers (user_id) where removed_at is null;
alter table public.project_managers enable row level security;
revoke all on public.project_managers from anon, authenticated;
grant select on public.project_managers to authenticated;

-- True when the signed-in user is an active Project Manager assigned to the project.
create or replace function app.is_project_manager(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('project.view_assigned') and exists (
    select 1 from public.project_managers pm
    where pm.project_id = p_project and pm.user_id = app.current_user_id() and pm.removed_at is null);
$$;

-- Parent-team staff who may see this project's inside: all-projects roles, or its assigned managers.
create or replace function app.is_project_staff(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('project.view_all') or app.is_project_manager(p_project);
$$;

create or replace function app.has_project_permission(p_project uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission(p_permission) and app.is_project_staff(p_project);
$$;

create or replace function app.require_project_permission(p_project uuid, p_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if not app.has_permission(p_permission) then
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;
  if not app.is_project_staff(p_project) then
    perform app.fail('CG403', 'This project is not assigned to you. Ask an Operations Manager.');
  end if;
  return v_user;
end;
$$;

-- Notifies holders of a permission who can act on this project (all-projects staff, or its managers).
create or replace function app.notify_project_staff(p_project uuid, p_permission text, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, href)
  select distinct ur.user_id, p_kind, p_title, coalesce(p_body, ''), p_href
  from public.user_roles ur
  join public.role_permissions rp on rp.role_code = ur.role_code and rp.permission_code = p_permission
  join public.users u on u.id = ur.user_id and u.status = 'ACTIVE'
  where ur.revoked_at is null
    and (exists (select 1 from public.user_roles ur2 join public.role_permissions rp2 on rp2.role_code = ur2.role_code
                 where ur2.user_id = ur.user_id and ur2.revoked_at is null and rp2.permission_code = 'project.view_all')
         or exists (select 1 from public.project_managers pm
                    where pm.project_id = p_project and pm.user_id = ur.user_id and pm.removed_at is null));
end;
$$;

-- -----------------------------------------------------------------------------
-- Assigning managers (Super Admin, Operations Manager)
-- -----------------------------------------------------------------------------
create or replace function public.assign_project_manager(p_project uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_permission('project.assign_managers');
  v_project public.projects;
  v_name text;
  v_id uuid;
begin
  select * into v_project from public.projects where id = p_project;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if not exists (
    select 1 from public.user_roles ur join public.users u on u.id = ur.user_id
    where ur.user_id = p_user and ur.role_code = 'PROJECT_MANAGER' and ur.revoked_at is null and u.status = 'ACTIVE') then
    perform app.fail('CG422', 'Choose an active Project Manager.');
  end if;
  if exists (select 1 from public.project_managers where project_id = p_project and user_id = p_user and removed_at is null) then
    perform app.fail('CG409', 'This Project Manager is already assigned to the project.');
  end if;
  insert into public.project_managers (project_id, user_id, assigned_by) values (p_project, p_user, v_actor) returning id into v_id;
  select coalesce(full_name, email) into v_name from public.users where id = p_user;
  perform app.audit('project.manager_assigned', 'project', p_project, null, format('%s assigned to %s', v_name, v_project.code),
    jsonb_build_object('user_id', p_user));
  insert into public.notifications (user_id, kind, title, body, href)
  values (p_user, 'project.assigned', 'Project assigned to you', format('You now manage %s.', v_project.title), '/admin/projects/' || p_project);
  return v_id;
end;
$$;

create or replace function public.remove_project_manager(p_project uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_permission('project.assign_managers');
  v_code text;
  v_name text;
begin
  update public.project_managers set removed_at = now(), removed_by = v_actor
  where project_id = p_project and user_id = p_user and removed_at is null;
  if not found then perform app.fail('CG404', 'This Project Manager is not assigned to the project.'); end if;
  select code into v_code from public.projects where id = p_project;
  select coalesce(full_name, email) into v_name from public.users where id = p_user;
  perform app.audit('project.manager_removed', 'project', p_project, null, format('%s removed from %s', v_name, v_code),
    jsonb_build_object('user_id', p_user));
end;
$$;

-- -----------------------------------------------------------------------------
-- Visibility: a Project Manager sees drafts and insides of assigned projects only
-- -----------------------------------------------------------------------------
create or replace function app.can_view_project(p_project uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_project public.projects;
  v_org uuid;
begin
  if v_user is null then
    return false;
  end if;
  if app.has_permission('project.view_all') or app.is_project_manager(p_project) then
    return true;
  end if;
  select * into v_project from public.projects where id = p_project;
  if not found or v_project.status = 'DRAFT' then
    return false;
  end if;

  v_org := app.current_org_id();

  -- Anyone with an application or assignment for the project keeps seeing it.
  if exists (
    select 1 from public.project_applications a
    where a.project_id = p_project
      and ((a.organization_id = v_org and app.has_org_permission(v_org, 'org.view')) or a.user_id = v_user)
  ) then
    return true;
  end if;

  -- Agency members only see projects assigned to them (#1).
  if exists (
    select 1 from public.member_assignments ma
    join public.project_assignments pa on pa.id = ma.project_assignment_id
    where pa.project_id = p_project and ma.user_id = v_user and ma.status = 'ASSIGNED'
  ) then
    return true;
  end if;

  if v_project.status <> 'PUBLISHED' then
    return false;
  end if;

  -- Open jobs for active agencies (Owner/Manager).
  if v_org is not null
     and app.has_org_permission(v_org, 'org.projects.apply')
     and v_project.applicant_type in ('AGENCY', 'BOTH')
     and exists (select 1 from public.organizations o where o.id = v_org and o.status = 'ACTIVE')
     and (v_project.visibility = 'PUBLIC'
          or exists (select 1 from public.project_invitations pi where pi.project_id = p_project and pi.organization_id = v_org)) then
    return true;
  end if;

  -- Open jobs for direct freelancers.
  if app.has_permission('individual.projects.apply')
     and v_project.applicant_type in ('INDIVIDUAL', 'BOTH')
     and v_project.visibility = 'PUBLIC' then
    return true;
  end if;

  return false;
end;
$$;

create policy project_managers_read on public.project_managers for select to authenticated
  using (user_id = (select app.current_user_id()) or (select app.has_permission('project.view_all')));

drop policy project_versions_read on public.project_versions;
create policy project_versions_read on public.project_versions for select to authenticated
  using (app.is_project_staff(project_id));

drop policy contract_templates_read on public.project_contract_templates;
create policy contract_templates_read on public.project_contract_templates for select to authenticated
  using (
    app.is_project_staff(project_id)
    or exists (
      select 1 from public.project_assignments pa
      where pa.contract_template_id = project_contract_templates.id
        and ((pa.organization_id is not null and app.has_org_permission(pa.organization_id, 'org.view'))
             or pa.user_id = (select app.current_user_id()))
    )
  );

drop policy project_invitations_read on public.project_invitations;
create policy project_invitations_read on public.project_invitations for select to authenticated
  using (app.has_org_permission(organization_id, 'org.view') or app.is_project_staff(project_id));

drop policy applications_read on public.project_applications;
create policy applications_read on public.project_applications for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or app.is_project_manager(project_id)
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.view'))
    or user_id = (select app.current_user_id())
  );

drop policy assignments_read on public.project_assignments;
create policy assignments_read on public.project_assignments for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or app.is_project_staff(project_id)
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.view'))
    or user_id = (select app.current_user_id())
    or exists (
      select 1 from public.member_assignments ma
      where ma.project_assignment_id = project_assignments.id
        and ma.user_id = (select app.current_user_id()) and ma.status = 'ASSIGNED'
    )
  );

drop policy signatures_read on public.contract_signatures;
create policy signatures_read on public.contract_signatures for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or exists (
      select 1 from public.project_assignments pa
      where pa.id = contract_signatures.assignment_id
        and (app.is_project_manager(pa.project_id)
             or (pa.organization_id is not null and app.has_org_permission(pa.organization_id, 'org.view'))
             or pa.user_id = (select app.current_user_id()))
    )
  );

-- Security definer so the member_assignments policy doesn't re-enter project_assignments' policy.
create or replace function app.pm_manages_assignment(p_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.project_assignments pa where pa.id = p_assignment and app.is_project_manager(pa.project_id));
$$;

drop policy member_assignments_read on public.member_assignments;
create policy member_assignments_read on public.member_assignments for select to authenticated
  using (
    user_id = (select app.current_user_id())
    or app.has_org_permission(organization_id, 'org.members.view')
    or (select app.has_permission('project.view_all'))
    or app.pm_manages_assignment(project_assignment_id)
  );

-- Timeline events of applications and assignments of the manager's projects.
create or replace function app.pm_can_see_event(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('project.view_assigned') and (
    (p_entity_type = 'project' and app.is_project_manager(p_entity_id))
    or (p_entity_type = 'application' and exists (select 1 from public.project_applications a where a.id = p_entity_id and app.is_project_manager(a.project_id)))
    or (p_entity_type = 'assignment' and exists (select 1 from public.project_assignments pa where pa.id = p_entity_id and app.is_project_manager(pa.project_id))));
$$;

drop policy workflow_events_read on public.workflow_events;
create policy workflow_events_read on public.workflow_events for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or (select app.has_permission('agency.view_all'))
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.view'))
    or subject_user_id = (select app.current_user_id())
    or app.pm_can_see_event(entity_type, entity_id)
  );

-- -----------------------------------------------------------------------------
-- Project actions check the project, not only the role
-- -----------------------------------------------------------------------------
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
  -- A Project Manager who creates a project manages it (ID-52).
  if not app.has_permission('project.view_all') then
    insert into public.project_managers (project_id, user_id, assigned_by) values (v_id, v_user, v_user);
  end if;
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
  v_user uuid := app.require_project_permission(p_project, 'project.manage');
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
  perform app.require_project_permission(p_project, 'project.manage');
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
  perform app.require_project_permission(p_project, 'project.manage');
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

create or replace function public.save_contract_template(p_project uuid, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_project_permission(p_project, 'project.manage');
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
  v_user uuid := app.require_project_permission(p_project, 'project.invite_agency');
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
  perform app.require_project_permission(v_app.project_id, 'application.decide');
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
  perform app.require_project_permission(v_assignment.project_id, 'contract.countersign');
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
  perform app.require_project_permission(v_assignment.project_id, 'assignment.revoke');
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
  perform app.notify_project_staff(p_project, 'application.decide', 'application.new', 'New application',
    format('%s applied to %s.', v_label, v_project.title), '/admin/projects/' || p_project || '/applications');
  return v_id;
end;
$$;

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
  perform app.notify_project_staff(v_assignment.project_id, 'contract.countersign', 'contract.signed', 'Contract waiting for countersignature',
    format('%s signed. Countersign to activate.', trim(p_signer_name)), '/admin/contracts');
end;
$$;

-- Staff role changes can name the Operations Manager.
create or replace function public.set_staff_role(p_user uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('staff.manage');
  if p_role_code not in ('OPERATIONS_MANAGER', 'PROJECT_MANAGER', 'QC_LEAD', 'QC_REVIEWER') then
    perform app.fail('CG422', 'Choose Operations Manager, Project Manager, QC Lead or QC Reviewer.');
  end if;
  if not exists (
    select 1 from public.organization_memberships m join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user and o.type = 'PLATFORM' and m.status = 'ACTIVE') then
    perform app.fail('CG404', 'This person is not active CohortData staff.');
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role_code = 'SUPER_ADMIN' and revoked_at is null) then
    perform app.fail('CG403', 'The Super Admin role cannot be changed here.');
  end if;
  update public.user_roles set revoked_at = now(), revoked_by = app.current_user_id()
    where user_id = p_user and role_scope = 'PLATFORM' and revoked_at is null and role_code <> p_role_code;
  insert into public.user_roles (user_id, role_code, role_scope, granted_by)
  select p_user, p_role_code, 'PLATFORM', app.current_user_id()
  where not exists (select 1 from public.user_roles where user_id = p_user and role_code = p_role_code and revoked_at is null);
  perform app.audit('staff.role_changed', 'user', p_user, null, format('Staff role set to %s', p_role_code));
end;
$$;

-- Grants (default privileges are closed, ID-38). Helpers used by policies are callable by signed-in users.
revoke execute on function app.is_project_manager(uuid), app.is_project_staff(uuid), app.has_project_permission(uuid, text),
  app.require_project_permission(uuid, text), app.notify_project_staff(uuid, text, text, text, text, text),
  app.pm_can_see_event(text, uuid), app.pm_manages_assignment(uuid) from public, anon;
grant execute on function app.is_project_manager(uuid), app.is_project_staff(uuid), app.pm_can_see_event(text, uuid), app.pm_manages_assignment(uuid) to authenticated;
revoke execute on function public.assign_project_manager(uuid, uuid), public.remove_project_manager(uuid, uuid) from public, anon;
grant execute on function public.assign_project_manager(uuid, uuid), public.remove_project_manager(uuid, uuid) to authenticated;
