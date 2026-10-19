> **ARCHIVED — OBSOLETE. Do not use.**
> This file was found at `.claude/skills/technical-documentation-writer/SKILL.md` on 2026-10-12. It is an early FORME draft that describes CohortGlobal as a KPI platform for sister companies, which is wrong: CohortGlobal is CohortData's data-collection platform for agencies and freelancers. It was kept only as a record, at the owner's approval. The current project description is `FORME.md`.

---

# FORME.md — CohortGlobal

> **Document purpose:** Explain CohortGlobal to its founder, product owner, developers, and AI coding assistants.
>
> **Project stage:** Pre-development, based on the requirements established so far.
>
> **Documentation status:** Initial baseline. The original PRD and architecture reference documents still need to be reviewed and reconciled with this document.
>
> **Important distinction:** Planned functionality is not the same as implemented functionality. No feature, integration, security control, test result, deployment, or production incident should be considered verified until supporting evidence is available.

---

# 1. The Big Picture — Project Overview

## 1.1 What is CohortGlobal?

CohortGlobal is a planned KPI and operational management platform for a group of approximately six to seven sister companies.

It is intended to give the CEO a consolidated view of company performance while allowing each company's administrator to manage their own company's operations. Employees will have access to their own records and the work they are permitted to perform.

The platform is expected to bring operational information, progress reporting, work-hour tracking, end-of-day reports, and key performance indicators into one system. Its central challenge is to make information easy to understand without allowing one company's users to access another company's restricted data.

The goal is one shared platform with appropriately separated company information—not a collection of disconnected tools and spreadsheets.

## 1.2 What problem does it solve?

Imagine managing seven related businesses. Each business has employees, assignments, deadlines, progress updates, and performance information.

Without a shared system, information can become scattered across spreadsheets, messages, reports, and separate tools. The CEO may need to collect updates manually, while company administrators spend time tracking down information and employees may not have a clear place to report their work.

CohortGlobal is intended to provide a common place for these activities.

The intended benefits are:

- **Visibility:** Understand what is happening across the group.
- **Accountability:** Connect work and progress to the appropriate employee, assignment, and company.
- **Consistency:** Use agreed definitions for KPIs rather than allowing each dashboard to calculate them differently.
- **Separation:** Let companies operate independently while supporting authorized group-level reporting.
- **Traceability:** Make it easier to understand where reported figures came from.

These are product goals, not yet measured outcomes.

## 1.3 Who uses the platform?

The initial access model has three established categories.

### The CEO

The CEO needs an authorized view across the companies.

Think of the CEO as someone looking at a group-wide control room. They should be able to compare company performance and see consolidated KPIs without having to log into each company separately.

Cross-company visibility does not automatically mean unrestricted permission to change every company's records.

### Company administrators

A company administrator manages permitted operations for their own company.

They should be able to work with their company's information without seeing another company's restricted records.

### Employees

Employees have a narrower view. They should be able to access their own permitted information and assigned work, and use the reporting workflows approved for their role.

The exact employee workflows and which fields they may edit still need to be confirmed.

## 1.4 A typical user journey

The intended experience looks like this:

1. A user signs in.
2. The system identifies the authenticated user and determines their authorized access.
3. The user sees the relevant dashboard or work area.
4. They review or update information they are permitted to access.
5. The system validates the operation and saves approved changes.
6. Dashboards and reports use the underlying data to present the appropriate information.

For the CEO, the journey centers on group-wide visibility. For an administrator, it centers on running one company. For an employee, it centers on permitted personal records and work.

The exact pages, navigation, and workflows remain subject to the approved product requirements.

## 1.5 If CohortGlobal were a restaurant group

Imagine seven restaurants owned by the same group.

Each restaurant has its own staff, daily operations, and performance figures. Each restaurant manager can inspect their own restaurant's records. They cannot open another manager's private files just because both restaurants belong to the same owner.

The group CEO has a central office that consolidates authorized information from all seven restaurants.

In this analogy:

- The **frontend** is the reception desk where people interact with the system.
- The **backend** is the operations team that checks requests and carries out the work.
- The **database** is the organized record room.
- **Authentication** checks who has arrived.
- **Authorization** determines which rooms that person may enter.
- **KPIs** are the performance reports prepared from the underlying records.

