/**
 * Upload straight from the browser to storage (Phase 2B/2C, ID-55).
 *
 * - Files up to one chunk (6 MB) go up in a single PUT to the signed upload link.
 * - Bigger files use Supabase's resumable (TUS) endpoint with the same signed token,
 *   6 MB at a time. A dropped connection retries from the last byte the server has,
 *   so phones on mobile data don't start over.
 * The file never passes through our own server.
 */
const CHUNK = 6 * 1024 * 1024;

export type UploadTarget = { uploadUrl: string; uploadToken: string; path: string; mimeType: string; supabaseUrl: string; apiKey: string };

export class UploadError extends Error {
  constructor(public kind: "too-large" | "network" | "rejected" | "aborted", message?: string) { super(message ?? kind); }
}

function putWithProgress(url: string, file: Blob, type: string, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(xhr.status === 413 ? "too-large" : "rejected", `status ${xhr.status}`)));
    xhr.onerror = () => reject(new UploadError("network"));
    xhr.onabort = () => reject(new UploadError("aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tusUpload(file: File, t: UploadTarget, onProgress: (sent: number) => void, signal?: AbortSignal) {
  const endpoint = `${t.supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable/sign`;
  const base = { apikey: t.apiKey, "x-signature": t.uploadToken, "Tus-Resumable": "1.0.0" };
  const create = await fetch(endpoint, {
    method: "POST", signal,
    headers: {
      ...base,
      "Upload-Length": String(file.size),
      "Upload-Metadata": [`bucketName ${b64("submissions")}`, `objectName ${b64(t.path)}`, `contentType ${b64(t.mimeType)}`, `cacheControl ${b64("3600")}`].join(","),
    },
  }).catch(() => { throw new UploadError("network"); });
  if (create.status === 413) throw new UploadError("too-large");
  const location = create.headers.get("Location");
  if (create.status !== 201 || !location) throw new UploadError("rejected", `create ${create.status}`);
  const url = new URL(location, endpoint).toString();

  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new UploadError("aborted");
    const chunk = file.slice(offset, Math.min(offset + CHUNK, file.size));
    try {
      const res = await fetch(url, {
        method: "PATCH", signal,
        headers: { ...base, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
        body: chunk,
      });
      if (res.status === 413) throw new UploadError("too-large");
      if (res.status !== 204) throw new UploadError("rejected", `patch ${res.status}`);
      offset = Number(res.headers.get("Upload-Offset") ?? offset + chunk.size);
      failures = 0;
      onProgress(offset);
    } catch (e) {
      if (e instanceof UploadError && (e.kind === "too-large" || e.kind === "aborted")) throw e;
      if (signal?.aborted) throw new UploadError("aborted");
      if (++failures > 5) throw new UploadError("network");
      await wait(Math.min(1000 * 2 ** failures, 15000));
      // Ask the server how much it has, then carry on from there.
      const head = await fetch(url, { method: "HEAD", headers: base, signal }).catch(() => null);
      const known = head?.headers.get("Upload-Offset");
      if (known != null) offset = Number(known);
    }
  }
}

export async function uploadToStorage(file: File, target: UploadTarget, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const report = (sent: number) => onProgress(Math.min(1, sent / Math.max(1, file.size)));
  if (file.size <= CHUNK) {
    await putWithProgress(target.uploadUrl, file, target.mimeType, report, signal);
    return;
  }
  try {
    await tusUpload(file, target, report, signal);
  } catch (e) {
    // If the resumable endpoint isn't available, fall back to one PUT.
    if (e instanceof UploadError && e.kind === "rejected" && e.message.startsWith("create")) {
      await putWithProgress(target.uploadUrl, file, target.mimeType, report, signal);
      return;
    }
    throw e;
  }
}
