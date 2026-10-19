-- =============================================================================
-- CohortGlobal — 0600 Identity and permission helpers (AD-1)
--
-- The user's identity comes from the Clerk session token, verified by Supabase
-- (Clerk third-party auth). auth.jwt()->>'sub' is the Clerk user ID.
-- These helpers are SECURITY DEFINER so that RLS policies can call them without
-- recursion. They only ever answer questions about the *current* user.
-- =============================================================================

create or replace function app.clerk_sub()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

-- Internal id of the signed-in, active user (NULL if unknown or suspended).
create or replace function app.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.users u
  where u.clerk_user_id = app.clerk_sub() and u.status = 'ACTIVE';
$$;

create or replace function app.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.current_user_id();
begin
  if v_id is null then
    perform app.fail('CG401', 'You need to be signed in with an active account.');
  end if;
  return v_id;
end;
$$;

-- The current user's live membership (ACTIVE only), if any.
create or replace function app.current_membership()
returns public.organization_memberships
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.organization_memberships m
  where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  limit 1;
$$;

create or replace function app.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id from public.organization_memberships m
  where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  limit 1;
$$;

-- Platform or individual permission through user_roles.
create or replace function app.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = app.current_user_id()
      and ur.revoked_at is null
      and rp.permission_code = p_permission
  );
$$;

-- Agency permission, only within the given organization.
create or replace function app.has_org_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code = m.role
    where m.user_id = app.current_user_id()
      and m.status = 'ACTIVE'
      and m.organization_id = p_org
      and rp.permission_code = p_permission
  );
$$;

create or replace function app.is_member_of(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE' and m.organization_id = p_org
  );
$$;

create or replace function app.require_permission(p_permission text)
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
  return v_user;
end;
$$;

-- Passes if the user has the agency permission in p_org, or the platform permission.
create or replace function app.require_org_or_platform(p_org uuid, p_org_permission text, p_platform_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if app.has_org_permission(p_org, p_org_permission) then
    return v_user;
  end if;
  if p_platform_permission is not null and app.has_permission(p_platform_permission) then
    return v_user;
  end if;
  perform app.fail('CG403', 'Your role does not allow this action.');
  return null;
end;
$$;

create or replace function app.is_direct_freelancer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = app.current_user_id() and ur.role_code = 'DIRECT_FREELANCER' and ur.revoked_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Visibility helpers used by RLS policies.
-- ---------------------------------------------------------------------------
create or replace function app.can_view_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = app.current_user_id()
      or app.has_permission('user.view_all')
      or exists (
        select 1 from public.organization_memberships m
        where m.user_id = p_user and m.status <> 'REMOVED'
          and app.has_org_permission(m.organization_id, 'org.members.view')
      );
$$;

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
  if app.has_permission('project.view_all') then
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

-- ---------------------------------------------------------------------------
-- Recording helpers: audit, workflow transitions, notifications, email.
-- ---------------------------------------------------------------------------
create or replace function app.audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_org uuid, p_summary text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_user_id();
begin
  insert into public.audit_logs (actor_user_id, actor_kind, action, entity_type, entity_id, organization_id, summary, metadata)
  values (v_actor, case when v_actor is null then 'SYSTEM' else 'USER' end,
          p_action, p_entity_type, p_entity_id, p_org, p_summary, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function app.transition(
  p_entity_type text, p_entity_id uuid, p_org uuid, p_subject uuid,
  p_from text, p_to text, p_reason text default null, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workflow_events (entity_type, entity_id, organization_id, subject_user_id, from_status, to_status, actor_user_id, reason, metadata)
  values (p_entity_type, p_entity_id, p_org, p_subject, p_from, p_to, app.current_user_id(), p_reason, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function app.notify(p_user uuid, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is not null then
    insert into public.notifications (user_id, kind, title, body, href)
    values (p_user, p_kind, p_title, coalesce(p_body, ''), p_href);
  end if;
end;
$$;

-- Notify the Owner and Manager of an agency.
create or replace function app.notify_org_admins(p_org uuid, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, href)
  select m.user_id, p_kind, p_title, coalesce(p_body, ''), p_href
  from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'ACTIVE' and m.role in ('AGENCY_OWNER', 'AGENCY_MANAGER');
end;
$$;

-- Notify everyone holding a platform permission (for example, the Super Admin).
create or replace function app.notify_permission_holders(p_permission text, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, href)
  select distinct ur.user_id, p_kind, p_title, coalesce(p_body, ''), p_href
  from public.user_roles ur
  join public.role_permissions rp on rp.role_code = ur.role_code
  join public.users u on u.id = ur.user_id and u.status = 'ACTIVE'
  where ur.revoked_at is null and rp.permission_code = p_permission;
end;
$$;

create or replace function app.queue_email(p_to text, p_template text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_outbox (to_email, template, payload) values (lower(p_to), p_template, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Helpers are internal: only policies and SECURITY DEFINER functions call them.
revoke all on all functions in schema app from public;
grant execute on function
  app.clerk_sub(), app.current_user_id(), app.current_org_id(), app.has_permission(text),
  app.has_org_permission(uuid, text), app.is_member_of(uuid), app.is_direct_freelancer(),
  app.can_view_user(uuid), app.can_view_project(uuid)
to authenticated;
