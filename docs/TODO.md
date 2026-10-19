# CohortGlobal — To-Do List

Updated at the end of every session (see `AGENTS.md` section 0.4). Tick items when done and note the date. Blocked items name the question they wait on (IDs from `docs/Decisions/confirmed-decisions.md`).

Last updated: 2026-10-19 (session 8)

---

## Now — owner actions

- [x] Install pnpm (home-folder installer) and packages; approve build scripts (2026-10-13)
- [x] `pnpm typecheck` passes on the Mac (2026-10-13)
- [x] Hosted Supabase project, Clerk dev app, Clerk ↔ Supabase third-party auth, migrations pushed (2026-10-13)
- [ ] Install Node 22 with nvm, then `pnpm install` again (also installs the bundled fonts)
- [ ] `pnpm install` (font package changed to Google Sans Flex) and review the new homepage
- [ ] Retry a document upload (new direct-to-storage upload, ID-32)
- [ ] Judge speed on a production build: `pnpm build && pnpm start`
- [ ] `pnpm bootstrap:super-admin sameer@cohortdata.com`, restart `pnpm dev`, sign in again
- [ ] Create the private `agency-documents` bucket in Supabase Storage (if not done)
- [x] typecheck, lint, 12 unit tests, production build and start all pass (Linux workspace, 2026-10-13)
- [ ] Clerk webhook (needs a public URL; optional while self-sync covers sign-in)
- [ ] Answer Q28 (countersigners), Q29 (Manager sees agency activity), Q30 (PMs invite agencies to projects), Q31 (documents in Supabase Storage)
- [ ] `pnpm supabase db push` (new: agency "Ask for changes", application locked in review, helper lockdown, invitation limits), then try **Ask for changes** on "adept"
- [ ] Delete `_to_delete/` and `skills-update/` (skills are already copied into `.claude/skills/`)

## Phase 0 — documentation and blueprint

- [x] Architecture, permissions, journal, TODO, skills retargeted (2026-10-12)
- [x] Q2–Q9 answered, AD-1 approved (2026-10-12)
- [x] 50-question table answered; AD-2 to AD-9 approved (2026-10-13)

## Phase 1 — platform foundation (see `docs/phase-1/`)

- [x] 1A Scaffold: tooling, env, middleware, clients, i18n, design system, shell (2026-10-13; not compiled yet)
- [x] 1B Database: 11 migrations, RLS, audit, 116 pgTAP tests passing (2026-10-13)
- [x] 1C Identity: webhook, self-sync, bootstrap, sign-up paths, agency application and review, invitations, requests, staff, account (2026-10-13)
- [x] 1D Projects: projects, questions, contracts, project invitations, applications, decisions, signing, countersigning, revoking (2026-10-13)
- [x] 1E Portals: console, agency portal, workspace, dashboards, members CSV export (2026-10-13)
- [x] Agency review: Ask for changes, document cards with View, read-only documents while reviewing (2026-10-15, ID-42, ID-43); application locked while in review, two-step sign-up (2026-10-15, ID-44)
- [ ] 1G completion plan: remaining items in `docs/phase-1/1G-completion-plan.md` (B1–B5, S8–S11, P3–P5, F0–F9)
- [ ] 1F Hardening
  - [ ] Fix whatever the real `typecheck`, `lint` and `build` report
  - [ ] Click-through on desktop and phone (lists in `docs/phase-1/1C-identity.md` and `1D-projects.md`)
  - [ ] Security tests 12–15 (architecture 6.7) against the running app
  - [x] Move hard-coded page text into `src/messages/en.json` (ID-25, ID-49, 2026-10-15)
  - [x] Hydration warning on sign-up forms: fixed country list and timezone defaults (2026-10-13)
  - [ ] Generate database types (`pnpm db:types`) and type the Supabase clients
  - [ ] Add a scheduled email-outbox drain once hosting is chosen (AD-10)
  - [ ] Production email domain for Resend; real privacy policy and terms (legal pages are drafts)

## Part 2 — data collection (plan: `docs/phase-2/README.md`, 2026-10-18)

- [x] Owner answers Q32–Q41 (2026-10-19)
- [x] Operations Manager role; PMs see only assigned projects (2026-10-19, ID-52) — owner: `pnpm supabase db push`, then invite an Operations Manager from Staff
- [ ] Owner: provide the new Git remote, then initialize this folder and push (old local history and `Cohortdata-Global/cohortglobal` link removed 2026-10-19). Deploy to Vercel using `docs/hosting.md`
- [x] 2A (2026-10-19, ID-53) Storage foundation: private `submissions` bucket in Supabase, `StorageProvider` interface (swap to the 2 TB server later), resumable TUS uploads with per-session tickets; PM data-requirements builder (file slots, metadata form, consent, quotas)
- [ ] 2B Logged-in collection in `/work`: sessions (5 h), form, consent, uploads, submit
- [ ] 2C Public links (one freelancer per link, 24 h, hashed tokens, Super Admin can revoke), `/c/[token]` mobile page, `link_contributors`; relax `Permissions-Policy` for camera and microphone there only
- [ ] 2D Automated checks: type/size/duration, metadata, duplicates (auto-reject on hash, email, phone, ID; flag name+DOB, device, name+phone), quotas
- [ ] 2E QC: queue per project, QC Lead assigns, reviewer workspace, approve / request resubmission / reject with remarks; remarks on link page and in `/work`
- [ ] 2F Delivery batches with CSV/JSON manifest; dashboards for PM, QC Lead, agency
- [ ] 2G Security tests, phone speed, docs

## Part 3 — finance (not in v1)

- [ ] Earnings, invoices, payment records, payment info, tax info (Stripe candidate); Finance role

---

## Blocked / waiting on the owner

| Item | Waiting on |
|---|---|
| Who countersigns | Q28 (built: Super Admin and PMs) |
| Manager access to agency activity | Q29 (built: yes) |
| PMs inviting agencies to projects | Q30 (built: yes) |
| Agency document storage | Q31 (built: Supabase Storage) |
| QC roles and levels | Q27 |
| Hosting | AD-10 |
| Media storage | AD-11 |
| Legal review of storage location | #41 |
