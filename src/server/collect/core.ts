import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { systemClient } from "@/server/db/system-client";
import { createUserClient } from "@/server/db/user-client";
import { serverEnv } from "@/server/env";
import { getViewer } from "@/server/auth/viewer";
import { BUCKETS, storage } from "@/server/storage/provider";
import { collectionSchema, type CollectionConfig } from "@/lib/collection";

/**
 * Shared server pieces for Phase 2B/2C (ID-55).
 *
 * Logged-in collectors act through their own Supabase identity (AD-1): RLS and
 * the database functions decide. Public-link freelancers have no account, so the
 * server checks the link token plus a per-browser session cookie, then calls the
 * link functions with the service role (the only role allowed to run them).
 */

export type SessionRef = { sessionId: string } | { linkToken: string };

export type ResolvedSession = {
  db: SupabaseClient;
  sessionId: string;
  projectId: string;
  version: number;
  status: string;
  endsAt: string;
  /** Who uploads: the user id, or "link:<link id>" for a public link. */
  owner: string;
  linkToken: string | null;
};

const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
export const isLinkToken = (t: string) => TOKEN_RE.test(t);

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Cookie that ties a link session to this browser. Name is per link; value is a random secret. */
function cookieName(token: string) {
  return `cg_ls_${sha256(token).slice(0, 16)}`;
}

export async function newLinkSessionSecret(token: string): Promise<string> {
  const secret = randomBytes(32).toString("base64url");
  (await cookies()).set(cookieName(token), secret, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/c", maxAge: 60 * 60 * 30,
  });
  return sha256(secret);
}

export async function linkSessionHash(token: string): Promise<string | null> {
  const v = (await cookies()).get(cookieName(token))?.value;
  return v ? sha256(v) : null;
}

export async function clearLinkSession(token: string) {
  (await cookies()).delete({ name: cookieName(token), path: "/c" });
}

export type LinkInfo = {
  link_id: string; project_id: string; organization_id: string; label: string; contributor_email: string | null; contributor_name: string | null;
  expires_at: string; revoked: boolean; max_submissions: number; used: number; collection_version: number; project_status: string;
  assignment_status: string; organization_status: string; organization_name: string; organization_email: string;
};

export async function lookupLink(token: string): Promise<LinkInfo | null> {
  if (!isLinkToken(token)) return null;
  const { data } = await systemClient().rpc("link_lookup", { p_token: token });
  return ((data ?? []) as LinkInfo[])[0] ?? null;
}

/** Why a link can't be used right now, or null when it can. */
export function linkProblem(l: LinkInfo): "revoked" | "expired" | "closed" | "used" | null {
  if (l.revoked) return "revoked";
  if (new Date(l.expires_at).getTime() < Date.now()) return "expired";
  if (l.project_status !== "PUBLISHED" || l.assignment_status !== "ACTIVE" || l.organization_status !== "ACTIVE" || l.collection_version === 0) return "closed";
  if (l.used >= l.max_submissions) return "used";
  return null;
}

export async function loadConfig(db: SupabaseClient, projectId: string, version: number): Promise<CollectionConfig | null> {
  if (!version) return null;
  const { data } = await db.from("project_collection_versions").select("config").eq("project_id", projectId).eq("version", version).maybeSingle();
  if (!data) return null;
  const parsed = collectionSchema.safeParse(data.config);
  return parsed.success ? parsed.data : null;
}

/** Quota id → submissions counted so far (drives which options are still offered). */
export async function quotaCounts(db: SupabaseClient, projectId: string): Promise<Record<string, number>> {
  const { data } = await db.rpc("collection_quota_counts", { p_project: projectId });
  return Object.fromEntries(((data ?? []) as { quota_id: string; filled: number }[]).map((r) => [r.quota_id, Number(r.filled)]));
}

