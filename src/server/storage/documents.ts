import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { systemClient } from "@/server/db/system-client";
import { serverEnv } from "@/server/env";

export const DOCUMENT_TYPES = ["REGISTRATION_CERTIFICATE", "TAX_CERTIFICATE", "OWNER_ID", "BANK_LETTER", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Agency documents live in a private Supabase Storage bucket (ID-12) until the
 * 2 TB server is ready.
 *
 * Upload path (ID-32): the browser sends the file straight to Storage with a
 * short-lived signed upload link that this server creates after a permission
 * check. The server then reads the stored object's real size and type and asks
 * the database (register_agency_document) to accept it; if the database refuses,
 * the object is deleted. The file never passes through the Next.js server.
 */

let bucketReady: Promise<void> | null = null;

/** Creates the private bucket with its limits if it doesn't exist yet. Runs once per server process. */
export function ensureDocumentBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const bucket = serverEnv().AGENCY_DOCUMENTS_BUCKET;
    const storage = systemClient().storage;
    const options = { public: false, fileSizeLimit: MAX_DOCUMENT_BYTES, allowedMimeTypes: ALLOWED_MIME };
    const { data, error } = await storage.getBucket(bucket);
    if (error || !data) {
      const created = await storage.createBucket(bucket, options);
      if (created.error && !/already exists/i.test(created.error.message)) {
        throw new Error(`Could not create the storage bucket "${bucket}": ${created.error.message}`);
      }
    } else if (data.public || data.file_size_limit !== MAX_DOCUMENT_BYTES) {
      // Keep the bucket private and size-limited even if it was created by hand.
      await storage.updateBucket(bucket, options);
    }
  })().catch((e) => {
    bucketReady = null; // try again on the next request
    throw e;
  });
  return bucketReady;
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-80) || "document";
}

const TICKET_TTL_MS = 2 * 60 * 60 * 1000;

function ticketSignature(payload: string): string {
  return createHmac("sha256", serverEnv().SUPABASE_SERVICE_ROLE_KEY).update(`upload-ticket:${payload}`).digest("base64url");
}

/**
 * A tamper-proof ticket for one upload path, bound to the person and the agency.
 * The finishing step accepts only paths that this server handed out (security fix S3).
 */
export function issueUploadTicket(path: string, userId: string, orgId: string): string {
  const expires = Date.now() + TICKET_TTL_MS;
  const payload = `${path}|${userId}|${orgId}|${expires}`;
  return `${expires}.${ticketSignature(payload)}`;
}

export function verifyUploadTicket(ticket: string, path: string, userId: string, orgId: string): boolean {
  const [expiresRaw, sig] = ticket.split(".");
  const expires = Number(expiresRaw);
  if (!sig || !Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = Buffer.from(ticketSignature(`${path}|${userId}|${orgId}|${expires}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A one-time signed upload link for a new, random `${orgId}/<uuid>-<name>` path. */
export async function createDocumentUploadTarget(orgId: string, fileName: string) {
  await ensureDocumentBucket();
  const bucket = serverEnv().AGENCY_DOCUMENTS_BUCKET;
  const path = `${orgId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
  const { data, error } = await systemClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message ?? "no link returned"}`);
  return { bucket, path, uploadUrl: data.signedUrl };
}

/** True if a document row already points at this file (such files are never deleted by the upload flow). */
export async function isRecordedFile(bucket: string, path: string): Promise<boolean> {
  const { count } = await systemClient().from("agency_documents").select("id", { count: "exact", head: true })
    .eq("storage_bucket", bucket).eq("storage_path", path);
  return (count ?? 0) > 0;
}

/** The stored object's real size and type, or null if nothing was uploaded at that path. */
export async function statStoredFile(bucket: string, path: string): Promise<{ size: number; mimeType: string } | null> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await systemClient().storage.from(bucket).list(folder, { search: name, limit: 5 });
  if (error || !data) return null;
  const row = data.find((o) => o.name === name);
  if (!row) return null;
  const meta = (row.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: Number(meta.size ?? 0), mimeType: String(meta.mimetype ?? "") };
}

export async function deleteStoredFile(bucket: string, path: string): Promise<void> {
  await systemClient().storage.from(bucket).remove([path]);
}

/** Short-lived download link. Only call after the user was shown the row through RLS. */
export async function signedDocumentUrl(bucket: string, path: string, seconds = 60): Promise<string | null> {
  const { data, error } = await systemClient().storage.from(bucket).createSignedUrl(path, seconds);
  if (error || !data) return null;
  return data.signedUrl;
}
