import "server-only";
import { systemClient } from "@/server/db/system-client";

export type InvitationPreview = {
  state: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" | "INVALID";
  purpose?: "PLATFORM_STAFF" | "AGENCY_OWNER" | "AGENCY_MANAGER" | "AGENCY_MEMBER";
  email?: string;
  organization_name?: string | null;
  role_code?: string | null;
  inviter_name?: string | null;
  message?: string | null;
  expires_at?: string;
};

/** Read-only preview so the invite page can explain the invitation before sign-in. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: "INVALID" };
  const { data, error } = await systemClient().rpc("preview_invitation", { p_token: token });
  if (error || !data) return { state: "INVALID" };
  return data as InvitationPreview;
}
