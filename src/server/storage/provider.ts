import "server-only";
import { systemClient } from "@/server/db/system-client";

/**
 * One door to file storage for Phase 2 (ID-53). Today it is Supabase Storage;
 * later the company's 2 TB server. Moving means writing a second provider with
 * the same five methods (for example an S3-compatible MinIO on the server) and
 * copying the files. Database rows store bucket + path, so both can run side by
 * side during the move. No other code talks to the storage service directly.
 */
export interface StorageProvider {
  readonly name: string;
  /** Creates the bucket if needed and keeps it private. */
  ensureBucket(bucket: string, options: { fileSizeLimitBytes?: number | null; allowedMimeTypes?: string[] | null }): Promise<void>;
  /**
   * A one-time upload target for one path. `uploadUrl` takes a single PUT (small files);
   * `token` is used for resumable (TUS) uploads of large files.
   */
  createUploadTarget(bucket: string, path: string): Promise<{ uploadUrl: string; token: string }>;
  /** The stored object's real size and type, or null if nothing is there. */
  stat(bucket: string, path: string): Promise<{ size: number; mimeType: string } | null>;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** A short-lived read link. Call only after the database showed the row to this person. */
  signedReadUrl(bucket: string, path: string, seconds: number): Promise<string | null>;
}

export const BUCKETS = {
  /** Example images for guides (PM uploads). */
  assets: "collection-assets",
  /** Contributors' videos, photos and ID documents (Phase 2B). */
  submissions: "submissions",
} as const;

const ready = new Map<string, Promise<void>>();

const supabaseProvider: StorageProvider = {
  name: "supabase",

  ensureBucket(bucket, { fileSizeLimitBytes = null, allowedMimeTypes = null }) {
    let p = ready.get(bucket);
    if (!p) {
      p = (async () => {
        const storage = systemClient().storage;
        const options = { public: false, fileSizeLimit: fileSizeLimitBytes ?? undefined, allowedMimeTypes: allowedMimeTypes ?? undefined };
        const { data, error } = await storage.getBucket(bucket);
        if (error || !data) {
          const created = await storage.createBucket(bucket, options);
          if (created.error && !/already exists/i.test(created.error.message)) {
            throw new Error(`Could not create the storage bucket "${bucket}": ${created.error.message}`);
          }
        } else if (data.public) {
          await storage.updateBucket(bucket, options); // never public, even if changed by hand
        }
      })().catch((e) => { ready.delete(bucket); throw e; });
      ready.set(bucket, p);
    }
    return p;
  },

  async createUploadTarget(bucket, path) {
    const { data, error } = await systemClient().storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message ?? "no link returned"}`);
    return { uploadUrl: data.signedUrl, token: data.token };
  },

  async stat(bucket, path) {
    const slash = path.lastIndexOf("/");
    const { data, error } = await systemClient().storage.from(bucket).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 5 });
    if (error || !data) return null;
    const row = data.find((o) => o.name === path.slice(slash + 1));
    if (!row) return null;
    const meta = (row.metadata ?? {}) as { size?: number; mimetype?: string };
    return { size: Number(meta.size ?? 0), mimeType: String(meta.mimetype ?? "") };
  },

  async remove(bucket, paths) {
    if (paths.length) await systemClient().storage.from(bucket).remove(paths);
  },

  async signedReadUrl(bucket, path, seconds) {
    const { data, error } = await systemClient().storage.from(bucket).createSignedUrl(path, seconds);
    return error || !data ? null : data.signedUrl;
  },
};

export const storage: StorageProvider = supabaseProvider;

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-80) || "file";
}
