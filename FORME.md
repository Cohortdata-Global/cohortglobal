# CohortGlobal — Complete Project Guide

**Company:** CohortData  
**Product:** CohortGlobal  
**Primary reference:** `docs/Decisions/reference/cohortdb-overview-v1.pdf`  
**Supplementary reference:** `docs/Decisions/reference/Platform Unified PRD and Architecture.docx`  
**Document status:** Background guide. Where it differs from `docs/Decisions/confirmed-decisions.md` or the code, those win.  
**Development status (2026-10-13):** Phase 1 is built. The database is implemented and tested (116 tests pass); the web app is written but must still be installed and compiled on your machine. Start with `README.md` and `docs/phase-1/README.md`.

> **Quick tour of what exists now**
> - `docs/phase-1/`: one page per module (1A scaffold, 1B database, 1C identity, 1D projects, 1E portals, 1F verification).
> - `docs/Decisions/implementation-decisions.md`: every technical choice, its level (low, medium, critical) and how to change it.
> - `docs/permissions.md`: who can do what, matching the database exactly.

---

## 1. What Is CohortGlobal?

### 1.1 The big picture

CohortGlobal is a platform developed by CohortData to manage data-collection projects and the people and organizations that perform the work.

The platform is intended to connect the entire operational workflow: establishing user identities, managing organizations and permissions, defining projects, assigning work, collecting submissions, checking quality, delivering accepted results, and eventually managing financial records.

Instead of managing each part of this process independently, CohortGlobal is intended to provide a centralized system where the relationships between people, agencies, projects, work, submissions, and results can be tracked.

### 1.2 A simple example

Imagine CohortData receives a project that requires contributors to collect videos and associated metadata.

The intended workflow might look like this:

1. CohortData creates a project and defines its requirements.
2. An agency applies to participate in the project.
3. CohortData reviews and approves the agency for the project.
4. The agency decides which of its members or freelancers will perform the assigned work.
5. Contributors submit the required data.
6. The platform validates the submissions and sends them through quality control.
7. Reviewers approve or reject submissions.
8. Accepted data is prepared for delivery.
9. Relevant operational events and decisions are recorded.

This is an illustrative example of the intended workflow, not a claim that these features have already been implemented.

### 1.3 Who uses the platform?

The primary architecture distinguishes two broad groups.

**CohortData's internal team**
- Administrators and other authorized platform staff.
- Quality-control leads.
- Quality-control reviewers.
- Other internal roles defined by the approved permission model.

**External organizations and contributors**
- Agency owners.
- Agency managers.
- Agency members.
- Agency freelancers.
- Direct freelancers.

The precise permissions associated with each role must follow the confirmed decisions and approved permission specification.

### 1.4 What problem does the platform solve?

The intended system provides a structured way to answer questions such as:

- Who is registered on the platform?
- Which organization does a person belong to?
- Which projects are available?
- Which agencies or freelancers have applied?
- Who has been approved to perform the work?
- Which submissions have been received?
- Which submissions passed quality control?
- What accepted data is ready for delivery?
- Who performed an important action, and when?

These questions describe the platform's intended capabilities. The current implementation must be checked before assuming a particular answer is available in the application.

---

## 2. How to Read This Document

Because CohortGlobal is still being designed, it is important to distinguish requirements from actual implementation.

This document uses the following terminology.

| Term | Meaning |
|---|---|
| Primary reference | The main approved project reference, currently `cohortdb-overview-v1.pdf`. |
| Planned | Part of the intended product design. |
| Confirmed | A business or technical rule explicitly established by an authoritative project decision. |
| Proposed | A suggested design that has not received approval. |
| Open decision | A question that still requires an answer. |
| Implemented | Present in the actual repository or deployed system. |
| Verified | Checked against implementation, tests, or other appropriate evidence. |

A planned database table is not automatically an implemented table.

A confirmed business rule is not automatically enforced by code.

An existing API is not automatically secure just because it works in a normal user flow.

Always verify the relevant implementation before making claims about the current system.

---

## 3. Technical Architecture

### 3.1 The intended technology stack

