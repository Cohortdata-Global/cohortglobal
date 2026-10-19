# 1A — Project scaffold

**Status:** written, not yet compiled. The package registry was blocked in the build environment, so `pnpm install`, `pnpm typecheck` and `pnpm build` must be run on your machine first (see 1F).

## Contents

| Part | Files |
|---|---|
| Tooling | `package.json` (pnpm), `tsconfig.json` (strict, `noUncheckedIndexedAccess`), `eslint.config.mjs`, `vitest.config.mts`, `postcss.config.mjs`, `next.config.ts` |
| Environment | `.env.example`, `src/server/env.ts` (validated with zod at first use) |
| Auth wiring | `src/middleware.ts` (Clerk; public routes: `/`, sign-in, sign-up, `/invite`, `/legal`, `/c`, webhooks) |
| Database clients | `src/server/db/user-client.ts` (user's Clerk token, AD-1), `src/server/db/system-client.ts` (service role; allow-listed, enforced by a lint rule) |
| i18n | `src/i18n/request.ts`, `src/messages/en.json` (English only, Q9) |
| Design system | `src/app/globals.css` (tokens and keyframes), `src/components/ui/*` |
| App frame | `src/components/app/app-shell.tsx`, `sidebar.tsx`, `top-bar.tsx`, `page-skeleton.tsx`, `src/app/*/loading.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx` |

## Design system ("field ledger", ID-22)

- **Colour:** paper `#f4f5f7`, surface white, ink `#141821`, pine accent `#0b6b5d`, amber for things that need attention, rose for rejections.
- **Type:** Bricolage Grotesque for headings and numbers, Instrument Sans for text.
- **Signature element:** the stage track (`src/components/app/stage-track.tsx`).
- **Motion:** CSS only (ID-23): page content rises in once, dialogs pop, the stage track fills, cards lift a pixel on hover. Everything stops under "reduce motion".
- **Speed:** server-rendered pages, a skeleton appears instantly while a page loads, filters update the URL without a full reload, and no animation or chart libraries are shipped.

## Security headers

`next.config.ts` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy and a permissions policy. Server Actions accept up to 11 MB (for 10 MB documents).
