"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { k, serverText } from "@/server/i18n";
import { callRpc, requestFingerprint, sendQueuedEmailsLater } from "@/server/actions/_rpc";
import { invalid, zodFieldErrors, type ActionResult } from "@/server/errors";

const projectSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,23}$/, k("projectCode")),
  title: z.string().trim().min(3, k("projectTitle")).max(200),
  summary: z.string().trim().max(280).optional().default(""),
  description: z.string().trim().max(20000).optional().default(""),
  data_type: z.enum(["AUDIO", "IMAGE", "VIDEO", "DOCUMENT", "PDF", "MIXED"]),
  applicant_type: z.enum(["AGENCY", "INDIVIDUAL", "BOTH"]),
  visibility: z.enum(["PUBLIC", "INVITE_ONLY"]),
  opens_at: z.string().optional().default(""),
  closes_at: z.string().optional().default(""),
  required_languages: z.string().max(300).optional().default(""),
  required_countries: z.array(z.string().length(2)).optional().default([]),
  requires_ekyc: z.boolean().optional().default(false),
  target_count: z.string().optional().default(""),
}).refine((v) => !v.opens_at || !v.closes_at || new Date(v.closes_at) > new Date(v.opens_at), { message: k("closingDate"), path: ["closes_at"] });

export type ProjectInput = z.input<typeof projectSchema>;

function toPayload(v: z.output<typeof projectSchema>) {
  return {
    code: v.code, title: v.title, summary: v.summary, description: v.description, data_type: v.data_type,
    applicant_type: v.applicant_type, visibility: v.visibility,
    opens_at: v.opens_at ? new Date(v.opens_at).toISOString() : null,
    closes_at: v.closes_at ? new Date(v.closes_at).toISOString() : null,
    required_languages: v.required_languages.split(",").map((s) => s.trim()).filter(Boolean),
    required_countries: v.required_countries,
    requires_ekyc: v.requires_ekyc,
    target_count: v.target_count ? Number.parseInt(v.target_count, 10) || null : null,
  };
}

export async function createProject(input: ProjectInput): Promise<ActionResult<string>> {
  const t = await serverText();
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const r = await callRpc<string>("create_project", { p: toPayload(parsed.data) }, t.done("draftCreated"));
  if (r.ok) revalidatePath("/admin/projects");
  return r;
}

export async function updateProject(projectId: string, input: ProjectInput) {
  const t = await serverText();
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const r = await callRpc("update_project", { p_project: projectId, p: toPayload(parsed.data) }, t.done("projectSaved"));
  if (r.ok) revalidatePath(`/admin/projects/${projectId}`, "layout");
  return r;
}

export async function setProjectStatus(projectId: string, status: string, reason: string) {
  const t = await serverText();
  const labels = {
    PUBLISHED: t.done("projectPublished"), PAUSED: t.done("projectPaused"),
    COMPLETED: t.done("projectCompleted"), ARCHIVED: t.done("projectArchived"),
  } as Record<string, ReturnType<typeof t.done>>;
  const r = await callRpc("set_project_status", { p_project: projectId, p_status: status, p_reason: reason || null }, labels[status] ?? t.done("statusUpdated"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

const questionSchema = z.object({
  prompt: z.string().trim().min(2, k("questionText")).max(500),
  help_text: z.string().trim().max(300).optional().default(""),
  answer_type: z.enum(["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "YES_NO"]),
  options: z.array(z.string().trim().min(1).max(120)).optional().default([]),
  required: z.boolean().optional().default(true),
});

export type QuestionInput = z.input<typeof questionSchema>;

export async function saveQuestions(projectId: string, questions: QuestionInput[]) {
  const t = await serverText();
  const parsed = z.array(questionSchema).max(30).safeParse(questions);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  for (const [i, q] of parsed.data.entries()) {
    if ((q.answer_type === "SINGLE_CHOICE" || q.answer_type === "MULTIPLE_CHOICE") && q.options.length < 2) {
      return invalid({ [`${i}.options`]: t.invalid("twoOptions") });
    }
  }
  const r = await callRpc<number>("save_project_questions", { p_project: projectId, p_questions: parsed.data }, t.done("questionsSaved"));
  if (r.ok) revalidatePath(`/admin/projects/${projectId}`, "layout");
  return r;
}

export async function saveContract(projectId: string, title: string, body: string) {
  const t = await serverText();
  if (title.trim().length < 2) return invalid({ title: t.invalid("contractTitle") });
  if (body.trim().length < 20) return invalid({ body: t.invalid("contractLength") });
  const r = await callRpc<string>("save_contract_template", { p_project: projectId, p_title: title.trim(), p_body: body }, t.done("contractSaved"));
  if (r.ok) revalidatePath(`/admin/projects/${projectId}`, "layout");
  return r;
}

export async function inviteAgencyToProject(projectId: string, orgId: string, message: string) {
  const t = await serverText();
  const r = await callRpc("invite_agency_to_project", { p_project: projectId, p_org: orgId, p_message: message || null }, t.done("agencyInvited"));
  if (r.ok) { sendQueuedEmailsLater(); revalidatePath(`/admin/projects/${projectId}`, "layout"); }
  return r;
}

export async function decideApplication(applicationId: string, approve: boolean, reason: string) {
  const t = await serverText();
  const r = await callRpc("decide_application", { p_application: applicationId, p_approve: approve, p_reason: reason || null },
    approve ? t.done("applicationApproved") : t.done("applicationRejected"));
  if (r.ok) { sendQueuedEmailsLater(); revalidatePath("/admin", "layout"); }
  return r;
}

export async function countersignContract(assignmentId: string, signerName: string) {
  const t = await serverText();
  const fp = await requestFingerprint();
  const r = await callRpc("countersign_contract", { p_assignment: assignmentId, p_signer_name: signerName, p_ip: fp.ip, p_user_agent: fp.userAgent },
    t.done("countersigned"));
  if (r.ok) { sendQueuedEmailsLater(); revalidatePath("/admin", "layout"); }
  return r;
}

export async function revokeAssignment(assignmentId: string, reason: string) {
  const t = await serverText();
  const r = await callRpc("revoke_assignment", { p_assignment: assignmentId, p_reason: reason }, t.done("accessRevoked"));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

/** Operations Manager / Super Admin: who manages a project (ID-52). */
export async function assignProjectManager(projectId: string, userId: string) {
  const t = await serverText();
  const r = await callRpc("assign_project_manager", { p_project: projectId, p_user: userId }, t.done("managerAssigned"));
  if (r.ok) revalidatePath(`/admin/projects/${projectId}`, "layout");
  return r;
}

export async function removeProjectManager(projectId: string, userId: string) {
  const t = await serverText();
  const r = await callRpc("remove_project_manager", { p_project: projectId, p_user: userId }, t.done("managerRemoved"));
  if (r.ok) revalidatePath(`/admin/projects/${projectId}`, "layout");
  return r;
}