/** Finds the session this request may act on, or null. */
export async function resolveSession(ref: SessionRef): Promise<ResolvedSession | null> {
  if ("sessionId" in ref) {
    const viewer = await getViewer();
    if (!viewer || !/^[0-9a-f-]{36}$/i.test(ref.sessionId)) return null;
    const db = await createUserClient();
    const { data } = await db.from("collection_sessions").select("id,project_id,collection_version,status,ends_at,user_id").eq("id", ref.sessionId).maybeSingle();
    if (!data || data.user_id !== viewer.user.id) return null;
    return { db, sessionId: data.id, projectId: data.project_id, version: data.collection_version, status: data.status, endsAt: data.ends_at, owner: viewer.user.id, linkToken: null };
  }
  const token = ref.linkToken;
  if (!isLinkToken(token)) return null;
  const hash = await linkSessionHash(token);
  if (!hash) return null;
  const db = systemClient();
  const { data } = await db.rpc("link_session", { p_token: token, p_session_token_hash: hash });
  const row = ((data ?? []) as { session_id: string; status: string; ends_at: string }[])[0];
  if (!row) return null;
  const { data: s } = await db.from("collection_sessions").select("project_id,collection_version,link_id").eq("id", row.session_id).maybeSingle();
  if (!s) return null;
  return { db, sessionId: row.session_id, projectId: s.project_id, version: s.collection_version, status: row.status, endsAt: row.ends_at, owner: `link:${s.link_id}`, linkToken: token };
}

// -----------------------------------------------------------------------------
// Files
// -----------------------------------------------------------------------------
export function storageLimitBytes() {
  return serverEnv().STORAGE_FILE_LIMIT_MB * 1024 * 1024;
}

export async function ensureSubmissionsBucket() {
  await storage.ensureBucket(BUCKETS.submissions, { fileSizeLimitBytes: storageLimitBytes() });
}

export function submissionPath(projectId: string, sessionId: string, slot: string, ext: string) {
  return `${projectId}/${sessionId}/${slot}-${crypto.randomUUID()}.${ext}`;
}

export async function signedFileUrl(bucket: string, path: string, seconds = 600) {
  return storage.signedReadUrl(bucket, path, seconds);
}

/** Config of the project a link belongs to (server only, after the link was checked). */
export async function loadLinkConfig(link: LinkInfo) {
  return loadConfig(systemClient(), link.project_id, link.collection_version);
}

/** Starts the session for a checked link (service role; the database checks the link again). */
export async function startLinkSessionDb(args: { token: string; profile: Record<string, string>; name: string; email: string; hash: string }) {
  return systemClient().rpc("start_link_session", {
    p_token: args.token, p_profile: args.profile, p_name: args.name, p_email: args.email, p_session_token_hash: args.hash,
  });
}

/** Small files the server writes itself (the drawn consent signature). */
export async function uploadServerFile(path: string, bytes: Buffer, contentType: string) {
  return systemClient().storage.from(BUCKETS.submissions).upload(path, bytes, { contentType, upsert: false });
}

/** What a link freelancer may see about their own submissions on the link page (#33). */
export async function linkSubmissions(token: string) {
  const { data } = await systemClient().rpc("link_submissions", { p_token: token });
  return (data ?? []) as { submission_id: string; status: string; remark: string | null; main_file_name: string | null; submitted_at: string }[];
}

export async function linkQuotaCounts(projectId: string) {
  return quotaCounts(systemClient(), projectId);
}

/** The session this browser has open on the link, with its uploaded files (to pick up where they left off). */
export async function loadLinkResume(token: string) {
  const hash = await linkSessionHash(token);
  if (!hash) return null;
  const db = systemClient();
  const { data } = await db.rpc("link_session", { p_token: token, p_session_token_hash: hash });
  const row = ((data ?? []) as { session_id: string; status: string; ends_at: string; consent_signed: boolean; profile: Record<string, string> }[])[0];
  if (!row || row.status !== "ACTIVE") return null;
  const { data: files } = await db.from("submission_files").select("role,slot_key,file_name,size_bytes,duration_seconds")
    .eq("session_id", row.session_id).is("removed_at", null);
  return { endsAt: row.ends_at, profile: row.profile, consentSigned: row.consent_signed,
    files: ((files ?? []) as { role: string; slot_key: string; file_name: string; size_bytes: number; duration_seconds: number | null }[]) };
}

/** A guide image of the link's project (link pages have no login, so /api/project-assets can't serve them). */
export async function linkAssetUrl(link: LinkInfo, assetId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return null;
  const { data } = await systemClient().from("project_assets").select("storage_bucket,storage_path,project_id,removed_at").eq("id", assetId).maybeSingle();
  if (!data || data.project_id !== link.project_id || data.removed_at) return null;
  return storage.signedReadUrl(data.storage_bucket, data.storage_path, 600);
}

export { storage, BUCKETS };
