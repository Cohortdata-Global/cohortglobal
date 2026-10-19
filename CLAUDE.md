# CLAUDE.md — Claude Code Instructions

## 1. Purpose

This file is the entry point for Claude Code when working in this repository.

It tells Claude Code which project instructions to read, which references to trust, which specialist skills to use, and how to approach development safely.

The shared development rules are defined in `AGENTS.md`. This file complements those rules; it does not replace them.

**Core workflow: Inspect → Understand → Propose → Wait for approval → Implement → Verify → Report.**

Do not skip the approval step.

## 2. Start Every Task by Understanding the Project

Before proposing or implementing a change:

1. Read `AGENTS.md`.
2. Read `docs/TODO.md` (current, next and blocked work) and the latest entries in `docs/JOURNAL.md` (what happened in previous sessions).
3. Read `docs/Decisions/confirmed-decisions.md`, `docs/architecture.md` and `docs/permissions.md`.
4. Read the primary project reference (section 3).
5. Inspect the actual repository structure and relevant files.
6. Read the relevant specialist skill under `.claude/skills/`.
7. Determine what is implemented, what is planned, and what remains unresolved.

Do not assume that a feature exists because it appears in a document, roadmap, or previous AI-generated response.

Use the repository and approved requirements to establish the current state.

## 3. Primary Project Reference

The owner has identified the primary reference as:

`docs/Decisions/reference/cohortdb-overview-v1.pdf`

The supplementary reference is:

`docs/Decisions/reference/Platform Unified PRD and Architecture.docx`

The owner's confirmed decisions are in `docs/Decisions/confirmed-decisions.md`. Where they disagree with the PDF or PRD, the decisions log takes precedence because it records the owner's later decisions.

Read these documents when relevant.

If the primary reference is missing, inaccessible, or inconsistent with the current project, report that fact. Do not invent its contents.

If project documents disagree, explain the discrepancy and request clarification rather than silently resolving it.

**Project identity:** CohortData is the company. CohortGlobal is its product: a data-collection platform run by CohortData for its external vendors, agencies and freelancers. CohortData has no sister companies. Do not reuse roles, terminology or decisions from other kinds of platforms (for example, multi-company KPI dashboards).

## 4. Approval Before Implementation

Claude Code must not make implementation changes until the project owner explicitly approves the proposed work.

### Before approval

You may:
- Inspect files and project structure.
- Read documentation and specialist skills.
- Explain existing behavior.
- Investigate errors using appropriate non-mutating diagnostics.
- Identify risks and dependencies.
- Recommend an approach.
- Propose changes and a testing plan.

You must not:
- Edit application code.
- Edit documentation files.
- Generate or apply migrations.
- Install or remove dependencies.
- Run destructive commands.
- Deploy changes.
- Make unapproved architectural decisions.

**Standing exception:** updating `docs/JOURNAL.md` and `docs/TODO.md` at the end of a session is always approved (see section 10.1). Recording a decision in `docs/Decisions/confirmed-decisions.md` is approved only when the owner has explicitly made that decision.

### Required proposal

Before implementation, present:

1. **Objective:** What needs to change.
2. **Current state:** What exists and what you inspected.
3. **Findings:** Relevant facts and constraints.
4. **Proposed solution:** How you intend to solve the problem.
5. **Files affected:** The expected files and their purposes.
6. **Database and security impact:** Where relevant.
7. **Testing plan:** How you will verify the change.
8. **Risks and alternatives:** Important trade-offs.
9. **Open questions:** Decisions requiring clarification.
10. **Approval requested:** The exact scope awaiting permission.

Then stop and wait.

If the owner changes the scope, revise the proposal and obtain approval for the revised work.

### After approval

Implement only the approved scope.

If a new architectural decision, material risk, or out-of-scope change becomes necessary, stop and request additional approval.

Do not interpret approval for one feature as approval for unrelated improvements.

## 5. Use Specialist Skills

Read the relevant `SKILL.md` before performing specialized work.

Expected skills (folder name = skill name):

- `.claude/skills/database-architect/SKILL.md`
- `.claude/skills/backend-architect/SKILL.md`
- `.claude/skills/project-documentation-architect/SKILL.md`
- `.claude/skills/technical-documentation-writer/SKILL.md`
- `.claude/skills/full-stack-developer/SKILL.md`

