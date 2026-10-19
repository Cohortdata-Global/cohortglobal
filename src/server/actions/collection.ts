"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/server/actions/_rpc";
import { fail, invalid, ok, zodFieldErrors, type ActionResult } from "@/server/errors";
import { collectionSchema, type CollectionInput } from "@/lib/collection";
import { can, getViewer } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { issueUploadTicket, verifyUploadTicket } from "@/server/storage/documents";
import { BUCKETS, safeFileName, storage } from "@/server/storage/provider";
import { serverText } from "@/server/i18n";

const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const uuid = z.string().uuid();

/** Saves the PM's collection setup as a new version (ID-53). */
export async function saveCollectionSetup(projectId: string, input: CollectionInput): Promise<ActionResult<number>> {
  const t = await serverText();
  if (!uuid.safeParse(projectId).success) return { ok: false, error: t.error("fallback") };
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const r = await callRpc<number>("save_collection_setup", { p_project: projectId, p_config: parsed.data });
  if (!r.ok) return r;
  revalidatePath(`/admin/projects/${projectId}`);
  return ok(r.data, t.done("collectionSaved", { version: r.data }));
}

/** May this person manage this project? RLS shows the project only to its staff; the permission says they may change it. */
async function mayManage(projectId: string) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "project.manage")) return null;
  const db = await createUserClient();
  const { data } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  return data ? viewer : null;
}

/** Step 1 of a guide-image upload: a one-time upload link for a fresh path under the project. */
export async function prepareGuideImageUpload(input: { projectId: string; fileName: string; size: number; mimeType: string }): Promise<ActionResult<{ path: string; uploadUrl: string; ticket: string }>> {
  const t = await serverText();
  if (!uuid.safeParse(input.projectId).success) return { ok: false, error: t.error("fallback") };
  if (!IMAGE_MIME.includes(input.mimeType)) return invalid({ file: t.invalid("imageType") });
  if (!(input.size > 0) || input.size > MAX_IMAGE_BYTES) return invalid({ file: t.invalid("imageSize") });
  const viewer = await mayManage(input.projectId);
  if (!viewer) return { ok: false, error: t.error("noAccess") };
  try {
    await storage.ensureBucket(BUCKETS.assets, { fileSizeLimitBytes: MAX_IMAGE_BYTES, allowedMimeTypes: IMAGE_MIME });
    const path = `${input.projectId}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
    const target = await storage.createUploadTarget(BUCKETS.assets, path);
    return ok({ path, uploadUrl: target.uploadUrl, ticket: issueUploadTicket(path, viewer.user.id, input.projectId) });
  } catch (e) {
    console.error("[collection] prepare upload failed:", e);
    return { ok: false, error: t.error("storageDown") };
  }
}

/** Step 2: record the uploaded image. Size and type come from storage, not from the browser. */
export async function completeGuideImageUpload(input: { projectId: string; fileName: string; path: string; ticket: string }): Promise<ActionResult<{ id: string; fileName: string }>> {
  const t = await serverText();
  const { projectId, path } = input;
  if (!uuid.safeParse(projectId).success || !path.startsWith(`${projectId}/`) || path.includes("..")) return { ok: false, error: t.error("wrongUpload") };
  const viewer = await mayManage(projectId);
  if (!viewer) return { ok: false, error: t.error("noAccess") };
  if (!verifyUploadTicket(input.ticket ?? "", path, viewer.user.id, projectId)) return { ok: false, error: t.error("uploadExpired") };
  const stat = await storage.stat(BUCKETS.assets, path);
  if (!stat) return invalid({ file: t.invalid("uploadUnfinished") });
  if (stat.size > MAX_IMAGE_BYTES || !IMAGE_MIME.includes(stat.mimeType)) {
    await storage.remove(BUCKETS.assets, [path]);
    return invalid({ file: t.invalid("imageType") });
  }
  const db = await createUserClient();
  const { data, error } = await db.rpc("register_project_asset", {
    p_project: projectId, p_file_name: input.fileName.slice(0, 200), p_storage_bucket: BUCKETS.assets,
    p_storage_path: path, p_mime_type: stat.mimeType, p_size_bytes: stat.size,
  });
  if (error) {
    await storage.remove(BUCKETS.assets, [path]);
    return fail(error, { fallback: t.error("fallback"), noAccess: t.error("noAccess"), exists: t.error("exists"), sessionExpired: t.error("sessionExpired") });
  }
  revalidatePath(`/admin/projects/${projectId}`);
  return ok({ id: data as string, fileName: input.fileName }, t.done("imageUploaded", { name: input.fileName }));
}

export async function removeGuideImage(projectId: string, assetId: string) {
  const t = await serverText();
  const r = await callRpc("remove_project_asset", { p_asset: assetId }, t.done("imageRemoved"));
  if (r.ok) revalidatePath(`/admin/projects/${projectId}`);
  return r;
}