The important detail is that one shared record system does not mean everyone gets access to everything.

---

# 2. Technical Architecture — The Blueprint

## 2.1 The simple version

CohortGlobal is intended to use one Next.js application, with React for its user interface, Clerk for authentication, and Supabase PostgreSQL for business data.

The frontend presents information and collects user input. The server handles trusted operations and business rules. The database stores persistent records and helps enforce data integrity.

The design deliberately starts with one application rather than a separate frontend and backend service. That keeps the initial system simpler to build and maintain. A separate backend should be considered only if a concrete requirement justifies it and the decision is approved.

## 2.2 Proposed architecture diagram

The following diagram shows the intended design, not a verified implementation.

```text
                    PEOPLE
          CEO / Company Admin / Employee
                       |
                       v
             +-------------------+
             |   Next.js App     |
             |                   |
             | React UI          |
             | Pages & Forms     |
             +-------------------+
                       |
                       v
             +-------------------+
             | Server-side Layer |
             |                   |
             | Validate requests |
             | Check permissions |
             | Apply business    |
             | rules             |
             +-------------------+
                       |
                       v
             +-------------------+
             | Supabase Client   |
             | and Access Rules  |
             +-------------------+
                       |
                       v
             +-------------------+
             | PostgreSQL        |
             |                   |
             | Companies         |
             | Employees         |
             | Operational data  |
             | KPI source data   |
             +-------------------+

             +-------------------+
             | Clerk             |
             | Authentication    |
             +-------------------+
                       |
              Trusted identity
              used by the app
```

Clerk and Supabase are separate services. The exact way authenticated identity is conveyed to the database must be configured and verified. Using Clerk does not automatically mean PostgreSQL knows the user's role or company.

## 2.3 The frontend — the reception desk

**Technology:** React, Next.js, and Tailwind CSS.

The frontend is the part of the application users see and interact with: dashboards, tables, forms, buttons, and reports.

React helps build these interfaces from reusable components. Next.js organizes the application and supports both user-facing pages and server-side functionality. Tailwind CSS provides a consistent way to style the interface.

Why this combination?

Keeping the UI and server-side functionality in one Next.js project avoids maintaining two independent applications at the beginning. React provides a component-based interface, and Tailwind supports consistent styling without requiring a separate styling system for every page.

The trade-off is that developers must understand which code runs in the browser and which runs on the server. Sensitive operations must stay on the trusted server side.

What could go wrong?

A dashboard might accidentally show data that the user should not see. Hiding a table column or button is not sufficient protection. The server must enforce the same access restrictions when data is requested or changed.

## 2.4 The backend — the operations team

The backend receives requests, validates information, checks permissions, applies business rules, and communicates with the database.

Next.js can handle this work using Route Handlers, Server Actions, Server Components, and server-side modules, depending on the operation.

The intention is not to create an API endpoint for every individual function. The backend should use the simplest suitable mechanism for each job.

For example, displaying a permitted dashboard may use a server-side read. Submitting a report may use a protected mutation. An external integration that needs a public HTTP endpoint may use a Route Handler.

Why not start with a separate Express server?

A separate service can be useful when there are independent deployment needs or substantial backend requirements. However, it also introduces another application, configuration, deployment process, and set of security boundaries.

For the initial platform, one Next.js application is the preferred starting point. Reconsider this only when the actual requirements justify a separate service.

## 2.5 Authentication — checking identity

**Technology:** Clerk.

Authentication answers the question: "Who is signing in?"

Clerk is intended to manage user authentication and provide a trusted identity to the application.

The platform must then associate that identity with the appropriate business permissions and company membership.

A successful sign-in does not automatically grant access to every company or record. Authentication and authorization are different checks.

Potential failure: a user may be authenticated but have no valid company membership or permission for a requested operation. The application must handle this safely rather than granting access by default.

## 2.6 Authorization — deciding what each user can do

Authorization answers the question: "Given who you are, what are you allowed to access?"

CohortGlobal must enforce the distinction between CEO access, company administration, and employee access.

A company administrator must not gain access to another company's records simply by changing an identifier in a request. An employee must not be able to view another employee's restricted records by guessing an address or record ID.

These checks belong on the server and, where appropriate, in database policies.

