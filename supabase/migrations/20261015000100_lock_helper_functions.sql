-- Security hardening (2026-10-15, plan item S2).
-- New functions get EXECUTE for PUBLIC by default. Several private helpers in
-- the app schema run with the owner's rights (SECURITY DEFINER), e.g.
-- app.swap_owner and app.apply_agency_profile. They are unreachable through the
-- API today (only the public schema is exposed), but they must not depend on
-- that: only the helpers that row-level-security policies call stay executable
-- by signed-in users.

revoke execute on all functions in schema app from public, anon, authenticated;

grant execute on function
  app.clerk_sub(), app.current_user_id(), app.current_org_id(), app.has_permission(text),
  app.has_org_permission(uuid, text), app.is_member_of(uuid), app.is_direct_freelancer(),
  app.can_view_user(uuid), app.can_view_project(uuid)
to authenticated;

-- Future functions start closed in both schemas; each migration grants what it needs.
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
