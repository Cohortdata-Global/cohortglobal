import "server-only";
import { createUserClient } from "@/server/db/user-client";

export type MemberRow = {
  id: string; role: string; status: string; joined_at: string; status_reason: string | null;
  user: { id: string; full_name: string | null; email: string; country_code: string | null; phone_e164: string | null } | null;
  assignments: { id: string; status: string }[];
};

export type InvitationRow = { id: string; purpose: string; email: string; invitee_name: string | null; status: string; expires_at: string; created_at: string; send_count: number };

export async function loadAgencyPeople(orgId: string) {
  const db = await createUserClient();
  const [{ data: members }, { data: invitations }] = await Promise.all([
    db.from("organization_memberships")
      .select("id,role,status,joined_at,status_reason,user:users!organization_memberships_user_id_fkey(id,full_name,email,country_code,phone_e164),assignments:member_assignments(id,status)")
      .eq("organization_id", orgId).neq("status", "REMOVED").order("joined_at"),
    db.from("invitations").select("id,purpose,email,invitee_name,status,expires_at,created_at,send_count")
      .eq("organization_id", orgId).in("status", ["PENDING", "EXPIRED"]).order("created_at", { ascending: false }),
  ]);
  const order: Record<string, number> = { AGENCY_OWNER: 0, AGENCY_MANAGER: 1, AGENCY_MEMBER: 2 };
  const rows = ((members ?? []) as unknown as MemberRow[]).sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  return { members: rows, invitations: (invitations ?? []) as InvitationRow[] };
}

export type EventRow = { id: number; entity_type: string; from_status: string | null; to_status: string; reason: string | null; created_at: string; actor_user_id?: string | null; actor: { full_name: string | null; email: string } | null };

export async function loadEvents(filter: { organizationId?: string; entityId?: string; entityIds?: string[] }, limit = 30) {
  const db = await createUserClient();
  let q = db.from("workflow_events").select("id,entity_type,from_status,to_status,reason,created_at,actor_user_id,actor:users!workflow_events_actor_user_id_fkey(full_name,email)")
    .order("created_at", { ascending: false }).limit(limit);
  if (filter.organizationId) q = q.eq("organization_id", filter.organizationId);
  if (filter.entityId) q = q.eq("entity_id", filter.entityId);
  if (filter.entityIds) q = q.in("entity_id", filter.entityIds.length ? filter.entityIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return (data ?? []) as unknown as EventRow[];
}

export type AuditRow = { id: number; occurred_at: string; action: string; summary: string; actor_kind: string; entity_type: string; actor: { full_name: string | null; email: string } | null };

export async function loadAudit(filter: { organizationId?: string; action?: string; q?: string }, limit = 100) {
  const db = await createUserClient();
  let q = db.from("audit_logs").select("id,occurred_at,action,summary,actor_kind,entity_type,actor:users!audit_logs_actor_user_id_fkey(full_name,email)")
    .order("occurred_at", { ascending: false }).limit(limit);
  if (filter.organizationId) q = q.eq("organization_id", filter.organizationId);
  if (filter.action) q = q.like("action", `${filter.action.replace(/[%_]/g, "")}%`);
  if (filter.q) q = q.ilike("summary", `%${filter.q.replace(/[%_]/g, "")}%`);
  const { data } = await q;
  return (data ?? []) as unknown as AuditRow[];
}