The primary architecture identifies the following technologies and responsibilities.

| Technology | Intended responsibility |
|---|---|
| Next.js backend | Server-side application logic, business rules, and permission checks. |
| Supabase PostgreSQL | Main business database and source of truth for application data. |
| Supabase Row-Level Security (RLS) | Database-level protection for organization and tenant data. |
| Clerk | Authentication, including login, signup, and password-related identity flows. |

The current architecture describes Clerk as the authentication provider and Supabase as the application data layer.

The business database maintains the application's internal understanding of users, organizations, memberships, roles, and other business records.

The actual versions, configuration, integration details, and installed dependencies must be verified from the repository.

### 3.2 The most important distinction: authentication versus authorization

These two concepts solve different problems.

**Authentication asks: Who are you?**

Clerk is intended to handle this responsibility. It establishes the authenticated identity of a person.

**Authorization asks: What are you allowed to do?**

CohortGlobal's application logic and database security policies must determine which records and operations are permitted for that person.

For example, a person may successfully sign in but still have no permission to review a submission or access a particular agency's records.

A successful login must never be treated as unrestricted access to the application.

### 3.3 High-level architecture

The intended architecture can be understood as the following sequence:

```text
User
  |
  v
Next.js application
  |
  +---- Clerk authentication
  |       |
  |       v
  |    Authenticated identity
  |
  v
Server-side authorization
  |
  v
Supabase PostgreSQL
  |
  +---- Business data
  |
  +---- Database constraints
  |
  +---- Row-Level Security
```

This is a conceptual representation of the intended architecture, not a verified diagram of deployed infrastructure.

### 3.4 Why the database is the source of truth

The database should represent the actual business structure, rather than merely storing whatever information is convenient for individual screens.

For example, an agency membership is a business relationship. It should not exist only because a dropdown in the frontend says that a person belongs to an agency.

Likewise, approval to participate in a project should be represented by an appropriate business record, rather than inferred from the fact that a user can open a project page.

The database and server-side application logic should work together to enforce these relationships.

---

## 4. Understanding the Main Database Concepts

The primary reference organizes the system into ten business domains.

Before studying individual tables, understand the difference between the main database concepts.

### 4.1 Users

A user represents a registered person in the platform.

The internal user record connects an authenticated identity to the person's business identity and applicable permissions.

### 4.2 Organizations

An organization represents a business entity within the platform.

The architecture identifies CohortData and agencies as organization types.

An organization is not the same thing as an individual user. An agency can have multiple members, while a direct freelancer can operate without an agency membership.

### 4.3 Memberships

A membership represents a person's authorized relationship with an organization.

For example, an agency owner or employee needs an appropriate relationship with their agency.

The updated architecture explicitly distinguishes agency membership from direct freelancer participation.

### 4.4 Roles

A role describes a category of responsibilities or access.

Examples include an agency owner, an agency manager, a QC lead, or a QC reviewer.

The meaning of a role must be enforced through approved permission rules. A role label alone does not make an operation safe.

### 4.5 Projects

A project defines a body of work and the requirements associated with it.

Projects may have eligibility conditions, targets, quotas, lifecycle states, and project-specific configuration.

The precise fields and rules must follow the approved project specification.

### 4.6 Applications and assignments

An application represents a request to participate in a project.

An assignment represents an approved allocation of work.

These are different business events: applying does not automatically mean approval, and approval does not necessarily mean every individual task has been completed.

### 4.7 Sessions and submissions

A session represents a period or unit of contributor activity under the project's rules.

A submission represents data provided for a project, along with the associated metadata and attribution.

The exact session lifecycle, upload limits, and submission rules require the relevant approved specifications.

### 4.8 Quality-control records

Quality-control records capture validation results, review assignments, decisions, and rejection reasons.

They provide traceability for the acceptance or rejection of submitted data.

### 4.9 Delivery records

Delivery records represent accepted results prepared for handoff or delivery.

They should distinguish data that has merely been submitted from data that has passed the required acceptance process.

### 4.10 Audit history