The intended protection is layered:

1. The application establishes the user's trusted identity.
2. The server checks the user's role, company, and requested action.
3. Database queries use the appropriate company scope.
4. Supabase Row Level Security (RLS), where correctly configured, provides another layer of database-level access control.

RLS is a database feature that can restrict which records a database request is allowed to access. Its effectiveness depends on the actual policies and the identity context reaching PostgreSQL.

## 2.7 The database — the organized record room

**Technology:** Supabase PostgreSQL.

The database is intended to store the platform's persistent business information.

PostgreSQL is a relational database, meaning records can be connected through defined relationships. For example, an assignment may belong to a job, and that job may belong to a company.

Those relationships must be designed deliberately. Otherwise, records can become orphaned, duplicated, or incorrectly associated with a company.

The schema has not yet been verified or finalized in this document. Actual tables, columns, relationships, constraints, indexes, and policies must be defined through the approved database design process.

Why PostgreSQL?

A relational database fits a platform where ownership, relationships, reporting, and data consistency are important. It supports structured queries and constraints that help prevent invalid relationships.

Why Supabase?

Supabase provides a managed PostgreSQL platform along with database tooling and related services. It can reduce the amount of database infrastructure that the team must operate directly.

The trade-off is that application developers must understand Supabase-specific access patterns, permissions, environment configuration, and the relationship between Clerk authentication and database policies.

## 2.8 KPI calculations — the reporting office

KPIs are measurements used to understand performance. A dashboard may display them, but the numbers must come from defined business rules.

For every KPI, the project needs to establish:

- What the number means.
- Which records contribute to it.
- Its formula and unit.
- Its date range and timezone.
- Whether it is calculated for an employee, a company, or the whole group.
- How missing, duplicate, incomplete, or corrected records are treated.
- Whether the number should reflect current data or preserve a historical snapshot.

For example, a completion rate might be calculated as completed eligible assignments divided by all eligible assignments. That is only an illustrative formula; the actual KPI definition must be approved.

If the CEO's dashboard and a company dashboard calculate the same KPI differently, the system loses trust. The project should establish one authoritative definition for each metric.

## 2.9 Architecture choices and trade-offs

| Decision | Why it fits the initial project | Trade-off or limitation |
|---|---|---|
| One Next.js application | Reduces the number of applications and deployment boundaries to manage. | Requires clear separation between browser and server code. |
| React | Supports reusable interactive interfaces. | Poorly organized components can become difficult to maintain. |
| TypeScript | Helps detect certain programming mistakes before execution. | Types do not validate untrusted data at runtime. |
| Tailwind CSS | Supports consistent styling through utility classes. | Styling conventions need to remain consistent. |
| Clerk | Provides authentication functionality without building sign-in systems from scratch. | User identity and business permissions still need to be integrated correctly. |
| Supabase PostgreSQL | Provides relational data storage and database-level constraints. | Schema design, RLS, and query performance require deliberate engineering. |
| Server-side authorization | Protects sensitive operations beyond what the UI displays. | Every protected operation must enforce the correct checks. |

These are the intended architectural choices. Their final suitability should be confirmed against the original requirements.

---

# 3. Codebase Structure — The Filing System

## 3.1 The simple version

A codebase is the collection of files that make up an application. Its folder structure is like an organized filing system: each type of work has a place.

A predictable structure helps developers and AI coding assistants locate the relevant code without changing unrelated parts of the application.

Because implementation has not started, the tree below is a proposed starting point, not the verified structure of an existing application.

## 3.2 Proposed repository tree

```text
cohortglobal/
├── .claude/
│   └── skills/
│       ├── database-architect/
│       │   └── SKILL.md
│       ├── backend-architect/
│       │   └── SKILL.md
│       ├── project-documentation-architect/
│       │   └── SKILL.md
│       ├── technical-documentation-writer/
│       │   └── SKILL.md
│       └── full-stack-developer/
│           └── SKILL.md
│
├── .cursor/
│   └── rules/
│
├── docs/
│   ├── architecture.md
│   ├── permissions.md
│   ├── decisions/
│   └── reference/
│
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── services/
│   └── types/
│
├── supabase/
│   └── migrations/
│
├── public/
├── tests/
│
├── AGENTS.md
├── CLAUDE.md
├── FORME.md
├── README.md
├── .env.example
└── .gitignore
```

