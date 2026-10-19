"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/server/actions/_rpc";
import { serverText } from "@/server/i18n";

export async function setStaffRole(userId: string, role: "OPERATIONS_MANAGER" | "PROJECT_MANAGER" | "QC_LEAD" | "QC_REVIEWER") {
  const t = await serverText();
  const r = await callRpc("set_staff_role", { p_user: userId, p_role_code: role }, t.done("roleUpdated"));
  if (r.ok) revalidatePath("/admin/staff");
  return r;
}

export async function revokeStaffAccess(userId: string, reason: string) {
  const t = await serverText();
  const r = await callRpc("revoke_staff_access", { p_user: userId, p_reason: reason || null }, t.done("staffRemoved"));
  if (r.ok) revalidatePath("/admin/staff");
  return r;
}
