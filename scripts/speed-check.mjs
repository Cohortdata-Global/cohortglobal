/**
 * Speed check (plan item P2). Run on the computer where the app runs:
 *   pnpm speed:check
 * Measures the round trip from this computer to each service the app depends on,
 * and to the app itself if it is running on http://localhost:3000.
 * Prints the median of several tries so one slow try doesn't mislead.
 */
const env = process.env;
const tries = 5;

async function time(url, init) {
  const t = performance.now();
  try {
    const r = await fetch(url, { ...init, redirect: "manual", cache: "no-store" });
    await r.arrayBuffer().catch(() => {});
    return { ms: performance.now() - t, status: r.status };
  } catch (e) {
    return { ms: NaN, status: `error: ${e.cause?.code ?? e.message}` };
  }
}

async function measure(label, url, init) {
  const results = [];
  for (let i = 0; i < tries; i++) results.push(await time(url, init));
  const ok = results.filter((r) => Number.isFinite(r.ms)).map((r) => r.ms).sort((a, b) => a - b);
  const median = ok.length ? Math.round(ok[Math.floor(ok.length / 2)]) : null;
  const first = Number.isFinite(results[0].ms) ? Math.round(results[0].ms) : "-";
  const verdict = median === null ? "UNREACHABLE" : median < 150 ? "fast" : median < 400 ? "ok" : "SLOW";
  console.log(`${label.padEnd(44)} median ${String(median ?? "-").padStart(5)} ms   first ${String(first).padStart(5)} ms   ${verdict}   (status ${results[0].status})`);
}

console.log(`Node ${process.versions.node}. ${tries} tries each.\n`);
if (env.NEXT_PUBLIC_SUPABASE_URL) {
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  await measure("Supabase database API (Mumbai)", `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, { headers: { apikey: key } });
  await measure("Supabase storage API", `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/version`, { headers: { apikey: key } });
} else console.log("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
if (env.CLERK_FRONTEND_API_DOMAIN) {
  await measure("Clerk sign-in service (development instance)", `https://${env.CLERK_FRONTEND_API_DOMAIN}/v1/environment`);
} else console.log("CLERK_FRONTEND_API_DOMAIN is not set in .env.local");
await measure("Clerk backend API (used on first visit only)", "https://api.clerk.com/v1/health");
const app = env.SPEED_CHECK_URL ?? "http://localhost:3000";
await measure(`This app: home page (${app})`, `${app}/`);
await measure("This app: sign-in page", `${app}/sign-in`);
console.log(`
How to read this:
- Supabase under 150 ms is good from India (Mumbai region).
- Clerk's development service runs outside India, so 250-700 ms is normal and is paid on every sign-in and
  whenever the 60-second session token refreshes. A production Clerk instance on our own domain removes the extra redirect.
- "This app" in development mode compiles each page on first visit (seconds). Judge real speed with: pnpm build && pnpm start`);