This is a suggested structure. The exact location of Next.js application files, components, tests, and database migrations should be chosen when the project is initialized. The team should not create empty folders simply to match this illustration.

## 3.3 Important folders

### `.claude/skills/` — specialist instruction manuals

This folder contains instructions for Claude Code skills.

The Database Architect skill focuses on the database. Backend Architect focuses on server-side behavior. Project Documentation Architect governs documentation structure and accuracy. Technical Documentation Writer produces readable explanations. Full-Stack Developer coordinates approved feature implementation.

These are guidance documents, not application runtime code.

### `.cursor/rules/` — Cursor-specific guidance

This folder is for instructions that need to be expressed in Cursor's supported rule format.

Shared project rules should live in `AGENTS.md` where compatible tools can use them. Claude Code skills should not be assumed to load automatically in Cursor.

### `docs/` — detailed project references

This folder contains supporting documentation.

- `architecture.md` explains the technical design.
- `permissions.md` describes the intended and verified access boundaries.
- `decisions/` records significant technical decisions and their rationale.
- `reference/` can hold original project documents, if keeping them in the repository is appropriate.

### `src/app/` — application entry points

In a proposed Next.js App Router structure, this is where route-based pages and related application entry points live.

A route is a path users can visit, such as a dashboard or a company-management page. Next.js uses its file and folder conventions to map application files to routes.

If the project uses a different supported structure, document the actual structure instead.

### `src/components/` — reusable interface pieces

This is the proposed home for reusable UI elements such as buttons, form fields, tables, cards, and dashboard widgets.

A component is a self-contained piece of interface that can be reused in multiple places.

Not every page needs to be broken into dozens of tiny components. Reuse should make the code easier to understand, not harder.

### `src/lib/` — shared utilities and integrations

This is a possible home for shared helpers and configuration used across the application.

Examples may include validated utility functions or appropriately configured client integrations. Sensitive server-only modules must not be imported into browser code.

### `src/services/` — reusable business operations

This is an optional organizational choice for business operations shared by multiple pages or Route Handlers.

Use it only if it helps the actual application structure. Do not introduce a service layer simply because a folder appears in this diagram.

### `src/types/` — shared type definitions

This folder may hold shared TypeScript definitions that improve consistency.

Types describe the shape of data in code. They do not replace runtime validation or database constraints.

### `supabase/migrations/` — database change history

A migration is a recorded database change, such as creating a table or changing a constraint.

Versioned migrations help developers reproduce and review schema changes. They must be managed carefully, because incorrect changes can damage data or interrupt application behavior.

### `tests/` — verification

This is a proposed location for tests, subject to the chosen testing framework and conventions.

Tests help verify that calculations, workflows, and security boundaries behave as intended. Their existence alone does not prove the application is secure.

## 3.4 Root-level files

| File | Purpose |
|---|---|
| `AGENTS.md` | Shared instructions for compatible AI coding tools. |
| `CLAUDE.md` | Claude Code entry instructions. |
| `FORME.md` | Main project context and comprehensive explanation. |
| `README.md` | Short introduction and setup guide. |
| `.env.example` | Names and descriptions of required environment variables without secret values. |
| `.gitignore` | Files and generated artifacts that should not be committed. |

The actual project should be initialized before these files claim that particular scripts, integrations, or entry points already exist.

---

# 4. Connections and Data Flow — How Things Talk

## 4.1 The simple version

When a user performs an action, the application must carry the request from the screen to trusted server-side code, check whether the action is allowed, access the relevant data, and return an appropriate result.

Think of it as a carefully managed delivery route. The request must reach the correct destination, be checked by the right people, and return only information the recipient is authorized to receive.

The following are planned flows. Exact filenames, function names, and implementation details must be verified after development begins.

## 4.2 Flow A: A user signs in and opens a dashboard

**Step 1 — The user opens the application.**

They visit the application and begin the sign-in process.

**Step 2 — Clerk establishes identity.**

Clerk is intended to handle authentication. A successful sign-in establishes who the user is, but it does not by itself determine all their business permissions.

**Step 3 — The application resolves the user's access.**