Audit history records important changes and actions so that the system can explain what happened, who performed an action, and when it occurred.

The exact audit events and retention requirements must be defined in the approved specification.

---

## 5. The Ten Business Domains

The primary database blueprint divides the product into ten domains.

These domains provide a way to organize business responsibilities. They do not imply that ten separate applications or microservices are required.

### Domain 1 — Identity and Organizations

**Main question:** Who exists in the platform, and which organization relationships do they have?

This domain covers concepts such as:

- Users.
- Organizations.
- Agency identities.
- Organization memberships.
- Contributor identities and profiles.

It establishes the foundation that the other domains depend on.

For example, the platform must be able to determine whether a person is a CohortData staff member, an agency owner, an agency employee, or a direct freelancer.

The updated identity architecture also distinguishes different registration paths and requires valid invitations for agency employees.

### Domain 2 — Roles and Permissions

**Main question:** What is each person allowed to do?

This domain defines roles, permissions, role-to-permission mappings, organization scope, and authorization rules.

It must distinguish between platform-level responsibilities and organization-level responsibilities.

For example, an internal QC reviewer and an agency manager have different responsibilities. The application must not grant QC permissions merely because a user belongs to an agency.

The backend and database security policies must enforce the approved access rules.

### Domain 3 — Projects and Requirements

**Main question:** What work is being requested?

This domain describes projects and their requirements.

Relevant concepts may include:

- Project identity and lifecycle status.
- Eligibility requirements.
- Targets and quotas.
- Project-specific configuration.
- Collection and consent requirements where applicable.

A project defines the rules under which work is requested and submissions are evaluated.

Project-specific requirements should be configured according to the approved product rules rather than hard-coded assumptions.

### Domain 4 — Assignments and Applications

**Main question:** Who has applied for, or been approved to perform, the work?

This domain represents the relationship between projects and participating agencies or individuals.

It distinguishes the application process from the assignment process.

The primary reference establishes that registration does not automatically approve a project application.

The current business rules also distinguish agency applications from direct freelancer applications. An agency's approval does not automatically require CohortData to approve every agency member separately; agency-side project assignment rules still apply.

### Domain 5 — Contributors and Memberships

**Main question:** Who belongs to an agency, and who actually performs the work?

This domain connects contributor identities with the organizations and projects relevant to their work.

The updated architecture distinguishes:

- Agency owners and employees with organization membership.
- Direct freelancers without agency membership.
- Contributor profiles associated with registered users.
- Invited contributors whose onboarding and account state depend on the approved workflow.

An agency relationship must be established through the authorized process. A user must not become an agency member merely by selecting an agency name or entering its email domain.

### Domain 6 — Collection and Sessions

**Main question:** How is the work performed and submitted?

This operational domain covers contributor sessions, uploads, submissions, and metadata.

A submission may need to preserve its relationship to:

- The contributor.
- The relevant project.
- The associated agency, when applicable.
- The originating link or invitation context, where the approved design requires attribution.
- The metadata and validation state associated with the submission.

The detailed data model, storage design, session behavior, and upload workflow are intended to be developed in the collection phase.

Do not assume that the final metadata schema or storage architecture has already been settled.

### Domain 7 — Automated Checks and Quality Control

**Main question:** Does submitted data meet the project's requirements?

This domain covers automated validation and human quality-control review.

The intended workflow includes metadata validation, entry into a QC queue, assignment by a QC lead, and review by a QC reviewer.

The platform must distinguish an automated validation result from a human review decision.

Rejections should be traceable to an appropriate reason or remark according to the confirmed workflow.

Detailed duplicate-detection rules and other validation policies must be taken from approved decisions rather than inferred from examples.

### Domain 8 — Delivery and Results

**Main question:** What accepted data has been delivered?

This domain represents the downstream handling of accepted submissions.

Concepts in the architecture include delivery packages and manifests.

The purpose is to preserve a clear distinction between:

- Data that has been uploaded.
- Data that is awaiting review.
- Data that has been accepted.
- Data that is ready for delivery.
- Data that has been delivered.

The exact delivery lifecycle and associated records must follow the approved specification.

