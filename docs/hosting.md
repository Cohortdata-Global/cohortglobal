# Hosting CohortGlobal (test deployment)

Status: guide written 2026-10-19. Hosting decision AD-10 is still open; this is the recommended path for **testing**.

## Time
- **First deployment:** about 45–60 minutes of the owner's time.
- **After that:** every `git push` to `main` redeploys in about 2 minutes. Phase 2 needs no extra hosting: it is the same app and the same Supabase project.

## 1. Before the first push
1. Create the GitHub repository as **private**.
2. Secrets never go to GitHub. `.gitignore` already covers `.env.local`, `node_modules`, `.next` and `_to_delete/`.
3. In the project folder:
   ```
   git init
   git add .
   git status            # check: no .env.local, node_modules or _to_delete in the list
   git commit -m "Phase 1 and Phase 2A"
   git branch -M main
   git remote add origin <your repo URL>
   git push -u origin main
   ```

## 2. Vercel
1. vercel.com → **Add New → Project** → import the repository. Vercel detects Next.js.
2. **Environment Variables:** copy every value from `.env.local`, with one change:
   `NEXT_PUBLIC_APP_URL=https://<project>.vercel.app`
3. **Settings → Functions → Function Region:** Mumbai (`bom1`), next to Supabase.
4. **Settings → General → Node.js Version:** 22.x.
5. Deploy.

## 3. Clerk
- **Webhooks → Add endpoint:** `https://<project>.vercel.app/api/webhooks/clerk`, subscribed to `user.created`, `user.updated` and `user.deleted`. Put its signing secret in Vercel as `CLERK_WEBHOOK_SIGNING_SECRET`, then redeploy.
- The development instance works on the Vercel address for testing; it shows a small "development mode" badge.

## 4. Supabase
- Run `pnpm supabase db push` from the Mac before testing, so the hosted database has every migration.
- No other change: the app creates its storage buckets (`agency-documents`, `collection-assets`, later `submissions`) on first use, private.
- Free plan: 50 MB per file and 1 GB in total. Delete test uploads now and then.

## 5. Check after it's live
1. `pnpm security:check https://<project>.vercel.app` → expect 16 of 16.
2. Sign in as the Super Admin; open Projects, Agencies and Staff.
3. In an incognito window, sign up a test agency, upload a document, approve it from the console.
4. Browser console (F12): look for red errors and "Content-Security-Policy" warnings. Send screenshots.
5. Open it on a phone over mobile data.
6. Emails don't send until Resend is set up; copy invitation links by hand.

## 6. Before real users
- Production Clerk instance on CohortData's own domain (also removes the sign-in delay).
- Resend with a verified sending domain.
- New Supabase secret key (rotate the one used during development).
- Vercel Pro ($20/month): the free Hobby plan is for non-commercial use.
- Consider Supabase Pro once real videos arrive (100 GB, files up to 500 GB).
- Turn the content security policy from report-only to enforced (`CSP_ENFORCE=1`) after the console shows no warnings.
