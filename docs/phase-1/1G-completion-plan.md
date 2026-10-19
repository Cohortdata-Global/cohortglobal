# 1G — Phase 1 completion plan

**Started:** 2026-10-15. **Owner's goal:** Phase 1 finished, secure, and fast. Nothing moves to Part 2 until every item below is ✅.

Status: ✅ done · 🔄 in progress · ⬜ not started · 👤 needs the owner

Phase 1 counts as **complete** only when the security, speed and flow sections below are all done.

---

## S — Security

| # | Item | Status | Evidence |
|---|---|---|---|
| S1 | Structural database checks as tests: RLS on every table, no write grants, anon locked out, definer functions pin `search_path`, no policies for anon | ✅ 2026-10-15 | `supabase/tests/005_security_catalog.test.sql` (9 checks pass) |
| S2 | Lock private helper functions (some run with owner rights) so signed-in users can only run the read-only access checks | ✅ 2026-10-15 | migration `20261015000100_lock_helper_functions.sql`; S1 test 6 |
| S3 | **Bug fixed:** upload "finish" step could be pointed at an approved document's file and delete it. Now only server-issued, signed, 2-hour upload tickets are accepted, and recorded files are never deleted | ✅ 2026-10-15 | `src/server/storage/documents.ts` (ticket), `completeAgencyDocumentUpload` |
| S4 | Flood protection: max 40 invitations per person per hour, max 5 sends per invitation | ✅ 2026-10-15 | migration `20261015000200_invitation_rate_limits.sql`; `006_rate_limits.test.sql` |
| S5 | HTTPS-only header (HSTS) in production | ✅ 2026-10-15 | `next.config.ts` |
| S6 | Review every privileged (service-key) code path: user sync, webhook, invitation preview, email outbox, storage | ✅ 2026-10-15 | All gated by a signature, a permission check or a database decision; the lint rule blocks new uses |
| S7 | Review every server action and route: input validated, permission checked in the database, no open redirects, no raw HTML, CSV injection guarded | ✅ 2026-10-15 | No `dangerouslySetInnerHTML`; redirect targets checked; 41 database calls checked against real function signatures |
| S8 | Content-Security-Policy (blocks injected scripts). Report-only first; enforce with `CSP_ENFORCE=1` once the browser console shows no CSP warnings | 🔄 2026-10-15 | Added (ID-51). Owner: check the console on sign-in, upload and main screens, send any CSP warnings |
| S9 | Security tests 12–15 from `architecture.md` 6.7 against the running app | 🔄 2026-10-15 | Automated part ✅: `pnpm security:check` 16/16 (no-account access, forged webhook, headers) and the service-role import test. Owner part: the two-account check below |
| S10 | Production secrets: new Clerk **production** instance, rotate Supabase secret key before launch, keys only in the host's env settings | 👤 ⬜ | At hosting time (AD-10) |
| S11 | Supabase dashboard: confirm only `public` is exposed in the Data API, email/password auth disabled (we use Clerk), bucket `agency-documents` private | 👤 ⬜ | 2-minute check; steps in the journal |

## P — Speed

| # | Item | Status | Evidence |
|---|---|---|---|
| P1 | Timing lines in the terminal for every slow step (`[perf] db get_my_context 48 ms`, `clerk auth()`, each database call, notifications) | ✅ 2026-10-15 | `src/server/perf.ts` |
| P2 | `pnpm speed:check`: measures this computer → Supabase, → Clerk, → the app | ✅ 2026-10-15 | `scripts/speed-check.mjs` |
| P3 | Owner runs P2 and sends the output; we compare with the `[perf]` lines | 🔄 2026-10-15 | Speed check: Supabase 74 ms (fast), storage 88 ms, Clerk dev 394 ms per call, Clerk backend 365 ms, app pages 103–333 ms after first compile. `[perf]` lines still to send. |
| P4 | Fix whatever P3 shows is slow. Known so far: Clerk's development instance adds a redirect to a server outside India on sign-in and token refresh; development mode compiles each page on first visit | ⬜ | |
| P5 | Judge speed on a production build (`pnpm build && pnpm start`), not `pnpm dev` | 👤 ⬜ | |
| P6 | Earlier fixes kept: direct-to-storage uploads, top-bar data fetched in parallel, fonts bundled, per-request database client | ✅ 2026-10-13 | ID-32, ID-33, ID-35 |

