# 1D — Projects, applications and contracts

**Status:** database done and tested (`004_projects_contracts`, 43 tests); screens written.

## The flow

```
Draft ──publish──▶ Open ◀──▶ Paused ──▶ Completed ──▶ Archived
                    │
           apply (answers) ──▶ Pending ──approve──▶ assignment: waiting for signature
                                  │                    │ applicant signs (Owner for agencies)
                               reject (reason)         ▼
                                                    waiting for CohortData ──countersign──▶ Work open
```

- Publishing needs a contract and a description (ID-13).
- The applicant type (agencies / individuals / both) locks once someone applies (#20).
- Questions: short answer, paragraph, one choice, several choices, yes/no (#21). After applications exist only the Super Admin can change them, which creates a new version (#22).
- Answers can't be edited (#23). Applicants can withdraw while pending.
- One contract per project, versioned once signed (#27, ID-18). Click-to-accept with a typed name; time, IP and browser are recorded (#26).
- Invite-only projects are visible only to the agencies invited to them (#19).

## Screens

| Screen | Route | Files |
|---|---|---|
| Projects list with status tabs | `/admin/projects` | `src/app/admin/projects/page.tsx` |
| New project | `/admin/projects/new` | `project-form.tsx` |
| Project: overview, job page, questions, contract, invited agencies, history | `/admin/projects/[id]?tab=…` | `questions-editor.tsx`, `contract-editor.tsx`, `project-status-actions.tsx`, `project-admin-actions.tsx` |
| Review applications (list and detail with answers and stage track) | `/admin/projects/[id]/applications` | same |
| Contracts to countersign | `/admin/contracts` | `CountersignDialog` in `project-admin-actions.tsx` |
| Job list and job page (agency) | `/agency/jobs`, `/agency/jobs/[id]` | `src/components/app/job-pages.tsx`, `apply-flow.tsx` |
| Job list and job page (freelancer) | `/work/jobs`, `/work/jobs/[id]` | same components, `mode="individual"` |

## Decisions used

Owner: Q6, #19–#29. Technical: ID-13, ID-14, ID-15 (Q28), ID-17 (Q30), ID-18, ID-19.

## How to check by hand

1. As a PM, create a project, try to publish (refused), add a contract, publish.
2. As an approved agency's Manager, apply. As the Owner, open the job: the sign panel appears after approval; the Manager sees "Only the Agency Owner can sign".
3. As the PM, approve, then countersign from `/admin/contracts`. The agency's job page now says "Work is open".
4. Edit the contract after signing: version 2 is created; the signed assignment keeps version 1.