### Domain 9 — Earnings and Finance

**Main question:** What money is owed or paid?

The architecture identifies earnings, invoices, and payment records as part of the broader system.

However, the current decisions log states that finance is outside version one and is deferred until its business rules are confirmed.

Therefore, do not assume that payment processing, invoicing, tax collection, or financial workflows are part of the initial release.

Any implementation of this domain requires explicit approval of the scope and requirements.

### Domain 10 — Audit and Notifications

**Main question:** What changed, and who needs to know?

This domain covers audit history and notifications.

Examples of relevant events include invitation creation, invitation acceptance, revocation, and role changes.

Audit history and notifications serve different purposes:

- Audit history helps explain what happened.
- Notifications communicate relevant events to users.

The exact event catalogue, notification channels, retention rules, and delivery behavior remain subject to approved requirements.

---

## 6. Identity and Registration

Identity is one of the most important parts of the platform because it establishes the relationships used by authorization.

### 6.1 Clerk-to-database mapping

The primary reference describes this relationship:

```text
Clerk identity
     |
     v
Internal user record
     |
     +---- Organization relationship, where applicable
     |
     +---- Platform or organization role
     |
     v
Authorized application operations
```

Clerk establishes the authenticated identity. The internal database represents the person's business identity and applicable relationships.

The actual mapping must be verified against the implementation before assuming particular identifiers or columns exist.

### 6.2 Direct freelancer

A direct freelancer participates without an agency membership.

Their access and project participation must be based on the approved direct freelancer workflow.

Do not create an artificial agency relationship just to simplify queries or permissions.

### 6.3 Agency owner or employee

An agency owner or employee must have an authorized relationship with their agency.

The current design requires agency employees to join through a valid agency invitation.

An invitation is an authorization mechanism for establishing membership; it is not merely a notification containing a link.

### 6.4 CohortData staff

Internal staff have platform-scoped roles.

The primary reference states that platform-team access cannot be granted simply because a person selects that option on a public registration form. It requires authorized provisioning or invitation.

### 6.5 One organization per user

The current architecture establishes that a user may belong to at most one organization under the updated business rule.

The primary reference discusses enforcing this rule with a database uniqueness constraint on the relevant membership relationship.

The exact schema and constraint must be verified before implementation.

### 6.6 Account state and membership state

Do not assume that these are the same thing.

A person can have an authenticated account without necessarily having a particular organization membership, project approval, or permission to perform a task.

Each relationship must be established through the appropriate authorized workflow.

---

## 7. Authorization and Data Security

### 7.1 The security model

The intended architecture uses both backend authorization and Supabase RLS.

The backend determines whether an operation is permitted. RLS provides database-level protection for records covered by the relevant policies.

These layers must work together.

### 7.2 Why frontend checks are insufficient

Imagine an agency manager can see only their agency's records in the user interface.

If the backend accepts any record ID sent by the browser, the manager may be able to request another agency's data directly.

Hiding a record in the interface does not protect it.

The server and database must independently enforce the intended access boundaries.

### 7.3 Authorization questions

For each protected operation, the system must establish:

1. Who is the authenticated user?
2. What platform-level role or permissions apply?
3. What organization relationships does the user have?
4. Does the requested record belong to an allowed scope?
5. Is the requested action permitted?
6. Are the relevant business rules satisfied?

The exact checks vary by operation and must follow the approved permission model.

### 7.4 RLS

Row-Level Security allows PostgreSQL policies to restrict which records can be accessed or modified.

For example, a policy may limit an agency user to records associated with that agency, subject to the approved access model.

However, RLS must be configured and tested correctly. Enabling it does not automatically guarantee that the policies are correct.

Policies must be checked for relevant operations, relationships, and possible cross-organization access paths.

### 7.5 Security must be verified

Security verification should include unauthorized reads, unauthorized writes, changed record IDs, cross-organization access attempts, and relevant file-download or export paths.

Never report the system as secure merely because authentication works.

---

## 8. Understanding the Operational Workflow

The broad operational flow connects project definition with accepted data delivery.

