# CohortGlobal — Roles and Permissions

**Status:** Phase 1 implemented. This page matches the database seed (`supabase/migrations/20261013000500_roles_seed.sql`), which is the source of truth.
**Last updated:** 2026-10-15, session 5
**Sources:** `docs/Decisions/confirmed-decisions.md` (owner decisions, takes precedence) and `docs/Decisions/implementation-decisions.md` (ID-xx).

**Legend:** ✅ allowed · ❌ not allowed · *own* / *agency* / *assigned* = limited to the person's own records, their agency, or items assigned to them · **(Qnn)** = built as shown but still an open question for the owner.

---

## 1. Roles and participants

| Scope | Role | Account | What they do |
|---|---|---|---|
| Platform | Super Admin (exactly one) | Yes | Runs the platform: staff, agencies, requests, audit; everything a PM can do; edits questions after applications exist |
| Platform | Operations Manager | Yes | Sees every project; assigns Project Managers to projects; can do everything a PM does on any project (ID-52) |
| Platform | Project Manager | Yes | Projects, applications, countersigning, project invitations, **only on projects assigned to them** (ID-52) |
| Platform | QC Lead, QC Reviewer | Yes | View projects in Phase 1; review submissions in Part 2 |
| Agency | Agency Owner (exactly one) | Yes | Runs the agency; the only one who signs contracts, invites or removes the Manager, and requests transfer or deactivation |
| Agency | Agency Manager (at most one) | Yes | Same as the Owner except the Owner-only items above; can never remove the Owner |
| Agency | Agency Member | Yes | Works only on projects assigned by the agency (#1–#4) |
| Agency | Agency Freelancer | **No** | Submits through a collection link only (Part 2) |
| None | Direct Freelancer | Yes | Applies and signs as an individual |

Fixed rules: one organization per person; no Team layer; no Finance role in v1; staff roles never come from public sign-up; agency people join only by invitation; nobody sees another agency's data.

## 2. Platform

| Capability | Permission | Super Admin | PM | QC Lead / Reviewer |
|---|---|---|---|---|
| Invite staff; change staff roles; remove staff | `staff.invite`, `staff.manage` | ✅ | ❌ | ❌ |
| Approve, reject or ask for changes on agency sign-ups (ID-42) | `agency.decide` | ✅ | ❌ | ❌ |
| Invite an agency onto the platform (auto-approved, #11) | `agency.invite` | ✅ | ❌ | ❌ |
| Edit, suspend, reactivate, deactivate an agency; reassign ownership; manage agency people | `agency.manage` | ✅ | ❌ | ❌ |
| Decide agency requests (profile change, deactivation, transfer) | `agency_request.decide` | ✅ | ❌ | ❌ |
| View all agencies and users | `agency.view_all`, `user.view_all` | ✅ | ✅ | ❌ |
| Platform-wide audit log (#30) | `audit.view_all` | ✅ | ❌ | ❌ |
| Platform settings (reserved) | `platform.settings` | ✅ | ❌ | ❌ |

## 3. Projects, applications and contracts

PM columns below apply **only to projects assigned to that PM** (`project_managers`); the Operations Manager has the same rights on every project (ID-52).

| Capability | Permission | Super Admin | PM | QC | Owner | Manager | Member | Direct freelancer |
|---|---|---|---|---|---|---|---|---|
| See all projects | `project.view_all` | ✅ | ❌ *assigned only* (`project.view_assigned`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Project Managers to projects | `project.assign_managers` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create, edit, publish, pause, complete, archive; questions; contract | `project.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change questions after applications exist (new version, #22) | `project.questions.relock` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invite an agency to a project **(Q30)** | `project.invite_agency` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| See and decide applications | `application.view_all`, `application.decide` | ✅ | ✅ *assigned* | ❌ | ❌ | ❌ | ❌ | ❌ |
| Countersign for CohortData **(Q28)** | `contract.countersign` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Revoke a project assignment | `assignment.revoke` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| See open jobs | (visibility rule) | — | — | — | ✅ agency jobs | ✅ agency jobs | ❌ (#1) | ✅ individual jobs |
| Apply | `org.projects.apply` / `individual.projects.apply` | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Sign the contract (#24, #25) | `org.contract.sign` / `individual.contract.sign` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ *own* |
| See the agency's applications and contracts | `org.view` | — | — | — | ✅ *agency* | ✅ *agency* | ❌ | ✅ *own* |
| Assign Members to an active project | `org.members.assign` | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| See a project's instructions | (visibility rule) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *assigned* | ✅ *own active* |

Visibility rule for projects (`app.can_view_project`): drafts are staff-only; agencies see published projects for agencies (invite-only ones only when invited) while the agency is active; freelancers see published individual projects; anyone keeps seeing a project they applied to; Members see only projects they are assigned to.

## 4. Agency management

| Capability | Permission | Super Admin | Owner | Manager | Member |
|---|---|---|---|---|---|
| Agency dashboard, members list, invitations | `org.view`, `org.members.view` | ✅ (console) | ✅ | ✅ | ❌ (#4) |
| Invite Members; revoke or resend invitations | `org.members.invite` | ✅ | ✅ | ✅ | ❌ |
| Suspend, restore or remove Members | `org.members.manage` | ✅ | ✅ | ✅ | ❌ |
| Invite or remove the Manager (#5, #6) | `org.manager.manage` | ✅ | ✅ | ❌ | ❌ |
| Remove the Owner | — | via ownership reassignment | n/a | ❌ never | ❌ |
| Request profile changes and document changes (#7, ID-07) | `org.profile.request_change` | edits directly | ✅ | ✅ | ❌ |
| Request ownership transfer to the Manager (#9) | `org.ownership.request` | reassigns directly | ✅ | ❌ | ❌ |
| Request deactivation (#10) | `org.deactivation.request` | deactivates directly | ✅ | ❌ | ❌ |
| Agency activity history (#31) **(Q29)** | `org.audit.view` | ✅ (platform audit) | ✅ | ✅ | ❌ |
| Export members as CSV | `org.members.view` | — | ✅ | ✅ | ❌ |

## 5. Part 2 permissions already seeded

| Permission | Holders | For |
|---|---|---|
| `org.links.manage` | Owner, Manager | Creating collection links (#3: Members can't) |
| `org.submissions.view_all` | Owner, Manager | Seeing every submission in the agency (#2) |
| `member.work` | Member | Submitting on assigned projects |
| `qc.queue.view` | Super Admin, PM, QC Lead, QC Reviewer | QC queue (#43; details in Q27) |

## 6. Limits

- At most 100 invitations per person per hour (ID-40, raised by ID-47 for bulk invite), and 5 sends per invitation. Bulk invite takes up to 100 people per file.
- Document uploads must use the signed upload ticket issued to that person (ID-39).

## 7. Changing who can do what

Permissions are rows in `role_permissions`. To change one, add a migration that inserts or deletes the row, add or adjust a pgTAP test, and run `pnpm db:test`. The UI reads the same permissions through `get_my_context()`, so menus and buttons follow automatically.

## 8. Open permission questions

| ID | Question |
|---|---|
| Q27 | Operations Manager role and two QC levels (Part 2) |
| Q28 | Countersigning: Super Admin only, or PMs too (built: both) |
| Q29 | Agency activity: Owner only, or Manager too (built: both) |
| Q30 | Project invitations: Super Admin only, or PMs too (built: both) |
