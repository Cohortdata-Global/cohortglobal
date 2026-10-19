# CohortGlobal — Architecture Blueprint

**Status:** Phase 1 built (session 3, 2026-10-13). The database layer is implemented and tested; the Next.js app is written but has not been compiled yet (see `docs/phase-1/1F-verification.md`). Section 14 maps this blueprint to what was built.
**Owner:** CohortData
**Last updated:** 2026-10-13, session 3 (Phase 1 built; AD-2 to AD-9 approved)
**Sources:** `docs/Decisions/confirmed-decisions.md` (takes precedence), `docs/Decisions/reference/cohortdb-overview-v1.pdf` (primary reference), `docs/Decisions/reference/Platform Unified PRD and Architecture.docx` (supplementary).

Labels used throughout:

- **Confirmed:** decided by the owner.
- **Proposed:** recommended, waiting for the owner's approval. Proposed items are listed again in section 12.
- **TBD:** an open question, with its ID from the decisions log. It must not be implemented by guessing.

---

## 1. What we are building

CohortGlobal is CohortData's data-collection platform. **(Confirmed)**

- CohortData's parent team publishes projects (jobs).
- External agencies and direct freelancers apply.
- Approved agencies give the work to their logged-in members, or send public submission links to freelancers who have no account.
- Contributors submit audio, image, video, document and PDF data.
- Submissions pass automated validation and parent-team QC, and approved data is delivered.
- Finance is deferred.

There are no sister companies. The organizations are CohortData (parent) and agencies. **(Confirmed)**

## 2. System context

```text
                    ┌──────────────────────────────────────────────┐
 Parent team ──────►│                                              │
 (Super Admin, PM,  │                                              │──► Supabase PostgreSQL
  QC Lead, QC Rev.) │          CohortGlobal (one Next.js app)      │    (business data + RLS)
                    │                                              │
 Agency users ─────►│  parent console · agency portal · contributor│──► Clerk (authentication)
 (Owner, Manager,   │  area · public submission pages · server API │
  Member; logged in)│                                              │──► Resend (email)
                    │                                              │
 Direct freelancers►│                                              │──► Media storage on the
 (logged in)        │                                              │    company 2 TB server (Part 2)
                    │                                              │
 Agency Freelancers (no account, public link only, Part 2) ───────►│
                    └──────────────────────────────────────────────┘
```

## 3. Technology stack

| Area | Choice | Status |
|---|---|---|
| Application | Next.js (App Router), one application | Confirmed |
| UI | React, TypeScript, Tailwind CSS | Confirmed |
| Authentication | Clerk: sign-up, login, password protection and resets only | Confirmed |
| Business data | Supabase PostgreSQL | Confirmed |
| Data protection | User's Clerk identity for normal access; server-side authorization plus RLS; service role only for system operations (AD-1) | **Confirmed** |
| Email | Resend | Confirmed |
| Languages | English only at launch; translation-ready structure | Confirmed (Q9) |
| Media storage | Company 2 TB server; details decided in Part 2 | Direction confirmed; details TBD |
| Hosting | Vercel or own server | TBD (AD-10) |
| Package manager | pnpm | Proposed (AD-3) |
| Migrations | Supabase CLI migrations in `supabase/migrations/` | Proposed (AD-4) |
| Runtime validation | zod | Proposed (AD-5) |
| Translation structure | next-intl with only an English catalogue in v1; Tailwind logical properties so layouts can later work right-to-left | Proposed (AD-6) |
| UI components | shadcn/ui (components copied into the repo, Tailwind-based) | Proposed (AD-7) |
| Tests | Vitest for code; pgTAP (via Supabase CLI) for RLS and constraints | Proposed (AD-8) |
| Error monitoring | Sentry | Proposed, later |

Not used:
- Clerk Organizations or any Clerk feature beyond authentication. **(Confirmed)**
- A separate backend service.
- A second database.

## 4. Application structure (Approved, AD-9)

One Next.js application, split by audience:

