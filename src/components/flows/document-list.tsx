"use client";

import { useRef, useState } from "react";
import { Eye, FileText, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { useAction } from "@/components/app/use-action";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/notify";
import { useLabels } from "@/i18n/labels";
import { completeAgencyDocumentUpload, prepareAgencyDocumentUpload, removeAgencyDocument } from "@/server/actions/onboarding";
import { DOCUMENT_TYPES } from "@/lib/status";
import { cn, formatBytes } from "@/lib/utils";

export type DocumentRow = { id: string; document_type: string; file_name: string; mime_type?: string | null; size_bytes: number; status: string; created_at: string };


/** Shows company documents as cards and uploads new ones. canUpload/canRemove come from the server's permission check. */
export function DocumentList({
  organizationId, documents, canUpload, canRemove, requestId, uploadHint, emptyText,
}: {
  organizationId: string; documents: DocumentRow[]; canUpload: boolean; canRemove: boolean; requestId?: string; uploadHint?: string; emptyText?: string;
}) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const labels = useLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("REGISTRATION_CERTIFICATE");
  const [error, setError] = useState<string>();
  const { pending, run } = useAction();

  const [progress, setProgress] = useState<number | null>(null);

  /** Sends the file straight to Storage (ID-32) so it doesn't travel through the app server. */
  function putFile(url: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("content-type", file.type);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "too-large" : `status ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    });
  }

  /** Shows the problem under the upload box and as a pop-up message (ID-46). */
  function uploadFailed(title: string, detail: string) {
    setError(detail);
    notify.error(title, detail);
  }

  async function upload(file: File) {
    setError(undefined);
    if (file.size > 10 * 1024 * 1024) {
      uploadFailed(t("tooLarge"), t("tooLargeDetail", { name: file.name, size: formatBytes(file.size) }));
      return;
    }
    if (file.type && !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      uploadFailed(t("badType"), t("badTypeDetail"));
      return;
    }
    setProgress(0);
    try {
      const prep = await prepareAgencyDocumentUpload({ organizationId, documentType: type as never, fileName: file.name, size: file.size, mimeType: file.type, requestId: requestId ?? null });
      if (!prep.ok) { uploadFailed(t("uploadFailed"), prep.fieldErrors?.file ?? prep.error); return; }
      try {
        await putFile(prep.data.uploadUrl, file);
      } catch (e) {
        if ((e as Error).message === "too-large") uploadFailed(t("tooLarge"), t("tooLargeShort"));
        else uploadFailed(t("interrupted"), t("interruptedDetail"));
        return;
      }
      setProgress(100);
      run(() => completeAgencyDocumentUpload({ organizationId, documentType: type, fileName: file.name, path: prep.data.path, ticket: prep.data.ticket, requestId: requestId ?? null }), {
        onError: (r) => setError(r.fieldErrors?.file ?? r.error),  // the pop-up comes from useAction
        onSuccess: () => { if (fileRef.current) fileRef.current.value = ""; },
      });
    } catch {
      notify.error(tc("offlineTitle"), tc("offlineDetail"));
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const visible = documents.filter((d) => d.status !== "REMOVED");

  return (
    <div className="grid gap-4">
      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">{emptyText ?? t("none")}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3" aria-label={t("list")}>
          {visible.map((d) => {
            // A document marked "Replace this" can be removed once a newer one of the same type is uploaded (ID-45).
            const replaced = d.status === "REJECTED" && visible.some((x) => x.status === "ACTIVE" && x.document_type === d.document_type && x.created_at > d.created_at);
            const removable = canRemove && (d.status !== "REJECTED" || replaced);
            return (
              <DocumentCard key={d.id} doc={d} replaced={replaced}
                onRemove={removable ? () => run(() => removeAgencyDocument(d.id)) : undefined}
                note={canRemove && d.status === "REJECTED" && !replaced ? t("uploadToRemove") : undefined}
                removing={pending} />
            );
          })}
        </ul>
      )}
      {canUpload ? (
        <div className="grid gap-3 rounded-md bg-paper p-3.5 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={t("type")} htmlFor="doc-type" hint={uploadHint ?? t("hint")} error={error}>
            <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value)}>
              {DOCUMENT_TYPES.map((k) => <option key={k} value={k}>{labels.docType(k)}</option>)}
            </Select>
          </Field>
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" id="doc-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <Button variant="secondary" loading={pending || progress !== null} onClick={() => fileRef.current?.click()}>
            <Upload /> {progress !== null ? t("uploading", { percent: progress }) : t("upload")}
          </Button>
          {progress !== null ? (
            <div className="h-1 overflow-hidden rounded-full bg-sunken sm:col-span-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-pine-600 transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


/** One document: a preview you can open, what it is, and a clear View button. */
function DocumentCard({ doc, onRemove, removing, note, replaced = false }: { doc: DocumentRow; onRemove?: () => void; removing: boolean; note?: string; replaced?: boolean }) {
  const t = useTranslations("documents");
  const labels = useLabels();
  const href = `/api/documents/${doc.id}`;
  const label = labels.docType(doc.document_type);
  const docStatus = { PENDING: t("waiting"), REJECTED: replaced ? t("replaced") : t("replaceThis") };
  const flagged = doc.status === "REJECTED";
  return (
    <li className={cn("flex flex-col overflow-hidden rounded-lg border bg-surface", flagged ? "border-amber-600/40 ring-2 ring-amber-600/15" : "border-line")}>
      <a href={href} target="_blank" rel="noreferrer" aria-label={t("viewLabel", { label })} className="group relative block aspect-[4/3] overflow-hidden bg-sunken">
        <DocumentThumb href={href} mime={doc.mime_type ?? guessMime(doc.file_name)} />
        <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-[opacity,background-color] duration-150 group-hover:bg-ink/35 group-hover:opacity-100 group-focus-visible:bg-ink/35 group-focus-visible:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface px-2.5 py-1 text-[12.5px] font-medium text-ink shadow-raise"><Eye className="size-3.5" /> {t("open")}</span>
        </span>
      </a>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13.5px] font-semibold leading-snug text-ink">{label}</p>
          {doc.status !== "ACTIVE" ? <StatusBadge status={doc.status} labels={docStatus} className="shrink-0" /> : null}
        </div>
        <p className="truncate text-[12.5px] text-muted" title={doc.file_name}>{doc.file_name}, {formatBytes(doc.size_bytes)}</p>
        {note ? <p className="text-[12px] text-amber-700">{note}</p> : null}
        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <a href={href} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex-1")}>
            <Eye /> {t("view")}
          </a>
          {onRemove ? (
            <Button variant="ghost" size="icon" className="size-8" aria-label={t("removeLabel", { name: doc.file_name })} title={t("remove")} disabled={removing} onClick={onRemove}>
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "application/pdf" : ext && ["png", "jpg", "jpeg", "webp"].includes(ext) ? `image/${ext === "jpg" ? "jpeg" : ext}` : "";
}

/** Images show the real picture (loaded only when scrolled into view). PDFs show a page so the card reads as a document. */
function DocumentThumb({ href, mime }: { href: string; mime: string }) {
  const [failed, setFailed] = useState(false);
  if (mime.startsWith("image/") && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- private, signed file; next/image can't optimise it
    return <img src={href} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />;
  }
  const isPdf = mime === "application/pdf";
  return (
    <div className="flex size-full items-center justify-center bg-[linear-gradient(160deg,var(--color-sunken),var(--color-paper))]">
      <div className="relative flex aspect-[3/4] h-[72%] flex-col gap-1.5 rounded-[3px] bg-surface px-[12%] pt-[14%] shadow-[0_1px_2px_rgb(20_24_33/0.08),0_6px_16px_-6px_rgb(20_24_33/0.18)]">
        <span className="h-1.5 w-3/4 rounded-full bg-line-strong" />
        <span className="h-1 w-full rounded-full bg-line" />
        <span className="h-1 w-full rounded-full bg-line" />
        <span className="h-1 w-2/3 rounded-full bg-line" />
        <span className="mt-1 h-1 w-full rounded-full bg-line" />
        <span className="h-1 w-5/6 rounded-full bg-line" />
        <span className={cn("absolute -left-1.5 bottom-[14%] rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white", isPdf ? "bg-rose-600" : "bg-ink-2")}>
          {isPdf ? "PDF" : <FileText className="size-3" />}
        </span>
      </div>
    </div>
  );
}
