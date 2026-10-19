import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { systemClient } from "@/server/db/system-client";

export type ClerkUserLike = {
  id: string;
  primaryEmail: string | null;
  fullName: string | null;
  imageUrl: string | null;
};

/** Creates or updates the internal users row for a Clerk account (AD-2). */
export async function syncClerkUser(user: ClerkUserLike): Promise<void> {
  if (!user.primaryEmail) return;
  const { error } = await systemClient().rpc("sync_clerk_user", {
    p_clerk_user_id: user.id,
    p_email: user.primaryEmail,
    p_full_name: user.fullName,
    p_avatar_url: user.imageUrl,
  });
  if (error) throw new Error(`Could not sync user: ${error.message}`);
}

/**
 * Self-heal: if the webhook has not arrived yet (or is not configured in local
 * development), create the users row for the signed-in person on first visit.
 * Implementation decision ID-04.
 */
export async function syncCurrentClerkUser(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  await syncClerkUser({
    id: user.id,
    primaryEmail: primary?.emailAddress ?? null,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    imageUrl: user.imageUrl ?? null,
  });
}

export async function markClerkUserDeleted(clerkUserId: string): Promise<void> {
  const { error } = await systemClient().rpc("mark_clerk_user_deleted", { p_clerk_user_id: clerkUserId });
  if (error) throw new Error(`Could not mark user deleted: ${error.message}`);
}
