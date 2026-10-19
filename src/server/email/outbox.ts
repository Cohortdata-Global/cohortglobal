import "server-only";
import { systemClient } from "@/server/db/system-client";
import { serverEnv } from "@/server/env";
import { renderQueued } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";

type OutboxRow = { id: string; to_email: string; template: string; payload: Record<string, unknown>; attempts: number };

/**
 * Sends emails queued by database functions (app.queue_email). Called with
 * next/server `after()` once an action has committed, so a slow or failing email
 * never blocks or undoes the business action. Rows that fail stay PENDING and
 * are retried on the next drain, up to 5 attempts.
 */
export async function drainOutbox(limit = 20): Promise<void> {
  const db = systemClient();
  const { data, error } = await db
    .from("email_outbox")
    .select("id,to_email,template,payload,attempts")
    .eq("status", "PENDING")
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return;
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;
  for (const row of data as OutboxRow[]) {
    const content = renderQueued(row.template, row.payload ?? {}, appUrl);
    if (!content) {
      await db.from("email_outbox").update({ status: "FAILED", last_error: `Unknown template ${row.template}` }).eq("id", row.id);
      continue;
    }
    const result = await sendEmail(row.to_email, content);
    if (result.ok) {
      await db.from("email_outbox").update({ status: "SENT", sent_at: new Date().toISOString(), provider_message_id: result.id, attempts: row.attempts + 1 }).eq("id", row.id);
    } else {
      await db.from("email_outbox").update({ attempts: row.attempts + 1, last_error: result.error, status: row.attempts + 1 >= 5 ? "FAILED" : "PENDING" }).eq("id", row.id);
    }
  }
}
