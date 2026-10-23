#!/usr/bin/env node
/**
 * S9 security check against a RUNNING app (ID-51). Usage:
 *   pnpm build && pnpm start          (in one terminal)
 *   pnpm security:check               (in another; default http://localhost:3000)
 *   pnpm security:check http://localhost:3001
 * Checks what anyone can try without an account: private pages and files are
 * closed, the Clerk webhook refuses forged calls, and the security headers are set.
 * The "another agency's IDs" checks need two signed-in accounts: see docs/phase-1/1G-completion-plan.md (S9).
 */
const base = (process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });
const get = (path, init = {}) => fetch(base + path, { redirect: "manual", ...init });

const closed = (s) => [301, 302, 303, 307, 308, 401, 403, 404].includes(s);

for (const path of ["/admin", "/admin/agencies", "/admin/audit", "/agency", "/agency/members", "/work", "/account", "/onboarding/agency", "/admin/qc", "/admin/projects", "/admin/submissions/00000000-0000-0000-0000-000000000000", "/preview/projects/00000000-0000-0000-0000-000000000000"]) {
  const r = await get(path);
  const loc = r.headers.get("location") ?? "";
  check(`No account: ${path} is closed`, closed(r.status) && (r.status !== 200), `${r.status} ${loc.slice(0, 60)}`);
}
const Z = "00000000-0000-0000-0000-000000000000";
for (const path of ["/agency/members/export", `/api/documents/${Z}`, `/api/submission-files/${Z}`, `/api/project-assets/${Z}`, `/api/projects/${Z}/submissions-csv`, `/c/${"x".repeat(32)}/asset/${Z}`]) {
  const r = await get(path);
  const body = r.status === 200 ? await r.text() : "";
  check(`No account: ${path} returns no data`, closed(r.status) && !body.includes("@"), `${r.status}`);
}

// Public submission links (2C): an unknown token shows a plain "not valid" page, hidden from search engines.
const link = await get(`/c/${"x".repeat(32)}`);
const linkBody = link.status === 200 ? await link.text() : "";
check("Unknown public link: no data, noindex", link.status === 200 && /noindex/i.test(linkBody) && !/[\w.%+-]+@[\w-]+\.[a-z]{2,}/i.test(linkBody), `${link.status}`);

const hook = await get("/api/webhooks/clerk", {
  method: "POST",
  headers: { "content-type": "application/json", "svix-id": "msg_fake", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,ZmFrZQ==" },
  body: JSON.stringify({ type: "user.created", data: { id: "user_attacker", email_addresses: [] } }),
});
check("Forged Clerk webhook is refused", hook.status === 400, `${hook.status}`);

const home = await get("/");
const h = (k) => home.headers.get(k);
check("X-Frame-Options: DENY", h("x-frame-options") === "DENY", h("x-frame-options"));
check("X-Content-Type-Options: nosniff", h("x-content-type-options") === "nosniff", h("x-content-type-options"));
check("Content-Security-Policy set (report-only or enforced)", !!(h("content-security-policy") || h("content-security-policy-report-only")),
  h("content-security-policy") ? "enforced" : h("content-security-policy-report-only") ? "report-only" : "missing");
check("No X-Powered-By header", !h("x-powered-by"), h("x-powered-by") ?? "absent");
const https = base.startsWith("https://");
check("HSTS on the live site", !https || !!h("strict-transport-security"), https ? h("strict-transport-security") ?? "missing" : "skipped on http://localhost");

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail ?? ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} passed against ${base}`);
process.exit(failed ? 1 : 0);
