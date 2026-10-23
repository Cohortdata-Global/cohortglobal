"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { fail, invalid, ok, type ActionResult } from "@/server/errors";
import { getViewer } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { serverEnv } from "@/server/env";
import { serverText } from "@/server/i18n";
import { issueUploadTicket, verifyUploadTicket } from "@/server/storage/documents";
import {
  BUCKETS, clearLinkSession, ensureSubmissionsBucket, linkProblem, loadConfig, loadLinkConfig, lookupLink, newLinkSessionSecret, resolveSession,
  sha256, startLinkSessionDb, storage, storageLimitBytes, submissionPath, uploadServerFile, type SessionRef,
} from "@/server/collect/core";
import { allowedExtensions, checkProfile, contactFrom, extensionOf, mimeFor, slotFor, type UploadRole } from "@/lib/collect-profile";

/**
 * Phase 2B/2C actions (ID-55): start a session, upload files straight to storage,
 * sign the consent, submit or cancel; agencies create and turn off public links.
 * Every rule is enforced again by the database functions.
 */

type DbError = { code?: string; message?: string } | null;
async function dbFail(error: DbError) {
  const t = await serverText();
  return fail(error, { fallback: t.error("fallback"), noAccess: t.error("noAccess"), exists: t.error("exists"), sessionExpired: t.error("sessionExpired") });
}

function profileProblems(problems: Record<string, string>, word: (k: string) => string) {
  return Object.fromEntries(Object.entries(problems).map(([k, v]) => [k, word(v)]));
}

// ---------------------------------------------------------------------------
// Start a session
// ---------------------------------------------------------------------------
export async function startCollectionSession(projectId: string, raw: Record<string, unknown>): Promise<ActionResult<{ sessionId: string }>> {
  const [viewer, t] = await Promise.all([getViewer(), serverText()]);
  if (!viewer) return { ok: false, error: t.error("signInAgain") };
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return { ok: false, error: t.error("fallback") };
  const db = await createUserClient();
  const { data: p } = await db.from("projects").select("collection_version").eq("id", projectId).maybeSingle();
  const config = p ? await loadConfig(db, projectId, p.collection_version) : null;
  if (!config) return { ok: false, error: t.error("notCollecting") };
  const { values, problems } = checkProfile(config, raw);
  if (Object.keys(problems).length) return invalid(profileProblems(problems, (k) => t.invalid(`collect_${k}` as never)), t.error("fixProfile"));
  const contact = contactFrom(config, values, { name: viewer.user.fullName ?? viewer.user.email, email: viewer.user.email });
  const { data, error } = await db.rpc("start_collection_session", { p_project: projectId, p_profile: values, p_name: contact.name, p_email: contact.email });
  if (error) return dbFail(error);
  revalidatePath(`/work/projects/${projectId}`);
  return ok({ sessionId: data as string }, t.done("sessionStarted", { hours: config.limits.sessionHours }));
}

