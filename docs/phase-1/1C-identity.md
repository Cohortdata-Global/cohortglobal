# 1C — Identity, agencies and invitations

**Status:** database done and tested (`003_agency_rules`, 37 tests); screens written.

## How each kind of person gets in

| Person | Path | Lands on |
|---|---|---|
| Super Admin | Signs up, then the operator runs `pnpm bootstrap:super-admin <email>` once | `/admin` |
| CohortData staff (PM, QC Lead, QC Reviewer) | Invited by the Super Admin from **Staff** | `/admin` |
| Agency, self sign-up | `/sign-up?as=agency` → company details (draft) → documents → **Send application** → locked while the Super Admin reviews (ID-44) | `/onboarding/agency`, then `/agency` |
| Agency, invited | Super Admin invites from **Agencies → Invite agency**; approved automatically (#11) | `/agency` |
| Agency Manager | Invited by the Owner only; one per agency | `/agency` |
| Agency Member | Invited by the Owner or Manager | `/work` (assigned projects only) |
| Direct freelancer | `/sign-up?as=freelancer` → short profile | `/work` |
| Agency freelancer | No account. Collection link only (Part 2) | — |

## Screens

| Screen | Route | Files |
|---|---|---|
| Sign in / sign up | `/sign-in`, `/sign-up` | `src/app/sign-in`, `src/app/sign-up`, `auth-frame.tsx` |
| Choose account type | `/onboarding` | `src/app/onboarding/page.tsx` |
| Freelancer profile | `/onboarding/freelancer` | `freelancer-form.tsx` |
| Agency application, status and re-apply | `/onboarding/agency` | `agency-application.tsx`, `agency-form.tsx`, `document-list.tsx` |
| Accept an invitation | `/invite/[token]` | `src/app/invite/[token]/page.tsx`, `accept-invitation.tsx` |
| Agencies list, review, approve, ask for changes, reject, suspend, edit, transfer | `/admin/agencies`, `/admin/agencies/[id]` | `agency-admin-actions.tsx` |
| Agency requests (profile changes, deactivation, transfer) | `/admin/requests` | `request-decision.tsx` |
| Staff and staff invitations | `/admin/staff` | `staff-actions.tsx`, `invite-dialog.tsx` |
| Your account | `/account` | `account-form.tsx` |

## Server code

- `src/server/auth/viewer.ts` loads the signed-in person with `get_my_context()` and decides where they belong (ID-06).
- `src/server/auth/sync-user.ts` and `src/app/api/webhooks/clerk/route.ts` keep `users` in step with Clerk (AD-2, ID-04).
- `src/server/actions/invitations.ts`, `onboarding.ts`, `agencies.ts`, `staff.ts`, `account.ts` call the database functions.

## Decisions used

Owner: Q2–Q5, #5–#18. Technical: ID-04, ID-06, ID-07, ID-08, ID-09, ID-11, ID-12.

## How to check by hand

1. Bootstrap yourself, open `/admin/staff`, invite a PM (copy the link from the dialog), accept it in a private window.
2. Sign up as an agency in another window, upload a document, then approve it from `/admin/agencies?tab=pending`.
3. As that agency's Owner, invite a Manager and a Member from `/agency/members`. Try inviting a second Manager: it is refused.
4. Reject an agency and check that it can only re-apply after 3 days.
5. Ask an agency for changes and mark a document. As its Owner, try **Send back for review** before uploading a replacement (refused), upload one, send back, and check it is in *Waiting for approval* again.