The trusted server-side application must determine the user's role, company membership, and permitted scope using the approved data model.

If a user has no valid membership or permission, the application must not silently grant access.

**Step 4 — The server requests the dashboard data.**

The application requests only the data the user is permitted to see. A company administrator's query should be scoped to their company; an employee's query should be restricted to permitted records.

**Step 5 — Supabase returns authorized data.**

The database query, relevant RLS policies, and trusted server-side checks must work together correctly.

**Step 6 — The dashboard presents the result.**

The interface shows the permitted information and handles loading, empty, and error states.

**What could go wrong?**

A correctly authenticated user could still have the wrong company scope. The system must verify authorization for the actual operation, not merely check that the user is signed in.

## 4.3 Flow B: An employee submits a work report

This is an illustrative planned workflow; the exact report fields and submission rules remain to be confirmed.

**Step 1 — The employee fills in a report.**

The interface collects the fields permitted by the approved reporting workflow.

**Step 2 — The application validates the request.**

The interface can provide helpful validation, but the server must validate the data again because requests can be sent without using the normal UI.

**Step 3 — The server verifies permission.**

It checks the authenticated identity, company membership, record ownership, and whether the employee is allowed to submit or update the report.

**Step 4 — The server applies the business rules.**

It checks any approved restrictions, such as permitted report states or required fields. These rules must be defined before implementation rather than invented by the developer.

**Step 5 — The database saves the report.**

The database should preserve required relationships and constraints. If the operation involves several dependent writes, the design must consider whether they need to succeed atomically.

**Step 6 — The user receives a result.**

The application reports success only when the save has actually succeeded. If the operation fails, the user receives an appropriate error.

**What could go wrong?**

A client could attempt to submit a report for another employee or company. The server must verify ownership rather than trusting the identifiers in the request.

## 4.4 Flow C: The CEO views consolidated KPIs

**Step 1 — The CEO opens the group dashboard.**

The application authenticates the user and verifies the required reporting permission.

**Step 2 — The server determines the authorized reporting scope.**

The system identifies which companies and data the CEO may include in the report.

**Step 3 — The application obtains the source data.**

The data query or approved KPI calculation uses the relevant records. Company scope must be correct before results are combined.

**Step 4 — The KPI is calculated consistently.**

The calculation follows an approved formula and agreed rules for date ranges, missing records, corrections, and aggregation.

**Step 5 — The dashboard displays the result.**

The CEO receives the consolidated view. Company-specific users should receive only their authorized scope when using their own dashboards.

**What could go wrong?**

A database join could accidentally count the same job multiple times, or a date boundary could include the wrong records. KPI calculations need explicit definitions and tests rather than relying on a plausible-looking number.

## 4.5 External service connections

The intended external services include Clerk and Supabase. The exact integration and failure behavior must be confirmed during implementation.

| Service | Purpose | What could go wrong |
|---|---|---|
| Clerk | User authentication | Sign-in or identity verification may fail. |
| Supabase PostgreSQL | Persistent business data | Queries or writes may fail, time out, or be rejected by policies. |
| Additional services | Not yet established | Do not assume email, storage, payment, or analytics services exist. |

When an essential service fails, the application should handle the error safely. It must not report a successful database write if the write failed or bypass security because an integration is unavailable.

---

# 5. Technology Choices — The Toolbox

The following table describes the intended stack, not verified installed dependencies.

| Technology | What It Does Here | Why This One | Watch Out For |
|---|---|---|---|
| Next.js | Organizes application pages and supports server-side functionality. | One application can handle the UI and appropriate server operations. | Browser and server responsibilities must be separated correctly. |
| React | Builds interactive user interfaces from components. | Reusable components support consistent dashboards and forms. | Poor component boundaries can create difficult-to-maintain code. |
| TypeScript | Adds type information to JavaScript code. | Helps catch certain mistakes during development. | It does not validate untrusted input at runtime. |
| Tailwind CSS | Provides utility classes for styling. | Supports consistent and responsive UI development. | Styling conventions should remain consistent. |
| Clerk | Handles user authentication. | Avoids building an authentication system from scratch. | Business roles and company membership still need correct integration. |
| Supabase PostgreSQL | Stores structured business records and relationships. | Relational integrity and SQL reporting fit the platform's needs. | RLS, ownership relationships, and schema changes require careful design. |
| Git | Tracks changes to the project files. | Makes changes reviewable and recoverable through version control. | Secrets and sensitive data must not be committed. |
| Claude Code | Primarily used for AI-assisted development. | Specialist skills can provide repeatable project guidance. | It must follow the approval workflow and verify its work. |
| Cursor | Used occasionally for AI-assisted coding. | Can complement the main development workflow. | Claude Code skills may require adaptation into Cursor-supported rules. |

