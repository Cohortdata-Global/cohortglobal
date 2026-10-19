"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, FileSpreadsheet, FileDown, Upload, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { notify } from "@/lib/notify";
import { useLabels } from "@/i18n/labels";
import { BULK_COLUMNS, BULK_INVITE_MAX, readInviteFile, sampleCsv, type FileError, type PreviewRow, type RowProblem } from "@/lib/bulk-invite";
import { cn } from "@/lib/utils";
import { bulkInviteMembers, type BulkInviteResult } from "@/server/actions/invitations";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useSampleDownload(allowManager: boolean) {
  const t = useTranslations("bulkInvite");
  return () => {
    download("cohortglobal-invite-sample.csv", sampleCsv(allowManager));
    notify.success(t("sampleDone"), t("sampleDoneDetail"));
  };
}

/** "Sample CSV" button shown beside Bulk invite. */
export function SampleCsvButton({ allowManager }: { allowManager: boolean }) {
  const t = useTranslations("bulkInvite");
  const downloadSample = useSampleDownload(allowManager);
  return (
    <Button variant="ghost" onClick={downloadSample} title={t("sampleTitle")}>
      <FileDown /> {t("sample")}
    </Button>
  );
}

/**
 * Bulk invite (B1, ID-47): choose a CSV, check every row before anything is sent,
 * then see which people were invited and why any were skipped.
 */
