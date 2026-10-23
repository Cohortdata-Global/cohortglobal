-- =============================================================================
-- Pre-launch hardening (2026-10-21, before the first Netlify deploy). ID-57.
--
-- Signed-in users can call the database functions directly with their Clerk
-- token, skipping the server actions, so the database itself must refuse:
--   1. collected files registered in any bucket other than "submissions",
--      or with ".." in the path (the path prefix check could be walked out of);
--   2. guide images registered outside "collection-assets", or with "..";
--   3. reason codes that are not on the list (free text in a coded field).
-- And:
--   4. automatic check results (duplicate and fraud flags, links to other
--      people's submissions) are for CohortData staff and the assigned
--      reviewer only. Agencies and contributors still see the remark.
-- =============================================================================

alter table public.submission_files
  add constraint submission_files_bucket_chk check (storage_bucket = 'submissions'),
  add constraint submission_files_path_chk check (storage_path !~ '\.\.' and storage_path !~ '^/');

alter table public.project_assets
  add constraint project_assets_bucket_chk check (storage_bucket = 'collection-assets'),
  add constraint project_assets_path_chk check (storage_path !~ '\.\.' and storage_path !~ '^/');

alter table public.submissions
  add constraint submissions_reason_codes_chk check (reason_codes <@ array[
    'AUTO', 'FACE_CUT', 'LIGHTING', 'BLURRY', 'WRONG_OPTIONS', 'ACCESSORY', 'BACKGROUND', 'LENGTH', 'DUPLICATE_PERSON', 'EDITED', 'OTHER']::text[]);

drop policy submission_checks_read on public.submission_checks;
create policy submission_checks_read on public.submission_checks for select to authenticated
  using (exists (
    select 1 from public.submissions s where s.id = submission_checks.submission_id
      and (app.is_project_staff(s.project_id) or s.qc_assignee = (select app.current_user_id()))));
