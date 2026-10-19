-- "Ask for changes" on an agency application (ID-42).
begin;
\ir fixture.psql
select plan(17);

select tests.as_service();
select sync_clerk_user('new3', 'founder@delta.ai', 'Dev Founder', null);
select tests.login('new3');
select save_agency_application('{"name":"Delta Data","legal_name":"Delta Data Pvt Ltd","country_code":"IN","registration_number":"U72900",
  "contact_name":"Dev","contact_email":"founder@delta.ai","contact_phone_e164":"+919876500000","website_url":"https://delta.ai"}'::jsonb) as org4 \gset
select register_agency_document(:'org4', 'OWNER_ID', 'id-blurry.jpg', 'agency-documents', 'x/id-blurry.jpg', 'image/jpeg', 1000) as doc_id \gset
select register_agency_document(:'org4', 'TAX_CERTIFICATE', 'tax.pdf', 'agency-documents', 'x/tax.pdf', 'application/pdf', 2000) as doc_tax \gset
select submit_agency_application('{"name":"Delta Data","legal_name":"Delta Data Pvt Ltd","country_code":"IN","registration_number":"U72900",
  "contact_name":"Dev","contact_email":"founder@delta.ai","contact_phone_e164":"+919876500000","website_url":"https://delta.ai"}'::jsonb);
-- Uploaded earlier than the review.
select tests.as_owner();
update agency_documents set created_at = now() - interval '1 hour' where organization_id = :'org4';

select tests.login('pm');
select is(tests.err(format('select request_agency_changes(%L, %L)', :'org4', 'Please fix')), 'CG403', 'only agency.decide holders can ask for changes');
select tests.login('new3');
select is(tests.err(format('select request_agency_changes(%L, %L)', :'org4', 'Please fix')), 'CG403', 'the agency cannot ask itself for changes');
select tests.login('sa');
select is(tests.err(format('select request_agency_changes(%L, %L)', :'org4', '  ')), 'CG422', 'a message is required');
select is(tests.err(format('select request_agency_changes(%L, %L, array[%L]::uuid[])', :'org4', 'Fix', tests.id('org1'))), 'CG422', 'only this agency''s documents can be marked');
select is(tests.err(format('select request_agency_changes(%L, %L, array[%L]::uuid[])', :'org4', 'The owner ID photo is blurry. Upload a clear scan.', :'doc_id')), 'OK', 'the Super Admin asks for changes');
select tests.as_owner();
select is((select status || '|' || status_reason from organizations where id = :'org4'), 'CHANGES_REQUESTED|The owner ID photo is blurry. Upload a clear scan.', 'the agency waits on changes with the message saved');
select is((select status from agency_documents where id = :'doc_id'), 'REJECTED', 'the marked document is flagged for replacement');
select is((select count(*)::int from email_outbox where template = 'agency_changes_requested' and to_email = 'founder@delta.ai'), 1, 'the owner is emailed');
select tests.login('sa');
select is(tests.err(format('select request_agency_changes(%L, %L)', :'org4', 'Again')), 'CG409', 'cannot ask twice while the agency is fixing');

select tests.login('new3');
select is(tests.err(format('select remove_agency_document(%L)', :'doc_id')), 'CG409', 'the flagged document cannot be removed before a replacement is uploaded');
select is(tests.err($$select submit_agency_application('{"name":"Delta Data","legal_name":"Delta Data Pvt Ltd","country_code":"IN","registration_number":"U72900","contact_name":"Dev","contact_email":"founder@delta.ai","contact_phone_e164":"+919876500000","website_url":"https://delta.ai"}')$$),
  'CG409', 'cannot send back without replacing the flagged document');
select register_agency_document(:'org4', 'OWNER_ID', 'id-clear.pdf', 'agency-documents', 'x/id-clear.pdf', 'application/pdf', 3000) as doc_new \gset
select is(tests.err(format('select remove_agency_document(%L)', :'doc_id')), 'OK', 'after the replacement is uploaded, the old document can be removed');
select is(tests.err($$select submit_agency_application('{"name":"Delta Data","legal_name":"Delta Data Pvt Ltd","country_code":"IN","registration_number":"U72900","contact_name":"Dev","contact_email":"founder@delta.ai","contact_phone_e164":"+919876500000","website_url":"https://delta.ai"}')$$),
  'OK', 'sends the application back straight away, no waiting period');
select tests.as_owner();
select is((select status || '|' || coalesce(status_reason, '-') from organizations where id = :'org4'), 'PENDING_VERIFICATION|-', 'the agency is back in the review queue');
select is((select string_agg(status, ',' order by file_name) from agency_documents where organization_id = :'org4'), 'REMOVED,ACTIVE,ACTIVE', 'the replaced document is removed, the others stay');

-- The Super Admin can still decide while the agency is fixing things.
select tests.login('sa');
select request_agency_changes(:'org4', 'Also add the bank letter.');
select is(tests.err(format('select decide_agency(%L, %L)', :'org4', 'APPROVE')), 'OK', 'approve works from changes requested');
select tests.as_owner();
select is((select count(*)::int from workflow_events where entity_id = :'org4' and to_status = 'CHANGES_REQUESTED'), 2, 'every request is in the status history');

select * from finish();
rollback;
