-- The agency application is locked while CohortData reviews it (ID-44).
begin;
\ir fixture.psql
select plan(12);

select tests.as_service();
select sync_clerk_user('new4', 'founder@echo.ai', 'Eko Founder', null);
select tests.login('new4');
select save_agency_application('{"name":"Echo Labs","legal_name":"Echo Labs LLP","country_code":"IN","registration_number":"AAB-1234",
  "contact_name":"Eko","contact_email":"founder@echo.ai","contact_phone_e164":"+919812300000","website_url":"https://echo.ai"}'::jsonb) as org5 \gset
select tests.as_owner();
select is((select status from organizations where id = :'org5'), 'DRAFT', 'saving details creates the agency as a draft');
select is((select count(*)::int from notifications where kind = 'agency.pending' and body like 'Echo Labs%'), 0, 'a draft does not reach the Super Admin');

select tests.login('new4');
select is(tests.err($$select submit_agency_application('{"name":"Echo Labs","legal_name":"Echo Labs LLP","country_code":"IN","registration_number":"AAB-1234","contact_name":"Eko","contact_email":"founder@echo.ai","contact_phone_e164":"+919812300000","website_url":"https://echo.ai"}')$$),
  'CG422', 'cannot send without a document');
select register_agency_document(:'org5', 'REGISTRATION_CERTIFICATE', 'reg.pdf', 'agency-documents', 'y/reg.pdf', 'application/pdf', 1000) as doc5 \gset
select is(tests.err(format('select remove_agency_document(%L)', :'doc5')), 'OK', 'a draft can remove its documents');
select register_agency_document(:'org5', 'REGISTRATION_CERTIFICATE', 'reg2.pdf', 'agency-documents', 'y/reg2.pdf', 'application/pdf', 1000) as doc5b \gset
select is(tests.err($$select submit_agency_application('{"name":"Echo Labs","legal_name":"Echo Labs LLP","country_code":"IN","registration_number":"AAB-1234","contact_name":"Eko","contact_email":"founder@echo.ai","contact_phone_e164":"+919812300000","website_url":"https://echo.ai"}')$$),
  'OK', 'sends with a document');
select tests.as_owner();
select is((select status from organizations where id = :'org5'), 'PENDING_VERIFICATION', 'the application is in review');
select is((select count(*)::int from notifications where kind = 'agency.pending' and body like 'Echo Labs%'), 1, 'the Super Admin is told once');

-- Locked while in review
select tests.login('new4');
select is(tests.err($$select save_agency_application('{"name":"Echo Labs 2","legal_name":"Echo Labs LLP","country_code":"IN","registration_number":"AAB-1234","contact_name":"Eko","contact_email":"founder@echo.ai","contact_phone_e164":"+919812300000","website_url":"https://echo.ai"}')$$),
  'CG409', 'details cannot change while in review');
select is(tests.err($$select submit_agency_application('{"name":"Echo Labs","legal_name":"Echo Labs LLP","country_code":"IN","registration_number":"AAB-1234","contact_name":"Eko","contact_email":"founder@echo.ai","contact_phone_e164":"+919812300000","website_url":"https://echo.ai"}')$$),
  'CG409', 'cannot send twice');
select is(tests.err(format('select register_agency_document(%L, %L, %L, %L, %L, %L, %L)', :'org5', 'OTHER', 'x.pdf', 'agency-documents', 'y/x.pdf', 'application/pdf', 100)),
  'CG409', 'documents cannot be added while in review');
select is(tests.err(format('select remove_agency_document(%L)', :'doc5b')), 'CG409', 'documents cannot be removed while in review');

-- Opens again when CohortData asks for changes
select tests.login('sa');
select request_agency_changes(:'org5', 'Add the tax certificate.');
select tests.login('new4');
select is(tests.err(format('select register_agency_document(%L, %L, %L, %L, %L, %L, %L)', :'org5', 'TAX_CERTIFICATE', 'tax.pdf', 'agency-documents', 'y/tax.pdf', 'application/pdf', 100)),
  'OK', 'documents can be added once changes are asked');

select * from finish();
rollback;
