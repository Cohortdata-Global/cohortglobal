-- =============================================================================
-- CohortGlobal — 0800 Identity, agency and invitation functions (Module 1C)
-- All writes happen here. Every function checks the caller's permission itself,
-- because a signed-in user could call these through the Supabase API directly.
-- =============================================================================

-- Small JSON helpers ----------------------------------------------------------
create or replace function app.jtext(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(p ->> k), '');
$$;

create or replace function app.jtext_array(p jsonb, k text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p -> k) = 'array'
    then array(select trim(x) from jsonb_array_elements_text(p -> k) x where trim(x) <> '')
    else null end;
$$;

-- Validates agency profile fields. p_require_all = true for a full application (#12).
create or replace function app.validate_agency_profile(p jsonb, p_require_all boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  k text;
  allowed text[] := array['name', 'legal_name', 'country_code', 'registration_number', 'tax_id', 'website_url',
                          'contact_name', 'contact_email', 'contact_phone_e164', 'address', 'description',
                          'languages', 'team_size'];
begin
  for k in select jsonb_object_keys(coalesce(p, '{}'::jsonb)) loop
    if not k = any(allowed) then
      perform app.fail('CG422', format('Unknown agency field: %s.', k));
    end if;
  end loop;

  if p_require_all then
    if app.jtext(p, 'name') is null then perform app.fail('CG422', 'Agency name is required.'); end if;
    if app.jtext(p, 'legal_name') is null then perform app.fail('CG422', 'Legal company name is required.'); end if;
    if app.jtext(p, 'country_code') is null then perform app.fail('CG422', 'Country is required.'); end if;
    if app.jtext(p, 'registration_number') is null and app.jtext(p, 'tax_id') is null then
      perform app.fail('CG422', 'A registration number or tax number is required.');
    end if;
    if app.jtext(p, 'contact_name') is null then perform app.fail('CG422', 'Contact person is required.'); end if;
    if app.jtext(p, 'contact_email') is null then perform app.fail('CG422', 'Contact email is required.'); end if;
    if app.jtext(p, 'contact_phone_e164') is null then perform app.fail('CG422', 'Contact phone is required.'); end if;
    if app.jtext(p, 'website_url') is null then perform app.fail('CG422', 'Company website is required.'); end if;
  end if;

  if app.jtext(p, 'name') is not null and length(app.jtext(p, 'name')) not between 2 and 160 then
    perform app.fail('CG422', 'Agency name must be 2 to 160 characters.');
  end if;
  if app.jtext(p, 'country_code') is not null and upper(app.jtext(p, 'country_code')) !~ '^[A-Z]{2}$' then
    perform app.fail('CG422', 'Country must be a two-letter ISO code.');
  end if;
  if app.jtext(p, 'contact_phone_e164') is not null and app.jtext(p, 'contact_phone_e164') !~ '^\+[1-9][0-9]{6,14}$' then
    perform app.fail('CG422', 'Phone must be in international format, for example +6591234567.');
  end if;
  if app.jtext(p, 'contact_email') is not null and app.jtext(p, 'contact_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail('CG422', 'Contact email is not valid.');
  end if;
  if app.jtext(p, 'website_url') is not null and app.jtext(p, 'website_url') !~* '^https?://' then
    perform app.fail('CG422', 'Website must start with http:// or https://.');
  end if;
  if p ? 'team_size' and jsonb_typeof(p -> 'team_size') not in ('number', 'null') then
    perform app.fail('CG422', 'Team size must be a number.');
  end if;
end;
$$;

-- Applies only the keys present in p.
create or replace function app.apply_agency_profile(p_org uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p ? 'name' then
    update public.organizations set name = app.jtext(p, 'name') where id = p_org;
  end if;
  insert into public.agency_profiles (organization_id) values (p_org) on conflict (organization_id) do nothing;
  update public.agency_profiles ap set
    legal_name          = case when p ? 'legal_name' then app.jtext(p, 'legal_name') else ap.legal_name end,
    country_code        = case when p ? 'country_code' then upper(app.jtext(p, 'country_code')) else ap.country_code end,
    registration_number = case when p ? 'registration_number' then app.jtext(p, 'registration_number') else ap.registration_number end,
    tax_id              = case when p ? 'tax_id' then app.jtext(p, 'tax_id') else ap.tax_id end,
    website_url         = case when p ? 'website_url' then app.jtext(p, 'website_url') else ap.website_url end,
    contact_name        = case when p ? 'contact_name' then app.jtext(p, 'contact_name') else ap.contact_name end,
    contact_email       = case when p ? 'contact_email' then lower(app.jtext(p, 'contact_email')) else ap.contact_email end,
    contact_phone_e164  = case when p ? 'contact_phone_e164' then app.jtext(p, 'contact_phone_e164') else ap.contact_phone_e164 end,
    address             = case when p ? 'address' then app.jtext(p, 'address') else ap.address end,
    description         = case when p ? 'description' then app.jtext(p, 'description') else ap.description end,
    languages           = case when p ? 'languages' then coalesce(app.jtext_array(p, 'languages'), '{}') else ap.languages end,
    team_size           = case when p ? 'team_size' then (p ->> 'team_size')::int else ap.team_size end
  where ap.organization_id = p_org;
end;
$$;

-- =============================================================================
-- System functions (service role only): Clerk webhook and bootstrap
-- =============================================================================
create or replace function public.sync_clerk_user(p_clerk_user_id text, p_email text, p_full_name text, p_avatar_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  if p_clerk_user_id is null or v_email is null then
    perform app.fail('CG422', 'Clerk user id and email are required.');
  end if;
  insert into public.users (clerk_user_id, email, full_name, avatar_url)
  values (p_clerk_user_id, v_email, nullif(trim(p_full_name), ''), p_avatar_url)
  on conflict (clerk_user_id) do update
    set email = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        avatar_url = excluded.avatar_url
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mark_clerk_user_deleted(p_clerk_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  select * into v_user from public.users where clerk_user_id = p_clerk_user_id;
  if not found then return; end if;
  update public.users set status = 'DELETED', deleted_at = now() where id = v_user.id;
  update public.organization_memberships set status = 'REMOVED', removed_at = now(), status_reason = 'Account deleted'
    where user_id = v_user.id and status <> 'REMOVED';
  update public.member_assignments set status = 'UNASSIGNED', unassigned_at = now()
    where user_id = v_user.id and status = 'ASSIGNED';
  update public.user_roles set revoked_at = now() where user_id = v_user.id and revoked_at is null;
  perform app.audit('user.deleted', 'user', v_user.id, null, format('Account %s was deleted in Clerk', v_user.email));
end;
$$;

-- One-time bootstrap of the first Super Admin (docs/architecture.md 6.5).
-- Callable only with the service role; refuses if a Super Admin already exists.
create or replace function public.bootstrap_super_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_org uuid;
begin
  if exists (select 1 from public.user_roles where role_code = 'SUPER_ADMIN' and revoked_at is null) then
    perform app.fail('CG409', 'A Super Admin already exists. Bootstrap can only run once.');
  end if;
  select * into v_user from public.users where email = lower(trim(p_email)) and status = 'ACTIVE';
  if not found then
    perform app.fail('CG404', 'No active account with that email. Sign up through the app first, then run the bootstrap.');
  end if;
  if exists (select 1 from public.organization_memberships where user_id = v_user.id and status <> 'REMOVED') then
    perform app.fail('CG409', 'That account already belongs to an organization.');
  end if;

  select id into v_org from public.organizations where type = 'PLATFORM';
  if v_org is null then
    insert into public.organizations (type, name, status, source, approved_at)
    values ('PLATFORM', 'CohortData', 'ACTIVE', 'SYSTEM', now())
    returning id into v_org;
  end if;

  insert into public.organization_memberships (organization_id, user_id, role) values (v_org, v_user.id, 'STAFF');
  insert into public.user_roles (user_id, role_code, role_scope) values (v_user.id, 'SUPER_ADMIN', 'PLATFORM');
  update public.users set registration_path = 'STAFF' where id = v_user.id;
  perform app.audit('platform.bootstrap', 'user', v_user.id, v_org, format('%s was made the first Super Admin', v_user.email));
  return v_user.id;
end;
$$;

-- =============================================================================
-- Current user
-- =============================================================================
create or replace function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_membership public.organization_memberships;
  v_org public.organizations;
  v_roles text[];
  v_permissions text[];
begin
  select * into v_user from public.users where clerk_user_id = app.clerk_sub();
  if not found then
    return jsonb_build_object('user', null);
  end if;

  select * into v_membership from public.organization_memberships
  where user_id = v_user.id and status <> 'REMOVED' limit 1;
  if v_membership.id is not null then
    select * into v_org from public.organizations where id = v_membership.organization_id;
  end if;

  select coalesce(array_agg(role_code order by role_code), '{}') into v_roles
  from public.user_roles where user_id = v_user.id and revoked_at is null;

  select coalesce(array_agg(distinct rp.permission_code order by rp.permission_code), '{}') into v_permissions
  from public.role_permissions rp
  where v_user.status = 'ACTIVE' and (
    rp.role_code = any(v_roles)
    or (v_membership.status = 'ACTIVE' and rp.role_code = v_membership.role)
  );

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id, 'email', v_user.email, 'full_name', v_user.full_name, 'avatar_url', v_user.avatar_url,
      'phone_e164', v_user.phone_e164, 'country_code', v_user.country_code, 'timezone', v_user.timezone,
      'registration_path', v_user.registration_path, 'status', v_user.status),
    'membership', case when v_membership.id is null then null else jsonb_build_object(
      'id', v_membership.id, 'role', v_membership.role, 'status', v_membership.status) end,
    'organization', case when v_org.id is null then null else jsonb_build_object(
      'id', v_org.id, 'type', v_org.type, 'name', v_org.name, 'status', v_org.status,
      'status_reason', v_org.status_reason, 'reapply_after', v_org.reapply_after) end,
    'roles', to_jsonb(v_roles),
    'permissions', to_jsonb(v_permissions)
  );
end;
$$;

create or replace function public.update_my_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if app.jtext(p, 'phone_e164') is not null and app.jtext(p, 'phone_e164') !~ '^\+[1-9][0-9]{6,14}$' then
    perform app.fail('CG422', 'Phone must be in international format, for example +919876543210.');
  end if;
  if app.jtext(p, 'country_code') is not null and upper(app.jtext(p, 'country_code')) !~ '^[A-Z]{2}$' then
    perform app.fail('CG422', 'Country must be a two-letter ISO code.');
  end if;
  update public.users u set
    full_name    = case when p ? 'full_name' then app.jtext(p, 'full_name') else u.full_name end,
    phone_e164   = case when p ? 'phone_e164' then app.jtext(p, 'phone_e164') else u.phone_e164 end,
    country_code = case when p ? 'country_code' then upper(app.jtext(p, 'country_code')) else u.country_code end,
    timezone     = case when p ? 'timezone' and app.jtext(p, 'timezone') is not null then app.jtext(p, 'timezone') else u.timezone end
  where u.id = v_user;

  if p ? 'contributor' then
    insert into public.contributor_profiles (user_id) values (v_user) on conflict (user_id) do nothing;
    update public.contributor_profiles c set
      date_of_birth    = case when p -> 'contributor' ? 'date_of_birth' then (app.jtext(p -> 'contributor', 'date_of_birth'))::date else c.date_of_birth end,
      gender           = case when p -> 'contributor' ? 'gender' then app.jtext(p -> 'contributor', 'gender') else c.gender end,
      nationality_code = case when p -> 'contributor' ? 'nationality_code' then upper(app.jtext(p -> 'contributor', 'nationality_code')) else c.nationality_code end,
      native_language  = case when p -> 'contributor' ? 'native_language' then app.jtext(p -> 'contributor', 'native_language') else c.native_language end,
      other_languages  = case when p -> 'contributor' ? 'other_languages' then coalesce(app.jtext_array(p -> 'contributor', 'other_languages'), '{}') else c.other_languages end,
      skills           = case when p -> 'contributor' ? 'skills' then coalesce(app.jtext_array(p -> 'contributor', 'skills'), '{}') else c.skills end,
      linkedin_url     = case when p -> 'contributor' ? 'linkedin_url' then app.jtext(p -> 'contributor', 'linkedin_url') else c.linkedin_url end,
      bio              = case when p -> 'contributor' ? 'bio' then app.jtext(p -> 'contributor', 'bio') else c.bio end
    where c.user_id = v_user;
  end if;
end;
$$;

-- =============================================================================
-- Onboarding: direct freelancer or agency (self sign-up)
-- =============================================================================
create or replace function public.complete_freelancer_onboarding(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  perform app.require_user();
  select * into v_user from public.users where id = app.current_user_id() for update;
  if v_user.registration_path is not null then
    perform app.fail('CG409', 'This account has already been set up.');
  end if;
  if exists (select 1 from public.organization_memberships where user_id = v_user.id and status <> 'REMOVED') then
    perform app.fail('CG409', 'This account already belongs to an organization.');
  end if;
  if app.jtext(p, 'full_name') is null then perform app.fail('CG422', 'Full name is required.'); end if;
  if app.jtext(p, 'country_code') is null then perform app.fail('CG422', 'Country is required.'); end if;

  perform public.update_my_profile(p);
  update public.users set registration_path = 'FREELANCER' where id = v_user.id;
  insert into public.user_roles (user_id, role_code, role_scope) values (v_user.id, 'DIRECT_FREELANCER', 'INDIVIDUAL');
  insert into public.contributor_profiles (user_id) values (v_user.id) on conflict do nothing;
  perform app.audit('freelancer.registered', 'user', v_user.id, null, format('%s registered as a direct freelancer', v_user.email));
end;
$$;

-- Creates (or re-submits) the caller's agency application. The caller becomes Owner.
create or replace function public.submit_agency_application(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_membership public.organization_memberships;
  v_org public.organizations;
  v_org_id uuid;
begin
  perform app.require_user();
  select * into v_user from public.users where id = app.current_user_id() for update;
  perform app.validate_agency_profile(p, true);

  select * into v_membership from public.organization_memberships
  where user_id = v_user.id and status <> 'REMOVED' limit 1;

  if v_membership.id is null then
    if v_user.registration_path is not null then
      perform app.fail('CG409', 'This account is already set up as a different account type.');
    end if;
    insert into public.organizations (type, name, status, source, created_by)
    values ('AGENCY', app.jtext(p, 'name'), 'PENDING_VERIFICATION', 'SELF_SIGNUP', v_user.id)
    returning id into v_org_id;
    insert into public.organization_memberships (organization_id, user_id, role) values (v_org_id, v_user.id, 'AGENCY_OWNER');
    update public.users set registration_path = 'AGENCY' where id = v_user.id;
    perform app.apply_agency_profile(v_org_id, p);
    update public.agency_profiles set submitted_at = now() where organization_id = v_org_id;
    perform app.transition('organization', v_org_id, v_org_id, v_user.id, null, 'PENDING_VERIFICATION', 'Agency applied');
    perform app.audit('agency.applied', 'organization', v_org_id, v_org_id, format('%s applied to become an agency', app.jtext(p, 'name')));
  else
    if v_membership.role <> 'AGENCY_OWNER' then
      perform app.fail('CG403', 'Only the Agency Owner can submit the agency application.');
    end if;
    select * into v_org from public.organizations where id = v_membership.organization_id for update;
    v_org_id := v_org.id;
    if v_org.status = 'REJECTED' then
      if v_org.reapply_after is not null and now() < v_org.reapply_after then
        perform app.fail('CG409', format('You can apply again after %s.', to_char(v_org.reapply_after at time zone 'UTC', 'DD Mon YYYY HH24:MI "UTC"')));
      end if;
      update public.organizations set status = 'PENDING_VERIFICATION', status_reason = null, rejected_at = null,
        reapply_after = null, status_changed_at = now() where id = v_org_id;
      perform app.transition('organization', v_org_id, v_org_id, v_user.id, 'REJECTED', 'PENDING_VERIFICATION', 'Agency re-applied');
      perform app.audit('agency.reapplied', 'organization', v_org_id, v_org_id, format('%s applied again', app.jtext(p, 'name')));
    elsif v_org.status = 'PENDING_VERIFICATION' then
      perform app.audit('agency.application_updated', 'organization', v_org_id, v_org_id, 'Application details updated while pending');
    else
      perform app.fail('CG409', 'Your agency is already reviewed. Use a change request to update the profile.');
    end if;
    perform app.apply_agency_profile(v_org_id, p);
    update public.agency_profiles set submitted_at = now() where organization_id = v_org_id;
  end if;

  perform app.notify_permission_holders('agency.decide', 'agency.pending', 'Agency waiting for approval',
    format('%s submitted an agency application.', app.jtext(p, 'name')), '/admin/agencies/' || v_org_id);
  return v_org_id;
end;
$$;

-- =============================================================================
-- Agency documents (files are stored by the server; this records them)
-- =============================================================================
create or replace function public.register_agency_document(
  p_org uuid, p_document_type text, p_file_name text, p_storage_bucket text, p_storage_path text,
  p_mime_type text, p_size_bytes bigint, p_request_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_org public.organizations;
  v_status text;
  v_id uuid;
begin
  select * into v_org from public.organizations where id = p_org and type = 'AGENCY';
  if not found then perform app.fail('CG404', 'Agency not found.'); end if;

  if app.has_permission('agency.manage') then
    v_status := 'ACTIVE';
  elsif app.has_org_permission(p_org, 'org.profile.request_change') then
    if v_org.status in ('PENDING_VERIFICATION', 'REJECTED') then
      v_status := 'ACTIVE';          -- still applying: documents are part of the application
    elsif p_request_id is not null and exists (
      select 1 from public.agency_requests r
      where r.id = p_request_id and r.organization_id = p_org and r.type = 'PROFILE_CHANGE' and r.status = 'PENDING') then
      v_status := 'PENDING';         -- approved agency: needs Super Admin approval (#7)
    else
      perform app.fail('CG409', 'Approved agencies add documents through a change request.');
    end if;
  else
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;

  if p_size_bytes > 10 * 1024 * 1024 then
    perform app.fail('CG422', 'Documents can be at most 10 MB.');
  end if;

  insert into public.agency_documents (organization_id, document_type, file_name, storage_bucket, storage_path,
    mime_type, size_bytes, status, request_id, uploaded_by)
  values (p_org, p_document_type, p_file_name, p_storage_bucket, p_storage_path, p_mime_type, p_size_bytes,
    v_status, case when v_status = 'PENDING' then p_request_id end, v_user)
  returning id into v_id;
  perform app.audit('agency.document_added', 'agency_document', v_id, p_org, format('Document %s added (%s)', p_file_name, v_status));
  return v_id;
end;
$$;

create or replace function public.remove_agency_document(p_document uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.agency_documents;
  v_org public.organizations;
begin
  perform app.require_user();
  select * into v_doc from public.agency_documents where id = p_document;
  if not found then perform app.fail('CG404', 'Document not found.'); end if;
  select * into v_org from public.organizations where id = v_doc.organization_id;
  if not (app.has_permission('agency.manage')
          or (app.has_org_permission(v_doc.organization_id, 'org.profile.request_change')
              and (v_org.status in ('PENDING_VERIFICATION', 'REJECTED') or v_doc.status = 'PENDING'))) then
    perform app.fail('CG403', 'Approved documents can only be removed through a change request.');
  end if;
  update public.agency_documents set status = 'REMOVED' where id = p_document;
  perform app.audit('agency.document_removed', 'agency_document', p_document, v_doc.organization_id, format('Document %s removed', v_doc.file_name));
end;
$$;

-- =============================================================================
-- Invitations
-- =============================================================================
create or replace function app.check_invite_permission(p_purpose text, p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_user();
  if p_purpose = 'PLATFORM_STAFF' then
    perform app.require_permission('staff.invite');
  elsif p_purpose = 'AGENCY_OWNER' then
    perform app.require_permission('agency.invite');
  elsif p_purpose = 'AGENCY_MANAGER' then
    perform app.require_org_or_platform(p_org, 'org.manager.manage', 'agency.manage');
  elsif p_purpose = 'AGENCY_MEMBER' then
    perform app.require_org_or_platform(p_org, 'org.members.invite', 'agency.manage');
  else
    perform app.fail('CG422', 'Unknown invitation type.');
  end if;
end;
$$;

-- Returns {id, token, expires_at}. The raw token is returned once and never stored.
create or replace function public.create_invitation(
  p_purpose text, p_email text, p_organization_id uuid default null, p_role_code text default null,
  p_agency_name text default null, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_email text := lower(trim(p_email));
  v_existing public.users;
  v_org public.organizations;
  v_id uuid;
  v_token text := app.new_token();
  v_expires timestamptz := now() + interval '7 days';   -- confirmed #18
begin
  perform app.check_invite_permission(p_purpose, p_organization_id);
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail('CG422', 'Enter a valid email address.');
  end if;

  if p_purpose in ('AGENCY_MANAGER', 'AGENCY_MEMBER') then
    select * into v_org from public.organizations where id = p_organization_id and type = 'AGENCY';
    if not found then perform app.fail('CG404', 'Agency not found.'); end if;
    if v_org.status <> 'ACTIVE' then perform app.fail('CG409', 'Only approved, active agencies can invite people.'); end if;
  end if;

  if p_purpose = 'AGENCY_MANAGER' then
    if exists (select 1 from public.organization_memberships where organization_id = p_organization_id
               and role = 'AGENCY_MANAGER' and status <> 'REMOVED') then
      perform app.fail('CG409', 'This agency already has a Manager. An agency can have only one.');
    end if;
    if exists (select 1 from public.invitations where organization_id = p_organization_id
               and purpose = 'AGENCY_MANAGER' and status = 'PENDING' and expires_at > now()) then
      perform app.fail('CG409', 'A Manager invitation is already pending for this agency.');
    end if;
  end if;

  if p_purpose = 'AGENCY_OWNER' and app.jtext(jsonb_build_object('n', p_agency_name), 'n') is null then
    perform app.fail('CG422', 'Agency name is required.');
  end if;

  -- The invitee must not already belong somewhere or be a direct freelancer.
  select * into v_existing from public.users where email = v_email and status <> 'DELETED';
  if v_existing.id is not null then
    if exists (select 1 from public.organization_memberships where user_id = v_existing.id and status <> 'REMOVED') then
      perform app.fail('CG409', 'This person already belongs to an organization.');
    end if;
    if v_existing.registration_path = 'FREELANCER' then
      perform app.fail('CG409', 'This email belongs to a direct freelancer. They must delete that account before joining.');
    end if;
  end if;

  -- Expire stale invitations for this email, then refuse if one is still open.
  update public.invitations set status = 'EXPIRED' where email = v_email and status = 'PENDING' and expires_at <= now();
  if exists (select 1 from public.invitations where email = v_email and status = 'PENDING') then
    perform app.fail('CG409', 'This email already has a pending invitation. Resend or revoke it instead.');
  end if;

  insert into public.invitations (purpose, email, organization_id, agency_name, role_code, message, invited_by, expires_at)
  values (p_purpose, v_email, p_organization_id, nullif(trim(p_agency_name), ''),
          case when p_purpose = 'PLATFORM_STAFF' then p_role_code end, nullif(trim(p_message), ''), v_user, v_expires)
  returning id into v_id;
  insert into public.invitation_tokens (invitation_id, token_hash) values (v_id, app.hash_token(v_token));

  perform app.audit('invitation.created', 'invitation', v_id, p_organization_id,
    format('Invited %s (%s)', v_email, p_purpose), jsonb_build_object('purpose', p_purpose, 'role', p_role_code));
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.resend_invitation(p_invitation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_token text := app.new_token();
  v_expires timestamptz := now() + interval '7 days';
begin
  select * into v_inv from public.invitations where id = p_invitation for update;
  if not found then perform app.fail('CG404', 'Invitation not found.'); end if;
  perform app.check_invite_permission(v_inv.purpose, v_inv.organization_id);
  if v_inv.status not in ('PENDING', 'EXPIRED') then
    perform app.fail('CG409', 'Only pending or expired invitations can be re-sent.');
  end if;
  if v_inv.status = 'EXPIRED' and exists (
      select 1 from public.invitations where email = v_inv.email and status = 'PENDING' and id <> v_inv.id) then
    perform app.fail('CG409', 'This email already has another pending invitation.');
  end if;
  update public.invitations set status = 'PENDING', expires_at = v_expires, send_count = send_count + 1, last_sent_at = now()
    where id = v_inv.id;
  update public.invitation_tokens set token_hash = app.hash_token(v_token), created_at = now() where invitation_id = v_inv.id;
  perform app.audit('invitation.resent', 'invitation', v_inv.id, v_inv.organization_id, format('Invitation to %s re-sent', v_inv.email));
  return jsonb_build_object('id', v_inv.id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_invitation for update;
  if not found then perform app.fail('CG404', 'Invitation not found.'); end if;
  perform app.check_invite_permission(v_inv.purpose, v_inv.organization_id);
  if v_inv.status <> 'PENDING' then perform app.fail('CG409', 'Only pending invitations can be revoked.'); end if;
  update public.invitations set status = 'REVOKED', revoked_at = now(), revoked_by = app.current_user_id() where id = v_inv.id;
  perform app.audit('invitation.revoked', 'invitation', v_inv.id, v_inv.organization_id, format('Invitation to %s revoked', v_inv.email));
end;
$$;

-- Server-only preview for the /invite/[token] page (service role).
create or replace function public.preview_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_org_name text;
  v_inviter text;
  v_state text;
begin
  select i.* into v_inv from public.invitations i
  join public.invitation_tokens t on t.invitation_id = i.id
  where t.token_hash = app.hash_token(p_token);
  if not found then
    return jsonb_build_object('state', 'INVALID');
  end if;
  select name into v_org_name from public.organizations where id = v_inv.organization_id;
  select coalesce(full_name, email) into v_inviter from public.users where id = v_inv.invited_by;
  v_state := case
    when v_inv.status = 'PENDING' and v_inv.expires_at <= now() then 'EXPIRED'
    else v_inv.status end;
  return jsonb_build_object(
    'state', v_state, 'purpose', v_inv.purpose, 'email', v_inv.email,
    'organization_name', coalesce(v_org_name, v_inv.agency_name), 'role_code', v_inv.role_code,
    'inviter_name', v_inviter, 'message', v_inv.message, 'expires_at', v_inv.expires_at);
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_inv public.invitations;
  v_org public.organizations;
  v_org_id uuid;
  v_role text;
begin
  perform app.require_user();
  select * into v_user from public.users where id = app.current_user_id() for update;

  select i.* into v_inv from public.invitations i
  join public.invitation_tokens t on t.invitation_id = i.id
  where t.token_hash = app.hash_token(p_token)
  for update of i;
  if not found then perform app.fail('CG404', 'This invitation link is not valid.'); end if;

  if v_inv.status = 'ACCEPTED' then perform app.fail('CG409', 'This invitation has already been used.'); end if;
  if v_inv.status = 'REVOKED' then perform app.fail('CG409', 'This invitation was revoked. Ask for a new one.'); end if;
  if v_inv.status = 'EXPIRED' or v_inv.expires_at <= now() then
    update public.invitations set status = 'EXPIRED' where id = v_inv.id and status = 'PENDING';
    perform app.fail('CG409', 'This invitation has expired. Ask for a new one.');
  end if;
  if v_user.email <> v_inv.email then
    perform app.fail('CG403', format('This invitation is for %s. Sign in with that email to accept it.', v_inv.email));
  end if;
  if v_user.registration_path = 'FREELANCER'
     or exists (select 1 from public.user_roles where user_id = v_user.id and role_code = 'DIRECT_FREELANCER' and revoked_at is null) then
    perform app.fail('CG409', 'This account is a direct freelancer account. Delete it and sign up again with this email to accept.');
  end if;
  if exists (select 1 from public.organization_memberships where user_id = v_user.id and status <> 'REMOVED') then
    perform app.fail('CG409', 'This account already belongs to an organization.');
  end if;

  if v_inv.purpose = 'PLATFORM_STAFF' then
    select id into v_org_id from public.organizations where type = 'PLATFORM';
    if v_org_id is null then perform app.fail('CG409', 'The platform has not been set up yet.'); end if;
    insert into public.organization_memberships (organization_id, user_id, role, invited_by)
    values (v_org_id, v_user.id, 'STAFF', v_inv.invited_by);
    insert into public.user_roles (user_id, role_code, role_scope, granted_by)
    values (v_user.id, v_inv.role_code, 'PLATFORM', v_inv.invited_by);
    update public.users set registration_path = 'STAFF' where id = v_user.id;
    v_role := v_inv.role_code;

  elsif v_inv.purpose = 'AGENCY_OWNER' then
    -- Agencies invited by the Super Admin are approved automatically (#11).
    insert into public.organizations (type, name, status, source, created_by, approved_at, approved_by)
    values ('AGENCY', v_inv.agency_name, 'ACTIVE', 'INVITED', v_user.id, now(), v_inv.invited_by)
    returning id into v_org_id;
    insert into public.agency_profiles (organization_id, legal_name, contact_email)
    values (v_org_id, v_inv.agency_name, v_user.email);
    insert into public.organization_memberships (organization_id, user_id, role, invited_by)
    values (v_org_id, v_user.id, 'AGENCY_OWNER', v_inv.invited_by);
    update public.users set registration_path = 'AGENCY' where id = v_user.id;
    perform app.transition('organization', v_org_id, v_org_id, v_user.id, null, 'ACTIVE', 'Invited by the Super Admin; approved automatically');
    v_role := 'AGENCY_OWNER';

  else
    select * into v_org from public.organizations where id = v_inv.organization_id for update;
    if v_org.status <> 'ACTIVE' then perform app.fail('CG409', 'This agency is not active right now.'); end if;
    v_org_id := v_org.id;
    v_role := case v_inv.purpose when 'AGENCY_MANAGER' then 'AGENCY_MANAGER' else 'AGENCY_MEMBER' end;
    if v_role = 'AGENCY_MANAGER' and exists (
      select 1 from public.organization_memberships where organization_id = v_org_id and role = 'AGENCY_MANAGER' and status <> 'REMOVED') then
      perform app.fail('CG409', 'This agency already has a Manager.');
    end if;
    insert into public.organization_memberships (organization_id, user_id, role, invited_by)
    values (v_org_id, v_user.id, v_role, v_inv.invited_by);
    insert into public.contributor_profiles (user_id) values (v_user.id) on conflict do nothing;
    update public.users set registration_path = 'AGENCY' where id = v_user.id;
  end if;

  update public.invitations set status = 'ACCEPTED', accepted_by = v_user.id, accepted_at = now() where id = v_inv.id;
  perform app.audit('invitation.accepted', 'invitation', v_inv.id, v_org_id,
    format('%s accepted an invitation as %s', v_user.email, v_role), jsonb_build_object('role', v_role));
  perform app.notify(v_inv.invited_by, 'invitation.accepted', 'Invitation accepted',
    format('%s joined as %s.', coalesce(v_user.full_name, v_user.email), replace(initcap(replace(v_role, '_', ' ')), 'Qc', 'QC')), null);
  return jsonb_build_object('purpose', v_inv.purpose, 'organization_id', v_org_id, 'role', v_role);
end;
$$;

-- =============================================================================
-- Agency decisions and status (Super Admin)
-- =============================================================================
create or replace function public.decide_agency(p_org uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_owner uuid;
  v_owner_email text;
begin
  perform app.require_permission('agency.decide');
  select * into v_org from public.organizations where id = p_org and type = 'AGENCY' for update;
  if not found then perform app.fail('CG404', 'Agency not found.'); end if;
  if v_org.status <> 'PENDING_VERIFICATION' then perform app.fail('CG409', 'This agency is not waiting for a decision.'); end if;
  select m.user_id, u.email into v_owner, v_owner_email from public.organization_memberships m
    join public.users u on u.id = m.user_id
    where m.organization_id = p_org and m.role = 'AGENCY_OWNER' and m.status <> 'REMOVED';

  if p_decision = 'APPROVE' then
    update public.organizations set status = 'ACTIVE', approved_at = now(), approved_by = app.current_user_id(),
      status_reason = null, status_changed_at = now() where id = p_org;
    perform app.transition('organization', p_org, p_org, v_owner, 'PENDING_VERIFICATION', 'ACTIVE', p_reason);
    perform app.audit('agency.approved', 'organization', p_org, p_org, format('%s was approved', v_org.name));
    perform app.notify(v_owner, 'agency.approved', 'Your agency is approved', 'You can now apply to projects and invite your team.', '/agency');
    perform app.queue_email(v_owner_email, 'agency_approved', jsonb_build_object('agency_name', v_org.name));
  elsif p_decision = 'REJECT' then
    if nullif(trim(p_reason), '') is null then perform app.fail('CG422', 'Give a reason for the rejection.'); end if;
    -- Confirmed #13: can apply again after 3 days.
    update public.organizations set status = 'REJECTED', rejected_at = now(), reapply_after = now() + interval '3 days',
      status_reason = trim(p_reason), status_changed_at = now() where id = p_org;
    perform app.transition('organization', p_org, p_org, v_owner, 'PENDING_VERIFICATION', 'REJECTED', p_reason);
    perform app.audit('agency.rejected', 'organization', p_org, p_org, format('%s was rejected', v_org.name), jsonb_build_object('reason', p_reason));
    perform app.notify(v_owner, 'agency.rejected', 'Your agency application was not approved', trim(p_reason), '/onboarding/agency');
    perform app.queue_email(v_owner_email, 'agency_rejected', jsonb_build_object('agency_name', v_org.name, 'reason', trim(p_reason)));
  else
    perform app.fail('CG422', 'Decision must be APPROVE or REJECT.');
  end if;
end;
$$;

create or replace function public.set_agency_status(p_org uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  perform app.require_permission('agency.manage');
  select * into v_org from public.organizations where id = p_org and type = 'AGENCY' for update;
  if not found then perform app.fail('CG404', 'Agency not found.'); end if;
  if not (
    (v_org.status = 'ACTIVE' and p_status in ('SUSPENDED', 'DEACTIVATED'))
    or (v_org.status = 'SUSPENDED' and p_status in ('ACTIVE', 'DEACTIVATED'))
    or (v_org.status = 'DEACTIVATED' and p_status = 'ACTIVE')
  ) then
    perform app.fail('CG409', format('An agency cannot move from %s to %s.', v_org.status, p_status));
  end if;
  if p_status in ('SUSPENDED', 'DEACTIVATED') and nullif(trim(p_reason), '') is null then
    perform app.fail('CG422', 'Give a reason.');
  end if;
  update public.organizations set status = p_status, status_reason = nullif(trim(p_reason), ''), status_changed_at = now() where id = p_org;
  perform app.transition('organization', p_org, p_org, null, v_org.status, p_status, p_reason);
  perform app.audit('agency.status_changed', 'organization', p_org, p_org,
    format('%s moved from %s to %s', v_org.name, v_org.status, p_status), jsonb_build_object('reason', p_reason));
  perform app.notify_org_admins(p_org, 'agency.status', 'Agency status changed',
    format('Your agency is now %s.', lower(p_status)), '/agency');
end;
$$;

-- Super Admin edits an agency profile directly (#6).
create or replace function public.admin_update_agency(p_org uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform app.require_permission('agency.manage');
  if not exists (select 1 from public.organizations where id = p_org and type = 'AGENCY') then
    perform app.fail('CG404', 'Agency not found.');
  end if;
  perform app.validate_agency_profile(p, false);
  select to_jsonb(ap) into v_before from public.agency_profiles ap where ap.organization_id = p_org;
  perform app.apply_agency_profile(p_org, p);
  perform app.audit('agency.edited_by_admin', 'organization', p_org, p_org, 'Agency profile edited by the Super Admin',
    jsonb_build_object('changes', p, 'before', v_before));
end;
$$;

-- =============================================================================
-- Agency requests: profile change, deactivation, ownership transfer
-- =============================================================================
create or replace function public.request_agency_change(p_type text, p_payload jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_org public.organizations;
  v_id uuid;
  v_target public.organization_memberships;
begin
  select o.* into v_org from public.organizations o where o.id = app.current_org_id() and o.type = 'AGENCY';
  if not found then perform app.fail('CG403', 'You are not part of an agency.'); end if;
  if v_org.status not in ('ACTIVE', 'SUSPENDED') then
    perform app.fail('CG409', 'Requests are for approved agencies. While applying, edit the application directly.');
  end if;

  if p_type = 'PROFILE_CHANGE' then
    if not app.has_org_permission(v_org.id, 'org.profile.request_change') then perform app.fail('CG403', 'Your role does not allow this action.'); end if;
    perform app.validate_agency_profile(coalesce(p_payload -> 'changes', '{}'::jsonb), false);
  elsif p_type = 'DEACTIVATION' then
    if not app.has_org_permission(v_org.id, 'org.deactivation.request') then perform app.fail('CG403', 'Only the Agency Owner can request deactivation.'); end if;
  elsif p_type = 'OWNERSHIP_TRANSFER' then
    if not app.has_org_permission(v_org.id, 'org.ownership.request') then perform app.fail('CG403', 'Only the Agency Owner can request a transfer.'); end if;
    select * into v_target from public.organization_memberships
    where organization_id = v_org.id and role = 'AGENCY_MANAGER' and status = 'ACTIVE';
    if not found then perform app.fail('CG409', 'Ownership can be transferred only to the agency''s active Manager.'); end if;
    p_payload := jsonb_build_object('to_membership_id', v_target.id, 'to_user_id', v_target.user_id);
  else
    perform app.fail('CG422', 'Unknown request type.');
  end if;

  if exists (select 1 from public.agency_requests where organization_id = v_org.id and type = p_type and status = 'PENDING') then
    perform app.fail('CG409', 'A request of this type is already waiting for a decision.');
  end if;

  insert into public.agency_requests (organization_id, type, payload, note, requested_by)
  values (v_org.id, p_type, coalesce(p_payload, '{}'::jsonb), nullif(trim(p_note), ''), v_user)
  returning id into v_id;
  perform app.audit('agency.request_created', 'agency_request', v_id, v_org.id, format('%s requested %s', v_org.name, lower(replace(p_type, '_', ' '))));
  perform app.notify_permission_holders('agency_request.decide', 'agency.request', 'Agency request waiting',
    format('%s requested %s.', v_org.name, lower(replace(p_type, '_', ' '))), '/admin/requests');
  return v_id;
end;
$$;

create or replace function public.cancel_agency_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.agency_requests;
begin
  perform app.require_user();
  select * into v_req from public.agency_requests where id = p_request for update;
  if not found then perform app.fail('CG404', 'Request not found.'); end if;
  if not app.has_org_permission(v_req.organization_id, 'org.profile.request_change') then
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;
  if v_req.status <> 'PENDING' then perform app.fail('CG409', 'Only pending requests can be cancelled.'); end if;
  update public.agency_requests set status = 'CANCELLED', decided_at = now() where id = p_request;
  update public.agency_documents set status = 'REJECTED' where request_id = p_request and status = 'PENDING';
  perform app.audit('agency.request_cancelled', 'agency_request', p_request, v_req.organization_id, 'Request cancelled');
end;
$$;

create or replace function app.swap_owner(p_org uuid, p_new_owner_membership uuid, p_old_owner_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.organization_memberships;
begin
  select * into v_old from public.organization_memberships
  where organization_id = p_org and role = 'AGENCY_OWNER' and status <> 'REMOVED' for update;

  if v_old.id is not null then
    -- Temporarily park the old owner so the one-owner/one-manager rules hold at every step.
    update public.organization_memberships set role = 'AGENCY_MEMBER' where id = v_old.id;
  end if;
  update public.organization_memberships set role = 'AGENCY_OWNER', status = 'ACTIVE' where id = p_new_owner_membership;
  if v_old.id is not null then
    if p_old_owner_action = 'MAKE_MANAGER' then
      update public.organization_memberships set role = 'AGENCY_MANAGER' where id = v_old.id;
    elsif p_old_owner_action = 'REMOVE' then
      update public.organization_memberships set status = 'REMOVED', removed_at = now(), removed_by = app.current_user_id(),
        status_reason = 'Ownership transferred' where id = v_old.id;
    end if;
    -- 'MAKE_MEMBER' leaves the old owner as a member.
  end if;
end;
$$;

create or replace function public.decide_agency_request(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.agency_requests;
  v_org public.organizations;
begin
  perform app.require_permission('agency_request.decide');
  select * into v_req from public.agency_requests where id = p_request for update;
  if not found then perform app.fail('CG404', 'Request not found.'); end if;
  if v_req.status <> 'PENDING' then perform app.fail('CG409', 'This request has already been decided.'); end if;
  select * into v_org from public.organizations where id = v_req.organization_id for update;

  if not p_approve then
    if nullif(trim(p_note), '') is null then perform app.fail('CG422', 'Give a reason for the rejection.'); end if;
    update public.agency_requests set status = 'REJECTED', decided_by = app.current_user_id(), decided_at = now(),
      decision_note = trim(p_note) where id = p_request;
    update public.agency_documents set status = 'REJECTED' where request_id = p_request and status = 'PENDING';
    perform app.audit('agency.request_rejected', 'agency_request', p_request, v_req.organization_id,
      format('%s request rejected', lower(replace(v_req.type, '_', ' '))), jsonb_build_object('note', p_note));
    perform app.notify_org_admins(v_req.organization_id, 'agency.request', 'Request not approved', trim(p_note), '/agency/profile');
    return;
  end if;

  if v_req.type = 'PROFILE_CHANGE' then
    perform app.validate_agency_profile(coalesce(v_req.payload -> 'changes', '{}'::jsonb), false);
    perform app.apply_agency_profile(v_req.organization_id, coalesce(v_req.payload -> 'changes', '{}'::jsonb));
    update public.agency_documents set status = 'ACTIVE' where request_id = p_request and status = 'PENDING';
    if v_req.payload ? 'remove_document_ids' then
      update public.agency_documents set status = 'REMOVED'
      where organization_id = v_req.organization_id
        and id in (select (x)::uuid from jsonb_array_elements_text(v_req.payload -> 'remove_document_ids') x);
    end if;
  elsif v_req.type = 'DEACTIVATION' then
    update public.organizations set status = 'DEACTIVATED', status_reason = coalesce(v_req.note, 'Deactivated at the agency''s request'),
      status_changed_at = now() where id = v_req.organization_id;
    perform app.transition('organization', v_org.id, v_org.id, null, v_org.status, 'DEACTIVATED', 'Agency requested deactivation');
  elsif v_req.type = 'OWNERSHIP_TRANSFER' then
    if not exists (select 1 from public.organization_memberships
                   where id = (v_req.payload ->> 'to_membership_id')::uuid and organization_id = v_req.organization_id
                     and role = 'AGENCY_MANAGER' and status = 'ACTIVE') then
      perform app.fail('CG409', 'The Manager named in this request is no longer active.');
    end if;
    perform app.swap_owner(v_req.organization_id, (v_req.payload ->> 'to_membership_id')::uuid, 'MAKE_MANAGER');
  end if;

  update public.agency_requests set status = 'APPROVED', decided_by = app.current_user_id(), decided_at = now(),
    decision_note = nullif(trim(p_note), '') where id = p_request;
  perform app.audit('agency.request_approved', 'agency_request', p_request, v_req.organization_id,
    format('%s request approved', lower(replace(v_req.type, '_', ' '))), v_req.payload);
  perform app.notify_org_admins(v_req.organization_id, 'agency.request', 'Request approved',
    format('Your %s request was approved.', lower(replace(v_req.type, '_', ' '))), '/agency/profile');
end;
$$;

-- Super Admin reassigns ownership directly, e.g. when the Owner is gone (#9).
create or replace function public.admin_transfer_ownership(p_org uuid, p_new_owner_membership uuid, p_old_owner_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.organization_memberships;
begin
  perform app.require_permission('agency.manage');
  if nullif(trim(p_reason), '') is null then perform app.fail('CG422', 'Give a reason.'); end if;
  if p_old_owner_action not in ('MAKE_MANAGER', 'MAKE_MEMBER', 'REMOVE') then
    perform app.fail('CG422', 'Choose what happens to the current Owner.');
  end if;
  select * into v_target from public.organization_memberships
  where id = p_new_owner_membership and organization_id = p_org and status <> 'REMOVED' for update;
  if not found then perform app.fail('CG404', 'The new Owner must be a current member of this agency.'); end if;
  if v_target.role = 'AGENCY_OWNER' then perform app.fail('CG409', 'This person is already the Owner.'); end if;
  if p_old_owner_action = 'MAKE_MANAGER' and v_target.role <> 'AGENCY_MANAGER' and exists (
      select 1 from public.organization_memberships where organization_id = p_org and role = 'AGENCY_MANAGER' and status <> 'REMOVED') then
    perform app.fail('CG409', 'The agency already has a Manager. Choose another option for the current Owner.');
  end if;
  perform app.swap_owner(p_org, p_new_owner_membership, p_old_owner_action);
  perform app.audit('agency.ownership_reassigned', 'organization', p_org, p_org, 'Ownership reassigned by the Super Admin',
    jsonb_build_object('new_owner_membership', p_new_owner_membership, 'old_owner_action', p_old_owner_action, 'reason', p_reason));
  perform app.notify(v_target.user_id, 'agency.ownership', 'You are now the Agency Owner', p_reason, '/agency');
end;
$$;

-- =============================================================================
-- Members: remove, suspend, reactivate
-- =============================================================================
create or replace function app.require_member_admin(p_target public.organization_memberships)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_target.role = 'AGENCY_OWNER' then
    perform app.fail('CG403', 'The Owner cannot be removed or suspended. Transfer ownership first.');
  end if;
  if p_target.user_id = app.current_user_id() then
    perform app.fail('CG422', 'You cannot do this to your own membership.');
  end if;
  if p_target.role = 'AGENCY_MANAGER' then
    perform app.require_org_or_platform(p_target.organization_id, 'org.manager.manage', 'agency.manage');
  elsif p_target.role = 'AGENCY_MEMBER' then
    perform app.require_org_or_platform(p_target.organization_id, 'org.members.manage', 'agency.manage');
  else
    perform app.fail('CG403', 'This membership cannot be changed here.');
  end if;
end;
$$;

create or replace function public.remove_member(p_membership uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.organization_memberships;
begin
  perform app.require_user();
  select * into v_target from public.organization_memberships where id = p_membership for update;
  if not found or v_target.status = 'REMOVED' then perform app.fail('CG404', 'Member not found.'); end if;
  perform app.require_member_admin(v_target);
  update public.organization_memberships set status = 'REMOVED', removed_at = now(), removed_by = app.current_user_id(),
    status_reason = nullif(trim(p_reason), '') where id = p_membership;
  update public.member_assignments set status = 'UNASSIGNED', unassigned_at = now(), unassigned_by = app.current_user_id()
    where membership_id = p_membership and status = 'ASSIGNED';
  perform app.audit('member.removed', 'membership', p_membership, v_target.organization_id,
    format('%s removed (%s)', (select email from public.users where id = v_target.user_id), v_target.role), jsonb_build_object('reason', p_reason));
  perform app.notify(v_target.user_id, 'member.removed', 'You were removed from the agency', coalesce(p_reason, ''), null);
end;
$$;

create or replace function public.set_member_status(p_membership uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.organization_memberships;
begin
  perform app.require_user();
  if p_status not in ('ACTIVE', 'SUSPENDED') then perform app.fail('CG422', 'Status must be ACTIVE or SUSPENDED.'); end if;
  select * into v_target from public.organization_memberships where id = p_membership for update;
  if not found or v_target.status = 'REMOVED' then perform app.fail('CG404', 'Member not found.'); end if;
  perform app.require_member_admin(v_target);
  if v_target.status = p_status then return; end if;
  update public.organization_memberships set status = p_status, status_reason = nullif(trim(p_reason), '') where id = p_membership;
  perform app.audit('member.status_changed', 'membership', p_membership, v_target.organization_id,
    format('%s is now %s', (select email from public.users where id = v_target.user_id), lower(p_status)), jsonb_build_object('reason', p_reason));
end;
$$;

-- =============================================================================
-- Staff management (Super Admin)
-- =============================================================================
create or replace function public.revoke_staff_access(p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  perform app.require_permission('staff.manage');
  if p_user = app.current_user_id() then perform app.fail('CG422', 'You cannot remove your own access.'); end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role_code = 'SUPER_ADMIN' and revoked_at is null) then
    perform app.fail('CG403', 'The Super Admin cannot be removed.');
  end if;
  update public.user_roles set revoked_at = now(), revoked_by = app.current_user_id()
    where user_id = p_user and role_scope = 'PLATFORM' and revoked_at is null;
  update public.organization_memberships m set status = 'REMOVED', removed_at = now(), removed_by = app.current_user_id(),
    status_reason = nullif(trim(p_reason), '')
    from public.organizations o
    where m.organization_id = o.id and o.type = 'PLATFORM' and m.user_id = p_user and m.status <> 'REMOVED';
  select email into v_email from public.users where id = p_user;
  perform app.audit('staff.access_revoked', 'user', p_user, null, format('Staff access removed for %s', v_email), jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.set_staff_role(p_user uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('staff.manage');
  if p_role_code not in ('PROJECT_MANAGER', 'QC_LEAD', 'QC_REVIEWER') then
    perform app.fail('CG422', 'Choose Project Manager, QC Lead or QC Reviewer.');
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

-- =============================================================================
-- Notifications
-- =============================================================================
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set read_at = now()
  where user_id = app.require_user() and read_at is null and (p_ids is null or id = any(p_ids));
end;
$$;
