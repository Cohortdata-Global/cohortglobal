-- =============================================================================
-- Phase 2B + 2C: collection sessions, submissions and public links (ID-55)
--
-- Who can collect:
--   Agency Member        logged in, assigned to the project by the agency (2B)
--   Direct Freelancer    logged in, own ACTIVE assignment (2B)
--   Agency Freelancer    no account, public link from the Owner/Manager (2C)
-- Every submission takes its agency and project from the assignment or the
-- link, never from the browser.
--
-- Flow: start session (profile answers, 5 hours; a link session ends at the
-- link's expiry if sooner) -> consent + signature -> files uploaded straight to
-- storage -> submit. The submission starts as PENDING ("awaiting checks"); the
-- automatic checks (2D) and QC (2E) move it on. Status history is written to
-- workflow_events (entity 'submission').
--
-- Public-link functions are called only by the server (service role) after it
-- has checked the link token; the anon role still has no access at all.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.submission_links (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  assignment_id     uuid not null references public.project_assignments(id) on delete cascade,
  token_hash        text not null unique,
  label             text not null default '' check (length(label) <= 120),
  -- One freelancer per link (#34): the first person to start a session owns it.
  contributor_email text,
  contributor_name  text,
  max_submissions   int not null default 1 check (max_submissions between 1 and 1000),
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_by        uuid references public.users(id),
  revoke_reason     text
);
create index submission_links_project_org_idx on public.submission_links (project_id, organization_id, created_at desc);

create table public.collection_sessions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  collection_version int not null,
  assignment_id      uuid not null references public.project_assignments(id),
  organization_id    uuid references public.organizations(id),
  user_id            uuid references public.users(id),
  link_id            uuid references public.submission_links(id),
  -- Link sessions are bound to the browser by a second secret kept in an httpOnly cookie.
  session_token_hash text unique,
  contributor_name   text not null,
  contributor_email  text not null,
  profile            jsonb not null check (jsonb_typeof(profile) = 'object'),
  status             text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUBMITTED', 'CANCELLED')),
  started_at         timestamptz not null default now(),
  ends_at            timestamptz not null,
  consent_text_sha256 text,
  consent_signature_kind text check (consent_signature_kind in ('draw', 'type', 'none')),
  consent_signature  text,
  consent_signed_at  timestamptz,
  consent_ip         text,
  consent_user_agent text,
  submitted_at       timestamptz,
  ended_at           timestamptz,
  constraint session_collector check ((user_id is null) <> (link_id is null))
);
create index collection_sessions_project_idx on public.collection_sessions (project_id, started_at desc);
create index collection_sessions_user_idx on public.collection_sessions (user_id, status) where user_id is not null;
create index collection_sessions_org_idx on public.collection_sessions (organization_id, started_at desc) where organization_id is not null;

create table public.submissions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  session_id         uuid not null unique references public.collection_sessions(id),
  collection_version int not null,
  assignment_id      uuid not null references public.project_assignments(id),
  organization_id    uuid references public.organizations(id),
  collector_user_id  uuid references public.users(id),
  link_id            uuid references public.submission_links(id),
  contributor_name   text not null,
  contributor_email  text not null,
  profile            jsonb not null,
  status             text not null default 'PENDING'
                     check (status in ('PENDING', 'READY_FOR_QC', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMIT_REQUESTED', 'DELIVERED', 'WITHDRAWN')),
  status_changed_at  timestamptz not null default now(),
  remark             text,
  main_file_name     text,
  duration_seconds   numeric(8,2),
  submitted_at       timestamptz not null default now()
);
create index submissions_project_idx on public.submissions (project_id, status, submitted_at desc);
create index submissions_org_idx on public.submissions (organization_id, submitted_at desc) where organization_id is not null;
create index submissions_collector_idx on public.submissions (collector_user_id, submitted_at desc) where collector_user_id is not null;
create index submissions_link_idx on public.submissions (link_id) where link_id is not null;
create index submissions_profile_idx on public.submissions using gin (profile jsonb_path_ops);
create index submissions_email_idx on public.submissions (project_id, contributor_email);

create table public.submission_files (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.collection_sessions(id) on delete cascade,
  submission_id   uuid references public.submissions(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  slot_key        text not null check (slot_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- FILE: a collected file; ID_FRONT / ID_BACK: eKYC; SIGNATURE: drawn consent signature.
  role            text not null check (role in ('FILE', 'ID_FRONT', 'ID_BACK', 'SIGNATURE')),
  storage_bucket  text not null,
  storage_path    text not null unique,
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0),
  duration_seconds numeric(8,2),
  created_at      timestamptz not null default now(),
  removed_at      timestamptz
);
create index submission_files_session_idx on public.submission_files (session_id) where removed_at is null;
create index submission_files_submission_idx on public.submission_files (submission_id) where removed_at is null;

alter table public.submission_links enable row level security;
alter table public.collection_sessions enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
revoke all on public.submission_links, public.collection_sessions, public.submissions, public.submission_files from anon, authenticated;
grant select on public.submissions, public.submission_files to authenticated;
-- Token and cookie hashes are never readable by signed-in users: grant every other column.
grant select (id, project_id, organization_id, assignment_id, label, contributor_email, contributor_name, max_submissions,
  created_by, created_at, expires_at, revoked_at, revoked_by, revoke_reason) on public.submission_links to authenticated;
grant select (id, project_id, collection_version, assignment_id, organization_id, user_id, link_id, contributor_name,
  contributor_email, profile, status, started_at, ends_at, consent_text_sha256, consent_signature_kind, consent_signature,
  consent_signed_at, consent_ip, consent_user_agent, submitted_at, ended_at) on public.collection_sessions to authenticated;

-- -----------------------------------------------------------------------------
-- Who sees what
-- -----------------------------------------------------------------------------
-- Staff of the project; the agency's Owner/Manager (Q40: their own agency only); the collector.
create policy submissions_read on public.submissions for select to authenticated
  using (
    app.is_project_staff(project_id)
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.submissions.view_all'))
    or collector_user_id = (select app.current_user_id())
  );

create policy sessions_read on public.collection_sessions for select to authenticated
  using (
    app.is_project_staff(project_id)
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.submissions.view_all'))
    or user_id = (select app.current_user_id())
  );

-- ID documents (eKYC) are seen only by CohortData staff and the person who uploaded them (ID-55).
create policy submission_files_read on public.submission_files for select to authenticated
  using (
    removed_at is null and (
      app.is_project_staff(project_id)
      or exists (select 1 from public.collection_sessions s where s.id = submission_files.session_id and s.user_id = (select app.current_user_id()))
      or (role in ('FILE', 'SIGNATURE') and organization_id is not null and app.has_org_permission(organization_id, 'org.submissions.view_all'))
    )
  );

create policy submission_links_read on public.submission_links for select to authenticated
  using (app.is_project_staff(project_id) or app.has_org_permission(organization_id, 'org.links.manage'));

-- Project managers see the status history of their projects' submissions.
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
    or (p_entity_type = 'assignment' and exists (select 1 from public.project_assignments pa where pa.id = p_entity_id and app.is_project_manager(pa.project_id)))
    or (p_entity_type = 'submission' and exists (select 1 from public.submissions s where s.id = p_entity_id and app.is_project_manager(s.project_id))));
$$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function app.collection_config(p_project uuid, p_version int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select config from public.project_collection_versions where project_id = p_project and version = p_version;
$$;

-- Submissions that count against quotas and limits: everything not rejected or withdrawn.
create or replace function app.counts_toward_quota(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_status not in ('REJECTED', 'WITHDRAWN'); $$;

-- Count per quota rule of the project's current setup.
create or replace function public.collection_quota_counts(p_project uuid)
returns table (quota_id text, filled bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select q ->> 'id', (
    select count(*) from public.submissions s
    where s.project_id = p_project and app.counts_toward_quota(s.status)
      and s.profile @> coalesce((select jsonb_object_agg(w ->> 'field', w ->> 'value') from jsonb_array_elements(q -> 'when') w), '{}'::jsonb))
  from public.projects p
  cross join lateral jsonb_array_elements(coalesce(app.collection_config(p.id, p.collection_version) -> 'quotas', '[]'::jsonb)) q
  where p.id = p_project and (app.can_view_project(p_project) or app.current_user_id() is null);
$$;

-- True when the answers fit an open quota (or the setup has no quotas for these fields).
create or replace function app.quota_open(p_project uuid, p_config jsonb, p_profile jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quotas jsonb := coalesce(p_config -> 'quotas', '[]'::jsonb);
  v_match boolean := false;
  q jsonb;
  v_when jsonb;
  v_filled bigint;
begin
  if jsonb_array_length(v_quotas) = 0 then return true; end if;
  for q in select * from jsonb_array_elements(v_quotas) loop
    select coalesce(jsonb_object_agg(w ->> 'field', w ->> 'value'), '{}'::jsonb) into v_when from jsonb_array_elements(q -> 'when') w;
    if p_profile @> v_when then
      v_match := true;
      select count(*) into v_filled from public.submissions s
        where s.project_id = p_project and app.counts_toward_quota(s.status) and s.profile @> v_when;
      if v_filled < (q ->> 'target')::int then return true; end if;
    end if;
  end loop;
  -- Answers matched quotas but all are full; or matched none while quotas exist.
  return false;
end;
$$;

-- Opens a session after the caller has established who is collecting.
create or replace function app.open_session(
  p_assignment public.project_assignments, p_user uuid, p_link public.submission_links,
  p_name text, p_email text, p_profile jsonb, p_session_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_config jsonb;
  v_limit int;
  v_done int;
  v_ends timestamptz;
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  select * into v_project from public.projects where id = p_assignment.project_id;
  if v_project.status <> 'PUBLISHED' then perform app.fail('CG409', 'This project is not collecting right now.'); end if;
  if v_project.collection_version = 0 then perform app.fail('CG409', 'This project is not ready for collection yet.'); end if;
  if p_assignment.status <> 'ACTIVE' then perform app.fail('CG409', 'Work on this project is not open.'); end if;
  if p_assignment.organization_id is not null and not exists (
      select 1 from public.organizations o where o.id = p_assignment.organization_id and o.status = 'ACTIVE') then
    perform app.fail('CG409', 'The agency is not active.');
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' or pg_column_size(p_profile) > 16384 then
    perform app.fail('CG422', 'Fill in your details.');
  end if;
  if length(coalesce(trim(p_name), '')) < 2 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    perform app.fail('CG422', 'Enter your full name and a valid email.');
  end if;

  v_config := app.collection_config(v_project.id, v_project.collection_version);
  if not app.quota_open(v_project.id, v_config, p_profile) then
    perform app.fail('CG409', 'This group is already full. Choose from the options that are still offered.');
  end if;

  -- Submissions per person (setup → limits), counted by email in this project.
  v_limit := nullif(v_config #>> '{limits,maxPerContributor}', '')::int;
  if v_limit is not null then
    select count(*) into v_done from public.submissions s
      where s.project_id = v_project.id and s.contributor_email = v_email and app.counts_toward_quota(s.status);
    if v_done >= v_limit then perform app.fail('CG409', 'You have already submitted the maximum for this project.'); end if;
  end if;

  v_ends := now() + make_interval(hours => coalesce((v_config #>> '{limits,sessionHours}')::int, 5));
  if p_link.id is not null then v_ends := least(v_ends, p_link.expires_at); end if;

  insert into public.collection_sessions (project_id, collection_version, assignment_id, organization_id, user_id, link_id,
    session_token_hash, contributor_name, contributor_email, profile, ends_at)
  values (v_project.id, v_project.collection_version, p_assignment.id, p_assignment.organization_id, p_user, p_link.id,
    p_session_token_hash, trim(p_name), v_email, p_profile, v_ends)
  returning id into v_id;
  perform app.audit('collection.session_started', 'collection_session', v_id, p_assignment.organization_id,
    format('Session started on %s', v_project.code), jsonb_build_object('link', p_link.id is not null));
  return v_id;
end;
$$;

-- Checks the caller owns the session (logged in), or the server vouches for a link session.
create or replace function app.require_session_owner(p_session public.collection_sessions)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_session.user_id is not null then
    if p_session.user_id is distinct from app.current_user_id() then perform app.fail('CG403', 'This is not your session.'); end if;
  elsif app.current_user_id() is not null
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    perform app.fail('CG403', 'This is not your session.');
  end if;
end;
$$;

-- The live session row (owned by the caller), or an error saying why it can't be used.
create or replace function app.live_session(p_session uuid)
returns public.collection_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.collection_sessions;
begin
  select * into v from public.collection_sessions where id = p_session for update;
  if not found then perform app.fail('CG404', 'Session not found.'); end if;
  perform app.require_session_owner(v);
  if v.status = 'SUBMITTED' then perform app.fail('CG409', 'This session was already submitted.'); end if;
  if v.status = 'CANCELLED' then perform app.fail('CG409', 'This session was cancelled. Start a new one.'); end if;
  if v.ends_at < now() then perform app.fail('CG409', 'The session time is over. Start a new session.'); end if;
  if v.link_id is not null and exists (select 1 from public.submission_links l where l.id = v.link_id and l.revoked_at is not null) then
    perform app.fail('CG409', 'This link was turned off by the agency.');
  end if;
  return v;
end;
$$;

-- The logged-in collector's active assignment for a project (Member via the agency; Direct Freelancer own).
create or replace function app.my_collect_assignment(p_project uuid)
returns public.project_assignments
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.project_assignments;
  v_user uuid := app.require_user();
begin
  select pa.* into v from public.project_assignments pa
  join public.member_assignments ma on ma.project_assignment_id = pa.id and ma.user_id = v_user and ma.status = 'ASSIGNED'
  join public.organization_memberships m on m.id = ma.membership_id and m.status = 'ACTIVE'
  where pa.project_id = p_project and pa.status = 'ACTIVE'
  limit 1;
  if v.id is null and app.has_permission('individual.projects.apply') then
    select * into v from public.project_assignments where project_id = p_project and user_id = v_user and status = 'ACTIVE';
  end if;
  if v.id is null then perform app.fail('CG403', 'You are not assigned to collect for this project.'); end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2B: logged-in collectors
-- -----------------------------------------------------------------------------
create or replace function public.start_collection_session(p_project uuid, p_profile jsonb, p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_assignment public.project_assignments := app.my_collect_assignment(p_project);
  v_existing uuid;
  v_null_link public.submission_links;
begin
  -- One live session per person and project: picking up again returns it.
  select id into v_existing from public.collection_sessions
  where user_id = v_user and project_id = p_project and status = 'ACTIVE' and ends_at > now();
  if v_existing is not null then return v_existing; end if;
  return app.open_session(v_assignment, v_user, v_null_link, p_name, p_email, p_profile, null);
end;
$$;



create or replace function public.sign_session_consent(
  p_session uuid, p_text_sha256 text, p_kind text, p_signature text, p_ip text default null, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.collection_sessions := app.live_session(p_session);
  v_config jsonb;
begin
  perform app.require_session_owner(v);
  v_config := app.collection_config(v.project_id, v.collection_version);
  if p_text_sha256 is distinct from app.sha256(v_config #>> '{consent,text}') then
    perform app.fail('CG409', 'The consent text changed. Reload the page and read it again.');
  end if;
  if p_kind not in ('draw', 'type', 'none') then perform app.fail('CG422', 'Sign the consent.'); end if;
  if p_kind = 'none' and coalesce(v_config #>> '{consent,signature}', 'either') <> 'none' then perform app.fail('CG422', 'Sign the consent.'); end if;
  if p_kind = 'type' and length(trim(coalesce(p_signature, ''))) < 2 then perform app.fail('CG422', 'Type your full name to sign.'); end if;
  if p_kind = 'draw' and coalesce(p_signature, '') = '' then perform app.fail('CG422', 'Draw your signature.'); end if;
  update public.collection_sessions set consent_text_sha256 = p_text_sha256, consent_signature_kind = p_kind,
    consent_signature = left(p_signature, 400), consent_signed_at = now(), consent_ip = left(p_ip, 64), consent_user_agent = left(p_user_agent, 400)
  where id = p_session;
  perform app.audit('collection.consent_signed', 'collection_session', p_session, v.organization_id, 'Consent signed',
    jsonb_build_object('kind', p_kind));
end;
$$;

-- Records an uploaded file; a newer file for the same slot replaces the older one.
create or replace function public.register_session_file(
  p_session uuid, p_slot_key text, p_role text, p_storage_bucket text, p_storage_path text,
  p_file_name text, p_mime_type text, p_size_bytes bigint, p_duration numeric default null)
returns table (file_id uuid, replaced_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.collection_sessions := app.live_session(p_session);
  v_old text;
  v_id uuid;
begin
  perform app.require_session_owner(v);
  if p_storage_path not like v.project_id::text || '/' || p_session::text || '/%' then
    perform app.fail('CG422', 'Wrong upload location.');
  end if;
  select storage_path into v_old from public.submission_files
    where session_id = p_session and slot_key = p_slot_key and role = p_role and removed_at is null;
  update public.submission_files set removed_at = now()
    where session_id = p_session and slot_key = p_slot_key and role = p_role and removed_at is null;
  insert into public.submission_files (session_id, project_id, organization_id, slot_key, role, storage_bucket, storage_path,
    file_name, mime_type, size_bytes, duration_seconds)
  values (p_session, v.project_id, v.organization_id, p_slot_key, p_role, p_storage_bucket, p_storage_path,
    left(p_file_name, 200), p_mime_type, p_size_bytes, p_duration)
  returning id into v_id;
  perform app.audit('collection.file_added', 'collection_session', p_session, v.organization_id,
    format('%s added (%s)', left(p_file_name, 200), p_role), jsonb_build_object('slot', p_slot_key, 'replaced', v_old is not null));
  return query select v_id, v_old;
end;
$$;

create or replace function public.submit_collection_session(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.collection_sessions := app.live_session(p_session);
  v_config jsonb;
  v_missing text;
  v_main public.submission_files;
  v_id uuid;
  v_code text;
begin
  perform app.require_session_owner(v);
  v_config := app.collection_config(v.project_id, v.collection_version);

  if coalesce((v_config #>> '{consent,enabled}')::boolean, false) and v.consent_signed_at is null then
    perform app.fail('CG422', 'Agree to the consent and sign before uploading.');
  end if;
  select string_agg(f ->> 'label', ', ') into v_missing
  from jsonb_array_elements(coalesce(v_config -> 'files', '[]'::jsonb)) f
  where coalesce((f ->> 'required')::boolean, true)
    and not exists (select 1 from public.submission_files sf where sf.session_id = p_session and sf.slot_key = f ->> 'key' and sf.role = 'FILE' and sf.removed_at is null);
  if v_missing is not null then perform app.fail('CG422', format('Add %s before submitting.', v_missing)); end if;
  if coalesce((v_config #>> '{ekyc,enabled}')::boolean, false) then
    if not exists (select 1 from public.submission_files where session_id = p_session and role = 'ID_FRONT' and removed_at is null) then
      perform app.fail('CG422', 'Add the front side of your ID document.');
    end if;
    if v_config #>> '{ekyc,backSide}' = 'required'
       and not exists (select 1 from public.submission_files where session_id = p_session and role = 'ID_BACK' and removed_at is null) then
      perform app.fail('CG422', 'Add the back side of your ID document.');
    end if;
  end if;
  if not app.quota_open(v.project_id, v_config, v.profile) then
    perform app.fail('CG409', 'This group filled up while you were uploading. Your files were not submitted.');
  end if;

  select * into v_main from public.submission_files
    where session_id = p_session and role = 'FILE' and removed_at is null
    order by (slot_key = (v_config #>> '{files,0,key}')) desc, created_at limit 1;

  insert into public.submissions (project_id, session_id, collection_version, assignment_id, organization_id, collector_user_id, link_id,
    contributor_name, contributor_email, profile, main_file_name, duration_seconds)
  values (v.project_id, v.id, v.collection_version, v.assignment_id, v.organization_id, v.user_id, v.link_id,
    v.contributor_name, v.contributor_email, v.profile, v_main.file_name, v_main.duration_seconds)
  returning id into v_id;
  update public.submission_files set submission_id = v_id where session_id = p_session and removed_at is null;
  update public.collection_sessions set status = 'SUBMITTED', submitted_at = now(), ended_at = now() where id = p_session;

  select code into v_code from public.projects where id = v.project_id;
  perform app.transition('submission', v_id, v.organization_id, v.user_id, null, 'PENDING', 'Submitted; waiting for the automatic checks');
  perform app.audit('submission.created', 'submission', v_id, v.organization_id,
    format('Submission to %s by %s', v_code, v.contributor_name), jsonb_build_object('link', v.link_id is not null));
  return v_id;
end;
$$;

-- Ends a session without submitting. Returns the files to delete from storage.
create or replace function public.cancel_collection_session(p_session uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.collection_sessions;
begin
  select * into v from public.collection_sessions where id = p_session for update;
  if not found then perform app.fail('CG404', 'Session not found.'); end if;
  perform app.require_session_owner(v);
  if v.status <> 'ACTIVE' then perform app.fail('CG409', 'This session is already closed.'); end if;
  update public.collection_sessions set status = 'CANCELLED', ended_at = now() where id = p_session;
  perform app.audit('collection.session_cancelled', 'collection_session', p_session, v.organization_id, 'Session cancelled');
  return query
    with gone as (
      update public.submission_files set removed_at = now() where session_id = p_session and removed_at is null returning storage_path
    ) select storage_path from gone;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2C: public links
-- -----------------------------------------------------------------------------
create or replace function public.create_submission_link(p_project uuid, p_label text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_org uuid := app.current_org_id();
  v_assignment public.project_assignments;
  v_project public.projects;
  v_token text := app.new_token();
  v_limit int;
  v_id uuid;
  v_expires timestamptz := now() + interval '24 hours';
begin
  if v_org is null or not app.has_org_permission(v_org, 'org.links.manage') then
    perform app.fail('CG403', 'Only the agency Owner or Manager can create links.');
  end if;
  if not exists (select 1 from public.organizations where id = v_org and status = 'ACTIVE') then
    perform app.fail('CG409', 'Your agency must be active to create links.');
  end if;
  select * into v_assignment from public.project_assignments where project_id = p_project and organization_id = v_org and status = 'ACTIVE';
  if not found then perform app.fail('CG409', 'Links can be created once both signatures are done and work is open.'); end if;
  select * into v_project from public.projects where id = p_project;
  if v_project.status <> 'PUBLISHED' or v_project.collection_version = 0 then
    perform app.fail('CG409', 'This project is not collecting right now.');
  end if;
  if (select count(*) from public.submission_links where organization_id = v_org and created_at > now() - interval '1 hour') >= 200 then
    perform app.fail('CG429', 'Too many links in the last hour. Try again later.');
  end if;
  v_limit := coalesce(nullif(app.collection_config(p_project, v_project.collection_version) #>> '{limits,maxPerContributor}', '')::int, 1000);
  insert into public.submission_links (project_id, organization_id, assignment_id, token_hash, label, max_submissions, created_by, expires_at)
  values (p_project, v_org, v_assignment.id, app.hash_token(v_token), left(trim(coalesce(p_label, '')), 120), v_limit, v_user, v_expires)
  returning id into v_id;
  perform app.audit('link.created', 'submission_link', v_id, v_org, format('Public link created for %s', v_project.code),
    jsonb_build_object('label', left(trim(coalesce(p_label, '')), 120)));
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.revoke_submission_link(p_link uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.submission_links;
begin
  perform app.require_user();
  select * into v from public.submission_links where id = p_link for update;
  if not found then perform app.fail('CG404', 'Link not found.'); end if;
  -- The agency's Owner/Manager, or the Super Admin (#36).
  if not (app.has_org_permission(v.organization_id, 'org.links.manage') or app.has_permission('agency.manage')) then
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;
  if v.revoked_at is not null then perform app.fail('CG409', 'This link is already turned off.'); end if;
  update public.submission_links set revoked_at = now(), revoked_by = app.current_user_id(), revoke_reason = nullif(trim(p_reason), '') where id = p_link;
  perform app.audit('link.revoked', 'submission_link', p_link, v.organization_id, 'Public link turned off', jsonb_build_object('reason', p_reason));
end;
$$;

-- Server only (service role): look up a link by its token. Returns nothing for unknown tokens.
create or replace function public.link_lookup(p_token text)
returns table (link_id uuid, project_id uuid, organization_id uuid, label text, contributor_email text, contributor_name text,
  expires_at timestamptz, revoked boolean, max_submissions int, used int, collection_version int, project_status text,
  assignment_status text, organization_status text, organization_name text, organization_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.project_id, l.organization_id, l.label, l.contributor_email, l.contributor_name, l.expires_at, l.revoked_at is not null,
    l.max_submissions,
    (select count(*)::int from public.submissions s where s.link_id = l.id and app.counts_toward_quota(s.status)),
    p.collection_version, p.status, pa.status, o.status, o.name,
    coalesce((select ap.contact_email from public.agency_profiles ap where ap.organization_id = o.id), '')
  from public.submission_links l
  join public.projects p on p.id = l.project_id
  join public.project_assignments pa on pa.id = l.assignment_id
  join public.organizations o on o.id = l.organization_id
  where l.token_hash = app.hash_token(p_token);
$$;

-- Server only: start a session on a link. p_session_token_hash binds it to the browser cookie.
create or replace function public.start_link_session(p_token text, p_profile jsonb, p_name text, p_email text, p_session_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.submission_links;
  v_assignment public.project_assignments;
  v_email text := lower(trim(p_email));
  v_used int;
  v_existing uuid;
begin
  select * into v_link from public.submission_links where token_hash = app.hash_token(p_token) for update;
  if not found or v_link.revoked_at is not null or v_link.expires_at < now() then
    perform app.fail('CG404', 'This link is not valid any more. Ask the agency for a new one.');
  end if;
  -- One freelancer per link (#34).
  if v_link.contributor_email is not null and v_link.contributor_email <> v_email then
    perform app.fail('CG403', 'This link belongs to someone else. Ask the agency for your own link.');
  end if;
  select count(*) into v_used from public.submissions where link_id = v_link.id and app.counts_toward_quota(status);
  if v_used >= v_link.max_submissions then perform app.fail('CG409', 'This link has been used. Ask the agency for a new one.'); end if;
  select id into v_existing from public.collection_sessions where link_id = v_link.id and status = 'ACTIVE' and ends_at > now();
  if v_existing is not null then perform app.fail('CG409', 'A session on this link is already open in another browser.'); end if;
  select * into v_assignment from public.project_assignments where id = v_link.assignment_id;
  if v_link.contributor_email is null then
    update public.submission_links set contributor_email = v_email, contributor_name = trim(p_name) where id = v_link.id;
    perform app.audit('link.claimed', 'submission_link', v_link.id, v_link.organization_id, format('Link taken by %s', trim(p_name)));
  end if;
  return app.open_session(v_assignment, null, v_link, p_name, v_email, p_profile, p_session_token_hash);
end;
$$;

-- Server only: the link session bound to this browser.
create or replace function public.link_session(p_token text, p_session_token_hash text)
returns table (session_id uuid, status text, ends_at timestamptz, consent_signed boolean, profile jsonb, contributor_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, case when s.status = 'ACTIVE' and s.ends_at < now() then 'EXPIRED' else s.status end, s.ends_at,
    s.consent_signed_at is not null, s.profile, s.contributor_name
  from public.collection_sessions s
  join public.submission_links l on l.id = s.link_id
  where l.token_hash = app.hash_token(p_token) and s.session_token_hash = p_session_token_hash
  order by s.started_at desc limit 1;
$$;

-- Server only: what the freelancer may see about their own submissions on this link (#33: remarks on the link page).
create or replace function public.link_submissions(p_token text)
returns table (submission_id uuid, status text, remark text, main_file_name text, submitted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.status, s.remark, s.main_file_name, s.submitted_at
  from public.submissions s join public.submission_links l on l.id = s.link_id
  where l.token_hash = app.hash_token(p_token)
  order by s.submitted_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on function
  app.collection_config(uuid, int), app.counts_toward_quota(text), app.quota_open(uuid, jsonb, jsonb),
  app.open_session(public.project_assignments, uuid, public.submission_links, text, text, jsonb, text),
  app.live_session(uuid), app.my_collect_assignment(uuid), app.require_session_owner(public.collection_sessions)
from public, anon, authenticated;

revoke execute on function
  public.collection_quota_counts(uuid), public.start_collection_session(uuid, jsonb, text, text),
  public.sign_session_consent(uuid, text, text, text, text, text),
  public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric),
  public.submit_collection_session(uuid), public.cancel_collection_session(uuid),
  public.create_submission_link(uuid, text), public.revoke_submission_link(uuid, text),
  public.link_lookup(text), public.start_link_session(text, jsonb, text, text, text),
  public.link_session(text, text), public.link_submissions(text)
from public, anon;

grant execute on function
  public.collection_quota_counts(uuid), public.start_collection_session(uuid, jsonb, text, text),
  public.sign_session_consent(uuid, text, text, text, text, text),
  public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric),
  public.submit_collection_session(uuid), public.cancel_collection_session(uuid),
  public.create_submission_link(uuid, text), public.revoke_submission_link(uuid, text)
to authenticated;

-- Link functions: the server's service role only.
revoke execute on function public.link_lookup(text), public.start_link_session(text, jsonb, text, text, text),
  public.link_session(text, text), public.link_submissions(text) from authenticated;
grant execute on function public.link_lookup(text), public.start_link_session(text, jsonb, text, text, text),
  public.link_session(text, text), public.link_submissions(text),
  public.collection_quota_counts(uuid), public.sign_session_consent(uuid, text, text, text, text, text),
  public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric),
  public.submit_collection_session(uuid), public.cancel_collection_session(uuid)
to service_role;
