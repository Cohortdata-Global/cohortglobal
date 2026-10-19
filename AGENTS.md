# AGENTS.md — CohortGlobal AI Development Instructions

## 0. Primary Project Reference and Development Status

### 0.1 Primary source of truth

The primary project reference for CohortGlobal is:

`docs/Decisions/reference/cohortdb-overview-v1.pdf`

Every AI coding agent must read and understand this document before proposing major architectural changes, designing the database, defining business rules or developing major features.

The supplementary reference is:

`docs/Decisions/reference/Platform Unified PRD and Architecture.docx`

The owner's confirmed decisions are recorded in:

`docs/Decisions/confirmed-decisions.md`

The confirmed decisions log records the owner's most recent explicit decisions. Where it disagrees with the PDF or the PRD, the decisions log takes precedence. If a conflict is not covered by the decisions log, identify the exact discrepancy and ask the project owner. Do not silently override any document or invent a resolution.

### 0.2 Development status

Project documentation describes the intended system. It does not prove that any feature has been implemented.

Before working on a feature, inspect the repository to determine what actually exists.

Always distinguish between:

- **Planned:** Described as part of the intended system.
- **Approved:** Explicitly authorized by the project owner.
- **Implemented:** Present in the codebase.
- **Verified:** Tested or otherwise checked against the actual implementation.
- **Pending:** Not yet implemented, not yet approved, or awaiting clarification.

Do not describe planned functionality as completed functionality.

### 0.3 Before starting any session

1. Read `AGENTS.md` and `CLAUDE.md`.
2. Read `docs/TODO.md` to see what is current, next and blocked.
3. Read the latest entries in `docs/JOURNAL.md` to see what happened in previous sessions.
4. Read `docs/Decisions/confirmed-decisions.md`.
5. Read the primary reference, and the supplementary PRD when relevant.
6. Read `docs/architecture.md` and `docs/permissions.md`.
7. Read the relevant specialist skill.
8. Inspect the actual repository and identify what has already been implemented.
9. Present findings and a proposed plan.
10. Wait for explicit approval before implementing changes.

### 0.4 At the end of every session (mandatory)

1. **Update `docs/JOURNAL.md`** with a new dated entry: goal, what was done, decisions made, mistakes or problems and how they were fixed, files changed, verification performed, and next steps. Never rewrite or delete earlier entries; correct them with a new entry instead.
2. **Update `docs/TODO.md`**: tick completed items, add new items, move items between sections, and link items to open questions.
3. **Update `docs/Decisions/confirmed-decisions.md`** if the owner confirmed or changed a decision.

A session is not complete until the journal and to-do list are updated.

---

## 1. Purpose of This File

This file defines the general development rules for CohortGlobal.

Any AI coding agent working in this repository must read and follow these instructions before analyzing, proposing, or implementing changes.

The goal is to make development secure, understandable, maintainable, and consistent with the approved business requirements.

These instructions apply to:

- Application architecture and technical decisions.
- Database design and migrations.
- Backend logic and API development.
- Frontend development and user experience.
- Authentication and authorization.
- Organization-level (agency-level) data isolation.
- Workflow status integrity (applications, submissions, QC, delivery).
- Testing, debugging, and code review.
- Project documentation.

If the repository contains more specific instructions for a directory or task, read those too. If instructions conflict, identify the conflict and ask for clarification instead of silently choosing one.

**Most important rule: Understand first. Propose second. Wait for approval. Implement only what was approved. Verify the result.**

---

## 2. Project Context

### 2.1 What is CohortGlobal?

- **CohortData** is the company.
- **CohortGlobal** is the product: CohortData's data-collection platform.

CohortGlobal is run by CohortData to collect data (audio, image, video, documents and PDF) through external **vendors and agencies** and **individual freelancers**. CohortData has no sister companies. The organizations on the platform are CohortData itself (the parent organization) and the agencies that work for it.

The core workflow:

1. CohortData's parent team (Super Admin, Project Manager) creates and publishes **projects (jobs)**.
2. **Agencies** and **direct freelancers** apply. The parent team approves or rejects each application, per project.
3. An approved agency decides internally who does the work. It assigns its own **members**, or sends **public links** to its **freelancers**, who can submit without logging in. Those submissions are attributed to the agency.
4. Each submission passes **automated metadata and duplicate validation**, then enters the **QC queue**.
5. The **QC Lead** (parent team) assigns submissions to **QC Reviewers** (parent team), who approve or reject them. A rejection always carries a remark that is sent back to the submitter.
6. Approved data is **delivered**.
7. **Finance** (invoices and payments) is deferred to a later version.

A reference application (AIxBlock's agency vendor portal) was used to understand the user experience. It is a reference, not a specification: CohortGlobal follows its own confirmed decisions.

### 2.2 Participants

- **Parent team (CohortData):** Super Admin, Project Manager, QC Lead, QC Reviewer. (The Finance role is deferred to Part 3.)
- **Agency:** Agency Owner and Agency Manager (same powers; the Owner can remove a Manager, not the reverse), Agency Member (the agency's employee, joins only by that agency's invitation, logs in), and Agency Freelancer (**no account**: submits only through a public link generated by the agency).
- There is no Team layer in v1.
- **Direct freelancers:** individuals who register on CohortGlobal and apply to projects without an agency.

Exact permissions are maintained in `docs/permissions.md` and must come from confirmed decisions, never from assumptions.

### 2.3 Build phases

1. **Part 1 — Platform foundation:** identity, organizations, roles, invitations, projects/jobs, applications, agency approval, agency member assignment, portals and dashboards.
2. **Part 2 — Data collection:** public links, sessions, submissions, metadata validation, QC, delivery, storage.
3. **Part 3 — Finance:** invoices and payments. Not in v1.

Do not build features from a later part without explicit approval.

### 2.4 International context

Vendors and contributors come mainly from Singapore, Saudi Arabia, the UAE, Indonesia, Brazil and India. CohortGlobal must be a production-grade, official application. English only at launch, with a translation-ready structure (one English message catalogue, direction-neutral layouts) but no other languages built in v1. Design for UTC timestamps, international phone numbers (E.164), ISO country codes, non-Latin names, mobile-first pages and low-bandwidth users. Face and voice data are sensitive or biometric data under the privacy laws of every operating country. See `docs/Decisions/confirmed-decisions.md`.

### 2.5 Source of truth order

1. Explicit decisions and approvals from the project owner (recorded in the decisions log).
2. The primary reference PDF and the supplementary PRD.
3. Approved architecture documents (`docs/architecture.md`, `docs/permissions.md`).
4. The current repository and its actual implementation.
5. Other project documentation, after checking its accuracy.
6. General technical knowledge and AI recommendations.

If the code and the requirements disagree, report the discrepancy. Do not invent requirements to fill gaps.

---

## 3. Required Technology Stack

| Area | Intended technology |
|---|---|
| Main application | Next.js (single application) |
| UI framework | React |
| Programming language | TypeScript |
| Styling | Tailwind CSS |
| Authentication | Clerk (authentication only) |
| Database | Supabase PostgreSQL with Row-Level Security |
| Business email | Resend |

Clerk is used only for sign-up, login, password protection and password resets. The Clerk user ID is mapped to an internal user record in Supabase. Other Clerk features (such as Clerk Organizations) are not used; organizations, memberships and roles live in the CohortGlobal database.

Hosting (Vercel or an own server) and media storage details (the company's 2 TB server) are decided later. Do not assume them.

### 3.1 Technology rules

- Prefer the approved stack when it meets the requirement.
- Do not replace an approved technology without explicit approval.
- Do not introduce additional frameworks, databases, authentication providers, or infrastructure without explaining why and obtaining approval.
- Do not create a separate backend service by default. Prefer one Next.js application using Route Handlers, Server Actions and server-side functions.
- Do not assume that a library is installed simply because it is commonly used with the stack.
- Check the package manager, existing dependencies, scripts, and configuration before proposing changes.
- Do not upgrade major dependency versions merely to resolve a small issue.
- Explain meaningful trade-offs in plain language before requesting an architectural decision.

---

## 4. Mandatory Approval-First Workflow

### Phase 1: Understand

1. Restate the requested outcome.
2. Inspect relevant files and existing behavior.
3. Read the applicable instructions and skills.
4. Identify affected components, APIs, database tables, permissions, and integrations.
5. Determine what is known, what is assumed, and what remains unclear.
6. Check whether the requested change conflicts with an existing decision.

Do not begin editing files while conducting this analysis.

### Phase 2: Plan

Present a proposal containing:

- **Objective**
- **Current state**
- **Findings**
- **Proposed approach**
- **Files affected**
- **Database impact**
- **Security impact** (authentication, authorization, organization isolation, sensitive data)
- **Testing plan**
- **Risks and trade-offs**
- **Open questions**
- **Approval required:** the exact work awaiting permission.

### Phase 3: Wait

After presenting the proposal, stop. Do not edit files, run mutating commands, generate migrations, install dependencies, or execute implementation steps until the owner explicitly approves.

A request to analyze, investigate, explain, or propose is not permission to implement. Silence is not approval. Approval for one change is not approval for unrelated improvements.

If two sources conflict, overlap or leave a gap, ask the owner before deciding.

### Phase 4: Implement

1. Re-read the approved scope.
2. Make only the authorized changes.
3. Follow the relevant specialist skill.
4. Preserve existing behavior unless a change is approved.
5. Apply security controls at the appropriate layers.
6. Write or update relevant tests.
7. Avoid unrelated refactoring and speculative features.

If implementation reveals a new requirement, a security concern or a need to exceed the approved scope, stop and ask.

### Phase 5: Verify

1. Review the changed files.
2. Run relevant tests, type checking, linting and build checks where configured.
3. Test relevant authorization boundaries.
4. Inspect database changes and migration behavior where applicable.
5. Report failures and unresolved issues.

Never claim that a command, test, deployment, or verification succeeded unless it was actually executed and its result was checked.

### Phase 6: Report and record

Provide a completion report (completed work, files changed, decisions, verification, security checks, remaining issues, scope confirmation). Then update `docs/JOURNAL.md` and `docs/TODO.md` (see section 0.4).

---

## 5. Project Instructions and Specialist Skills

### 5.1 Root and documentation files

| File | Purpose |
|---|---|
| `AGENTS.md` | Shared development rules (this file). |
| `CLAUDE.md` | Claude Code entry point and workflow. |
| `FORME.md` | Human-readable explanation of the project. |
| `docs/architecture.md` | Intended system architecture (blueprint). |
| `docs/permissions.md` | Role and capability matrix. |
| `docs/Decisions/confirmed-decisions.md` | Owner-confirmed decisions and open questions. |
| `docs/JOURNAL.md` | Session-by-session log of work, decisions, mistakes and fixes. |
| `docs/TODO.md` | Current, next, later and blocked work. |
| `README.md` | Setup instructions (to be created when the application is scaffolded). |

Do not create duplicate instruction systems or competing sources of truth.

### 5.2 Specialist skills

Skills live under `.claude/skills/<skill-name>/SKILL.md`:

- `database-architect`: schema, migrations, constraints, RLS.
- `backend-architect`: Route Handlers, Server Actions, authorization, Clerk and Supabase integration, workflows.
- `full-stack-developer`: approved end-to-end features.
- `project-documentation-architect`: documentation structure and accuracy.
- `technical-documentation-writer`: writing or substantially updating `FORME.md`.

A skill provides additional detail; it does not override the approval-first rule or weaken security requirements in this file.

---

## 6. Organization-Level Data Isolation

Organization isolation is a fundamental security requirement. The organizations in CohortGlobal are **CohortData (the parent organization)** and **agencies**.

A user must not gain access to another agency's data by changing a URL, request parameter, record ID, browser state, or client-side value.

### 6.1 Core rules

- A user belongs to **at most one organization**. Direct freelancers belong to none.
- Agency users see only their own agency's members, applications, project assignments, links, submissions and (later) finances.
- Direct freelancers see only their own profile, applications and submissions.
- Parent-team access is role-based (for example, QC Reviewers see only what they are authorized to review). Belonging to CohortData does not grant unrestricted access.
- Agency approval for a project does not grant access to other projects or to platform-wide data.
- Never infer permissions from an email address, display name, selected organization in the UI, or a client-submitted organization ID. Resolve organization scope from trusted server-side data.
- Treat missing, conflicting, or invalid organization context as an authorization failure.

### 6.2 Required authorization checks

For every protected operation, determine:

1. Who is the authenticated user (Clerk session verified on the server)?
2. Which internal user does that identity map to, and is the account active?
3. Which platform role or organization role does the user hold?
4. Which organization (if any) does the user belong to?
5. Does the requested record belong to an allowed scope (organization, project, assignment, link)?
6. Is the requested action permitted for that role?
7. Is the action valid under the business rules (for example, project status, link expiry)?

Apply these checks to reads, writes, updates, deletes, exports, file downloads and background processing. Do not rely on an earlier page-level check.

### 6.3 Pay special attention to

- Dynamic route IDs and request parameters.
- Joins and aggregations on dashboards.
- Search, filtering, pagination, sorting.
- CSV exports and bulk operations.
- Public collection links and their tokens.
- File metadata and download URLs.
- Error messages and logs that could reveal other organizations' data.

### 6.4 Security tests

Where applicable, test that:

- A user from Agency A cannot access Agency B's records by changing an ID.
- An Agency Manager cannot read or modify another agency's members, links or submissions.
- A direct freelancer cannot access other freelancers' records.
- A public link cannot be used for a different project or agency, or after it expires.
- Parent-team roles can only perform the actions their role allows.
- Unauthorized writes are rejected even if the UI exposes a request.

A successful login does not prove that authorization is correct.

---

## 7. Authentication and Authorization

- **Authentication** establishes who the user is (Clerk).
- **Authorization** determines what that user may access or do (CohortGlobal server logic and RLS).

### Rules

- Verify authentication in server-side code for every protected request.
- Check authorization separately for each protected operation.
- Never trust role names or permissions submitted by the browser.
- A valid Clerk session does not grant access to any business data by itself.
- Parent-team access is granted only through authorized provisioning or invitation, never by choosing an option on a public sign-up form.
- Agency membership is created only through a valid agency invitation, never by selecting an agency name or email domain.
- Protect server-side secrets and privileged database access.
- Return safe errors without exposing internal details.
- Use the least privilege necessary.

Do not design the final role model, membership tables or permission overrides by guesswork. Follow `docs/permissions.md` and the decisions log, and ask when they are silent.

---

## 8. Database and Supabase Rules

### 8.1 Before changing the database

1. Inspect the existing schema and migration history.
2. Identify affected tables, relationships, constraints, and queries.
3. Confirm ownership and organization boundaries.
4. Review the effect on existing records.
5. Propose the schema and migration changes.
6. Explain data migration and rollback considerations.
7. Wait for explicit approval.

### 8.2 Design principles

- UUID primary keys and explicit foreign keys.
- Unique and check constraints for business rules (for example, one organization per user).
- `timestamptz` stored in UTC.
- Separate status fields for separate processes (application, assignment, submission, QC, delivery).
- Preserve history: approvals, rejections, QC decisions and status changes are recorded, not overwritten.
- Store hashes of link and invitation tokens, never the raw tokens.
- Large files live outside PostgreSQL; the database stores references and metadata.
- Indexes follow real query patterns.
- Every change goes through a migration file with a traceable history.

Do not add tables or columns solely because they seem useful.

### 8.3 Row-Level Security

- Enable RLS on every table that holds organization-owned or sensitive data.
- Policies must enforce the intended boundaries using trusted identity data.
- Consider `SELECT`, `INSERT`, `UPDATE` and `DELETE` independently.
- Test allowed and denied operations.
- RLS is an additional layer, not a replacement for server-side authorization.
- Never expose the Supabase service-role key to client-side code. Privileged access must be narrow and must not bypass the authorization model accidentally.

---

## 9. Backend and API Rules

- Keep secrets, privileged database operations and authorization logic on the server.
- Validate all incoming data before use.
- Treat all client-provided IDs, filters, organization identifiers, link tokens and file references as untrusted.
- Enforce business rules and status transitions on the server.
- Return predictable responses and appropriate HTTP status codes.
- Handle errors without exposing secrets or unauthorized data.
- Use transactions where consistency requires them (for example, creating an agency together with its owner membership).
- Do not create a separate backend service without approval.

---

## 10. Workflow and Status Integrity

CohortGlobal is a workflow platform. Its statuses are business facts.

Before implementing a workflow, establish:

- Its states and allowed transitions.
- Who may perform each transition.
- What is recorded for each transition (actor, time, reason or remark).
- What happens on rejection, resubmission, revocation, expiry and duplicates.
- Which confirmed decision defines it.

### Safeguards

- Never invent or silently change a workflow rule, status, duplicate rule, link or session rule.
- Keep each status in one source of truth.
- Distinguish: registered vs verified vs approved for a project vs assigned work; submitted vs validated vs reviewed vs approved vs delivered.
- Dashboard counts must be derived from the same records the workflow uses, and must respect organization scope.
- Test boundary cases: expired links, reopened sessions, duplicate submissions, revoked assignments.

If a rule is ambiguous, propose alternatives and wait for a decision.

---

## 11. Frontend and User Experience Rules

- Follow the established design system and component patterns once they exist.
- Build mobile-first and test at phone widths.
- Keep user-facing text in the English message catalogue and use direction-neutral (logical) CSS, so translations can be added later. v1 ships in English only; do not build other language interfaces.
- Display times in the user's timezone; store them in UTC.
- Handle loading, empty, error and success states.
- Make forms accessible with useful validation feedback.
- Treat client-side filtering as presentation, not security.

Do not introduce a new component library, state-management library or styling system without explaining why and obtaining approval.

---

## 12. File Uploads and Storage

File uploads are central to Part 2. Before implementing file handling, establish:

- Which users and links can upload, and to which project.
- Which records files belong to.
- Who can view, download, replace, or delete them.
- How organization ownership is enforced.
- File type and size limits.
- How sensitive (biometric) data is protected, retained and deleted.
- How unauthorized downloads are prevented.

Never assume an unguessable filename or hidden UI control makes a file private. Large files must not be streamed through request bodies that have small limits. Storage design is an approval-required decision.

---

## 13. Environment Variables and Secrets

Never commit secrets. Examples: Clerk secret key, Clerk webhook secret, Supabase service-role key, database credentials, Resend API key.

- Use environment variables for secrets and deployment-specific configuration.
- Keep `.env.example` limited to variable names and safe placeholders.
- Never move a server-only secret into a `NEXT_PUBLIC_` variable.
- Never print full secret values while debugging.
- If a secret is found in tracked files, report it and recommend remediation.

---

## 14. Testing and Verification

Testing is part of implementation.

Depending on the change: unit tests, integration tests, RLS policy tests, authorization and organization-isolation tests, migration checks, type checking, linting, production build, and manual verification of key workflows.

Security-focused cases: unauthenticated requests, invalid sessions, wrong roles, cross-agency access, unauthorized writes, invalid identifiers, malformed input, expired or foreign links, unauthorized exports or downloads.

Report each check as **Passed**, **Failed**, **Not run**, **Blocked** (with reason) or **Not applicable**. A successful build does not prove that authorization or workflow logic is correct.

---

## 15. Coding Standards and Maintainability

- Follow existing repository conventions.
- Use clear names that describe business meaning.
- Prefer small, focused functions and components.
- Use explicit types; avoid `any`.
- Avoid duplicated business logic.
- Handle expected errors explicitly; never swallow exceptions.
- Comment important reasoning, not obvious code.
- Keep dependencies and abstractions proportional to the problem.

---

## 16. Dependencies, Commands, and Destructive Changes

Approval is required before: installing or removing dependencies, major upgrades, replacing configuration, generating or applying migrations, resetting or deleting databases, deleting important files, rewriting Git history, changing auth configuration, modifying deployment infrastructure, deploying, or changing production data.

Read-only inspection is allowed during analysis. Explain the impact of risky commands and safer alternatives before requesting approval.

---

## 17. Documentation Rules

- Distinguish planned, approved, implemented and verified.
- Use real file paths, table names and routes only after verifying them.
- Mark unresolved questions explicitly.
- Never invent historical bugs, incidents or lessons learned. The journal records only what actually happened.
- Never expose secrets or sensitive personal information.
- Avoid competing sources of truth.
- Update affected documentation after approved implementation changes.
- Update `docs/JOURNAL.md` and `docs/TODO.md` at the end of every session.

`FORME.md` must remain understandable to newcomers while accurately describing the verified implementation and labelling planned functionality.

---

## 18. Git and Change Management

The repository is not yet under Git. Once it is:

- Inspect the working tree before modifying code.
- Do not overwrite or discard unrelated work.
- Review the diff after changes; check for secrets, debug statements and unrelated edits.
- Do not automatically commit, push, merge, rebase or release unless explicitly authorized.
- Never use destructive Git commands without approval.

---

## 19. How to Handle Uncertainty

- **Minor implementation detail:** low risk, reversible, within scope → follow existing conventions and mention the choice.
- **Business-rule ambiguity:** affects workflows, permissions or who can see data → ask the owner.
- **Architectural decision:** new technology, service or major abstraction → explain options and wait for approval.
- **Security uncertainty:** auth, isolation, files, sensitive data → do not guess; propose a safe approach for approval.
- **Conflicting or overlapping documents:** identify the conflict, explain the consequences and ask which takes precedence.

Ask focused questions and do not repeat questions already answered in the decisions log.

---

## 20. Communication Standards

- Explain technical concepts in plain English.
- Explain why a recommendation is appropriate.
- Prefer concrete file paths, examples and consequences.
- Present alternatives when there is a meaningful trade-off and identify the recommended option.
- Separate facts, assumptions, recommendations and unresolved questions.
- Make it clear exactly what the owner is approving.

---

## 21. Definition of Done

- [ ] Behavior matches the approved requirements and confirmed decisions.
- [ ] Implementation stays within the approved scope.
- [ ] Authentication and authorization are enforced on the server.
- [ ] Organization (agency) isolation is preserved and tested.
- [ ] Input validation and error handling are appropriate.
- [ ] Database constraints, RLS and migrations are correct where relevant.
- [ ] Workflow statuses and transitions match approved definitions.
- [ ] Relevant tests were added and executed, with results recorded.
- [ ] No secrets or unauthorized data are exposed.
- [ ] The diff was reviewed for unrelated changes.
- [ ] Documentation is updated where required.
- [ ] `docs/JOURNAL.md` and `docs/TODO.md` are updated.
- [ ] Remaining limitations and open questions are disclosed.

---

## 22. Final Non-Negotiable Rules

1. **Inspect before proposing.**
2. **Propose before implementing.**
3. **Wait for explicit approval before making changes.**
4. **Stay within the approved scope.**
5. **Never guess business rules, permissions or workflow rules; ask the owner.**
6. **Never trust client-side checks as the sole security boundary.**
7. **Never let one agency's data leak to another.**
8. **Never expose secrets or private data.**
9. **Never claim implementation or verification that did not happen.**
10. **Prefer the approved architecture over new systems.**
11. **Keep code and documentation understandable to future developers.**
12. **Update the journal and to-do list at the end of every session.**

**CohortGlobal's development principle: security first, requirements before implementation, explicit approval before changes, verification before completion, and a written record of every session.**