## 5.1 Cost considerations

Exact costs depend on selected plans, usage, current provider pricing, and deployment choices.

Before launch, verify the applicable pricing and usage limits for Clerk, Supabase, the hosting provider, and any other selected services.

Do not assume a free tier is sufficient for production, and do not assume a paid plan is necessary before actual requirements are known.

---

# 6. Environment and Configuration

## 6.1 The simple version

Environment variables are named configuration values supplied to the application when it runs. They let the same code connect to different services or environments without embedding credentials in source files.

For example, local development should use the intended development database rather than accidentally writing to production.

The exact variable names must be taken from the selected integrations and actual configuration. The following names are common examples, not a verified list for this repository.

| Example variable | Purpose | Important caution |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Makes the appropriate Clerk public configuration available to the browser. | Confirm the correct environment and provider configuration. |
| `CLERK_SECRET_KEY` | Allows trusted server-side code to use Clerk's privileged API operations where needed. | Never expose it to browser code. |
| `NEXT_PUBLIC_SUPABASE_URL` | Identifies the Supabase project endpoint. | Use the intended project's URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or the applicable publishable key | Identifies the public client key for the configured Supabase integration. | A public key does not replace authorization or RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` or an applicable secret key | Provides privileged server-side database access where configured. | Keep secret and do not use it to bypass required authorization. |

**Before using this table for setup, verify the exact variable names and key model against the chosen Clerk and Supabase SDKs.** Do not create every example variable automatically.

## 6.2 Development, staging, and production

These are separate environments for different purposes.

- **Development:** A safe place to build and test changes locally.
- **Staging:** An optional pre-production environment for testing an integrated version.
- **Production:** The live environment used by actual users.

Each environment should have its own appropriate configuration and database access.

Do not run experimental migrations or destructive test operations against production without a specifically approved process.

## 6.3 Configuration safety

- Never commit real credentials.
- Keep local secret files excluded through `.gitignore`.
- Use `.env.example` to document variable names without secret values.
- Avoid logging secrets.
- Confirm the target environment before running database operations.
- Rotate credentials if they are accidentally exposed.

The final setup instructions and environment-variable list must be updated after the application and integrations are initialized.

---

# 7. Lessons Learned — The War Stories

## 7.1 Current status

Development has not started, so there are no verified project-specific bug histories, fixes, production incidents, or engineering discoveries to document yet.

Inventing these would make the documentation less trustworthy.

This section therefore records preventive guidance and anticipated risks. Replace or expand it with actual incidents and lessons when evidence becomes available.

## 7.2 Anticipated pitfalls

### Pitfall 1: Authentication is not authorization

A signed-in user is not automatically permitted to access every record.

**Prevention:** Check the user's permission for the specific operation and verify company scope on the server.

### Pitfall 2: Company isolation cannot rely on the interface

Hiding another company's data in the UI does not prevent someone from calling an endpoint directly.

**Prevention:** Enforce authorization in the backend and configure and test appropriate database policies.

### Pitfall 3: KPI numbers can look correct and still be wrong

A query that joins several related tables may duplicate records. A date filter can also produce incorrect results around boundaries or timezones.

**Prevention:** Define each KPI explicitly and test representative edge cases against known expected results.

### Pitfall 4: Database changes can affect many features

Changing a relationship or column can break forms, server operations, reports, and tests that depend on it.

**Prevention:** Inspect dependencies, propose the schema change, obtain approval, use a reviewed migration, and verify affected workflows.

### Pitfall 5: AI-generated code can introduce assumptions

An AI assistant may create a plausible field, permission, or workflow that was never part of the requirements.

**Prevention:** Keep the approval-first process and distinguish confirmed requirements from recommendations.

## 7.3 Engineering wisdom