export async function startLinkSession(token: string, raw: Record<string, unknown>): Promise<ActionResult<{ started: true }>> {
  const t = await serverText();
  const link = await lookupLink(token);
  const problem = link ? linkProblem(link) : "revoked";
  if (!link || problem) return { ok: false, error: t.error(`link_${problem}` as never) };
  const config = await loadLinkConfig(link);
  if (!config) return { ok: false, error: t.error("notCollecting") };
  const { values, problems } = checkProfile(config, raw);
  if (Object.keys(problems).length) return invalid(profileProblems(problems, (k) => t.invalid(`collect_${k}` as never)), t.error("fixProfile"));
  const contact = contactFrom(config, values);
  if (!contact.email || contact.name.length < 2) return { ok: false, error: t.error("needNameEmail") };
  const hash = await newLinkSessionSecret(token);
  const { error } = await startLinkSessionDb({ token, profile: values, name: contact.name, email: contact.email, hash });
  if (error) { await clearLinkSession(token); return dbFail(error); }
  revalidatePath(`/c/${token}`);
  return ok({ started: true }, t.done("sessionStarted", { hours: config.limits.sessionHours }));
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
export async function prepareCollectUpload(ref: SessionRef, input: { role: UploadRole; slotKey: string; fileName: string; size: number }):
  Promise<ActionResult<{ path: string; uploadUrl: string; uploadToken: string; ticket: string; mimeType: string; supabaseUrl: string; apiKey: string }>> {
  const t = await serverText();
  const s = await resolveSession(ref);
  if (!s || s.status !== "ACTIVE" || new Date(s.endsAt).getTime() < Date.now()) return { ok: false, error: t.error("sessionGone") };
  const config = await loadConfig(s.db, s.projectId, s.version);
  const slot = config ? slotFor(config, input.role, input.slotKey) : null;
  if (!slot) return { ok: false, error: t.error("wrongUpload") };
  const ext = extensionOf(input.fileName);
  const mime = mimeFor(input.fileName);
  if (!allowedExtensions(input.role, slot).includes(ext) || !mime) return invalid({ file: t.invalid("collect_fileType") });
  const limit = Math.min(slot.maxMb * 1024 * 1024, storageLimitBytes());
  if (!(input.size > 0) || input.size > limit) return invalid({ file: t.invalid("collect_fileSize", { max: Math.floor(limit / 1024 / 1024) }) });
  try {
    await ensureSubmissionsBucket();
    const key = input.role === "FILE" ? input.slotKey : input.role === "ID_FRONT" ? "id_front" : "id_back";
    const path = submissionPath(s.projectId, s.sessionId, key, ext);
    const target = await storage.createUploadTarget(BUCKETS.submissions, path);
    const env = serverEnv();
    return ok({
      path, uploadUrl: target.uploadUrl, uploadToken: target.token, ticket: issueUploadTicket(path, s.owner, s.sessionId), mimeType: mime,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, apiKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch (e) {
    console.error("[collect] prepare upload failed:", e);
    return { ok: false, error: t.error("storageDown") };
  }
}

export async function completeCollectUpload(ref: SessionRef, input: { role: UploadRole; slotKey: string; fileName: string; path: string; ticket: string; durationSeconds: number | null; sha256?: string | null }):
  Promise<ActionResult<{ fileId: string }>> {
  const t = await serverText();
  const s = await resolveSession(ref);
  if (!s) return { ok: false, error: t.error("sessionGone") };
  if (!input.path.startsWith(`${s.projectId}/${s.sessionId}/`) || input.path.includes("..")) return { ok: false, error: t.error("wrongUpload") };
  if (!verifyUploadTicket(input.ticket ?? "", input.path, s.owner, s.sessionId)) return { ok: false, error: t.error("uploadExpired") };
  const config = await loadConfig(s.db, s.projectId, s.version);
  const slot = config ? slotFor(config, input.role, input.slotKey) : null;
  if (!slot) return { ok: false, error: t.error("wrongUpload") };
  const stat = await storage.stat(BUCKETS.submissions, input.path);
  if (!stat) return invalid({ file: t.invalid("uploadUnfinished") });
  const limit = Math.min(slot.maxMb * 1024 * 1024, storageLimitBytes());
  const d = input.durationSeconds;
  const durationBad = slot.kind !== "image" && (d == null || (slot.minSeconds != null && d < slot.minSeconds) || (slot.maxSeconds != null && d > slot.maxSeconds));
  // The stored type comes from the browser's upload; refuse anything that isn't the slot's kind (e.g. an HTML page named .mp4).
  const family = input.role === "FILE" ? `${slot.kind}/` : "image/";
  if (stat.mimeType && !stat.mimeType.startsWith(family)) {
    await storage.remove(BUCKETS.submissions, [input.path]);
    return invalid({ file: t.invalid("collect_fileType") });
  }
  if (stat.size > limit || durationBad) {
    await storage.remove(BUCKETS.submissions, [input.path]);
    return invalid({ file: durationBad ? t.invalid("collect_duration") : t.invalid("collect_fileSize", { max: Math.floor(limit / 1024 / 1024) }) });
  }
  const { data, error } = await s.db.rpc("register_session_file", {
    p_session: s.sessionId, p_slot_key: slot.key, p_role: input.role, p_storage_bucket: BUCKETS.submissions, p_storage_path: input.path,
    p_file_name: input.fileName.slice(0, 200), p_mime_type: mimeFor(input.fileName) ?? (stat.mimeType || "application/octet-stream"),
    p_size_bytes: stat.size, p_duration: slot.kind === "image" ? null : d,
    p_sha256: input.sha256 && /^[0-9a-f]{64}$/.test(input.sha256) ? input.sha256 : null,
  });
  if (error) { await storage.remove(BUCKETS.submissions, [input.path]); return dbFail(error); }
  const row = ((data ?? []) as { file_id: string; replaced_path: string | null }[])[0];
  if (row?.replaced_path) await storage.remove(BUCKETS.submissions, [row.replaced_path]);
  return ok({ fileId: row?.file_id ?? "" });
}

// ---------------------------------------------------------------------------
// Consent, submit, cancel
// ---------------------------------------------------------------------------
export async function signCollectConsent(ref: SessionRef, input: { kind: "draw" | "type" | "none"; value: string }): Promise<ActionResult<null>> {
  const t = await serverText();
  const s = await resolveSession(ref);
  if (!s || s.status !== "ACTIVE") return { ok: false, error: t.error("sessionGone") };
  const config = await loadConfig(s.db, s.projectId, s.version);
  if (!config) return { ok: false, error: t.error("notCollecting") };
  let value = input.value.trim();
  if (input.kind === "draw") {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
    const bytes = m ? Buffer.from(m[1]!, "base64") : null;
    if (!bytes || bytes.length < 200 || bytes.length > 300 * 1024) return invalid({ signature: t.invalid("collect_signature") });
    await ensureSubmissionsBucket();
    const path = submissionPath(s.projectId, s.sessionId, "signature", "png");
    const up = await uploadServerFile(path, bytes, "image/png");
    if (up.error) return { ok: false, error: t.error("storageDown") };
    const reg = await s.db.rpc("register_session_file", {
      p_session: s.sessionId, p_slot_key: "signature", p_role: "SIGNATURE", p_storage_bucket: BUCKETS.submissions, p_storage_path: path,
      p_file_name: "signature.png", p_mime_type: "image/png", p_size_bytes: bytes.length, p_duration: null, p_sha256: null,
    });
    if (reg.error) { await storage.remove(BUCKETS.submissions, [path]); return dbFail(reg.error); }
    const old = ((reg.data ?? []) as { replaced_path: string | null }[])[0]?.replaced_path;
    if (old) await storage.remove(BUCKETS.submissions, [old]);
    value = path;
  }
  const h = await headers();
  const { error } = await s.db.rpc("sign_session_consent", {
    p_session: s.sessionId, p_text_sha256: sha256(config.consent.text), p_kind: input.kind, p_signature: value,
    p_ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, p_user_agent: h.get("user-agent"),
  });
  if (error) return dbFail(error);
  return ok(null);
}

export async function submitCollectSession(ref: SessionRef): Promise<ActionResult<{ submissionId: string }>> {
  const t = await serverText();
  const s = await resolveSession(ref);
  if (!s) return { ok: false, error: t.error("sessionGone") };
  const { data, error } = await s.db.rpc("submit_collection_session", { p_session: s.sessionId });
  if (error) return dbFail(error);
  if (s.linkToken) { await clearLinkSession(s.linkToken); revalidatePath(`/c/${s.linkToken}`); }
  else revalidatePath(`/work/projects/${s.projectId}`);
  return ok({ submissionId: data as string }, t.done("submitted"));
}

export async function cancelCollectSession(ref: SessionRef): Promise<ActionResult<null>> {
  const t = await serverText();
  const s = await resolveSession(ref);
  if (!s) return { ok: false, error: t.error("sessionGone") };
  const { data, error } = await s.db.rpc("cancel_collection_session", { p_session: s.sessionId });
  if (error) return dbFail(error);
  const paths = ((data ?? []) as (string | { cancel_collection_session: string })[]).map((r) => (typeof r === "string" ? r : r.cancel_collection_session)).filter(Boolean);
  if (paths.length) await storage.remove(BUCKETS.submissions, paths);
  if (s.linkToken) { await clearLinkSession(s.linkToken); revalidatePath(`/c/${s.linkToken}`); }
  else revalidatePath(`/work/projects/${s.projectId}`);
  return ok(null, t.done("sessionCancelled"));
}

// ---------------------------------------------------------------------------
// Public links (agency Owner / Manager)
// ---------------------------------------------------------------------------
export async function createSubmissionLink(projectId: string, label: string): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const t = await serverText();
  const db = await createUserClient();
  const { data, error } = await db.rpc("create_submission_link", { p_project: projectId, p_label: label.trim().slice(0, 120) });
  if (error) return dbFail(error);
  const r = data as { token: string; expires_at: string };
  revalidatePath(`/agency/projects/${projectId}`);
  return ok({ url: `${serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/c/${r.token}`, expiresAt: r.expires_at }, t.done("linkCreated"));
}

export async function revokeSubmissionLink(linkId: string, reason: string) {
  const t = await serverText();
  const db = await createUserClient();
  const { error } = await db.rpc("revoke_submission_link", { p_link: linkId, p_reason: reason || null });
  if (error) return dbFail(error);
  revalidatePath("/agency", "layout");
  return ok(null, t.done("linkRevoked"));
}
