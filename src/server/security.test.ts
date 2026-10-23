import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture 6.7 test 15 (S9): the service-role client, which bypasses row-level
 * security, is imported only by the allow-listed modules.
 */
const ALLOWED = [
  "src/server/db/system-client.ts",
  "src/server/auth/sync-user.ts",
  "src/server/email/",
  "src/server/storage/",
  "src/server/collect/",
  "src/server/invitations/preview.ts",
  "src/app/api/webhooks/clerk/route.ts",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("service-role client", () => {
  it("is imported only by allow-listed modules", () => {
    const users = files("src").filter((f) => /from ["']@\/server\/db\/system-client["']/.test(readFileSync(f, "utf8")));
    const outside = users.map((f) => f.replace(/\\/g, "/")).filter((f) => !ALLOWED.some((a) => f.startsWith(a)));
    expect(outside).toEqual([]);
    expect(users.length).toBeGreaterThan(0);
  });

  it("is never imported by browser code", () => {
    const client = files("src").filter((f) => readFileSync(f, "utf8").startsWith('"use client"'));
    const leaking = client.filter((f) => /@\/server\/db\/system-client/.test(readFileSync(f, "utf8")));
    expect(leaking).toEqual([]);
  });
});
