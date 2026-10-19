-- =============================================================================
-- Agency review: "Ask for changes" (ID-42)
--
-- A middle path between approving and rejecting. The Super Admin sends the
-- agency a message and can mark documents that must be replaced. The agency
-- fixes its details or documents and sends the application back straight away
-- (no 3-day wait). It then returns to the review queue.
--
--   PENDING_VERIFICATION --request_agency_changes--> CHANGES_REQUESTED
--   CHANGES_REQUESTED    --submit_agency_application--> PENDING_VERIFICATION
--   CHANGES_REQUESTED    --decide_agency--> ACTIVE | REJECTED  (admin may still decide)
--
-- Documents marked for replacement get status REJECTED. The agency must upload
-- a new document of the same type before it can send the application back;
-- on resubmission the replaced documents are set to REMOVED.
-- =============================================================================

alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('PENDING_VERIFICATION', 'CHANGES_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DEACTIVATED'));

-- Plain-language name of a document type, for messages.
create or replace function app.document_type_label(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'REGISTRATION_CERTIFICATE' then 'Registration certificate'
    when 'TAX_CERTIFICATE' then 'Tax certificate'
    when 'OWNER_ID' then 'Owner ID'
    when 'BANK_LETTER' then 'Bank letter'
    else 'Other document'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Super Admin asks the agency for changes
-- -----------------------------------------------------------------------------
create or replace function public.request_agency_changes(p_org uuid, p_message text, p_documents uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_owner uuid;
  v_owner_email text;
  v_message text := nullif(trim(p_message), '');
  v_flagged int := 0;
  v_labels text;
begin
  perform app.require_permission('agency.decide');
  if v_message is null or length(v_message) < 3 then
    perform app.fail('CG422', 'Tell the agency what to change.');
  end if;
  if length(v_message) > 2000 then
    perform app.fail('CG422', 'Keep the message under 2,000 characters.');
  end if;
  select * into v_org from public.organizations where id = p_org and type = 'AGENCY' for update;
  if not found then perform app.fail('CG404', 'Agency not found.'); end if;
  if v_org.status <> 'PENDING_VERIFICATION' then
    perform app.fail('CG409', 'You can ask for changes only while the agency is waiting for a decision.');
  end if;

  if coalesce(array_length(p_documents, 1), 0) > 0 then
    if exists (select 1 from unnest(p_documents) d(id)
               where not exists (select 1 from public.agency_documents a
                                 where a.id = d.id and a.organization_id = p_org and a.status = 'ACTIVE')) then
      perform app.fail('CG422', 'One of the selected documents does not belong to this agency.');
    end if;
    update public.agency_documents set status = 'REJECTED'
      where organization_id = p_org and id = any (p_documents) and status = 'ACTIVE';
    get diagnostics v_flagged = row_count;
    select string_agg(distinct app.document_type_label(document_type), ', ') into v_labels
      from public.agency_documents where id = any (p_documents);
  end if;

  update public.organizations set status = 'CHANGES_REQUESTED', status_reason = v_message, status_changed_at = now()
    where id = p_org;

  select m.user_id, u.email into v_owner, v_owner_email from public.organization_memberships m
    join public.users u on u.id = m.user_id
    where m.organization_id = p_org and m.role = 'AGENCY_OWNER' and m.status <> 'REMOVED';

  perform app.transition('organization', p_org, p_org, v_owner, 'PENDING_VERIFICATION', 'CHANGES_REQUESTED', v_message);
  perform app.audit('agency.changes_requested', 'organization', p_org, p_org,
    format('Changes requested from %s', v_org.name),
    jsonb_build_object('message', v_message, 'documents', to_jsonb(coalesce(p_documents, '{}'::uuid[])), 'documents_flagged', v_flagged));
  perform app.notify(v_owner, 'agency.changes_requested', 'CohortData asked for changes', v_message, '/onboarding/agency');
  perform app.queue_email(v_owner_email, 'agency_changes_requested',
    jsonb_build_object('agency_name', v_org.name, 'message', v_message, 'documents', coalesce(v_labels, '')));
end;
$$;

-- -----------------------------------------------------------------------------
-- Decide: also allowed while the agency is fixing things
-- -----------------------------------------------------------------------------
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
  if v_org.status not in ('PENDING_VERIFICATION', 'CHANGES_REQUESTED') then
    perform app.fail('CG409', 'This agency is not waiting for a decision.');
  end if;
  select m.user_id, u.email into v_owner, v_owner_email from public.organization_memberships m
    join public.users u on u.id = m.user_id
    where m.organization_id = p_org and m.role = 'AGENCY_OWNER' and m.status <> 'REMOVED';

  if p_decision = 'APPROVE' then
    update public.organizations set status = 'ACTIVE', approved_at = now(), approved_by = app.current_user_id(),
      status_reason = null, status_changed_at = now() where id = p_org;
    -- Documents that were marked for replacement are not part of the approved profile.
    update public.agency_documents set status = 'REMOVED' where organization_id = p_org and status = 'REJECTED';
    perform app.transition('organization', p_org, p_org, v_owner, v_org.status, 'ACTIVE', p_reason);
    perform app.audit('agency.approved', 'organization', p_org, p_org, format('%s was approved', v_org.name));
    perform app.notify(v_owner, 'agency.approved', 'Your agency is approved', 'You can now apply to projects and invite your team.', '/agency');
    perform app.queue_email(v_owner_email, 'agency_approved', jsonb_build_object('agency_name', v_org.name));
  elsif p_decision = 'REJECT' then
    if nullif(trim(p_reason), '') is null then perform app.fail('CG422', 'Give a reason for the rejection.'); end if;
    -- Confirmed #13: can apply again after 3 days.
    update public.organizations set status = 'REJECTED', rejected_at = now(), reapply_after = now() + interval '3 days',
      status_reason = trim(p_reason), status_changed_at = now() where id = p_org;
    perform app.transition('organization', p_org, p_org, v_owner, v_org.status, 'REJECTED', p_reason);
    perform app.audit('agency.rejected', 'organization', p_org, p_org, format('%s was rejected', v_org.name), jsonb_build_object('reason', p_reason));
    perform app.notify(v_owner, 'agency.rejected', 'Your agency application was not approved', trim(p_reason), '/onboarding/agency');
    perform app.queue_email(v_owner_email, 'agency_rejected', jsonb_build_object('agency_name', v_org.name, 'reason', trim(p_reason)));
  else
    perform app.fail('CG422', 'Decision must be APPROVE or REJECT.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Agency application: CHANGES_REQUESTED -> back to review
-- -----------------------------------------------------------------------------
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
  v_missing text;
  v_event text := 'submitted an agency application.';
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
      v_event := 'applied again.';
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
      update public.organizations set status = 'PENDING_VERIFICATION', status_reason = null, status_changed_at = now()
        where id = v_org_id;
      perform app.transition('organization', v_org_id, v_org_id, v_user.id, 'CHANGES_REQUESTED', 'PENDING_VERIFICATION', 'Agency sent changes');
      perform app.audit('agency.resubmitted', 'organization', v_org_id, v_org_id, format('%s sent the requested changes', app.jtext(p, 'name')));
      v_event := 'sent the changes you asked for.';
    elsif v_org.status = 'PENDING_VERIFICATION' then
      perform app.audit('agency.application_updated', 'organization', v_org_id, v_org_id, 'Application details updated while pending');
      v_event := 'updated its application.';
    else
      perform app.fail('CG409', 'Your agency is already reviewed. Use a change request to update the profile.');
    end if;
    perform app.apply_agency_profile(v_org_id, p);
    update public.agency_profiles set submitted_at = now() where organization_id = v_org_id;
  end if;

  perform app.notify_permission_holders('agency.decide', 'agency.pending', 'Agency waiting for approval',
    format('%s %s', app.jtext(p, 'name'), v_event), '/admin/agencies/' || v_org_id);
  return v_org_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Documents: the agency can add documents while fixing its application.
-- Documents marked for replacement stay until the application is sent back,
-- so the agency can't remove them (the reviewer needs to see what was replaced).
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
    if v_org.status in ('PENDING_VERIFICATION', 'CHANGES_REQUESTED', 'REJECTED') then
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
  if v_doc.status = 'REMOVED' then perform app.fail('CG409', 'This document is already removed.'); end if;
  if not app.has_permission('agency.manage') then
    if not app.has_org_permission(v_doc.organization_id, 'org.profile.request_change') then
      perform app.fail('CG403', 'Your role does not allow this action.');
    end if;
    if v_doc.status = 'REJECTED' then
      perform app.fail('CG409', 'Upload a replacement instead. CohortData removes the old file when you send your application back.');
    end if;
    if not (v_org.status in ('PENDING_VERIFICATION', 'CHANGES_REQUESTED', 'REJECTED') or v_doc.status = 'PENDING') then
      perform app.fail('CG403', 'Approved documents can only be removed through a change request.');
    end if;
  end if;
  update public.agency_documents set status = 'REMOVED' where id = p_document;
  perform app.audit('agency.document_removed', 'agency_document', p_document, v_doc.organization_id, format('Document %s removed', v_doc.file_name));
end;
$$;

-- Default privileges are closed (ID-38), so every callable function is granted explicitly.
revoke execute on function app.document_type_label(text) from public;
revoke execute on function public.request_agency_changes(uuid, text, uuid[]) from public, anon;
grant execute on function public.request_agency_changes(uuid, text, uuid[]) to authenticated;
