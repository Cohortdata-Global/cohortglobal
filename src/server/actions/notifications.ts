"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/server/actions/_rpc";

export async function markNotificationsRead(ids?: string[]) {
  const r = await callRpc("mark_notifications_read", { p_ids: ids && ids.length ? ids : null });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