Use only the skills relevant to the current task.

Examples:

- Database schema, migrations, constraints, or RLS → `database-architect`.
- APIs, authorization, or server-side business logic → `backend-architect`.
- Documentation accuracy and organization → `project-documentation-architect`.
- Writing or substantially updating `FORME.md` → `technical-documentation-writer`.
- Approved end-to-end feature development → `full-stack-developer`.

If a listed skill does not exist, do not pretend you read it. Report that it is missing and follow the available project instructions.

Skills provide specialized guidance. They do not override the approval requirement or the security rules in `AGENTS.md`.

## 6. Intended Technical Architecture

The currently intended stack is:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Clerk for authentication
- Supabase PostgreSQL for data storage

Verify the actual repository before assuming these technologies have been installed or configured.

Prefer a single Next.js application with Route Handlers and appropriate server-side functions.

Do not create a separate backend, add another database, introduce a new authentication provider, or change the approved stack without explaining the need and receiving approval.

Do not invent package versions, configuration values, routes, tables, or existing integrations.

## 7. Security Is Non-Negotiable

Always follow the security requirements in `AGENTS.md`.

In particular:

- Authenticate protected requests on the server.
- Authorize each protected operation separately.
- Never rely on frontend visibility or client-side filtering as the sole access control.
- Never trust an organization ID, agency ID, role, or permission supplied by the browser.
- Enforce organization-level (agency-level) data isolation: one agency must never see another agency's data.
- Protect private files and sensitive information.
- Keep secrets on the server.
- Never expose Supabase service-role credentials or Clerk secret keys to browser code.
- Evaluate and test database RLS policies where applicable.
- Never broaden access merely to make a feature work.

The exact role model and permissions must come from approved project requirements, not assumptions.

## 8. Respect Existing Work

Before modifying files:

- Inspect the working tree and relevant Git status.
- Identify existing changes that may belong to the owner.
- Read the surrounding code and established conventions.
- Understand the reason for the existing implementation when possible.

Do not overwrite unrelated changes, rewrite entire files unnecessarily, or perform broad refactors for a narrow task.

Do not automatically commit, push, merge, rebase, or deploy.

## 9. Testing and Verification

After approved implementation:

1. Review the diff.
2. Run the relevant tests available in the repository.
3. Run type checking, linting, and build checks when appropriate.
4. Verify relevant authorization and agency-isolation behavior.
5. Check database and migration changes where applicable.
6. Record the actual results.
7. Report anything that remains incomplete.

Do not claim that a test passed unless it was executed successfully.

Do not claim that a feature is production-ready merely because the code compiles.

If a test cannot run, explain why.

## 10. Documentation Accuracy

Keep project documentation consistent with the approved requirements and actual implementation.

Distinguish clearly between:

- Planned functionality.
- Approved requirements.
- Implemented functionality.
- Verified behavior.
- Proposed changes.
- Unresolved questions.

Do not invent features, historical bugs, decisions, or completed work.

Do not duplicate the same source of truth across multiple files without a clear reason.

Update documentation only when it is part of the approved scope.

### 10.1 Journal and to-do list (every session)

At the end of every session, before the final report:

1. Add a new dated entry to `docs/JOURNAL.md` (goal, work done, decisions, mistakes and how they were fixed, files changed, verification, next steps). Append only; never rewrite earlier entries.
2. Update `docs/TODO.md` (tick done items, add new ones, move blocked items, link open questions).

Record only what actually happened. Do not invent work, incidents or results.

## 11. Final Response Format

After completing approved work, report:

### Completed
What was actually implemented.

### Files changed
The real file paths.

### Verification
The commands run and their actual results.

### Security and data impact
Relevant checks or changes.

### Remaining issues
Anything incomplete, blocked, or unresolved.

### Scope
Confirm whether the approved scope was respected.

Keep the report clear, factual, and understandable to someone who did not participate in the implementation.

## 12. Final Rule

**Never guess when a decision affects business rules, architecture, data integrity, or security. Investigate, explain the options, and ask.**

Your responsibility is not merely to generate code. It is to help build a secure, understandable, maintainable system that matches the project owner's approved requirements.