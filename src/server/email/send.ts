import "server-only";
import { serverEnv } from "@/server/env";
import type { EmailContent } from "@/server/email/templates";

/** printed: no email provider is set up, so the email only went to the server log. */
export type SendResult = { ok: true; id: string | null; printed?: boolean } | { ok: false; error: string };

/**
 * Sends one email through Resend's HTTP API (no SDK needed).
 * Without RESEND_API_KEY (local development) the email is printed to the server log.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    console.info(`[email:dev] to=${to} subject="${content.subject}"\n${content.text}`);
    return { ok: true, id: null, printed: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: content.subject, html: content.html, text: content.text }),
    });
    if (!res.ok) return { ok: false, error: `Resend responded ${res.status}` };
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
