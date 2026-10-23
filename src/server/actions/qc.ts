"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/server/actions/_rpc";
import { serverText } from "@/server/i18n";
import { ok, type ActionResult } from "@/server/errors";
import { REASON_CODES } from "@/lib/qc";

/**
 * QC (2E, ID-56). Assigning: QC Lead, the project's PMs, Operations Manager,
 * Super Admin. Deciding: only the assignee. The database enforces every rule.
 */
const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export type Reviewer = { user_id: string; full_name: string | null; email: string; role_code: string };

export async function loadReviewers(projectId: string | null): Promise<ActionResult<Reviewer[]>> {
  const r = await callRpc<Reviewer[]>("qc_reviewers", { p_project: projectId && uuid(projectId) ? projectId : null });
  return r.ok ? ok(r.data ?? []) : r;
}

export async function assignSubmissions(ids: string[], assigneeId: string) {
  const t = await serverText();
  const list = ids.filter(uuid).slice(0, 200);
  const r = await callRpc<number>("assign_submissions", { p_submissions: list, p_assignee: assigneeId });
  if (r.ok) revalidatePath("/admin", "layout");
  return r.ok ? ok(r.data, t.done("qcAssigned", { count: r.data })) : r;
}

export async function unassignSubmission(id: string) {
  const t = await serverText();
  const r = await callRpc("unassign_submission", { p_submission: id }, t.done("qcUnassigned"));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function decideSubmission(id: string, decision: "APPROVED" | "REJECTED" | "RESUBMIT_REQUESTED", remark: string, reasons: string[]) {
  const t = await serverText();
  const codes = reasons.filter((c) => (REASON_CODES as readonly string[]).includes(c));
  const r = await callRpc("decide_submission", { p_submission: id, p_decision: decision, p_remark: remark.trim() || null, p_reason_codes: codes },
    t.done(decision === "APPROVED" ? "qcApproved" : decision === "REJECTED" ? "qcRejected" : "qcResubmit"));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function commentOnSubmission(id: string, body: string, shared: boolean) {
  const t = await serverText();
  const r = await callRpc("comment_on_submission", { p_submission: id, p_body: body.trim().slice(0, 2000), p_shared: shared },
    t.done(shared ? "commentShared" : "commentInternal"));
  if (r.ok) revalidatePath(`/admin/submissions/${id}`);
  return r;
}

export async function rerunChecks(id: string) {
  const t = await serverText();
  const r = await callRpc<string>("rerun_submission_checks", { p_submission: id });
  if (r.ok) revalidatePath(`/admin/submissions/${id}`);
  return r.ok ? ok(r.data, t.done(r.data === "REJECTED" ? "checksFailed" : "checksPassed")) : r;
}