export function BulkInviteDialog({ organizationId, allowManager }: { organizationId: string; allowManager: boolean }) {
  const t = useTranslations("bulkInvite");
  const tc = useTranslations("common");
  const labels = useLabels();
  const downloadSample = useSampleDownload(allowManager);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<BulkInviteResult[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const ready = rows?.filter((r) => !r.problem) ?? [];
  const problems = rows?.filter((r) => r.problem) ?? [];

  const problemText = (p: RowProblem) => (p.code === "roleUnknown" ? t("problems.roleUnknown", { role: p.role }) : t(`problems.${p.code}`));
  const fileErrorText = (e: FileError) => (e.code === "tooMany" ? t("fileErrors.tooMany", { max: e.max, count: e.count }) : t(`fileErrors.${e.code}`));

  function reset() {
    setFileName(null); setRows(null); setResults(null);
    if (input.current) input.current.value = "";
  }

  async function readFile(file: File) {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      notify.error(t("notCsv"), t("notCsvDetail"));
      return;
    }
    if (file.size > 1024 * 1024) {
      notify.error(t("tooLarge"), t("tooLargeDetail"));
      return;
    }
    const { rows: parsed, error } = readInviteFile(await file.text(), { allowManager });
    if (error) { notify.error(t("unreadable"), fileErrorText(error)); return; }
    setFileName(file.name);
    setRows(parsed);
    const bad = parsed.filter((r) => r.problem).length;
    if (bad) notify.info(t("someToFix", { ready: parsed.length - bad, bad }), t("someToFixDetail"));
  }

  function send() {
    start(async () => {
      try {
        const r = await bulkInviteMembers(organizationId, ready.map(({ line, name, email, role, message }) => ({ line, name, email, role, message })));
        if (!r.ok) { notify.error(r.error); return; }
        const done = r.data.results.filter((x) => x.ok).length;
        const failed = r.data.results.length - done + problems.length;
        setResults(r.data.results);
        if (done === 0) notify.error(t("noneCreated"), t("noneCreatedDetail"));
        else notify.success(t("created", { count: done }),
          failed ? t("skipped", { count: failed }) : r.data.emailed ? t("allEmailed") : t("notEmailed"));
      } catch {
        notify.error(tc("offlineTitle"), tc("offlineDetail"));
      }
    });
  }

  const failedResults = results?.filter((r) => !r.ok) ?? [];
  const okCount = results ? results.length - failedResults.length : 0;
  const notInvited = [...problems.map((p) => ({ line: p.line, email: p.email, error: p.problem ? problemText(p.problem) : "" })), ...failedResults];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) reset(); } }}>
      <DialogTrigger asChild><Button variant="secondary"><Users /> {t("trigger")}</Button></DialogTrigger>
      <DialogContent className="max-w-2xl" title={t("title")} description={t("body", { max: BULK_INVITE_MAX })}>
        {results ? (
          <div className="grid gap-4 animate-rise">
            <div className="flex items-start gap-3 rounded-md border border-line bg-paper p-3.5">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-pine-600" />
              <div className="text-[14px]">
                <p className="font-semibold text-ink">{t("created", { count: okCount })}</p>
                <p className="text-ink-2">{t("createdBody")}</p>
              </div>
            </div>
            {notInvited.length > 0 ? (
              <div>
                <p className="mb-2 text-[13.5px] font-semibold text-ink">{t("notInvited", { count: notInvited.length })}</p>
                <ul className="divide-y divide-line rounded-md border border-line text-[13.5px]">
                  {notInvited.map((f) => (
                    <li key={`${f.line}-${f.email}`} className="grid gap-0.5 px-3.5 py-2.5 sm:grid-cols-[4.5rem_1fr]">
                      <span className="tabular text-muted">{t("row", { line: f.line })}</span>
                      <span><span className="font-medium text-ink">{f.email || t("noEmail")}</span><span className="block text-amber-700">{f.error}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>{t("another")}</Button>
              <Button onClick={() => { setOpen(false); reset(); }}>{t("done")}</Button>
            </DialogFooter>
          </div>
        ) : rows ? (
          <div className="grid gap-4 animate-rise">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
              <span className="inline-flex items-center gap-2 text-ink-2"><FileSpreadsheet className="size-4 text-muted" /> {fileName}</span>
              <span className="text-ink-2">
                {t.rich("readyCount", { ready: ready.length, b: (c) => <strong className="text-ink">{c}</strong> })}
                {problems.length ? t.rich("fixCount", { bad: problems.length, w: (c) => <strong className="text-amber-700">{c}</strong> }) : null}
              </span>
            </div>
            <div className="max-h-[46vh] overflow-auto rounded-md border border-line">
              <table className="w-full border-collapse text-[13.5px]">
                <thead className="sticky top-0 border-b border-line bg-paper text-left text-[12.5px] text-muted">
                  <tr><th className="px-3 py-2 font-medium">{t("colRow")}</th><th className="px-3 py-2 font-medium">{t("colPerson")}</th><th className="px-3 py-2 font-medium">{t("colRole")}</th><th className="px-3 py-2 font-medium">{t("colCheck")}</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className={cn("border-b border-line last:border-0", r.problem && "bg-amber-50/60")}>
                      <td className="tabular px-3 py-2 align-top text-muted">{r.line}</td>
                      <td className="px-3 py-2 align-top">
                        <span className="block font-medium text-ink">{r.name || <span className="font-normal text-faint">{t("noName")}</span>}</span>
                        <span className="block break-all text-muted">{r.email || "—"}</span>
                      </td>
                      <td className="px-3 py-2 align-top text-ink-2">{labels.role(r.role)}</td>
                      <td className="px-3 py-2 align-top">
                        {r.problem
                          ? <span className="inline-flex items-start gap-1.5 text-amber-700"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{problemText(r.problem)}</span>
                          : <span className="inline-flex items-center gap-1.5 text-pine-700"><CheckCircle2 className="size-3.5" />{t("ready")}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset} disabled={pending}>{t("chooseAnother")}</Button>
              <Button onClick={send} loading={pending} disabled={ready.length === 0}>
                {pending ? t("sending") : t("send", { count: ready.length })}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-5">
            <label
              htmlFor="bulk-file"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
                dragging ? "border-pine-600 bg-pine-50" : "border-line-strong bg-paper hover:border-pine-500",
              )}>
              <Upload className="size-6 text-pine-600" />
              <span className="text-[14.5px] font-semibold text-ink">{t("drop")}</span>
              <span className="text-[13px] text-muted">{t("dropHint")}</span>
              <input ref={input} id="bulk-file" type="file" accept=".csv,text/csv" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[13.5px] font-semibold text-ink">{t("columns")}</p>
                <Button variant="link" size="sm" onClick={downloadSample}><FileDown className="size-3.5" /> {t("downloadSample")}</Button>
              </div>
              <dl className="divide-y divide-line rounded-md border border-line text-[13px]">
                {BULK_COLUMNS.map((c) => (
                  <div key={c.key} className="grid gap-0.5 px-3.5 py-2.5 sm:grid-cols-[6.5rem_1fr]">
                    <dt className="font-medium text-ink"><code className="text-[12.5px]">{c.key}</code>{c.required ? <span className="text-rose-600"> *</span> : <span className="text-faint"> {t("optional")}</span>}</dt>
                    <dd className="text-ink-2">{c.key === "role" && !allowManager ? t("columnHelp.roleMemberOnly") : t(`columnHelp.${c.key}`)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