| Area | Proposed route prefix | Who | Phase |
|---|---|---|---|
| Public pages, sign-in, sign-up | `/`, `/sign-in`, `/sign-up` | Everyone | 1 |
| Invitation acceptance | `/invite/[token]` | Invited parent staff, agency owners, agency managers and members | 1 |
| Parent-team console | `/admin/...` | Super Admin, Operations Manager, PM (assigned projects only, ID-52), QC Lead, QC Reviewer | 1 (QC in 2) |
| Agency portal | `/agency/...` | Agency Owner, Agency Manager (Members never see it, #4) | 1 |
| Contributor area | `/work/...` | Agency Members, direct freelancers | 1 |
| Public submission page | `/c/[token]` | Agency Freelancers (no account) | 2 |
| Webhooks | `/api/webhooks/clerk` | Clerk | 1 |

Proposed source layout:

```text
src/
  app/                  routes (grouped by audience as above)
  components/           shared UI
  server/
    auth/               session → internal user → roles (authorization helpers)
    db/
      user-client.ts    Supabase client carrying the user's Clerk token (normal access)
      system-client.ts  service-role client (allow-listed system operations only)
    domains/            identity, rbac, projects, applications, contracts,
                        members, links, collection, qc, delivery, audit
  lib/                  shared utilities (dates, phone, ids)
  i18n/                 English message catalogue
scripts/
  bootstrap-super-admin.mjs  one-time operator script (section 6.5)
supabase/
  migrations/           SQL migrations
  tests/                pgTAP tests for RLS and constraints
```

## 5. Identity and registration

### 5.1 Request flow

```text
Browser ──(Clerk session)──► Next.js middleware: is there a valid session?
                                   │
                                   ▼
                     Server code (page, Server Action, Route Handler)
                                   │ 1. read the Clerk user ID from the verified session
                                   │ 2. look up the internal users row by clerk_user_id
                                   │ 3. load the platform role, or organization + agency role
                                   │ 4. check the specific permission for this action
                                   ▼
                     Supabase query through the user client (user's Clerk token)
                                   │
                                   ▼
                     PostgreSQL RLS checks the same boundaries again
```

Clerk proves identity; CohortGlobal's database decides access. The browser never supplies a trusted organization ID or role. **(Confirmed)**

### 5.2 How each kind of person gets in (Confirmed unless marked)

| Person | How they get in | Account? | Result |
|---|---|---|---|
| Super Admin (first) | One-time bootstrap (section 6.5) | Yes | User + Super Admin platform role |
| Parent staff (Operations Manager, PM, QC Lead, QC Reviewer, more Super Admins) | Invitation from a Super Admin | Yes | User + platform role |
| Agency (self sign-up) | Public sign-up choosing "vendor/agency"; the Super Admin approves or rejects | Yes (owner) | User, agency organization (pending), owner membership |
| Agency (invited) | Invitation link from the Super Admin | Yes (owner) | Same as above; whether approval is still needed is TBD (Q20) |
| Agency Manager | Invitation from that agency (who may invite Managers: TBD, Q19) | Yes | Membership with the Manager role |
| Agency Member | Invitation from that agency only | Yes | Membership with the Member role; every later login is as that agency's member |
| Direct freelancer | Public sign-up without an invitation | Yes | User + contributor profile, no organization |
| Agency Freelancer | Public submission link from an agency (Part 2) | **No** | No user record; a link-contributor record (section 8.1) |

- Parent-team access never comes from public sign-up. **(Confirmed)**
- Agency membership never comes from choosing an agency name or email domain. **(Confirmed)**
- A direct freelancer cannot be converted to an agency member; the account is deleted and the person signs up again through the agency invitation. **(Confirmed)**
- One organization per user, enforced by a unique constraint on the membership's user reference. **(Confirmed)**

### 5.3 Creating the internal user record (Proposed, AD-2)

A verified Clerk webhook (`user.created`, `user.updated`, `user.deleted`) creates and updates the internal `users` row. The webhook verifies Clerk's signature, uses the system client, and is idempotent (keyed on `clerk_user_id`). A signed-in user with no `users` row yet is treated as having no access until the row exists.

### 5.4 Invitations (Confirmed principle; details Proposed)

- One `invitations` table with a **purpose**: `PLATFORM_STAFF`, `AGENCY_OWNER`, `AGENCY_MANAGER`, `AGENCY_MEMBER`.
- Each invitation records the inviter, the target organization (if any), the intended role, the invited email, the token hash, the expiry and the status (PENDING, ACCEPTED, EXPIRED, REVOKED).
- The token is 32 random bytes and is shown only once in the link; only its SHA-256 hash is stored.
- Accepting runs one database function in a single transaction. It checks the token, its expiry and status, and that the signed-in user's email matches the invited email. Then it creates the membership and role (or platform role), marks the invitation accepted and writes an audit entry.
- Invitation expiry period: TBD (proposal: 7 days).
- Agency Freelancers are not invited this way. They receive public submission links (section 8.1).

## 6. Data access and security (AD-1, approved 2026-10-12)

### 6.1 The decision

- Normal database access uses the **authenticated user's Clerk identity**.
- **Server-side authorization and Supabase RLS are both enforced.**
- The **service-role key is used only for trusted system operations** that need elevated access.

### 6.2 How the user's identity reaches PostgreSQL (Proposed implementation)

1. Configure **Clerk as a third-party auth provider** in Supabase. Supabase then verifies Clerk-issued session tokens itself; no shared JWT secret is copied around.
2. Clerk session tokens carry the Clerk user ID in `sub`. They must also carry `role: authenticated`, which the Clerk–Supabase integration adds, so that PostgreSQL runs the request as the `authenticated` role.
3. Server code creates the **user client**: a Supabase client using the anon key, with each request's Clerk session token attached.
4. The browser never calls Supabase directly. All queries run in server code (pages, Server Actions, Route Handlers).

### 6.3 RLS design (Proposed implementation)

- **RLS is enabled on every table.** With no matching policy, access is denied.
- The `anon` role gets no table privileges. Public-link traffic (Part 2) goes through server code (section 6.6).
- Small `SECURITY DEFINER` helper functions in a private `app` schema read the trusted tables once per statement. They are `STABLE` and use a fixed `search_path`. All of them return nothing for a user who has no `users` row or is suspended.

| Helper | Returns |
|---|---|
| `app.current_user_id()` | `users.id` for `auth.jwt()->>'sub'`, or null if none or suspended |
| `app.has_platform_role(code)` | Whether the user holds that platform role |
| `app.current_org_id()` | The user's one active organization, or null |
| `app.agency_role(org_id)` | The user's role in that agency, or null |
| `app.is_agency_admin(org_id)` | True for an active Owner or Manager of that agency |

- **Policy pattern.** Separate `SELECT`, `INSERT`, `UPDATE` and `DELETE` policies, each built from these helpers. Example: an agency's applications are readable by that agency's Owner or Manager and by the Super Admin and Project Manager, and by no one else.
- **Protected columns.** Users never change their own role, organization, verification status or approval status. These columns are excluded from user-level `UPDATE` grants, or guarded by triggers, and are changed only through dedicated database functions that check the caller's role.
- **Multi-step business actions** run as database functions (RPC) with their own checks. Examples: accept an invitation, approve an application and create the assignment, remove a Manager. Each runs in one transaction and writes the audit record.
- **Server-side authorization still runs first** in every Server Action and Route Handler. RLS is the second, independent check.

### 6.4 Service-role key: allowed uses only

The service role bypasses RLS, so its use is allow-listed.

| Operation | Why elevated access is needed | Extra protection |
|---|---|---|
| Clerk webhook (create, update, deactivate `users`) | No user session exists | Clerk signature verified; idempotent |
| First Super Admin bootstrap (section 6.5) | No Super Admin exists yet | Operator-only script; refuses if one exists |
| Public submission links (Part 2) | Link users have no account | Token checked on every request (section 6.6) |
| Scheduled jobs (expire invitations, links and sessions) | No user session | Runs only on the server; logged |
| Sending notification emails | Reads recipient details across agencies | Read-only; no user input decides recipients |

Rules:

- The system client lives in one module (`server/db/system-client.ts`) marked server-only, so it cannot be bundled into browser code.
- Every use performs its own authorization or token check first.
- Every use writes an audit entry with `actor = system` and the reason.
- Adding a new use requires owner approval.
- `SUPABASE_SERVICE_ROLE_KEY` is never a `NEXT_PUBLIC_` variable and is never logged.

### 6.5 First Super Admin bootstrap (Confirmed approach, Q5; details Proposed)

The bootstrap is a **command-line script run by an operator**, not a web page or API route, so it cannot be triggered from the internet.

1. The operator signs up normally through Clerk with the intended Super Admin email, so the `users` row exists through the webhook.
2. The operator runs `pnpm bootstrap:super-admin <email>` (`scripts/bootstrap-super-admin.mjs`). It runs on a trusted machine with the service-role key loaded from `.env.local`.
3. In one transaction, the script:
   - creates the CohortData `PLATFORM` organization if missing;
   - **checks that no Super Admin exists**, and stops if one does;
   - grants the Super Admin platform role;
   - writes an audit entry.
4. A database-level guard backs this up: a function, or a partial unique index on a bootstrap marker, so a second bootstrap fails even if the script is run again or modified.
5. After that, Super Admins invite other staff through the app (invitation purpose `PLATFORM_STAFF`).

Protection summary:
- no HTTP entry point;
- needs the service-role key (server operators only);
- works only when zero Super Admins exist;
- audited;
- the email must belong to an already signed-up Clerk account.

There is exactly one Super Admin (#16, #17), enforced by a partial unique index on `user_roles`. The Super Admin cannot be removed or re-roled from the app.

### 6.6 Public submission links (Part 2; confirmed rules plus Proposed design)

| Aspect | Design |
|---|---|
| Who creates | An agency Owner or Manager, only for a project their agency is approved for (Confirmed). Whether the signed contract is a precondition is TBD (Q22). |
| Token | 32 random bytes in the URL (`/c/<token>`); only the SHA-256 hash is stored; shown once at creation, with a copy button |
| Binding | The link row stores the project, the agency, the agency's approved project assignment and the creator. Nothing about attribution is taken from the form. |
| Expiry | 24 hours after creation (Confirmed). Statuses: ACTIVE, EXPIRED, REVOKED. Checked on every request, not only by a scheduled job. |
| Session | 5 hours from start (Confirmed). After a rejection the session reopens only while the link is valid (Confirmed); whether with a fresh 5 hours is TBD (Q10). |
| Checks on every request | Token hash found; link ACTIVE and not expired; project still published; agency assignment still active; agency still active |
| Single or multi-use | TBD (Q17) |
| Revocation | By the creating agency (Confirmed by principle); by the Super Admin: TBD (Q17) |
| Abuse protection | Rate limits per IP and per link; generic error for an invalid, expired or revoked link (no hint which); page marked `noindex`; shows only the project instructions and form, never other submissions |
| Uploads | Direct-to-storage with short-lived, per-session upload permissions (AD-11, Part 2) |
| Data access | Server code using the system client after the checks above; the `anon` role still has no table access |

### 6.7 Security tests required before each feature ships (Proposed)

**Database (pgTAP, `supabase/tests/`)**

1. The `anon` role cannot read or write any table.
2. A Clerk user with no `users` row, or a suspended one, gets no rows from any table.
3. An Agency A Owner or Manager reads and updates Agency A rows, and gets nothing from Agency B (members, invitations, applications, assignments, links).
4. An Agency Member cannot perform Owner or Manager actions (exact list from Q18).
5. A Manager cannot remove or demote the Owner; an Owner can remove a Manager.
6. No user can change their own role, organization, verification status or approval status, even with direct `UPDATE` statements.
7. One-organization-per-user: a second membership insert for the same user fails.
8. Only a Super Admin can approve or reject an agency; only Super Admin and PM can approve or reject applications; only Super Admin can invite parent staff.
9. Invitation acceptance fails for an expired, revoked or used token, and for an email mismatch.
10. A second bootstrap fails when a Super Admin already exists.
11. Projects tagged Agency reject individual applications, and the reverse.

**Application (Vitest, integration)**

12. Every protected Route Handler and Server Action returns 401 without a session and 403 for the wrong role.
13. Changing an ID in a URL or request body to another agency's record returns 403 or 404, never data.
14. The Clerk webhook rejects an invalid signature, and a repeated event is harmless.
15. The system client is imported only by allow-listed modules (checked by a lint rule or test).
16. Part 2: link requests fail after expiry or revocation, for a paused project or revoked assignment, and with a token for another project.

A feature is not done until its tests are written and pass.

## 7. Database domains

One PostgreSQL database. The domains are logical groupings, not separate databases. **(Confirmed by the primary reference)**

```text
D1 Identity & Organizations ─► D2 Roles & Permissions ─► D3 Projects & Requirements
        │                                                        │
        └──────────► D5 Contributors & Memberships ◄── D4 Assignments & Applications
                                   │                             │
                                   └──────────► D6 Collection & Sessions (Part 2)
                                                         │
                                                D7 Automated Checks & QC (Part 2)
                                                         │
                                                D8 Delivery & Results (Part 2)
                                                         │
                                                D9 Earnings & Finance (deferred)
D10 Audit & Notifications: used by every domain, starting in Part 1
```

The candidate tables are **proposed names, not a final schema**. Exact columns are designed in Phase 1B and approved before any migration. Changes from the 2026-10-12 answers are in bold.

| Domain | Candidate tables | Phase |
|---|---|---|
| D1 Identity & Organizations | `users`, `organizations` (PLATFORM or AGENCY; status), `organization_memberships` (unique per user), `agency_profiles`, `contributor_profiles` (direct freelancers and members), **`invitations` (purposes: PLATFORM_STAFF, AGENCY_OWNER, AGENCY_MANAGER, AGENCY_MEMBER)**, **`agency_verification_requests` / `verification_records` (Super Admin decision)** | 1 |
| D2 Roles & Permissions | Built as `roles`, `permissions`, `role_permissions`, `user_roles` (platform and individual roles) and a `role` column on `organization_memberships` (ID-01). **Seed roles: SUPER_ADMIN, PROJECT_MANAGER, QC_LEAD, QC_REVIEWER (platform); AGENCY_OWNER, AGENCY_MANAGER, AGENCY_MEMBER (agency). No FINANCE role. No AGENCY_FREELANCER role (freelancers have no account).** | 1 |
| D3 Projects & Requirements | `projects` (**with `applicant_type`: AGENCY, INDIVIDUAL, BOTH**), `project_versions`, `project_requirements`, `project_quotas`, `project_eligibility_rules`, `project_consent_templates`, **`project_application_questions`**, **`project_contract_templates` (versioned)** | 1 |
| D4 Assignments & Applications | `project_applications`, **`project_application_answers`**, `application_decisions`, **`contract_signatures`**, `agency_project_assignments`, `freelancer_project_assignments`, `assignment_status_history` | 1 |
| D5 Contributors & Memberships | `contributor_qualifications`, `contributor_documents`, **`member_project_assignments` (agency assigns its Members to an approved project)** | 1 |
| D6 Collection & Sessions | `submission_links`, `submission_sessions`, **`link_contributors` (no-login freelancer details per agency)**, `submissions`, `submission_attempts`, `submission_assets`, `submission_metadata`, `consent_records` | 2 |
| D7 Checks & QC | `auto_check_runs`, `auto_check_results`, `qc_tasks`, `qc_review_assignments`, `qc_reviews`, `rejection_reasons`, `qc_review_reasons`, `submission_appeals` | 2 |
| D8 Delivery | `delivery_packages`, `delivery_package_items`, `delivery_manifests`, `delivery_attempts`, `delivery_confirmations` | 2 |
| D9 Finance | deferred | 3 |
| D10 Audit & Notifications | `audit_logs` (append-only), `notifications`, `notification_deliveries`, `notification_templates` | 1 |

**Removed from v1:** any Team layer (Q8), the Finance role (Q7), freelancer user accounts (Q2).

### 7.1 Database conventions (Proposed, from the primary reference)

- UUID primary keys and explicit foreign keys.
- `created_at` and `updated_at` as `timestamptz` (UTC).
- Statuses as constrained values (enum or check constraint).
- Files: storage key, checksum, size and MIME type; never file bytes in PostgreSQL.
- Important business records are archived or status-changed, not deleted.
- History tables for important changes.
- Tokens stored as hashes.
- Indexes follow real queries, for example `project_applications(project_id, status)` and `submissions(agency_id, status, submitted_at)`.
- Phone numbers in E.164, countries as ISO 3166-1 alpha-2, names in any script.

## 8. Main workflows

Statuses come from the primary reference and are **proposed enums**. Final values are approved in each domain's design.

| Workflow | Proposed statuses and steps | Rules |
|---|---|---|
| Agency onboarding (self sign-up) | Sign up as agency → DRAFT (details, then documents) → send → PENDING_VERIFICATION, locked for the agency (ID-44) → Super Admin approves (ACTIVE), asks for changes (CHANGES_REQUESTED, agency sends back with no wait, ID-42) or rejects (REJECTED, with reason) | Super Admin decides (Confirmed). Requirements TBD (Q21); re-apply TBD (Q21). |
| Agency onboarding (invited) | Super Admin sends an AGENCY_OWNER invitation → invitee signs up → organization created | Whether approval is still needed: TBD (Q20) |
| Agency verification later | ACTIVE → SUSPENDED → ACTIVE | Super Admin (Confirmed for approval; suspension assumed to be the same role; confirm) |
| Membership | PENDING (invited) → ACTIVE → SUSPENDED / REMOVED | The Owner can remove a Manager; a Manager cannot remove the Owner (Confirmed). Removal keeps history. |
| Invitation | PENDING → ACCEPTED / EXPIRED / REVOKED | Token hashed; expiry TBD (proposal 7 days) |
| Project lifecycle | DRAFT → PUBLISHED → PAUSED → COMPLETED → ARCHIVED | Super Admin and PM. Archived projects accept nothing. |
| Project application | Applicant answers the questions → PENDING → APPROVED / REJECTED (with reason) | Applicant type must match the project tag (Confirmed). SA and PM decide. |
| Contract | After approval: AWAITING_SIGNATURE → SIGNED | Confirmed that a contract is signed after approval; details TBD (Q22) |
| Project assignment | Created on approval; ACTIVE after the contract is signed (if gated, Q22) → REVOKED | Revocation stops new work and keeps history |
| Agency member assignment | ASSIGNED → UNASSIGNED | Agency-internal; Owner or Manager; no CohortData approval (Confirmed) |
| Link and session (Part 2) | Link ACTIVE (24 h) → EXPIRED / REVOKED; session 5 h | Confirmed; reopen rule details TBD (Q10) |
| Automated checks (Part 2) | PENDING → RUNNING → PASSED / FAILED / ERROR | Duplicates rejected automatically (Confirmed) |
| QC task (Part 2) | QUEUED → ASSIGNED → IN_REVIEW → COMPLETED | QC Lead assigns; parent team only (Confirmed) |
| QC decision (Part 2) | APPROVED / REJECTED / RESUBMISSION_REQUESTED | A rejection carries a remark sent to the submitter (Confirmed) |
| Delivery (Part 2) | APPROVED → PACKAGED → DELIVERY_IN_PROGRESS → DELIVERED / DELIVERY_FAILED | Failed attempts are kept |

### 8.1 How no-login Agency Freelancers are identified and attributed (Part 2; Proposed)

Agency Freelancers have no account (Confirmed, Q2), so they are identified through the link and the form, never through a login.

1. **Attribution comes only from the link.** The link row already holds the project, the agency, the approved assignment and the creator (Owner or Manager). Each session and submission copies these from the link. The agency and "referred by" values are never read from the form. **This makes cross-agency attribution impossible to fake.**
2. **The freelancer's identity is self-declared.** The form collects the fields the project requires: full name, email, phone (E.164), date of birth if needed, and the segment fields (gender, age group, nationality and so on). The AIxBlock public form is the reference.
3. **`link_contributors` record.** One row per agency and person, matched on the normalized email (and phone, if collected). Repeat submissions from the same person through the same agency's links are then grouped, which lets the agency see its freelancers' history. This is not a login and grants no access.
4. **Optional email check.** A one-time code sent to the email before the session starts would confirm the contact for consent withdrawal and duplicate checks. TBD (Q16).
5. **Consent/eKYC.** When the project requires it, the form collects it in the session, and the consent record points to the session and the `link_contributors` row (Confirmed: per project, submitted with the task).
6. **Duplicate checks** use the self-declared identifiers plus file hashes (proposed rules in the decisions log, Q11).
7. **What the freelancer sees.** Only the form and instructions, and the outcome of their own submission while the session is open. They have no dashboard. How rejection remarks reach a freelancer who has no account (email, or shown on the link page while the session is open) is TBD (part of Q16).

### 8.2 Application questions, contracts and the applicant-type tag (v1; Confirmed scope, details TBD)

The decision is confirmed: all three are in v1 (Q6). These details must be defined before Phase 1D:

**Applicant-type tag**
- Each project has `applicant_type`: AGENCY, INDIVIDUAL or BOTH (Confirmed).
- Only matching applicants see the Apply button, and the server rejects mismatched applications.
- Invite-only projects, like AIxBlock's "only for invited agency vendors" job with an invitation-code question: TBD (Q24).
- Changing the tag after applications exist: TBD (Q24).

**Application questions**
- Defined per project by Super Admin or PM, with order and a required flag.
- Proposed answer types: short text, long text, single choice, multiple choice, yes/no. File upload: TBD (Q23).
- Answers are stored per application and shown to the Super Admin and PM when deciding.
- Editing questions after publishing, and editing answers after submitting: TBD (Q23). Proposal: answers lock on submit; edits to questions create a new version.

**Contract after approval**
- A contract template per project, versioned. The text is supplied by CohortData's legal team (TBD: per project or per agency, Q22).
- After approval, the applicant sees "Sign contract".
- The signature record stores who signed, their role, the template version and a hash of the exact text, the time, the IP address and user agent, and the typed full name (click-to-accept). Alternative: an e-signature service (TBD, Q22).
- A downloadable PDF copy for both sides: Proposed.
- TBD (Q22):
  - Who signs for an agency (Owner only, or Owner or Manager).
  - Whether direct freelancers sign.
  - Whether CohortData countersigns.
  - Whether signing is required before the agency can assign members or create links.

## 9. Cross-cutting concerns

- **Audit (Part 1):** append-only `audit_logs` for invitations, acceptance, revocation, role changes, member removal, agency approval or rejection, application decisions, contract signatures, project status changes and every service-role use. The parent team can see audits across all agencies. What agencies can see is TBD.
- **Notifications:** in-app records plus email through Resend. A failed email never reverses a business action. WhatsApp: TBD (Q15).
- **Languages (Confirmed, Q9):** English only at launch. All user-facing text goes through one English message catalogue, and layouts use direction-neutral (logical) CSS, so translations and right-to-left layouts can be added later without rewriting pages. No other languages are built in v1.
- **Time:** stored in UTC; shown in the user's timezone.
- **Sensitive data:** face and voice are biometric data, and ID documents vary by country. Legal review of cross-border transfer is TBD (Q14, Part 2).

## 10. Environments and secrets (Proposed)

Environment variable names only; values never go into the repository.

| Variable | Used by | Visibility |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk in the browser | Public |
| `CLERK_SECRET_KEY` | Clerk on the server | Server only |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Webhook verification | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | User client (sent with the user's Clerk token) | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | System client and bootstrap script | Server only |
| `RESEND_API_KEY` | Email | Server only |

Environments: local (Supabase local stack) → staging → production. Hosting: TBD (AD-10).

## 11. Phases

| Phase | Scope |
|---|---|
| 0 | Documentation and blueprint (this document) |
| 1A | Project scaffold (no business features) |
| 1B | Database design and migrations for D1, D2 and the D10 audit baseline: RLS helpers, policies and pgTAP tests (section 6.7) |
| 1C | Identity flows: Clerk webhook, bootstrap script, registration paths, agency sign-up and Super Admin approval, Super Admin agency invitations, agency member and manager invitations, staff invitations |
| 1D | D3 and D4: projects with applicant-type tag, application questions, applications, decisions, contracts |
| 1E | D5 and portals: agency members, member assignment to approved projects, dashboards |
| 1F | Hardening: full security test pass, audit coverage, translation-ready check, mobile checks |
| Part 2 | D6 to D8: public links, link contributors, sessions, submissions, validation, QC, delivery, storage |
| Part 3 | D9: finance, plus the Finance role |

The live task list is in `docs/TODO.md`.

## 12. Architectural decisions

| ID | Decision | Status |
|---|---|---|
| AD-1 | Database access: user's Clerk identity, server-side authorization and RLS; service role only for allow-listed system operations (section 6) | **Approved 2026-10-12** |
| AD-2 | Create internal users through a verified Clerk webhook | **Approved 2026-10-13** |
| AD-3 | Package manager: pnpm | **Approved 2026-10-13** |
| AD-4 | Migrations: Supabase CLI | **Approved 2026-10-13** |
| AD-5 | Runtime validation: zod | **Approved 2026-10-13** |
| AD-6 | Translation structure: next-intl with an English-only catalogue in v1 | **Approved 2026-10-13** |
| AD-7 | UI component kit: shadcn/ui | **Approved 2026-10-13** |
| AD-8 | Tests: Vitest and pgTAP | **Approved 2026-10-13** |
| AD-9 | Route structure as in section 4 | **Approved 2026-10-13** |
| AD-10 | Hosting | TBD |
| AD-11 | Media storage and upload path | TBD (Part 2) |

## 13. Consequences of the 2026-10-12 decisions

**Schema**
- Agency Freelancers are not users and have no role. They appear only in `link_contributors` (Part 2).
- The role seed has three agency roles and four platform roles. No Finance role; no Team table.
- New tables: `project_application_questions`, `project_application_answers`, `project_contract_templates`, `contract_signatures`, `member_project_assignments`.
- `projects.applicant_type` is new.
- `invitations` gains purposes for agency owners (Super Admin invites) and platform staff.
- Agency approval is recorded as a Super Admin decision with a reason.

**Permissions**
- Owner and Manager share one capability set. The only confirmed difference: the Owner can remove a Manager, and a Manager cannot remove the Owner. Further differences are TBD (Q19).
- Agency approval belongs to the Super Admin only.
- Staff invitations belong to the Super Admin only.

**Workflows**
- Projects get an approval → contract signing step.
- Applications include answers.
- Two agency onboarding paths.
- The bootstrap is an operator procedure, not an app feature.

**UI**
- English only. No language switcher in v1.
- No freelancer accounts, so no freelancer dashboard. Agency portals show freelancers through their link submissions.

## 14. As built in Phase 1 (2026-10-13)

The blueprint above is the plan; this section records where the build differs or adds detail. Each module has its own page in `docs/phase-1/`, and every technical choice is in `docs/Decisions/implementation-decisions.md`.

| Topic | As built | Where |
|---|---|---|
| Writes | Every write is a `SECURITY DEFINER` function in `public` with `search_path = ''`. Signed-in users only have `SELECT`, filtered by RLS. `anon` has nothing. | `supabase/migrations/…0600…`–`…1000…` |
| Permissions | Data-driven: `role_permissions` seed; `get_my_context()` returns the permissions the UI uses. The server still checks in SQL. | `…0500_roles_seed.sql`, `src/server/auth/viewer.ts` |
| Errors | Custom SQLSTATEs `CG401`, `CG403`, `CG404`, `CG409`, `CG422` mapped to messages in `src/server/errors.ts`. | |
| Routing | `homeFor()` sends staff to `/admin`, Owner/Manager to `/agency`, Members and direct freelancers to `/work`, applying agencies to `/onboarding/agency`, suspended accounts to `/account/suspended`. | `src/server/auth/viewer.ts` |
| Contracts | Approval creates an assignment `AWAITING_SIGNATURE` → applicant signs → `AWAITING_COUNTERSIGNATURE` → CohortData countersigns → `ACTIVE`. Both signatures store the SHA-256 of the exact text. | `…0900_project_functions.sql` |
| Agency documents | Private Supabase Storage bucket `agency-documents`, opened through 60-second signed URLs (ID-12, Q31). | `src/server/storage/documents.ts` |
| Email | Outbox table drained after the response (`after()`); Resend over HTTPS; logged to the console when no key is set. Invitation emails are sent directly so raw tokens are never stored (ID-09). | `src/server/email/` |
