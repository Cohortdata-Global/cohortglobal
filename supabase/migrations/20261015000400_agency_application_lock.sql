-- =============================================================================
-- Agency application is locked while CohortData reviews it (ID-44)
--
-- An agency can change its application details and documents only while the
-- application is open:
--   DRAFT              started, not sent yet (new)
--   CHANGES_REQUESTED  CohortData asked for changes (ID-42)
--   REJECTED           only after the 3-day wait (#13)
-- While PENDING_VERIFICATION (or REJECTED within the wait) nothing can change.
--
-- Sign-up is now two steps:
--   save_agency_application   details; creates the agency as DRAFT
--   submit_agency_application details + send for review; needs >= 1 document
-- =============================================================================

alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('DRAFT', 'PENDING_VERIFICATION', 'CHANGES_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DEACTIVATED'));

-- True when the agency itself may change its application.
create or replace function app.agency_application_open(p_org public.organizations)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_org.status in ('DRAFT', 'CHANGES_REQUESTED')
      or (p_org.status = 'REJECTED' and (p_org.reapply_after is null or now() >= p_org.reapply_after));
$$;

-- The message an agency sees when its application is locked.
create or replace function app.fail_application_locked(p_org public.organizations)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_org.status = 'PENDING_VERIFICATION' then
    perform app.fail('CG409', 'Your application is being reviewed. You can change it only if CohortData asks for changes.');
  elsif p_org.status = 'REJECTED' then
    perform app.fail('CG409', format('You can apply again after %s.', to_char(p_org.reapply_after at time zone 'UTC', 'DD Mon YYYY HH24:MI "UTC"')));
  else
    perform app.fail('CG409', 'Your agency is already reviewed. Use a change request to update the profile.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Step 1: save details (creates the agency as DRAFT)
-- -----------------------------------------------------------------------------
create or replace function public.save_agency_application(p jsonb)
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
    values ('AGENCY', app.jtext(p, 'name'), 'DRAFT', 'SELF_SIGNUP', v_user.id)
    returning id into v_org_id;
    insert into public.organization_memberships (organization_id, user_id, role) values (v_org_id, v_user.id, 'AGENCY_OWNER');
    update public.users set registration_path = 'AGENCY' where id = v_user.id;
    perform app.apply_agency_profile(v_org_id, p);
    perform app.transition('organization', v_org_id, v_org_id, v_user.id, null, 'DRAFT', 'Agency started an application');
    perform app.audit('agency.application_started', 'organization', v_org_id, v_org_id, format('%s started an agency application', app.jtext(p, 'name')));
    return v_org_id;
  end if;

  if v_membership.role <> 'AGENCY_OWNER' then
    perform app.fail('CG403', 'Only the Agency Owner can change the agency application.');
  end if;
  select * into v_org from public.organizations where id = v_membership.organization_id for update;
  if not app.agency_application_open(v_org) then perform app.fail_application_locked(v_org); end if;
  perform app.apply_agency_profile(v_org.id, p);
  perform app.audit('agency.application_updated', 'organization', v_org.id, v_org.id, 'Application details updated');
  return v_org.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Step 2: save details and send for review
-- -----------------------------------------------------------------------------
create or replace function public.submit_agency_application(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_org_id uuid;
  v_org public.organizations;
  v_missing text;
  v_event text;
begin
  v_org_id := public.save_agency_application(p);   -- checks owner and that the application is open
  v_user := app.current_user_id();
  select * into v_org from public.organizations where id = v_org_id for update;

  if not exists (select 1 from public.agency_documents where organization_id = v_org_id and status = 'ACTIVE') then
    perform app.fail('CG422', 'Upload at least one company document before sending your application.');
  end if;

  if v_org.status = 'DRAFT' then
    perform app.transition('organization', v_org_id, v_org_id, v_user, 'DRAFT', 'PENDING_VERIFICATION', 'Agency applied');
    perform app.audit('agency.applied', 'organization', v_org_id, v_org_id, format('%s applied to become an agency', app.jtext(p, 'name')));
    v_event := 'submitted an agency application.';
  elsif v_org.status = 'CHANGES_REQUESTED' then
    -- Every document marked for replacement needs a newer document of the same type.
    select string_agg(distinct app.document_type_label(r.document_type), ', ') into v_missing
      from public.agency_documents r
      where r.organization_id = v_org_id and r.status = 'REJECTED'
        and not exists (select 1 from public.agency_documents n
                        where n.organization_id = v_org_id and n.status = 'ACTIVE'
                          and n.document_type = r.document_type and n.created_at >= v_org.status_changed_at);
    if v_missing is not null then
      perform app.fail('CG409', format('Upload a new %s before sending your application back.', v_missing));
    end if;
    update public.agency_documents set status = 'REMOVED' where organization_id = v_org_id and status = 'REJECTED';
    perform app.transition('organization', v_org_id, v_org_id, v_user, 'CHANGES_REQUESTED', 'PENDING_VERIFICATION', 'Agency sent changes');
    perform app.audit('agency.resubmitted', 'organization', v_org_id, v_org_id, format('%s sent the requested changes', app.jtext(p, 'name')));
    v_event := 'sent the changes you asked for.';
  else -- REJECTED, wait is over (save_agency_application checked it)
    update public.agency_documents set status = 'REMOVED' where organization_id = v_org_id and status = 'REJECTED';
    perform app.transition('organization', v_org_id, v_org_id, v_user, 'REJECTED', 'PENDING_VERIFICATION', 'Agency re-applied');
    perform app.audit('agency.reapplied', 'organization', v_org_id, v_org_id, format('%s applied again', app.jtext(p, 'name')));
    v_event := 'applied again.';
  end if;

  update public.organizations set status = 'PENDING_VERIFICATION', status_reason = null, rejected_at = null,
    reapply_after = null, status_changed_at = now() where id = v_org_id;
  update public.agency_profiles set submitted_at = now() where organization_id = v_org_id;
  perform app.notify_permission_holders('agency.decide', 'agency.pending', 'Agency waiting for approval',
    format('%s %s', app.jtext(p, 'name'), v_event), '/admin/agencies/' || v_org_id);
  return v_org_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Documents follow the same rule
-- -----------------------------------------------------------------------------
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
    if app.agency_application_open(v_org) then
      v_status := 'ACTIVE';          -- still applying: documents are part of the application
    elsif v_org.status in ('PENDING_VERIFICATION', 'REJECTED') then
      perform app.fail_application_locked(v_org);
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
  if v_doc.status = 'REMOVED' then perform app.fail('CG409', 'This document is already removed.'); end if;
  if not app.has_permission('agency.manage') then
    if not app.has_org_permission(v_doc.organization_id, 'org.profile.request_change') then
      perform app.fail('CG403', 'Your role does not allow this action.');
    end if;
    if v_doc.status = 'REJECTED' then
      perform app.fail('CG409', 'Upload a replacement instead. CohortData removes the old file when you send your application back.');
    end if;
    if v_doc.status <> 'PENDING' and not app.agency_application_open(v_org) then
      if v_org.status in ('PENDING_VERIFICATION', 'REJECTED') then perform app.fail_application_locked(v_org); end if;
      perform app.fail('CG403', 'Approved documents can only be removed through a change request.');
    end if;
  end if;
  update public.agency_documents set status = 'REMOVED' where id = p_document;
  perform app.audit('agency.document_removed', 'agency_document', p_document, v_doc.organization_id, format('Document %s removed', v_doc.file_name));
end;
$$;

-- Default privileges are closed (ID-38), so every callable function is granted explicitly.
revoke execute on function app.agency_application_open(public.organizations) from public;
revoke execute on function app.fail_application_locked(public.organizations) from public;
revoke execute on function public.save_agency_application(jsonb) from public, anon;
grant execute on function public.save_agency_application(jsonb) to authenticated;
