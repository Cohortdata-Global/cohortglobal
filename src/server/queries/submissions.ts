import "server-only";
import { createUserClient } from "@/server/db/user-client";
import { collectionSchema, type CollectionConfig } from "@/lib/collection";

/**
 * Submissions as the signed-in person may see them (RLS, ID-55): CohortData
 * staff of the project, the agency's Owner/Manager (own agency only, Q40), or
 * the collector. Used by the agency, the collector's area and the console.
 */
export const SUBMISSION_STATUSES = ["PENDING", "READY_FOR_QC", "IN_REVIEW", "APPROVED", "REJECTED", "RESUBMIT_REQUESTED", "DELIVERED", "WITHDRAWN"] as const;

export type SubmissionRow = {
  id: string; status: string; contributor_name: string; contributor_email: string; profile: Record<string, string>;
  main_file_name: string | null; duration_seconds: number | null; submitted_at: string; status_changed_at: string; remark: string | null;
  organization_id: string | null; collector_user_id: string | null; link_id: string | null;
  link: { label: string } | null; organization: { name: string } | null;
};

export type SubmissionFilter = { projectId: string; organizationId?: string; collectorUserId?: string; status?: string; q?: string; profile?: Record<string, string>; source?: string; page?: number };

export const PAGE_SIZE = 50;

export async function currentConfig(projectId: string): Promise<{ config: CollectionConfig | null; version: number }> {
  const db = await createUserClient();
  const { data: p } = await db.from("projects").select("collection_version").eq("id", projectId).maybeSingle();
  if (!p?.collection_version) return { config: null, version: 0 };
  const { data } = await db.from("project_collection_versions").select("config").eq("project_id", projectId).eq("version", p.collection_version).maybeSingle();
  const parsed = data ? collectionSchema.safeParse(data.config) : null;
  return { config: parsed?.success ? parsed.data : null, version: p.collection_version };
}

function applyFilters<Q extends { eq: (c: string, v: string) => Q; in: (c: string, v: string[]) => Q; or: (f: string) => Q; contains: (c: string, v: object) => Q; is: (c: string, v: null) => Q; not: (c: string, o: string, v: null) => Q }>(q: Q, f: SubmissionFilter): Q {
  q = q.eq("project_id", f.projectId);
  if (f.organizationId) q = q.eq("organization_id", f.organizationId);
  if (f.collectorUserId) q = q.eq("collector_user_id", f.collectorUserId);
  if (f.status === "IN_QC") q = q.in("status", ["READY_FOR_QC", "IN_REVIEW"]);
  else if (f.status) q = q.eq("status", f.status);
  if (f.source === "link") q = q.not("link_id", "is", null);
  if (f.source === "member") q = q.is("link_id", null);
  if (f.q) {
    const term = f.q.replace(/[,()%_*]/g, "").slice(0, 80);
    if (term) q = q.or(`contributor_name.ilike.%${term}%,contributor_email.ilike.%${term}%,main_file_name.ilike.%${term}%`);
  }
  if (f.profile && Object.keys(f.profile).length) q = q.contains("profile", f.profile);
  return q;
}

export async function loadSubmissions(f: SubmissionFilter) {
  const db = await createUserClient();
  const from = Math.max(0, (f.page ?? 1) - 1) * PAGE_SIZE;
  let list = db.from("submissions")
    .select("id,status,contributor_name,contributor_email,profile,main_file_name,duration_seconds,submitted_at,status_changed_at,remark,organization_id,collector_user_id,link_id,link:submission_links!submissions_link_id_fkey(label),organization:organizations!submissions_organization_id_fkey(name)", { count: "exact" });
  list = applyFilters(list as never, f) as typeof list;
  const statusQuery = applyFilters(db.from("submissions").select("status") as never, { projectId: f.projectId, organizationId: f.organizationId, collectorUserId: f.collectorUserId }) as unknown as PromiseLike<{ data: { status: string }[] | null }>;
  const [{ data, count }, { data: all }] = await Promise.all([
    list.order("submitted_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    statusQuery,
  ]);
  const counts: Record<string, number> = {};
  for (const r of all ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return { rows: (data ?? []) as unknown as SubmissionRow[], total: count ?? 0, counts, all: (all ?? []).length };
}

export type SubmissionDetail = SubmissionRow & {
  project_id: string; session_id: string; collection_version: number;
  project: { code: string; title: string } | null;
  session: { started_at: string; ends_at: string; consent_signed_at: string | null; consent_signature_kind: string | null; consent_signature: string | null } | null;
  files: { id: string; role: string; slot_key: string; file_name: string; mime_type: string; size_bytes: number; duration_seconds: number | null }[];
};

export async function loadSubmission(id: string): Promise<{ s: SubmissionDetail; config: CollectionConfig | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await createUserClient();
  const { data } = await db.from("submissions")
    .select("*,link:submission_links!submissions_link_id_fkey(label),organization:organizations!submissions_organization_id_fkey(name),project:projects!submissions_project_id_fkey(code,title),session:collection_sessions!submissions_session_id_fkey(started_at,ends_at,consent_signed_at,consent_signature_kind,consent_signature),files:submission_files!submission_files_submission_id_fkey(id,role,slot_key,file_name,mime_type,size_bytes,duration_seconds)")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  const s = data as unknown as SubmissionDetail;
  const { data: cv } = await db.from("project_collection_versions").select("config").eq("project_id", s.project_id).eq("version", s.collection_version).maybeSingle();
  const parsed = cv ? collectionSchema.safeParse(cv.config) : null;
  return { s, config: parsed?.success ? parsed.data : null };
}

/** The signed-in collector's live session on a project, with its files (to pick up where they left off). */
export async function loadMySession(projectId: string, userId: string) {
  const db = await createUserClient();
  const { data } = await db.from("collection_sessions")
    .select("id,ends_at,profile,consent_signed_at,files:submission_files!submission_files_session_id_fkey(role,slot_key,file_name,size_bytes,duration_seconds,removed_at)")
    .eq("project_id", projectId).eq("user_id", userId).eq("status", "ACTIVE").gt("ends_at", new Date().toISOString())
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data as unknown as {
    id: string; ends_at: string; profile: Record<string, string>; consent_signed_at: string | null;
    files: { role: string; slot_key: string; file_name: string; size_bytes: number; duration_seconds: number | null; removed_at: string | null }[];
  } | null;
}
