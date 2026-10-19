-- =============================================================================
-- A document CohortData marked "Replace this" (ID-42) can be removed by the
-- agency once a new document of the same type has been uploaded (ID-45).
-- Before that it stays, so the requirement can't be skipped by deleting it.
-- =============================================================================

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
      -- A document CohortData marked for replacement can go once its replacement is uploaded.
      if v_org.status <> 'CHANGES_REQUESTED' or not exists (
        select 1 from public.agency_documents n
        where n.organization_id = v_doc.organization_id and n.status = 'ACTIVE'
          and n.document_type = v_doc.document_type and n.created_at >= v_org.status_changed_at) then
        perform app.fail('CG409', format('Upload the new %s first, then remove the old one.', lower(app.document_type_label(v_doc.document_type))));
      end if;
    elsif v_doc.status <> 'PENDING' and not app.agency_application_open(v_org) then
      if v_org.status in ('PENDING_VERIFICATION', 'REJECTED') then perform app.fail_application_locked(v_org); end if;
      perform app.fail('CG403', 'Approved documents can only be removed through a change request.');
    end if;
  end if;
  update public.agency_documents set status = 'REMOVED' where id = p_document;
  perform app.audit('agency.document_removed', 'agency_document', p_document, v_doc.organization_id, format('Document %s removed', v_doc.file_name));
end;
$$;
