# Phase 1 — Platform foundation

Built in session 3 (2026-10-13). Phase 1 is split into six modules. Each page says what the module contains, which files hold it, which decisions it rests on, and how to check it.

| Module | What it is | Status | Page |
|---|---|---|---|
| 1A | Project scaffold: Next.js, tooling, design system, shell | Written; not yet compiled (npm blocked in the build environment) | `1A-scaffold.md` |
| 1B | Database: tables, roles, RLS, audit | Done and tested (116 pgTAP tests pass) | `1B-database.md` |
| 1C | Identity: sign-up paths, invitations, agency approval, requests | Database done and tested; screens written | `1C-identity.md` |
| 1D | Projects, applications and contracts | Database done and tested; screens written | `1D-projects.md` |
| 1E | Portals and dashboards (console, agency portal, workspace) | Screens written | `1E-portals.md` |
| 1F | Verification and what is left to harden | Partly done | `1F-verification.md` |

The life of a piece of work, end to end:

1. The Super Admin bootstraps their account, invites staff and agencies, or approves agencies that sign up.
2. A Project Manager creates a project (job page), adds questions and a contract, and publishes it.
3. An agency (Owner or Manager) or a direct freelancer applies with answers.
4. CohortData approves → the applicant signs (the Owner for an agency) → CohortData countersigns → work is open.
5. The agency assigns its Members, who see only those projects. Collection links and submissions come in Part 2.

Every step shows the same stage track: Applied → Approved → Contract signed → CohortData signed → Work open.

Decisions: owner decisions are in `../Decisions/confirmed-decisions.md`; technical ones (ID-01 to ID-31) are in `../Decisions/implementation-decisions.md`.