```text
Identity and Organizations
          |
          v
Roles and Permissions
          |
          v
Projects and Requirements
          |
          v
Applications and Assignments
          |
          v
Contributor Work
          |
          v
Collection and Sessions
          |
          v
Automated Validation
          |
          v
Quality-Control Review
          |
          v
Accepted Results
          |
          v
Delivery
```

Audit history and notifications support relevant events throughout the workflow.

Finance is a downstream domain in the broader architecture but is deferred from the initial release according to the current decisions log.

This diagram is conceptual. It does not establish the exact order of every operation, all possible statuses, or every exception path.

The detailed lifecycle must be specified before implementation.

---

## 9. Technology Choices and Their Purpose

### Next.js

Next.js is the intended application framework.

It can support the user interface and server-side application logic in one application, reducing the need to maintain a separate backend service by default.

The actual division between client and server code must be established by the implementation.

### React

React provides the component model for building the interface.

It is suitable for reusable pages, forms, dashboards, project views, and workflow interfaces.

React components must not be treated as the sole security boundary.

### TypeScript

TypeScript provides static type checking for application code.

It helps make data structures and function contracts clearer, but it does not validate untrusted requests automatically at runtime.

### Tailwind CSS

Tailwind CSS is the intended styling system.

It supports consistent layout and styling through utility classes. It does not determine business logic or access permissions.

### Clerk

Clerk is intended to manage authentication.

The current decisions log specifies that Clerk is used for authentication only and that the Clerk user ID is mapped to an internal Supabase user.

Do not assume Clerk Organizations or other Clerk features are part of the approved design.

### Supabase PostgreSQL

Supabase PostgreSQL is intended to store the platform's business data.

The database should preserve relationships, enforce appropriate constraints, and support controlled access to records.

### Row-Level Security

RLS is intended to add database-level enforcement of data access rules.

It must be designed in coordination with the server-side authorization model.

### Hosting

The current decisions log lists Vercel or an organization's own server as candidates. Hosting has not yet been finalized.

Do not assume a deployment platform until the decision is confirmed.

---

## 10. Files, Storage, and Data Collection

The primary architecture places detailed collection and session design in a later phase.

The storage design must account for the requirements of the data being collected and the environments in which contributors work.

Important questions include:

- Where will files be stored?
- How will private files be accessed?
- What file sizes must be supported?
- How will interrupted uploads resume?
- How will metadata be validated?
- How will files be associated with the right project and contributor?
- How will accepted data be organized for delivery?
- What retention and deletion rules apply?

The current decisions log identifies the company's 2 TB server as the intended storage direction, with implementation details deferred to the collection phase.

The final storage location, upload path, upload limits, and detailed metadata model should not be treated as settled until the relevant decisions are approved.

---

## 11. Internationalization, Privacy, and Operational Requirements

The current decisions log identifies contributors and members from Singapore, Saudi Arabia, the UAE, Indonesia, Brazil, and India.

The product requirements therefore need to account for international usage.

### Languages and text direction

English is the intended starting language in the current decisions log.

CohortGlobal launches in English only (confirmed 2026-10-12). The application is built translation-ready, with text in one English message catalogue and direction-neutral layouts, so other languages and right-to-left layouts (Arabic) can be added later. No other language interfaces are built in v1.

### Dates and times

The decisions log specifies storing dates and times in UTC and displaying them in the user's timezone.

The implementation must still define and verify the applicable database types, timezone conversion rules, and reporting behavior.

### Phone numbers and countries

The decisions log specifies international phone-number formatting using E.164 and country identifiers based on ISO country codes.

Names must support non-Latin scripts.

### Privacy and sensitive data

The decisions log identifies privacy obligations across the relevant operating countries and highlights face and voice data as sensitive or biometric data.

Consent requirements, retention, access controls, and cross-border data transfers must be reviewed against the applicable requirements before sensitive data collection is implemented.

The technical documentation is not a substitute for legal review.

### Identification documents

The decisions log states that identification requirements vary by country and that raw national identification numbers should be avoided unless required.

The precise data fields and retention rules must be confirmed before implementation.