## B — Phase 1 features still missing (found in the 2026-10-15 review against the original Phase 1 list)

| # | Item | Status |
|---|---|---|
| B1 | Members: bulk invite by CSV import, with a sample CSV | ✅ 2026-10-15 (ID-47) |
| B2 | Members list: filter by role and status; export follows filters | ✅ 2026-10-15 (ID-48) |
| B3 | Emails actually sent: Resend key and sending domain (today they print in the terminal) | 👤 ⬜ |
| B4 | Page text moved into the English language file (translation-ready) | ✅ 2026-10-15 (ID-49, `docs/i18n.md`) |
| B5 | Audit coverage check: every important action writes an audit entry | ✅ 2026-10-15 (ID-50; 2 gaps fixed; test 009) |
| B6 | Agency review: **Ask for changes** (middle option between approve and reject; agency fixes and sends back with no wait). Requested by owner 2026-10-15 | ✅ 2026-10-15 (ID-42; 16 database tests) |
| B8 | Agency application locked while in review; editable only as a draft, after "Ask for changes", or after the 3-day rejection wait. Sign-up becomes details → documents → send. Requested by owner 2026-10-15 | ✅ 2026-10-15 (ID-44; 12 database tests) |
| B7 | Documents as cards with preview and **View** button; no upload/delete for the admin on the review screen. Requested by owner 2026-10-15 | ✅ 2026-10-15 (ID-43) |

## F — Flows on the real setup (owner's Mac + hosted Supabase)

| # | Flow | Status |
|---|---|---|
| F0 | `pnpm supabase db push` (applies the newest migrations, including `20261015000300_agency_changes_requested`) | 👤 ⬜ |
| F1 | Super Admin bootstrap, land in the console | ✅ 2026-10-15 (Sameer Shaik, Super Admin; console loads with live counts) |
| F2 | Agency signs up (details, then documents, then send) and can no longer edit; Super Admin asks for changes; agency replaces the document and sends back; Super Admin approves | 👤 ⬜ |
| F3 | Super Admin invites staff (PM); PM accepts | ⬜ |
| F4 | PM creates a project with questions and a contract, publishes | ⬜ |
| F5 | Agency applies; PM approves; Owner signs; PM countersigns; work open | ⬜ |
| F6 | Owner invites a Manager and a Member; assigns the Member to the project; Member sees only that project | ⬜ |
| F7 | Direct freelancer signs up, applies, signs, gets countersigned | ⬜ |
| F8 | Requests: profile change with a document, ownership transfer, deactivation; Super Admin decides | ⬜ |
| F9 | Phone-size check of the main screens | ⬜ |

## D — Documentation

| # | Item | Status |
|---|---|---|
| D1 | This plan, updated after every round | 🔄 |
| D2 | Journal entry per round; decisions ID-38 to ID-49 | ✅ 2026-10-15 |
| D3 | `docs/permissions.md` and `1B-database.md` updated for S2 and S4 | ✅ 2026-10-15 |

## S9 — two-account check (owner, about 10 minutes)

You need two approved agencies (A and B), one open in a normal window and one in incognito.

1. Run `pnpm build && pnpm start` and, in another terminal, `pnpm security:check http://localhost:3000`. All lines should say PASS.
2. In A's window, copy three links: a project page (`/agency/projects/…`), a job page (`/agency/jobs/…`), and a document's **View** link (right-click → Copy link).
3. Paste each into B's window. Each must show "This page isn't here" (or an empty page), never A's data.
4. As an agency **Member**, open `/agency` and `/admin`. You must land on your own workspace.
5. As an agency **Owner**, open `/admin`. You must land on `/agency`.
