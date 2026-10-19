"use server";

import { revalidatePath } from "next/cache";
import { serverText } from "@/server/i18n";
import { callRpc, sendQueuedEmailsLater } from "@/server/actions/_rpc";
import { buildProfileChanges, type AgencyApplicationInput } from "@/server/actions/onboarding";

/* ---------------- Super Admin ---------------- */

/** The middle option between approving and rejecting (ID-42). */
export async function requestAgencyChanges(orgId: string, message: string, documentIds: string[]) {
  const t = await serverText();
  const r = await callRpc("request_agency_changes", { p_org: orgId, p_message: message, p_documents: documentIds }, t.done("changesAsked"));
  if (r.ok) { sendQueuedEmailsLater(); revalidatePath("/admin", "layout"); }
  return r;
}

export async function decideAgency(orgId: string, decision: "APPROVE" | "REJECT", reason: string) {
  const t = await serverText();
  const r = await callRpc("decide_agency", { p_org: orgId, p_decision: decision, p_reason: reason || null },
    decision === "APPROVE"
      ? t.done("agencyApproved")
      : t.done("agencyRejected"));
  if (r.ok) { sendQueuedEmailsLater(); revalidatePath("/admin", "layout"); }
  return r;
}

export async function setAgencyStatus(orgId: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED", reason: string) {
  const t = await serverText();
  const label = status === "ACTIVE" ? t.done("agencyReactivated")
    : status === "SUSPENDED" ? t.done("agencySuspended")
    : t.done("agencyDeactivated");
  const r = await callRpc("set_agency_status", { p_org: orgId, p_status: status, p_reason: reason || null }, label);
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function adminUpdateAgency(orgId: string, input: AgencyApplicationInput) {
  const t = await serverText();
  const built = await buildProfileChanges(input);
  if (!built.ok) return built;
  const r = await callRpc("admin_update_agency", { p_org: orgId, p: built.data }, t.done("agencyProfileSaved"));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function decideAgencyRequest(requestId: string, approve: boolean, note: string) {
  const t = await serverText();
  const r = await callRpc("decide_agency_request", { p_request: requestId, p_approve: approve, p_note: note || null },
    approve ? t.done("requestApproved") : t.done("requestRejected"));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function adminTransferOwnership(orgId: string, membershipId: string, oldOwnerAction: "MAKE_MANAGER" | "MAKE_MEMBER" | "REMOVE", reason: string) {
  const t = await serverText();
  const r = await callRpc("admin_transfer_ownership", { p_org: orgId, p_new_owner_membership: membershipId, p_old_owner_action: oldOwnerAction, p_reason: reason }, t.done("ownershipReassigned"));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

/* ---------------- Agency side ---------------- */

/** Profile edits by an approved agency go to the Super Admin (#7). Approved documents can be marked for removal. */
export async function requestProfileChange(input: AgencyApplicationInput, note: string, removeDocumentIds: string[] = []) {
  const t = await serverText();
  const built = await buildProfileChanges(input);
  if (!built.ok) return built;
  const ids = removeDocumentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50);
  const payload = ids.length ? { changes: built.data, remove_document_ids: ids } : { changes: built.data };
  const r = await callRpc<string>("request_agency_change", { p_type: "PROFILE_CHANGE", p_payload: payload, p_note: note || null },
    t.done("changeRequestSent"));
  if (r.ok) revalidatePath("/agency", "layout");
  return r;
}

export async function requestDeactivation(note: string) {
  const t = await serverText();
  const r = await callRpc<string>("request_agency_change", { p_type: "DEACTIVATION", p_payload: {}, p_note: note || null }, t.done("deactivationSent"));
  if (r.ok) revalidatePath("/agency", "layout");
  return r;
}

export async function requestOwnershipTransfer(note: string) {
  const t = await serverText();
  const r = await callRpc<string>("request_agency_change", { p_type: "OWNERSHIP_TRANSFER", p_payload: {}, p_note: note || null }, t.done("transferSent"));
  if (r.ok) revalidatePath("/agency", "layout");
  return r;
}

export async function cancelAgencyRequest(requestId: string) {
  const t = await serverText();
  const r = await callRpc("cancel_agency_request", { p_request: requestId }, t.done("requestCancelled"));
  if (r.ok) revalidatePath("/agency", "layout");
  return r;
}

export async function removeMember(membershipId: string, reason: string) {
  const t = await serverText();
  const r = await callRpc("remove_member", { p_membership: membershipId, p_reason: reason || null }, t.done("memberRemoved"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function setMemberStatus(membershipId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  const t = await serverText();
  const r = await callRpc("set_member_status", { p_membership: membershipId, p_status: status, p_reason: reason || null },
    status === "ACTIVE" ? t.done("accessRestored") : t.done("accessSuspended"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function assignMember(assignmentId: string, membershipId: string) {
  const t = await serverText();
  const r = await callRpc<string>("assign_member", { p_assignment: assignmentId, p_membership: membershipId }, t.done("memberAssigned"));
  if (r.ok) revalidatePath("/agency", "layout");
  return r;
}

export async function unassignMember(memberAssignmentId: string) {
  const t = await serverText();
  const r = await callRpc("unassign_member", { p_member_assignment: memberAssignmentId }, t.done("memberUnassigned"));
  if (r.ok) revalidatePath("/agency", "layout");
  return r;
}