### Low-bandwidth contributors

The platform is expected to support contributors using mobile devices and mobile data.

Resumable uploads and mobile-first pages are identified as requirements to design for.

Their implementation and verification status must be checked separately.

---

## 12. Project Phases and Scope

The current decisions log separates the work into three broad phases.

### Part 1 — Platform foundation

The documented foundation includes:

- Identity and organization management.
- Roles and permissions.
- Invitations.
- Job postings and applications.
- Agency approval.
- Agency member assignment.
- Portals and dashboards.

The precise feature scope and acceptance criteria must be confirmed against the approved requirements.

### Part 2 — Data collection

The documented collection phase includes:

- Public links.
- Sessions.
- Submissions.
- Metadata validation.
- Quality-control queues.
- Reviews and remarks.
- Delivery workflows.
- Storage and sensitive-data handling.
- Detailed metadata modeling.

### Part 3 — Finance

The broader architecture includes earnings and finance, but the current decisions log explicitly excludes finance from version one.

Finance should not be implemented merely because it appears in the long-term architecture.

**Phase descriptions are planning information, not evidence that a phase is complete.** Check the actual repository and approved acceptance criteria to determine implementation status.

---

## 13. Decisions and Open Questions

Use the project's decisions log to track what is confirmed, proposed, or unresolved.

The current decisions log includes open questions concerning:

- Agency freelancer account behavior.
- Session reopening after rejection.
- Duplicate-detection rules.
- Upload limits and upload paths.
- The final metadata model.
- Job-page features in version one.
- Launch-language requirements.
- Storage location and cross-border data-transfer review.
- Optional notification channels.

These questions must be resolved by the appropriate product, technical, or legal decision-maker before implementing affected behavior.

Do not convert a proposed solution into a confirmed rule simply because it appears in an AI-generated document.

Keep this guide focused on explaining the product. Use the dedicated decisions log for the detailed history and status of individual decisions.

---

## 14. Development and Maintenance Rules

Anyone working on CohortGlobal should follow these principles.

### Understand before changing

Read the primary reference and relevant specialist instructions before proposing architectural or business-logic changes.

Inspect the actual repository instead of assuming the current code matches the documentation.

### Approval before implementation

Present the findings, proposed solution, files affected, risks, and testing plan before editing files.

Wait for explicit approval.

### Preserve data integrity

Do not create or change business relationships without understanding their consequences.

Database constraints, server-side validation, and authorization must support the approved business rules.

### Keep security boundaries explicit

Authentication, authorization, organization membership, and project participation are separate concepts.

Do not conflate them.

### Verify behavior

Run relevant tests and checks after approved changes. Report exactly what was executed and what remains unverified.

### Keep documentation synchronized

When approved implementation changes affect the documented architecture, update the appropriate documentation within the approved scope.

Clearly distinguish planned features from verified behavior.

---

## 15. Quick Reference

| Question | Where to look |
|---|---|
| What is CohortGlobal? | Sections 1–2 |
| What technologies are intended? | Sections 3 and 9 |
| What do the database domains represent? | Sections 4–5 |
| How does identity and membership work? | Section 6 |
| How are access and data isolation enforced? | Section 7 |
| How does collection flow into delivery? | Section 8 |
| What remains to be decided about storage? | Section 10 |
| What international requirements are documented? | Section 11 |
| What belongs in each phase? | Section 12 |
| Where are individual decisions tracked? | Section 13 |
| How should AI agents work? | Section 14 and `AGENTS.md` |
| What is the architecture blueprint? | `docs/architecture.md` |
| Who can do what? | `docs/permissions.md` |
| What happened in each session? | `docs/JOURNAL.md` |
| What are we doing next? | `docs/TODO.md` |

---

## Final Principle

CohortGlobal should be developed from a clear understanding of CohortData's business requirements, not from assumptions about what a typical platform should contain.

The primary architecture establishes the intended direction. Approved decisions establish the business rules. The implementation establishes what actually exists. Testing and verification establish what can be relied upon.

Keep these sources connected, but never treat them as interchangeable.