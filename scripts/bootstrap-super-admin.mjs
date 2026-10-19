/**
 * One-time Super Admin bootstrap (confirmed decision Q5, docs/architecture.md 6.5).
 *
 *   1. Sign up in the app with the email that should become Super Admin.
 *   2. Run:  pnpm bootstrap:super-admin you@cohortdata.com
 *
 * It calls public.bootstrap_super_admin with the service role. The database
 * refuses if a Super Admin already exists, so running it twice does nothing.
 * Plain JavaScript so it runs on Node 20 and later without a build step.
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !email.includes("@")) {
  console.error("Usage: pnpm bootstrap:super-admin <email>");
  process.exit(1);
}
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.rpc("bootstrap_super_admin", { p_email: email });
if (error) {
  console.error(`Bootstrap refused: ${error.message}`);
  process.exit(1);
}
console.log(`Done. ${email} is now the Super Admin (user ${String(data)}). Sign in again to open the console.`);
