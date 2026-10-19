# 1B — Database

**Status:** done. All migrations apply cleanly and **193 pgTAP tests pass** (as of 2026-10-19, including Phase 2A) (`pnpm db:test`, or `pnpm db:test:local` without Docker).

## Migrations (`supabase/migrations/`)

| File | Contents |
|---|---|
| `…0100_foundation` | `pgcrypto`; private `app` schema; `app.fail` (custom error codes, ID-05), token helpers |
| `…0200_identity` | users, roles, permissions, `user_roles` (one Super Admin), organizations (one PLATFORM org), agency profiles, documents, agency requests, memberships (one org per person; one Owner and at most one Manager per agency), contributor profiles, invitations and token hashes |
| `…0300_projects` | projects, versions, questions (versioned), contract templates (versioned, SHA-256 of the text), project invitations, applications, answers, assignments, signatures, member assignments |
| `…0400_audit_notifications` | append-only `audit_logs`, `workflow_events`, `notifications`, `email_outbox` |
| `…0500_roles_seed` | the role → permission matrix (see `docs/permissions.md`) |
| `…0600_auth_helpers` | `app.current_user_id()`, `app.has_permission()`, `app.has_org_permission()`, `app.can_view_project()` and friends |
| `…0700_rls` | RLS on every table; signed-in users get `SELECT` only, through policies; `anon` gets nothing |
| `…0800_identity_functions` | all identity, agency, invitation, request and staff operations |
| `…0900_project_functions` | all project, application, contract and assignment operations |
| `…1000_function_grants` | which role may call which function |
| `…1100_suspension_guard` | suspended agencies can't assign members (ID-31) |
| `20261015000100_lock_helper_functions` | private helpers closed to users; only read-only access checks stay callable (ID-38) |
| `20261015000200_invitation_rate_limits` | 40 invitations per person per hour; 5 sends per invitation (ID-40) |
| `20261015000700_audit_coverage` | Profile updates and new accounts write audit entries (ID-50) |
| `20261019000100_operations_manager` | Operations Manager role; `project_managers`; PMs see and act only on assigned projects (ID-52) |
| `20261019000200_collection_setup` | Phase 2A: versioned collection setup per project; guide images (ID-53) |
| `20261015000600_bulk_invite` | Invitee name on invitations; hourly limit 100 (ID-47) |
| `20261015000500_remove_replaced_document` | A document marked "Replace this" can be deleted once its replacement is uploaded (ID-45) |
| `20261015000400_agency_application_lock` | Agency status `DRAFT`; `save_agency_application`; application and documents locked while in review (ID-44) |
| `20261015000300_agency_changes_requested` | Agency status `CHANGES_REQUESTED`; `request_agency_changes`; resubmission and document rules (ID-42) |

## Rules that live in the database

These hold even if someone calls the API directly:

- one organization per person; one Owner and one Manager per agency; one Super Admin;
- invitations expire after 7 days and are stored only as hashes;
- answers can't be edited; the applicant type locks once applications exist;
- only the Owner signs for an agency;
- work opens only after both signatures;
- audit entries can't be changed or deleted;
- agencies never see each other's data.

## Tests (`supabase/tests/`)

| File | Tests | Covers |
|---|---|---|
| `001_fixture_smoke` | 8 | the test fixture itself |
| `002_rls_isolation` | 28 | who can read what; anonymous access; cross-agency isolation; audit immutability |
| `003_agency_rules` | 37 | invitations, Owner/Manager rules, approval, re-applying, requests, transfer, deactivation, staff |
| `004_projects_contracts` | 43 | job visibility, applying, locks, versioning, approval, signing, countersigning, member assignment, invite-only projects, suspension |
| `005_security_catalog` | 9 | structural checks: RLS everywhere, no write grants, anon locked out, helpers closed |
| `006_rate_limits` | 3 | invitation flood limits (100 per hour), invitee name kept |
| `009_audit_coverage` | 4 | every data-changing function audits; profile update and sign-up recorded |
| `010_operations_manager` | 21 | a PM sees only assigned projects; Operations Manager assigns and removes; notifications only to the project's PMs |
| `011_collection_setup` | 11 | only the project's managers save; versions kept; guide images belong to the project; who can read the setup |
| `008_application_lock` | 12 | draft, a document needed to send, nothing changes while in review, opens on "Ask for changes" |
| `007_agency_changes` | 17 | Ask for changes: who may ask, flagged documents, send back without waiting, decide while waiting |

## Changing a rule

Never edit an applied migration. Add a new migration with `create or replace function …` (or an `alter`), add a test, and run `pnpm db:test`.
