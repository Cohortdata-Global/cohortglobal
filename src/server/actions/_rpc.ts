import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { createUserClient } from "@/server/db/user-client";
import { drainOutbox } from "@/server/email/outbox";
import { fail, ok, type ActionResult, type SuccessMessage } from "@/server/errors";
import { timed } from "@/server/perf";
import { serverText } from "@/server/i18n";

/**
 * Calls a database function as the signed-in user (AD-1). The function checks
 * permissions itself; server actions add input validation and friendly errors.
 */
export async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>, successMessage?: SuccessMessage): Promise<ActionResult<T>> {
  const db = await createUserClient();
  const { data, error } = await timed(`db ${fn}`, db.rpc(fn, args));
  if (error) {
    const t = await serverText();
    return fail(error, { fallback: t.error("fallback"), noAccess: t.error("noAccess"), exists: t.error("exists"), sessionExpired: t.error("sessionExpired") });
  }
  return ok(data as T, successMessage);
}

/** Sends any emails queued by the action after the response is sent. */
export function sendQueuedEmailsLater() {
  after(async () => {
    try {
      await drainOutbox();
    } catch (e) {
      console.error("[cohortglobal] email outbox drain failed", e instanceof Error ? e.message : e);
    }
  });
}

/** IP and browser for click-to-accept signatures (#26). */
export async function requestFingerprint(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}
