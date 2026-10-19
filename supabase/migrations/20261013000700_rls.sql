-- =============================================================================
-- CohortGlobal — 0700 Row-Level Security (AD-1)
--
-- Principles:
--   * RLS is enabled on every table; without a matching policy access is denied.
--   * The anon role gets nothing. Public pages go through server code.
--   * authenticated users may only SELECT, and only what policies allow.
--     All writes go through SECURITY DEFINER functions (0800, 0900) that check
--     permissions, validate the workflow and write audit history.
--   * service_role (system operations only, see docs/architecture.md 6.4) bypasses RLS.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'roles', 'permissions', 'role_permissions', 'users', 'user_roles', 'organizations',
    'agency_profiles', 'agency_documents', 'agency_requests', 'organization_memberships',
    'contributor_profiles', 'invitations', 'invitation_tokens', 'projects', 'project_versions',
    'project_questions', 'project_contract_templates', 'project_invitations', 'project_applications',
    'application_answers', 'project_assignments', 'contract_signatures', 'member_assignments',
    'audit_logs', 'workflow_events', 'notifications', 'email_outbox'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Read-only access for signed-in users; policies decide which rows.
grant select on
  public.roles, public.permissions, public.role_permissions, public.users, public.user_roles,
  public.organizations, public.agency_profiles, public.agency_documents, public.agency_requests,
  public.organization_memberships, public.contributor_profiles, public.invitations, public.projects,
  public.project_versions, public.project_questions, public.project_contract_templates,
  public.project_invitations, public.project_applications, public.application_answers,
  public.project_assignments, public.contract_signatures, public.member_assignments,
  public.audit_logs, public.workflow_events, public.notifications
to authenticated;
-- invitation_tokens and email_outbox: no grant at all (service role only).

-- Reference data -------------------------------------------------------------
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- Users ----------------------------------------------------------------------
create policy users_read on public.users for select to authenticated
  using (app.can_view_user(id));

create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select app.current_user_id()) or (select app.has_permission('user.view_all')));

create policy contributor_profiles_read on public.contributor_profiles for select to authenticated
  using (app.can_view_user(user_id));

-- Organizations --------------------------------------------------------------
create policy organizations_read on public.organizations for select to authenticated
  using (app.is_member_of(id) or (select app.has_permission('agency.view_all')));

create policy agency_profiles_read on public.agency_profiles for select to authenticated
  using (app.has_org_permission(organization_id, 'org.view') or (select app.has_permission('agency.view_all')));

create policy agency_documents_read on public.agency_documents for select to authenticated
  using (app.has_org_permission(organization_id, 'org.view') or (select app.has_permission('agency.view_all')));

create policy agency_requests_read on public.agency_requests for select to authenticated
  using (app.has_org_permission(organization_id, 'org.view') or (select app.has_permission('agency_request.decide')));

create policy memberships_read on public.organization_memberships for select to authenticated
  using (
    user_id = (select app.current_user_id())
    or app.has_org_permission(organization_id, 'org.members.view')
    or (select app.has_permission('user.view_all'))
  );

create policy invitations_read on public.invitations for select to authenticated
  using (
    (organization_id is not null and app.has_org_permission(organization_id, 'org.members.view'))
    or (purpose = 'PLATFORM_STAFF' and (select app.has_permission('staff.invite')))
    or (purpose = 'AGENCY_OWNER' and (select app.has_permission('agency.invite')))
    or (select app.has_permission('agency.manage'))
  );

-- Projects -------------------------------------------------------------------
create policy projects_read on public.projects for select to authenticated
  using (app.can_view_project(id));

create policy project_versions_read on public.project_versions for select to authenticated
  using ((select app.has_permission('project.view_all')));

create policy project_questions_read on public.project_questions for select to authenticated
  using (app.can_view_project(project_id));

create policy contract_templates_read on public.project_contract_templates for select to authenticated
  using (
    (select app.has_permission('project.view_all'))
    or exists (
      select 1 from public.project_assignments pa
      where pa.contract_template_id = project_contract_templates.id
        and ((pa.organization_id is not null and app.has_org_permission(pa.organization_id, 'org.view'))
             or pa.user_id = (select app.current_user_id()))
    )
  );

create policy project_invitations_read on public.project_invitations for select to authenticated
  using (app.has_org_permission(organization_id, 'org.view') or (select app.has_permission('project.view_all')));

create policy applications_read on public.project_applications for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.view'))
    or user_id = (select app.current_user_id())
  );

create policy answers_read on public.application_answers for select to authenticated
  using (exists (select 1 from public.project_applications a where a.id = application_answers.application_id));
  -- The nested select is itself filtered by applications_read.

create policy assignments_read on public.project_assignments for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or (select app.has_permission('project.view_all'))
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.view'))
    or user_id = (select app.current_user_id())
    or exists (
      select 1 from public.member_assignments ma
      where ma.project_assignment_id = project_assignments.id
        and ma.user_id = (select app.current_user_id()) and ma.status = 'ASSIGNED'
    )
  );

create policy signatures_read on public.contract_signatures for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or exists (
      select 1 from public.project_assignments pa
      where pa.id = contract_signatures.assignment_id
        and ((pa.organization_id is not null and app.has_org_permission(pa.organization_id, 'org.view'))
             or pa.user_id = (select app.current_user_id()))
    )
  );

create policy member_assignments_read on public.member_assignments for select to authenticated
  using (
    user_id = (select app.current_user_id())
    or app.has_org_permission(organization_id, 'org.members.view')
    or (select app.has_permission('project.view_all'))
  );

-- History and messages -------------------------------------------------------
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (
    (select app.has_permission('audit.view_all'))
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.audit.view'))
  );

create policy workflow_events_read on public.workflow_events for select to authenticated
  using (
    (select app.has_permission('application.view_all'))
    or (select app.has_permission('agency.view_all'))
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.view'))
    or subject_user_id = (select app.current_user_id())
  );

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select app.current_user_id()));
