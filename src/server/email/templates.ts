/**
 * Plain, transactional emails. One function per template name used in the
 * database (app.queue_email) or by the invitation actions.
 */
export type EmailContent = { subject: string; text: string; html: string };

const ROLE_WORDS: Record<string, string> = {
  PLATFORM_STAFF: "join the CohortData team",
  AGENCY_OWNER: "bring your agency to CohortGlobal",
  AGENCY_MANAGER: "manage your agency on CohortGlobal",
  AGENCY_MEMBER: "join your agency's team on CohortGlobal",
};

function layout(title: string, paragraphs: string[], cta?: { label: string; href: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${cta.href}" style="background:#0B6B5D;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5F6F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#12161F">
<div style="max-width:540px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:15px;margin-bottom:24px">CohortGlobal</div>
<div style="background:#fff;border:1px solid #E4E7EC;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}
</div>
<p style="font-size:12px;color:#6B7385;margin-top:18px">CohortGlobal is operated by CohortData. You received this email because of activity on your account or an invitation.</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function invitationEmail(input: {
  purpose: string; inviterName: string; organizationName: string | null; link: string; expiresAt: string; message?: string | null; inviteeName?: string | null;
}): EmailContent {
  const what = ROLE_WORDS[input.purpose] ?? "join CohortGlobal";
  const where = input.organizationName ? ` (${input.organizationName})` : "";
  const subject = `${input.inviterName} invited you to ${what}`;
  const expires = new Date(input.expiresAt).toUTCString();
  const paragraphs = [
    ...(input.inviteeName ? [`Hi ${input.inviteeName},`] : []),
    `${input.inviterName} invited you to ${what}${where}.`,
    ...(input.message ? [`Message: ${input.message}`] : []),
    `Accept with this email address. The invitation expires on ${expires}.`,
  ];
  return {
    subject,
    text: `${paragraphs.join("\n\n")}\n\nAccept: ${input.link}`,
    html: layout(subject, paragraphs, { label: "Accept invitation", href: input.link }),
  };
}

export function renderQueued(template: string, payload: Record<string, unknown>, appUrl: string): EmailContent | null {
  const s = (k: string) => String(payload[k] ?? "");
  const link = (path: string) => `${appUrl}${path}`;
  switch (template) {
    case "agency_approved":
      return mk(`${s("agency_name")} is approved`, [
        "Your agency is approved on CohortGlobal.",
        "You can now apply to projects, invite your Manager and team members, and complete your profile.",
      ], { label: "Open your agency", href: link("/agency") });
    case "agency_rejected":
      return mk(`Update on ${s("agency_name")}`, [
        "Your agency application was not approved this time.",
        `Reason: ${s("reason")}`,
        "You can update your details and apply again after 3 days.",
      ], { label: "Review application", href: link("/onboarding/agency") });
    case "agency_changes_requested":
      return mk(`${s("agency_name")}: a few changes before approval`, [
        "CohortData reviewed your agency application and needs a few changes before approving it.",
        `What to change: ${s("message")}`,
        ...(payload.documents ? [`Documents to upload again: ${s("documents")}`] : []),
        "Make the changes and send your application back. There is no waiting period.",
      ], { label: "Fix your application", href: link("/onboarding/agency") });
    case "project_invited":
      return mk(`You're invited to ${s("project_title")}`, [
        `CohortData invited ${s("agency_name")} to apply to ${s("project_title")}.`,
        ...(payload.message ? [`Message: ${s("message")}`] : []),
      ], { label: "View project", href: link(`/agency/jobs/${s("project_id")}`) });
    case "application_approved":
      return mk(`Approved for ${s("project_title")}`, [
        `Your application to ${s("project_title")} was approved.`,
        "Sign the project contract to continue. Work starts after CohortData countersigns.",
      ], { label: "Sign contract", href: link(s("href")) });
    case "application_rejected":
      return mk(`Update on ${s("project_title")}`, [
        `Your application to ${s("project_title")} was not approved.`,
        `Reason: ${s("reason")}`,
      ]);
    case "contract_countersigned":
      return mk(`${s("project_title")} is open`, [
        `CohortData countersigned your contract for ${s("project_title")}. You can start now.`,
      ], { label: "Open project", href: link(s("href")) });
    default:
      return null;
  }
}

function mk(subject: string, paragraphs: string[], cta?: { label: string; href: string }): EmailContent {
  return { subject, text: paragraphs.join("\n\n") + (cta ? `\n\n${cta.label}: ${cta.href}` : ""), html: layout(subject, paragraphs, cta) };
}
