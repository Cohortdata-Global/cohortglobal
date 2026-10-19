"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/server/actions/_rpc";
import { invalid, ok, zodFieldErrors, type ActionResult } from "@/server/errors";
import { getViewer } from "@/server/auth/viewer";
import { sendEmail } from "@/server/email/send";
import { invitationEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { BULK_INVITE_MAX } from "@/lib/bulk-invite";
import { k, serverText } from "@/server/i18n";

const schema = z.object({
  purpose: z.enum(["PLATFORM_STAFF", "AGENCY_OWNER", "AGENCY_MANAGER", "AGENCY_MEMBER"]),
  email: z.string().trim().toLowerCase().email(k("email")),
  organization_id: z.string().uuid().optional().nullable(),
  role_code: z.enum(["OPERATIONS_MANAGER", "PROJECT_MANAGER", "QC_LEAD", "QC_REVIEWER"]).optional().nullable(),
  agency_name: z.string().trim().max(160).optional().nullable(),
  message: z.string().trim().max(500).optional().nullable(),
  invitee_name: z.string().trim().max(120, k("nameLength")).optional().nullable(),
});

export type InvitationInput = z.input<typeof schema>;
type Created = { id: string; token: string; expires_at: string };

async function deliver(purpose: string, email: string, token: string, expiresAt: string, organizationName: string | null, message: string | null, inviteeName: string | null = null) {
  const viewer = await getViewer();
  const link = `${serverEnv().NEXT_PUBLIC_APP_URL}/invite/${token}`;
  const result = await sendEmail(email, invitationEmail({
    purpose, inviterName: viewer?.user.fullName ?? viewer?.user.email ?? "CohortData", organizationName, link, expiresAt, message, inviteeName,
  }));
  return { link, emailed: result.ok && !result.printed, notConfigured: result.ok && !!result.printed };
}

/**
 * Creates an invitation and emails it. The raw token exists only in this
 * response and the email; the database keeps a hash (ID-09). The link is also
 * returned so the inviter can copy it if the email does not arrive.
 */
export async function createInvitation(input: InvitationInput): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const t = await serverText();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const v = parsed.data;
  const r = await callRpc<Created>("create_invitation", {
    p_purpose: v.purpose, p_email: v.email, p_organization_id: v.organization_id ?? null,
    p_role_code: v.role_code ?? null, p_agency_name: v.agency_name ?? null, p_message: v.message ?? null,
    p_invitee_name: v.invitee_name || null,
  });
  if (!r.ok) return r;
  const viewer = await getViewer();
  const orgName = v.purpose === "AGENCY_OWNER" ? v.agency_name ?? null : v.purpose === "PLATFORM_STAFF" ? "CohortData" : viewer?.organization?.name ?? null;
  const sent = await deliver(v.purpose, v.email, r.data.token, r.data.expires_at, orgName, v.message ?? null, v.invitee_name || null);
  revalidatePath("/", "layout");
  return ok(sent, sent.emailed ? t.done("invitationSent", { email: v.email })
    : sent.notConfigured ? t.done("invitationNotEmailed") : t.done("invitationEmailFailed"));
}

export async function resendInvitation(id: string, purpose: string, email: string, organizationName: string | null) {
  const t = await serverText();
  const r = await callRpc<Created>("resend_invitation", { p_invitation: id });
  if (!r.ok) return r;
  const sent = await deliver(purpose, email, r.data.token, r.data.expires_at, organizationName, null);
  revalidatePath("/", "layout");
  return ok(sent, sent.emailed ? t.done("invitationResent", { email })
    : sent.notConfigured ? t.done("newLinkNotEmailed") : t.done("newLinkEmailFailed"));
}

export async function revokeInvitation(id: string) {
  const t = await serverText();
  const r = await callRpc("revoke_invitation", { p_invitation: id }, t.done("invitationRevoked"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function acceptInvitation(token: string) {
  const t = await serverText();
  const r = await callRpc<{ purpose: string; organization_id: string; role: string }>("accept_invitation", { p_token: token }, t.done("invitationAccepted"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/* ---------------- Bulk invite by CSV (B1, ID-47) ---------------- */

const bulkRow = z.object({
  line: z.number().int().min(1),
  name: z.string().trim().max(120, k("nameLength")).optional().default(""),
  email: z.string().trim().toLowerCase().email(k("emailRow")),
  role: z.enum(["AGENCY_MEMBER", "AGENCY_MANAGER"]),
  message: z.string().trim().max(500, k("messageLength")).optional().default(""),
});

export type BulkInviteRow = z.input<typeof bulkRow>;
export type BulkInviteResult = { line: number; email: string; ok: boolean; error?: string };

/**
 * Invites each row of an uploaded CSV to the viewer's agency. Every row goes through
 * the same database function as a single invitation, so permissions, the one-Manager
 * rule and the hourly limit all apply; each row reports its own result.
 */
export async function bulkInviteMembers(organizationId: string, rows: BulkInviteRow[]): Promise<ActionResult<{ results: BulkInviteResult[]; emailed: boolean }>> {
  const t = await serverText();
  if (!z.string().uuid().safeParse(organizationId).success) return { ok: false, error: t.error("agencyNotFound") };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: t.error("noRows") };
  if (rows.length > BULK_INVITE_MAX) return { ok: false, error: t.error("tooManyRows", { max: BULK_INVITE_MAX }) };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: t.error("signInAgain") };
  const orgName = viewer.organization?.name ?? null;

  const results: BulkInviteResult[] = [];
  let emailed = true;
  const invite = async (raw: BulkInviteRow): Promise<BulkInviteResult> => {
    const parsed = bulkRow.safeParse(raw);
    if (!parsed.success) return { line: Number(raw?.line) || 0, email: String(raw?.email ?? ""), ok: false, error: t.field(parsed.error.issues[0]?.message ?? "") || t.error("invalidRow") };
    const v = parsed.data;
    const r = await callRpc<Created>("create_invitation", {
      p_purpose: v.role, p_email: v.email, p_organization_id: organizationId, p_role_code: null, p_agency_name: null,
      p_message: v.message || null, p_invitee_name: v.name || null,
    });
    if (!r.ok) return { line: v.line, email: v.email, ok: false, error: r.error };
    const sent = await deliver(v.role, v.email, r.data.token, r.data.expires_at, orgName, v.message || null, v.name || null);
    if (!sent.emailed) emailed = false;
    return { line: v.line, email: v.email, ok: true };
  };
  // A few at a time: fast for large files without flooding the database or the email provider.
  for (let i = 0; i < rows.length; i += 5) {
    results.push(...(await Promise.all(rows.slice(i, i + 5).map(invite))));
  }
  revalidatePath("/", "layout");

  // The window shows the per-row outcome and its own pop-up message.
  return ok({ results, emailed });
}
