import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { markClerkUserDeleted, syncClerkUser } from "@/server/auth/sync-user";

/**
 * Clerk → CohortGlobal user sync (AD-2). The signature is verified with
 * CLERK_WEBHOOK_SIGNING_SECRET; repeated events are harmless (upsert by Clerk id).
 * Configure in Clerk: endpoint /api/webhooks/clerk, events user.created, user.updated, user.deleted.
 */
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;
      const primary = u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0];
      await syncClerkUser({
        id: u.id,
        primaryEmail: primary?.email_address ?? null,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
        imageUrl: u.image_url ?? null,
      });
    } else if (evt.type === "user.deleted" && evt.data.id) {
      await markClerkUserDeleted(evt.data.id);
    }
  } catch (e) {
    console.error("[cohortglobal] clerk webhook failed", e instanceof Error ? e.message : e);
    return new Response("Sync failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
