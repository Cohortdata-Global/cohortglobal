import type { CollectionConfig, FileSlot } from "@/lib/collection";
import { KIND_EXTENSIONS } from "@/lib/collection";

/**
 * Checks a contributor's profile answers against the project's collection setup
 * (Phase 2B/2C). Used in the browser for instant messages and again on the server.
 * Returns the cleaned answers, or field problems as message keys under "collect".
 */
export function checkProfile(config: CollectionConfig, raw: Record<string, unknown>): { values: Record<string, string>; problems: Record<string, string> } {
  const values: Record<string, string> = {};
  const problems: Record<string, string> = {};
  for (const f of config.fields) {
    const v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim().slice(0, 300) : "";
    if (!v) { if (f.required) problems[f.key] = "required"; continue; }
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) problems[f.key] = "badEmail";
    else if (f.type === "phone" && !/^\+?[0-9 ()-]{7,20}$/.test(v)) problems[f.key] = "badPhone";
    else if (f.type === "number" && !Number.isFinite(Number(v))) problems[f.key] = "badNumber";
    else if (f.type === "date" && Number.isNaN(Date.parse(v))) problems[f.key] = "badDate";
    else if (f.type === "select" && !f.options.includes(v)) problems[f.key] = "badOption";
    values[f.key] = f.type === "email" ? v.toLowerCase() : v;
  }
  return { values, problems };
}

/**
 * Who is collecting, from the answers: the first email field, and a "full_name"
 * field or else the first text field. Logged-in collectors fall back to their account.
 */
export function contactFrom(config: CollectionConfig, values: Record<string, string>, fallback?: { name: string; email: string }) {
  const email = config.fields.filter((f) => f.type === "email").map((f) => values[f.key]).find(Boolean) ?? fallback?.email ?? "";
  const nameField = config.fields.find((f) => f.key === "full_name") ?? config.fields.find((f) => f.type === "text");
  const name = (nameField && values[nameField.key]) || fallback?.name || "";
  return { name, email: email.toLowerCase() };
}

/** Largest file this slot accepts, capped by what storage accepts (STORAGE_FILE_LIMIT_MB). */
export function slotLimitBytes(maxMb: number, storageLimitMb: number) {
  return Math.min(maxMb, storageLimitMb) * 1024 * 1024;
}

export type UploadRole = "FILE" | "ID_FRONT" | "ID_BACK";

/** The slot a role/key refers to; eKYC sides are photos with the eKYC size limit. */
export function slotFor(config: CollectionConfig, role: UploadRole, key: string): FileSlot | null {
  if (role === "FILE") return config.files.find((f) => f.key === key) ?? null;
  if (!config.ekyc.enabled) return null;
  if (role === "ID_BACK" && config.ekyc.backSide === "none") return null;
  return { key: role === "ID_FRONT" ? "id_front" : "id_back", label: role, kind: "image", required: role === "ID_FRONT", maxMb: config.ekyc.maxMb, minSeconds: null, maxSeconds: null, notice: "" };
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg",
};

/** Allowed extensions for a slot (ID photos: JPEG/PNG only, as in the brief). */
export function allowedExtensions(role: UploadRole, slot: FileSlot): string[] {
  return role === "FILE" ? KIND_EXTENSIONS[slot.kind] : ["jpg", "jpeg", "png"];
}

export function mimeFor(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}
