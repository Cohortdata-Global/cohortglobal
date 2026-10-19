"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/server/actions/_rpc";
import { fail, invalid, ok, zodFieldErrors, type ActionResult } from "@/server/errors";
import { toE164 } from "@/lib/phone";
import { getViewer } from "@/server/auth/viewer";
import { ALLOWED_MIME, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, createDocumentUploadTarget, deleteStoredFile, isRecordedFile, issueUploadTicket, statStoredFile, verifyUploadTicket } from "@/server/storage/documents";
import { serverEnv } from "@/server/env";
import { createUserClient } from "@/server/db/user-client";
import { k, serverText } from "@/server/i18n";

const freelancerSchema = z.object({
  full_name: z.string().trim().min(2, k("fullName")).max(120),
  country_code: z.string().trim().length(2, k("chooseYourCountry")),
  phone: z.string().trim().min(5, k("phoneMissing")),
  timezone: z.string().trim().min(1),
  date_of_birth: z.string().optional().default(""),
  gender: z.enum(["", "MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional().default(""),
  native_language: z.string().trim().max(60).optional().default(""),
  accept_terms: z.literal(true, { errorMap: () => ({ message: k("acceptTerms") }) }),
});

export async function completeFreelancerOnboarding(input: z.input<typeof freelancerSchema>) {
  const t = await serverText();
  const parsed = freelancerSchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const v = parsed.data;
  const phone = toE164(v.phone, v.country_code);
  if (!phone) return invalid({ phone: t.invalid("phoneForCountry") });
  const r = await callRpc("complete_freelancer_onboarding", {
    p: {
      full_name: v.full_name, country_code: v.country_code, phone_e164: phone, timezone: v.timezone,
      contributor: { date_of_birth: v.date_of_birth || null, gender: v.gender || null, native_language: v.native_language || null },
    },
  }, t.done("welcome"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

const agencySchema = z.object({
  name: z.string().trim().min(2, k("agencyName")).max(160),
  legal_name: z.string().trim().min(2, k("legalName")).max(200),
  country_code: z.string().trim().length(2, k("registrationCountry")),
  registration_number: z.string().trim().max(80).optional().default(""),
  tax_id: z.string().trim().max(80).optional().default(""),
  website_url: z.string().trim().url(k("website")),
  contact_name: z.string().trim().min(2, k("contactName")).max(120),
  contact_email: z.string().trim().email(k("contactEmail")),
  contact_phone: z.string().trim().min(5, k("contactPhone")),
  address: z.string().trim().max(400).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  languages: z.string().trim().max(300).optional().default(""),
  team_size: z.string().trim().optional().default(""),
}).refine((v) => v.registration_number || v.tax_id, { message: k("registrationOrTax"), path: ["registration_number"] });

export type AgencyApplicationInput = z.input<typeof agencySchema>;

function agencyPayload(v: z.output<typeof agencySchema>, phone: string) {
  return {
    name: v.name, legal_name: v.legal_name, country_code: v.country_code,
    registration_number: v.registration_number || null, tax_id: v.tax_id || null, website_url: v.website_url,
    contact_name: v.contact_name, contact_email: v.contact_email.toLowerCase(), contact_phone_e164: phone,
    address: v.address || null, description: v.description || null,
    languages: v.languages.split(",").map((s) => s.trim()).filter(Boolean),
    team_size: v.team_size ? Number.parseInt(v.team_size, 10) || null : null,
  };
}

/**
 * Agency application (ID-44): "save" stores details (step 1 creates the agency as a draft);
 * "submit" stores details and sends the application for review. The database refuses
 * both while the application is in review.
 */
export async function submitAgencyApplication(input: AgencyApplicationInput, mode: "save" | "submit" = "submit"): Promise<ActionResult<string>> {
  const t = await serverText();
  const parsed = agencySchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const phone = toE164(parsed.data.contact_phone, parsed.data.country_code);
  if (!phone) return invalid({ contact_phone: t.invalid("phoneForCountry") });
  const r = mode === "save"
    ? await callRpc<string>("save_agency_application", { p: agencyPayload(parsed.data, phone) }, t.done("detailsSaved"))
    : await callRpc<string>("submit_agency_application", { p: agencyPayload(parsed.data, phone) }, t.done("applicationSentAgency"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Builds the payload for a profile change request (approved agencies, #7). */
export async function buildProfileChanges(input: AgencyApplicationInput) {
  const t = await serverText();
  const parsed = agencySchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const phone = toE164(parsed.data.contact_phone, parsed.data.country_code);
  if (!phone) return invalid({ contact_phone: t.invalid("phoneForCountry") });
  return ok(agencyPayload(parsed.data, phone));
}

/** Who may add documents for this agency before anything is stored (the database still decides). */
function mayAddDocuments(viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>, orgId: string): boolean {
  if (viewer.permissions.includes("agency.manage")) return true;
  return viewer.organization?.id === orgId && viewer.permissions.includes("org.profile.request_change");
}

const uploadSchema = z.object({
  organizationId: z.string().uuid(),
  documentType: z.enum(DOCUMENT_TYPES),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
  mimeType: z.string(),
  requestId: z.string().uuid().nullable().optional(),
});

/**
 * Step 1 of an upload (ID-32): check the file and the person, then return a
 * one-time signed link the browser uploads to directly.
 */
export async function prepareAgencyDocumentUpload(input: z.input<typeof uploadSchema>): Promise<ActionResult<{ path: string; uploadUrl: string; ticket: string }>> {
  const [viewer, t] = await Promise.all([getViewer(), serverText()]);
  if (!viewer) return { ok: false, error: t.error("signInAgain") };
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return invalid({ file: t.invalid("chooseFile") });
  const v = parsed.data;
  if (!ALLOWED_MIME.includes(v.mimeType)) return invalid({ file: t.invalid("fileType") });
  if (v.size > MAX_DOCUMENT_BYTES) return invalid({ file: t.invalid("fileSize") });
  if (!mayAddDocuments(viewer, v.organizationId)) return { ok: false, error: t.error("noAccess") };
  try {
    const target = await createDocumentUploadTarget(v.organizationId, v.fileName);
    return ok({ path: target.path, uploadUrl: target.uploadUrl, ticket: issueUploadTicket(target.path, viewer.user.id, v.organizationId) });
  } catch (e) {
    console.error("[documents] prepare upload failed:", e);
    return { ok: false, error: t.error("storageDown") };
  }
}

/** Step 2: after the browser uploaded, record the document. Size and type are read from Storage, not trusted from the browser. */
export async function completeAgencyDocumentUpload(input: { organizationId: string; documentType: string; fileName: string; path: string; ticket: string; requestId?: string | null }): Promise<ActionResult<string>> {
  const [viewer, t] = await Promise.all([getViewer(), serverText()]);
  if (!viewer) return { ok: false, error: t.error("signInAgain") };
  const { organizationId: orgId, path } = input;
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !path.startsWith(`${orgId}/`) || path.includes("..")) return { ok: false, error: t.error("wrongUpload") };
  if (!DOCUMENT_TYPES.includes(input.documentType as (typeof DOCUMENT_TYPES)[number])) return invalid({ document_type: t.invalid("documentType") });
  if (!mayAddDocuments(viewer, orgId)) return { ok: false, error: t.error("noAccess") };
  // Only paths this server handed out in step 1, to this person, for this agency (security fix S3).
  if (!verifyUploadTicket(input.ticket ?? "", path, viewer.user.id, orgId)) return { ok: false, error: t.error("uploadExpired") };

  const bucket = serverEnv().AGENCY_DOCUMENTS_BUCKET;
  if (await isRecordedFile(bucket, path)) return { ok: false, error: t.error("alreadyRecorded") };
  const stat = await statStoredFile(bucket, path);
  if (!stat) return invalid({ file: t.invalid("uploadUnfinished") });
  if (stat.size > MAX_DOCUMENT_BYTES || (stat.mimeType && !ALLOWED_MIME.includes(stat.mimeType))) {
    await deleteStoredFile(bucket, path);
    return invalid({ file: t.invalid("fileTypeOrSize") });
  }
  const db = await createUserClient();
  const { data, error } = await db.rpc("register_agency_document", {
    p_org: orgId, p_document_type: input.documentType, p_file_name: input.fileName.slice(0, 200), p_storage_bucket: bucket,
    p_storage_path: path, p_mime_type: stat.mimeType || "application/octet-stream", p_size_bytes: stat.size, p_request_id: input.requestId || null,
  });
  if (error) {
    await deleteStoredFile(bucket, path);
    return fail(error, { fallback: t.error("fallback"), noAccess: t.error("noAccess"), exists: t.error("exists"), sessionExpired: t.error("sessionExpired") });
  }
  revalidatePath("/", "layout");
  return ok(data as string, t.done("documentUploaded", { name: input.fileName }));
}

export async function removeAgencyDocument(documentId: string) {
  const t = await serverText();
  const r = await callRpc("remove_agency_document", { p_document: documentId }, t.done("documentRemoved"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