- Decide who owns each record before designing the queries.
- Treat authorization as part of every protected operation.
- Define KPI formulas before building dashboards.
- Keep one authoritative definition for each business rule.
- Test unauthorized operations, not only successful ones.
- Prefer the simplest design that satisfies the approved requirement.
- Record important decisions while their rationale is still clear.
- Verify claims rather than assuming that generated code works.

## 7.4 Future war-story template

When a real issue occurs, record it in this format:

**Incident:** What happened?

**Impact:** Who or what was affected?

**Cause:** What evidence identified the underlying problem?

**Fix:** What change resolved it?

**Verification:** How was the fix tested?

**Prevention:** What should future developers do differently?

**Related files or decisions:** Where can someone find the supporting evidence?

Only record a fix as verified when there is evidence that the relevant behavior was tested.

---

# 8. Quick Reference Card

## 8.1 Project status

| Item | Current understanding |
|---|---|
| Project name | CohortGlobal |
| Purpose | Multi-company KPI and operational management |
| Development stage | Pre-development |
| Intended frontend and application framework | Next.js and React |
| Intended language | TypeScript |
| Intended styling | Tailwind CSS |
| Intended authentication | Clerk |
| Intended database | Supabase PostgreSQL |
| Confirmed employee membership rule | One company per employee account |
| Confirmed administrator boundary | Own company |
| Confirmed CEO visibility | Authorized cross-company access |
| Production URL | Not yet established in this document |
| Staging URL | Not yet established in this document |

## 8.2 Proposed local setup

The project has not yet been verified as initialized or runnable. These are the expected high-level steps, not guaranteed commands for an existing repository.

1. Install a supported Node.js version and the project's selected package manager.
2. Clone or open the repository.
3. Install the dependencies specified by the actual package manifest.
4. Configure the required development environment variables.
5. Set up the approved Clerk and Supabase development projects.
6. Apply the reviewed database migrations using the project's established workflow.
7. Start the development server using the verified project script.
8. Open the local address reported by the development server.
9. Run the available tests and quality checks.

Do not execute database setup commands until the target environment and migration contents are understood.

## 8.3 Common commands

The following are examples commonly used in Next.js projects. Confirm the actual scripts in `package.json` before relying on them.

```bash
# Install dependencies when using npm
npm install

# Start the development server
npm run dev

# Run the configured linter, if available
npm run lint

# Run the configured test script, if available
npm test

# Create a production build
npm run build
```

If the repository uses pnpm, yarn, or another package manager, use the repository's established commands instead.

## 8.4 Important documentation locations

- `AGENTS.md` — shared AI coding instructions.
- `CLAUDE.md` — Claude-specific instructions.
- `.claude/skills/` — specialist Claude Code guidance.
- `docs/architecture.md` — detailed architecture.
- `docs/permissions.md` — role and access boundaries.
- `docs/decisions/` — significant approved architecture decisions.
- `docs/reference/` — original requirements and reference documents, if stored there.

## 8.5 When something breaks

Start with the smallest relevant investigation:

1. Identify the failing user action and error message.
2. Inspect the relevant frontend component and server-side operation.
3. Check authentication and authorization behavior.
4. Inspect the related database query, constraints, and policies.
5. Reproduce the problem in a safe development environment.
6. Propose a fix and explain its impact.
7. Obtain approval before implementing the fix.
8. Test the relevant successful and failure cases.

Do not change multiple unrelated layers at once without a clear reason.

## 8.6 Before production

Before real users depend on the system, verify:

- Authentication and authorization.
- Cross-company isolation.
- Database migrations and recovery procedures.
- KPI formulas and reporting accuracy.
- Error handling and operational visibility.
- Backup and recovery arrangements.
- Environment configuration and secret management.
- Automated tests and production build.
- Deployment configuration and access to administrative consoles.

These are readiness requirements, not claims that the checks have already passed.

---

# Final Note

CohortGlobal should be built around one principle: **shared visibility where authorized, strict company boundaries where required, and KPI numbers that can be explained and trusted.**

The architecture and documentation should help the team achieve that without introducing unnecessary complexity.

This document is a starting reference. Update it as the requirements are confirmed, architecture decisions are approved, implementation is completed, and real lessons emerge. Never replace uncertainty with invented detail.
