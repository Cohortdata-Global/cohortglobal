# 1E — Portals and dashboards

**Status:** screens written.

## CohortData console (`/admin`)

| Page | What it shows |
|---|---|
| Overview | Agencies waiting, active agencies, open projects, applications to decide, contracts to countersign; latest applications; agencies waiting |
| Projects | See 1D |
| Contracts | Tabs: to countersign, waiting for applicant, signed by both, revoked |
| Agencies, Agency requests | See 1C |
| Staff | People and invitations; change role; remove access (not the Super Admin) |
| Audit log | Platform-wide, Super Admin only (#30); search and area filter |

The sidebar shows counts for anything waiting on a decision. Menu items appear only when the person has the permission.

## Agency portal (`/agency`, Owner and Manager)

| Page | What it shows |
|---|---|
| Dashboard | Active projects, contracts to sign, members, member assignments; each application with its stage track; next steps (sign a contract, invite a Manager, invite the team, open jobs) |
| Jobs | Open jobs and "My applications"; job page with apply and sign |
| Projects | Projects the agency is approved for; per project, assign and unassign Members; collection links placeholder (Part 2) |
| Members | People and invitations; invite (Manager option only for the Owner and only if there is none); suspend, restore, remove; CSV export |
| Company profile | Verified details; change request with documents; request history; Owner-only transfer and deactivation requests |
| Activity | The agency's own audit history (#31; Owner and Manager, ID-16) |

A banner explains what still works when the agency is suspended or deactivated.

## Contributor workspace (`/work`)

| Person | Sees |
|---|---|
| Agency Member | "My projects": only projects assigned to them (#1, #4). No job list, no agency data. |
| Direct freelancer | Dashboard (active projects, contracts to sign, in review, open jobs), Jobs, application stage tracks |

The project page shows instructions and a placeholder for submissions (Part 2).

## Shared

- `/account` for every signed-in person; email and password changes go through Clerk ("Email and password" in the account menu).
- Notifications bell in the top bar (in-app notifications written by the database functions).
- Loading skeletons on every surface, a friendly 404 and an error page with a reference code.

## Files

`src/app/admin/*`, `src/app/agency/*`, `src/app/work/*`, `src/app/account/page.tsx`, `src/components/app/*`, `src/components/flows/agency-portal-actions.tsx`, `staff-actions.tsx`, `account-form.tsx`.
