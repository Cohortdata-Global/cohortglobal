# 1F — Verification and hardening

## What was verified in the build environment (2026-10-13)

| Check | Result |
|---|---|
| All 11 migrations apply on PostgreSQL 16 with a local Supabase shim | Pass |
| pgTAP: 116 tests in 4 files (RLS isolation, agency rules, projects and contracts) | **All pass** |
| Every `.select(...)` in the app (74) checked against the real schema: tables, columns and embedded relations | No problems |
| Every relationship hint (`!…_fkey`) used for embedded selects exists in the database | All 18 exist |
| Every database function call from the app (41) checked against the real function names and argument names | No problems |
| TypeScript syntax and our own types (with stand-in types for third-party packages) | No errors in our code |
| Unit tests `src/lib/utils.test.ts`, `src/lib/status.test.ts` (12 tests), run with Node's test runner | Pass |

## What could not be run here

The npm registry was blocked by the environment's network policy, so the third-party packages (Next.js, React, Clerk, Supabase client, Tailwind) could not be installed. That means **the app has not been compiled, linted with the real config, or opened in a browser yet.** On your Mac:

```bash
pnpm install
pnpm typecheck     # expect a few type fixes; report them and I'll fix them
pnpm lint
pnpm test          # Vitest unit tests
pnpm db:start && pnpm db:reset && pnpm db:test
pnpm build
pnpm dev
```

## On the owner's Mac (2026-10-13, session 4)

| Check | Result |
|---|---|
| `pnpm install` | Pass (after `pnpm approve-builds`) |
| `pnpm typecheck` | **Pass, no errors** |
| `pnpm lint` | 12 apostrophe errors → rule turned off; re-run pending |
| `pnpm test` | Config load error → `vitest.config.mts`; re-run pending |
| `supabase db push` (hosted) | Done |
| App starts with `pnpm dev` | Yes; a hydration warning on sign-up forms was fixed |
| `pnpm build` | Not yet run |

Requirement found: **Node 22+** (supabase-js 2.117 needs Node's built-in WebSocket).

## Still to do in 1F

- Run the steps above and fix whatever the real compiler and linter report.
- Click through the "How to check by hand" lists in 1C and 1D, on desktop and on a phone.
- Move the remaining hard-coded page text into `src/messages/en.json` (ID-25).
- Application security tests 12–15 from `docs/architecture.md` 6.7 against the running app (direct Server Action calls with another agency's IDs).
- Choose hosting (AD-10) and, with it, a scheduled email drain.
- Part 2 will need camera and microphone access; the current `Permissions-Policy` header blocks them and must be relaxed for the collection page only.
