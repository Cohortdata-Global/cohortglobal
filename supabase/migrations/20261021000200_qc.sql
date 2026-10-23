-- =============================================================================
-- Phase 2D + 2E: automatic checks (metadata validator) and the QC queue (ID-56)
--
-- 2D  On submit the database runs the checks at once:
--       profile answers complete and valid; files present, size and length
--       inside the setup; duplicates (#38): same value in a "duplicate check"
--       field (email, phone, ID number...) or the same file (SHA-256) in this
--       project -> rejected automatically; same name + date of birth, or same
--       name + phone with another email -> flagged for QC.
--     Pass -> READY_FOR_QC; any failure -> REJECTED with the reasons as remark.
--     Results are kept in submission_checks.
-- 2E  QC queue per project. Assigning (qc.assign): QC Lead, Project Manager of
--     the project (owner 2026-10-21: PMs assign too and see what QC Leads see),
--     Operations Manager, Super Admin. They can assign to anyone who reviews
--     (qc.review: QC Reviewer, QC Lead, the project's PMs, Operations Manager,
--     Super Admin), themselves included. Assigning moves the submission to
--     IN_REVIEW. The assignee decides: APPROVED, RESUBMIT_REQUESTED or REJECTED;
--     the last two need a remark, which the agency and the contributor see.
--     Comments: internal (CohortData only) or shared with the agency/contributor.
--     A QC Reviewer sees only submissions assigned to them.
-- Resubmission: a RESUBMIT_REQUESTED submission no longer counts toward
-- quotas and limits, so the contributor can start again (links too, until the
-- link expires, #37); the new submission replaces the old one (REPLACED).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
insert into public.permissions (code, scope, description) values
  ('qc.assign', 'PLATFORM', 'Assign QC reviews (on projects you can manage)'),
  ('qc.review', 'PLATFORM', 'Review submissions assigned to you');
insert into public.role_permissions (role_code, permission_code) values
  ('SUPER_ADMIN', 'qc.assign'), ('SUPER_ADMIN', 'qc.review'),
  ('OPERATIONS_MANAGER', 'qc.assign'), ('OPERATIONS_MANAGER', 'qc.review'),
  ('PROJECT_MANAGER', 'qc.assign'), ('PROJECT_MANAGER', 'qc.review'),
  ('QC_LEAD', 'qc.assign'), ('QC_LEAD', 'qc.review'),
  ('QC_REVIEWER', 'qc.review');
-- A QC Reviewer no longer sees every project: only the work assigned to them.
delete from public.role_permissions where role_code = 'QC_REVIEWER' and permission_code = 'project.view_all';

-- -----------------------------------------------------------------------------
-- Columns and tables
-- -----------------------------------------------------------------------------
alter table public.submissions drop constraint submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('PENDING', 'READY_FOR_QC', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMIT_REQUESTED', 'REPLACED', 'DELIVERED', 'WITHDRAWN'));
alter table public.submissions
  add column flag_count int not null default 0,
  add column qc_assignee uuid references public.users(id),
  add column qc_assigned_by uuid references public.users(id),
  add column qc_assigned_at timestamptz,
  add column decided_by uuid references public.users(id),
  add column decided_at timestamptz,
  add column reason_codes text[] not null default '{}',
  add column replaces_submission_id uuid references public.submissions(id);
create index submissions_qc_queue_idx on public.submissions (project_id, status, qc_assignee);
create index submissions_assignee_idx on public.submissions (qc_assignee, status) where qc_assignee is not null;

alter table public.submission_files add column sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
create index submission_files_hash_idx on public.submission_files (project_id, sha256) where sha256 is not null and removed_at is null;

create table public.submission_checks (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  check_code    text not null,
  result        text not null check (result in ('PASS', 'FAIL', 'FLAG')),
  detail        text,
  related_submission_id uuid references public.submissions(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index submission_checks_submission_idx on public.submission_checks (submission_id);

create table public.submission_comments (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  author_id     uuid not null references public.users(id),
  body          text not null check (length(trim(body)) between 1 and 2000),
  shared        boolean not null default false,
  kind          text not null default 'COMMENT' check (kind in ('COMMENT', 'DECISION')),
  created_at    timestamptz not null default now()
);
create index submission_comments_submission_idx on public.submission_comments (submission_id, created_at);

alter table public.submission_checks enable row level security;
alter table public.submission_comments enable row level security;
revoke all on public.submission_checks, public.submission_comments from anon, authenticated;
grant select on public.submission_checks, public.submission_comments to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- QC permission on a project: the permission AND (every project, or a PM of this one).
create or replace function app.can_qc(p_project uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission(p_permission) and app.is_project_staff(p_project);
$$;

-- Can this (other) user review on this project? Used when assigning.
create or replace function app.user_can_review(p_user uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users u where u.id = p_user and u.status = 'ACTIVE')
     and exists (select 1 from public.user_roles ur join public.role_permissions rp on rp.role_code = ur.role_code
                 where ur.user_id = p_user and ur.revoked_at is null and rp.permission_code = 'qc.review')
     and (exists (select 1 from public.user_roles ur join public.role_permissions rp on rp.role_code = ur.role_code
                  where ur.user_id = p_user and ur.revoked_at is null and rp.permission_code = 'project.view_all')
          or exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.revoked_at is null and ur.role_code = 'QC_REVIEWER')
          or exists (select 1 from public.project_managers pm where pm.project_id = p_project and pm.user_id = p_user and pm.removed_at is null
                     and exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.revoked_at is null and ur.role_code = 'PROJECT_MANAGER')));
$$;

-- The signed-in reviewer is assigned to this submission.
create or replace function app.is_qc_assignee(p_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.submissions s where s.id = p_submission and s.qc_assignee = app.current_user_id());
$$;

create or replace function app.has_qc_work_in(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.submissions s where s.project_id = p_project and s.qc_assignee = app.current_user_id());
$$;

create or replace function app.counts_toward_quota(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_status not in ('REJECTED', 'WITHDRAWN', 'REPLACED', 'RESUBMIT_REQUESTED'); $$;

-- Status change with an explicit actor (null = the system: automatic checks).
create or replace function app.submission_event(p_sub public.submissions, p_from text, p_to text, p_reason text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workflow_events (entity_type, entity_id, organization_id, subject_user_id, from_status, to_status, actor_user_id, reason)
  values ('submission', p_sub.id, p_sub.organization_id, p_sub.collector_user_id, p_from, p_to, p_actor, p_reason);
end;
$$;

-- Tells the collector (if they have an account) and the agency's Owner/Manager.
create or replace function app.notify_submission(p_sub public.submissions, p_kind text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sub.collector_user_id is not null then
    perform app.notify(p_sub.collector_user_id, p_kind, p_title, p_body, '/work/submissions/' || p_sub.id);
  end if;
  if p_sub.organization_id is not null then
    insert into public.notifications (user_id, kind, title, body, href)
    select m.user_id, p_kind, p_title, coalesce(p_body, ''), '/agency/submissions/' || p_sub.id
    from public.organization_memberships m
    where m.organization_id = p_sub.organization_id and m.status = 'ACTIVE' and m.role in ('AGENCY_OWNER', 'AGENCY_MANAGER')
      and m.user_id is distinct from p_sub.collector_user_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2D: automatic checks
-- -----------------------------------------------------------------------------
create or replace function app.run_submission_checks(p_submission uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions;
  v_config jsonb;
  f jsonb;
  v_val text;
  v_other uuid;
  v_fail text[] := '{}';
  v_flags int := 0;
  v_file public.submission_files;
  v_slot jsonb;
  v_dob_key text;
  v_phone_key text;
begin
  select * into s from public.submissions where id = p_submission for update;
  v_config := app.collection_config(s.project_id, s.collection_version);

  -- Profile answers
  for f in select * from jsonb_array_elements(coalesce(v_config -> 'fields', '[]'::jsonb)) loop
    v_val := nullif(trim(s.profile ->> (f ->> 'key')), '');
    if v_val is null and coalesce((f ->> 'required')::boolean, true) then
      insert into public.submission_checks (submission_id, check_code, result, detail) values (s.id, 'profile_missing', 'FAIL', f ->> 'label');
      v_fail := v_fail || ('Missing: ' || (f ->> 'label'));
    elsif v_val is not null and f ->> 'type' = 'select'
          and not exists (select 1 from jsonb_array_elements_text(f -> 'options') o where o = v_val) then
      insert into public.submission_checks (submission_id, check_code, result, detail) values (s.id, 'profile_option', 'FAIL', (f ->> 'label') || ': ' || v_val);
      v_fail := v_fail || ((f ->> 'label') || ' has an option that is not offered');
    end if;
    if f ->> 'type' = 'date' and v_dob_key is null then v_dob_key := f ->> 'key'; end if;
    if f ->> 'type' = 'phone' and v_phone_key is null then v_phone_key := f ->> 'key'; end if;

    -- Duplicate check fields (email, phone, ID number...): same value in another live submission.
    if v_val is not null and coalesce((f ->> 'identity')::boolean, false) then
      select o.id into v_other from public.submissions o
      where o.project_id = s.project_id and o.id <> s.id and app.counts_toward_quota(o.status)
        and lower(trim(o.profile ->> (f ->> 'key'))) = lower(v_val)
      order by o.submitted_at limit 1;
      if v_other is not null then
        insert into public.submission_checks (submission_id, check_code, result, detail, related_submission_id)
        values (s.id, 'duplicate_field', 'FAIL', f ->> 'label', v_other);
        v_fail := v_fail || ('Duplicate ' || lower(f ->> 'label') || ' (already submitted in this project)');
      end if;
    end if;
  end loop;

  -- Files: size and length inside the setup; the same file already submitted.
  for v_file in select * from public.submission_files where submission_id = s.id and role = 'FILE' and removed_at is null loop
    select x into v_slot from jsonb_array_elements(coalesce(v_config -> 'files', '[]'::jsonb)) x where x ->> 'key' = v_file.slot_key;
    if v_slot is not null then
      if v_file.size_bytes > (v_slot ->> 'maxMb')::bigint * 1024 * 1024 then
        insert into public.submission_checks (submission_id, check_code, result, detail) values (s.id, 'file_size', 'FAIL', v_file.file_name);
        v_fail := v_fail || (v_file.file_name || ' is larger than allowed');
      end if;
      if v_slot ->> 'kind' <> 'image' and (
           v_file.duration_seconds is null
           or (v_slot ->> 'minSeconds' is not null and v_file.duration_seconds < (v_slot ->> 'minSeconds')::numeric)
           or (v_slot ->> 'maxSeconds' is not null and v_file.duration_seconds > (v_slot ->> 'maxSeconds')::numeric)) then
        insert into public.submission_checks (submission_id, check_code, result, detail) values (s.id, 'file_length', 'FAIL', v_file.file_name);
        v_fail := v_fail || (v_file.file_name || ' length is outside the project''s range');
      end if;
    end if;
    if v_file.sha256 is not null then
      select o.id into v_other from public.submission_files of2 join public.submissions o on o.id = of2.submission_id
      where of2.project_id = s.project_id and of2.sha256 = v_file.sha256 and of2.removed_at is null and o.id <> s.id and app.counts_toward_quota(o.status)
      limit 1;
      if v_other is not null then
        insert into public.submission_checks (submission_id, check_code, result, detail, related_submission_id)
        values (s.id, 'duplicate_file', 'FAIL', v_file.file_name, v_other);
        v_fail := v_fail || ('The same file was already submitted (' || v_file.file_name || ')');
      end if;
    end if;
  end loop;

  -- Flags for QC (not rejected): same name + date of birth; same name + phone with another email.
  if v_dob_key is not null and nullif(s.profile ->> v_dob_key, '') is not null then
    select o.id into v_other from public.submissions o
    where o.project_id = s.project_id and o.id <> s.id and app.counts_toward_quota(o.status)
      and lower(o.contributor_name) = lower(s.contributor_name) and o.profile ->> v_dob_key = s.profile ->> v_dob_key
      and o.contributor_email <> s.contributor_email limit 1;
    if v_other is not null then
      insert into public.submission_checks (submission_id, check_code, result, detail, related_submission_id) values (s.id, 'same_name_dob', 'FLAG', s.contributor_name, v_other);
      v_flags := v_flags + 1;
    end if;
  end if;
  if v_phone_key is not null and nullif(s.profile ->> v_phone_key, '') is not null then
    select o.id into v_other from public.submissions o
    where o.project_id = s.project_id and o.id <> s.id and app.counts_toward_quota(o.status)
      and lower(o.contributor_name) = lower(s.contributor_name)
      and regexp_replace(o.profile ->> v_phone_key, '[^0-9]', '', 'g') = regexp_replace(s.profile ->> v_phone_key, '[^0-9]', '', 'g')
      and o.contributor_email <> s.contributor_email limit 1;
    if v_other is not null then
      insert into public.submission_checks (submission_id, check_code, result, detail, related_submission_id) values (s.id, 'same_name_phone', 'FLAG', s.contributor_name, v_other);
      v_flags := v_flags + 1;
    end if;
  end if;

  if array_length(v_fail, 1) is null then
    insert into public.submission_checks (submission_id, check_code, result) values (s.id, 'all', 'PASS');
    update public.submissions set status = 'READY_FOR_QC', status_changed_at = now(), flag_count = v_flags where id = s.id;
    perform app.submission_event(s, 'PENDING', 'READY_FOR_QC',
      case when v_flags > 0 then format('Automatic checks passed with %s flag(s) for QC', v_flags) else 'Automatic checks passed' end, null);
    return 'READY_FOR_QC';
  end if;
  update public.submissions set status = 'REJECTED', status_changed_at = now(), flag_count = v_flags,
    remark = 'Rejected automatically: ' || array_to_string(v_fail, '; ') || '.', reason_codes = '{AUTO}' where id = s.id;
  perform app.submission_event(s, 'PENDING', 'REJECTED', 'Automatic checks: ' || array_to_string(v_fail, '; '), null);
  perform app.notify_submission(s, 'submission.rejected', 'Submission rejected', 'Rejected automatically: ' || array_to_string(v_fail, '; '));
  return 'REJECTED';
end;
$$;

-- Staff can run the checks again (e.g. after a duplicate was withdrawn).
create or replace function public.rerun_submission_checks(p_submission uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions;
begin
  perform app.require_user();
  select * into s from public.submissions where id = p_submission for update;
  if not found then perform app.fail('CG404', 'Submission not found.'); end if;
  if not app.can_qc(s.project_id, 'qc.assign') then perform app.fail('CG403', 'Your role does not allow this action.'); end if;
  if s.status not in ('PENDING', 'READY_FOR_QC', 'REJECTED') or (s.status = 'REJECTED' and not (s.reason_codes @> '{AUTO}')) then
    perform app.fail('CG409', 'Checks can run again only before QC starts, or on an automatic rejection.');
  end if;
  delete from public.submission_checks where submission_id = s.id;
  if s.status <> 'PENDING' then
    update public.submissions set status = 'PENDING', remark = null, reason_codes = '{}', status_changed_at = now() where id = s.id;
    perform app.submission_event(s, s.status, 'PENDING', 'Checks run again', app.current_user_id());
  end if;
  perform app.audit('submission.checks_rerun', 'submission', s.id, s.organization_id, 'Automatic checks run again');
  return app.run_submission_checks(s.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2E: assign, decide, comment
-- -----------------------------------------------------------------------------
create or replace function public.assign_submissions(p_submissions uuid[], p_assignee uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_user();
  s public.submissions;
  v_name text;
  v_n int := 0;
begin
  if coalesce(array_length(p_submissions, 1), 0) = 0 or array_length(p_submissions, 1) > 200 then
    perform app.fail('CG422', 'Choose between 1 and 200 submissions.');
  end if;
  select coalesce(full_name, email) into v_name from public.users where id = p_assignee;
  for s in select * from public.submissions where id = any(p_submissions) order by submitted_at for update loop
    if not app.can_qc(s.project_id, 'qc.assign') then perform app.fail('CG403', 'You can assign QC only on projects you manage.'); end if;
    if not app.user_can_review(p_assignee, s.project_id) then perform app.fail('CG422', format('%s can''t review this project.', coalesce(v_name, 'This person'))); end if;
    if s.status not in ('READY_FOR_QC', 'IN_REVIEW') then perform app.fail('CG409', 'Only submissions waiting for QC can be assigned.'); end if;
    if s.qc_assignee is distinct from p_assignee then
      update public.submissions set qc_assignee = p_assignee, qc_assigned_by = v_actor, qc_assigned_at = now(),
        status = 'IN_REVIEW', status_changed_at = now() where id = s.id;
      perform app.submission_event(s, s.status, 'IN_REVIEW',
        case when p_assignee = v_actor then format('%s took this review', v_name) else format('Assigned to %s', v_name) end, v_actor);
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 then
    if p_assignee <> v_actor then
      perform app.notify(p_assignee, 'qc.assigned', 'Reviews assigned to you', format('%s submission(s) to review.', v_n), '/admin/qc?view=mine');
    end if;
    perform app.audit('qc.assigned', 'user', p_assignee, null, format('%s submission(s) assigned to %s', v_n, v_name));
  end if;
  return v_n;
end;
$$;

-- Who can be picked as reviewer (names for the assign menu; the caller must be able to assign).
create or replace function public.qc_reviewers(p_project uuid default null)
returns table (user_id uuid, full_name text, email text, role_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('qc.assign') or (p_project is not null and not app.can_qc(p_project, 'qc.assign')) then
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;
  return query
    select distinct on (u.id) u.id, u.full_name, u.email, ur.role_code
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.revoked_at is null and ur.role_scope = 'PLATFORM'
    join public.role_permissions rp on rp.role_code = ur.role_code and rp.permission_code = 'qc.review'
    where u.status = 'ACTIVE' and (p_project is null or app.user_can_review(u.id, p_project))
    order by u.id, ur.role_code;
end;
$$;

-- Back to the unassigned queue.
create or replace function public.unassign_submission(p_submission uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_user();
  s public.submissions;
begin
  select * into s from public.submissions where id = p_submission for update;
  if not found then perform app.fail('CG404', 'Submission not found.'); end if;
  if not app.can_qc(s.project_id, 'qc.assign') then perform app.fail('CG403', 'Your role does not allow this action.'); end if;
  if s.status <> 'IN_REVIEW' then perform app.fail('CG409', 'This submission is not assigned.'); end if;
  update public.submissions set qc_assignee = null, qc_assigned_by = null, qc_assigned_at = null, status = 'READY_FOR_QC', status_changed_at = now() where id = s.id;
  perform app.submission_event(s, 'IN_REVIEW', 'READY_FOR_QC', 'Returned to the queue', v_actor);
  perform app.audit('qc.unassigned', 'submission', s.id, s.organization_id, 'Returned to the QC queue');
end;
$$;

create or replace function public.decide_submission(p_submission uuid, p_decision text, p_remark text default null, p_reason_codes text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_user();
  s public.submissions;
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_title text;
begin
  select * into s from public.submissions where id = p_submission for update;
  if not found then perform app.fail('CG404', 'Submission not found.'); end if;
  if s.qc_assignee is distinct from v_actor or not app.has_permission('qc.review') then
    perform app.fail('CG403', 'Only the assigned reviewer decides. Assign it to yourself first.');
  end if;
  if s.status <> 'IN_REVIEW' then perform app.fail('CG409', 'This submission is not in review.'); end if;
  if p_decision not in ('APPROVED', 'REJECTED', 'RESUBMIT_REQUESTED') then perform app.fail('CG422', 'Choose approve, ask to resubmit or reject.'); end if;
  if p_decision <> 'APPROVED' and (v_remark is null or length(v_remark) < 5) then
    perform app.fail('CG422', 'Write a remark. The contributor and the agency see it.');
  end if;
  update public.submissions set status = p_decision, status_changed_at = now(), decided_by = v_actor, decided_at = now(),
    remark = v_remark, reason_codes = coalesce(p_reason_codes, '{}') where id = s.id;
  if v_remark is not null then
    insert into public.submission_comments (submission_id, author_id, body, shared, kind) values (s.id, v_actor, v_remark, true, 'DECISION');
  end if;
  perform app.submission_event(s, 'IN_REVIEW', p_decision, v_remark, v_actor);
  v_title := case p_decision when 'APPROVED' then 'Submission approved' when 'REJECTED' then 'Submission rejected' else 'Please submit again' end;
  perform app.notify_submission(s, 'submission.' || lower(p_decision), v_title, coalesce(v_remark, coalesce(s.main_file_name, 'Your submission') || ' passed QC.'));
  perform app.audit('qc.decided', 'submission', s.id, s.organization_id, format('%s: %s', p_decision, coalesce(s.main_file_name, s.id::text)),
    jsonb_build_object('reasons', p_reason_codes));
end;
$$;

create or replace function public.comment_on_submission(p_submission uuid, p_body text, p_shared boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_user();
  s public.submissions;
  v_id uuid;
begin
  select * into s from public.submissions where id = p_submission;
  if not found then perform app.fail('CG404', 'Submission not found.'); end if;
  if not (app.can_qc(s.project_id, 'qc.review') or app.can_qc(s.project_id, 'qc.assign') or coalesce(s.qc_assignee = v_actor, false)) then
    perform app.fail('CG403', 'Your role does not allow this action.');
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then perform app.fail('CG422', 'Write a comment.'); end if;
  insert into public.submission_comments (submission_id, author_id, body, shared) values (s.id, v_actor, left(trim(p_body), 2000), coalesce(p_shared, false))
  returning id into v_id;
  if p_shared then perform app.notify_submission(s, 'submission.comment', 'New comment from CohortData', left(trim(p_body), 200)); end if;
  perform app.audit('qc.commented', 'submission', s.id, s.organization_id, case when p_shared then 'Shared comment added' else 'Internal comment added' end);
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Visibility
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
  if app.has_permission('project.view_all') or app.is_project_manager(p_project) or app.has_qc_work_in(p_project) then
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

create or replace function app.pm_can_see_event(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_entity_type = 'submission' and (app.is_qc_assignee(p_entity_id)
            or exists (select 1 from public.submissions s where s.id = p_entity_id and app.is_project_staff(s.project_id))))
    or app.has_permission('project.view_assigned') and (
    (p_entity_type = 'project' and app.is_project_manager(p_entity_id))
    or (p_entity_type = 'application' and exists (select 1 from public.project_applications a where a.id = p_entity_id and app.is_project_manager(a.project_id)))
    or (p_entity_type = 'assignment' and exists (select 1 from public.project_assignments pa where pa.id = p_entity_id and app.is_project_manager(pa.project_id)))
    or (p_entity_type = 'submission' and exists (select 1 from public.submissions s where s.id = p_entity_id and app.is_project_manager(s.project_id))));
$$;

drop policy submissions_read on public.submissions;
create policy submissions_read on public.submissions for select to authenticated
  using (
    app.is_project_staff(project_id)
    or qc_assignee = (select app.current_user_id())
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.submissions.view_all'))
    or collector_user_id = (select app.current_user_id())
  );

drop policy sessions_read on public.collection_sessions;
create policy sessions_read on public.collection_sessions for select to authenticated
  using (
    app.is_project_staff(project_id)
    or (organization_id is not null and app.has_org_permission(organization_id, 'org.submissions.view_all'))
    or user_id = (select app.current_user_id())
    or exists (select 1 from public.submissions s where s.session_id = collection_sessions.id and s.qc_assignee = (select app.current_user_id()))
  );

drop policy submission_files_read on public.submission_files;
create policy submission_files_read on public.submission_files for select to authenticated
  using (
    removed_at is null and (
      app.is_project_staff(project_id)
      or exists (select 1 from public.collection_sessions s where s.id = submission_files.session_id and s.user_id = (select app.current_user_id()))
      or (submission_id is not null and app.is_qc_assignee(submission_id))
      or (role in ('FILE', 'SIGNATURE') and organization_id is not null and app.has_org_permission(organization_id, 'org.submissions.view_all'))
    )
  );

create policy submission_checks_read on public.submission_checks for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_checks.submission_id));
  -- filtered by submissions_read

-- Internal comments: CohortData staff of the project and the assignee. Shared ones also the agency and the collector.
create policy submission_comments_read on public.submission_comments for select to authenticated
  using (exists (
    select 1 from public.submissions s where s.id = submission_comments.submission_id
      and (app.is_project_staff(s.project_id) or s.qc_assignee = (select app.current_user_id())
           or (submission_comments.shared and (
                (s.organization_id is not null and app.has_org_permission(s.organization_id, 'org.submissions.view_all'))
                or s.collector_user_id = (select app.current_user_id()))))));

-- -----------------------------------------------------------------------------
-- Upload and submit now feed the checks
-- -----------------------------------------------------------------------------
drop function public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric);
create or replace function public.register_session_file(
  p_session uuid, p_slot_key text, p_role text, p_storage_bucket text, p_storage_path text,
  p_file_name text, p_mime_type text, p_size_bytes bigint, p_duration numeric default null, p_sha256 text default null)
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
    file_name, mime_type, size_bytes, duration_seconds, sha256)
  values (p_session, v.project_id, v.organization_id, p_slot_key, p_role, p_storage_bucket, p_storage_path,
    left(p_file_name, 200), p_mime_type, p_size_bytes, p_duration, case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end)
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
  v_old uuid;
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
  -- A resubmission replaces the submission that QC asked to be redone (#37).
  update public.submissions o set status = 'REPLACED', status_changed_at = now()
  where o.project_id = v.project_id and o.contributor_email = v.contributor_email and o.status = 'RESUBMIT_REQUESTED' and o.id <> v_id
  returning o.id into v_old;
  if v_old is not null then
    update public.submissions set replaces_submission_id = v_old where id = v_id;
    insert into public.workflow_events (entity_type, entity_id, organization_id, subject_user_id, from_status, to_status, actor_user_id, reason)
    values ('submission', v_old, v.organization_id, v.user_id, 'RESUBMIT_REQUESTED', 'REPLACED', null, 'Replaced by a new submission');
  end if;
  update public.collection_sessions set status = 'SUBMITTED', submitted_at = now(), ended_at = now() where id = p_session;

  select code into v_code from public.projects where id = v.project_id;
  perform app.transition('submission', v_id, v.organization_id, v.user_id, null, 'PENDING', 'Submitted; waiting for the automatic checks');
  perform app.audit('submission.created', 'submission', v_id, v.organization_id,
    format('Submission to %s by %s', v_code, v.contributor_name), jsonb_build_object('link', v.link_id is not null));
  perform app.run_submission_checks(v_id);
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on function app.can_qc(uuid, text), app.user_can_review(uuid, uuid), app.submission_event(public.submissions, text, text, text, uuid),
  app.notify_submission(public.submissions, text, text, text), app.run_submission_checks(uuid) from public, anon, authenticated;
revoke execute on function app.is_qc_assignee(uuid), app.has_qc_work_in(uuid) from public, anon;
grant execute on function app.is_qc_assignee(uuid), app.has_qc_work_in(uuid) to authenticated;

revoke execute on function public.qc_reviewers(uuid), public.rerun_submission_checks(uuid), public.assign_submissions(uuid[], uuid), public.unassign_submission(uuid),
  public.decide_submission(uuid, text, text, text[]), public.comment_on_submission(uuid, text, boolean),
  public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric, text) from public, anon;
grant execute on function public.qc_reviewers(uuid), public.rerun_submission_checks(uuid), public.assign_submissions(uuid[], uuid), public.unassign_submission(uuid),
  public.decide_submission(uuid, text, text, text[]), public.comment_on_submission(uuid, text, boolean),
  public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric, text) to authenticated;
grant execute on function public.register_session_file(uuid, text, text, text, text, text, text, bigint, numeric, text) to service_role;
