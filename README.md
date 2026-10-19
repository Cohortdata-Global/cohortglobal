# CohortGlobal

CohortData's data-collection platform for external agencies, vendors and freelancers.

- **Phase 1 (this code):** accounts, agencies, invitations, projects (job pages), applications, contracts, member assignment, and the three workspaces: the CohortData console (`/admin`), the agency portal (`/agency`) and the contributor workspace (`/work`).
- **Part 2:** data collection (public links, submissions, QC, delivery). **Part 3:** finance.

Where to read more:

| Document | What it covers |
|---|---|
| `docs/phase-1/README.md` | What was built, module by module (1A–1F), and how to check each one |
| `docs/Decisions/confirmed-decisions.md` | The owner's decisions and the open questions |
| `docs/Decisions/implementation-decisions.md` | Technical choices made while building, with how to change each |
| `docs/architecture.md`, `docs/permissions.md` | Blueprint and the permission matrix |
| `docs/JOURNAL.md`, `docs/TODO.md` | Session log and task list |

## Stack

Next.js 15 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4, Clerk (sign-in only), Supabase Postgres with row-level security, Supabase Storage (agency documents), Resend (email), zod, next-intl (English), Vitest and pgTAP.

## First-time setup

Requirements: **Node 22+** (Supabase's client needs it), pnpm and the Supabase CLI (installed with the dev dependencies). Docker is only needed for the optional local database.

No admin rights on the Mac? Install both into your home folder:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash   # then open a new Terminal
nvm install 22 && nvm alias default 22
curl -fsSL https://get.pnpm.io/install.sh | sh -                                     # then: source ~/.zshrc
```

1. **Install**
   ```bash
   pnpm install
   pnpm approve-builds   # once: allow the listed packages to build (press a, Enter, y)
   cp .env.example .env.local   # put real keys in .env.local only; .env.example stays as placeholders
   ```
2. **Clerk.** Create a development application at dashboard.clerk.com.
   - Copy the publishable and secret keys into `.env.local`.
   - Under *Integrations*, enable **Supabase** (this adds the `role: authenticated` claim to session tokens). Put your Clerk frontend API domain (for example `your-app.clerk.accounts.dev`) in `CLERK_FRONTEND_API_DOMAIN`.
   - Add a webhook to `https://<your-tunnel>/api/webhooks/clerk` for `user.created`, `user.updated` and `user.deleted`, and copy its signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`. Locally the webhook is optional: the app creates the user on first sign-in (ID-04).
3. **Database.** Either a free hosted project (what we use now) or the local Docker stack.

   *Hosted (supabase.com):* create a project; copy the Project URL, **Publishable key** (into `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and a **Secret key** (into `SUPABASE_SERVICE_ROLE_KEY`) into `.env.local`; add Clerk under Authentication → Sign In / Providers → Third-party auth; create a private Storage bucket named `agency-documents`; then:
   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref <20-letter ref from the URL>
   pnpm supabase db push      # needs CLERK_FRONTEND_API_DOMAIN in .env.local or the shell
   ```
   *Local (Docker):*
   ```bash
   pnpm db:start        # starts local Supabase and prints the URL and keys
   pnpm db:reset        # applies supabase/migrations
   pnpm db:test         # runs the pgTAP tests (116 at the time of writing)
   ```
   Copy the printed API URL, anon key and service-role key into `.env.local`.
4. **Run**
   ```bash
   pnpm dev
   ```
5. **Make yourself Super Admin (once).** Sign up at `/sign-up` with your CohortData email, then:
   ```bash
   pnpm bootstrap:super-admin you@cohortdata.com
   ```
   Sign out and in again; you land in the console. The database refuses a second Super Admin.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm check` | Type-check, lint and unit tests |
| `pnpm db:test` | Database security and workflow tests (needs Docker) |
| `pnpm db:test:local` | The same tests on a plain PostgreSQL server, without Docker (see `scripts/db/test-local.sh`) |
| `pnpm db:types` | Generate TypeScript types from the local database |

## Rules for changes

Read `AGENTS.md` first. In short: the browser never gets the service-role key; every write goes through a database function that checks permissions; never edit an applied migration (add a new one); keep `docs/JOURNAL.md` and `docs/TODO.md` current.
