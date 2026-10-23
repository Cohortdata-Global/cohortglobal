"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flag, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { useAction } from "@/components/app/use-action";
import { assignSubmissions } from "@/server/actions/qc";
import { cn } from "@/lib/utils";

export type QueueRow = {
  id: string; status: string; project: string; projectId: string; file: string | null; contributor: string; agency: string | null;
  flags: number; waiting: string; assignee: string | null; segments: string[];
};

/**
 * The QC queue table (2E): pick rows, then assign them to a reviewer or to
 * yourself. Rows open the review page.
 */
export function QcQueueTable({ rows, reviewers, canAssign, meId, statusLabels }: {
  rows: QueueRow[]; reviewers: { id: string; label: string }[]; canAssign: boolean; meId: string; statusLabels: Record<string, string>;
}) {
  const t = useTranslations("qc");
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const { pending, run } = useAction();
  const all = rows.length > 0 && picked.length === rows.length;
  const names = useMemo(() => new Map(reviewers.map((r) => [r.id, r.label])), [reviewers]);

  function assign(target: string) {
    if (!picked.length || !target) return;
    run(() => assignSubmissions(picked, target), { onSuccess: () => { setPicked([]); setTo(""); } });
  }

  return (
    <div>
      {canAssign ? (
        <div className={cn("sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
          picked.length ? "border-pine-600/40 bg-pine-50" : "border-line bg-surface")}>
          <span className="me-1 text-[13.5px] text-ink-2">{picked.length ? t("selected", { count: picked.length }) : t("selectHint")}</span>
          <div className="min-w-[14rem]">
            <Select aria-label={t("assignTo")} value={to} onChange={(e) => setTo(e.target.value)} disabled={!picked.length}>
              <option value="">{t("assignTo")}</option>
              {reviewers.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </div>
          <Button size="sm" disabled={!picked.length || !to} loading={pending} onClick={() => assign(to)}>{t("assign")}</Button>
          <Button size="sm" variant="secondary" disabled={!picked.length || pending} onClick={() => assign(meId)}><UserCheck /> {t("assignMe")}</Button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-[13.5px]">
          <thead className="border-b border-line bg-paper text-left text-[12.5px] text-muted">
            <tr>
              {canAssign ? (
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" aria-label={t("selectAll")} className="size-4 accent-pine-600" checked={all}
                    onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])} />
                </th>
              ) : null}
              <th className="px-3 py-2.5 font-medium">{t("col.submission")}</th>
              <th className="px-3 py-2.5 font-medium">{t("col.project")}</th>
              <th className="px-3 py-2.5 font-medium">{t("col.profile")}</th>
              <th className="px-3 py-2.5 font-medium">{t("col.status")}</th>
              <th className="px-3 py-2.5 font-medium">{t("col.waiting")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = picked.includes(r.id);
              return (
                <tr key={r.id} className={cn("border-b border-line last:border-0", on && "bg-pine-50/50")}>
                  {canAssign ? (
                    <td className="px-3 py-2.5 align-top">
                      <input type="checkbox" aria-label={t("selectRow", { name: r.file ?? r.contributor })} className="size-4 accent-pine-600" checked={on}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} />
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5 align-top">
                    <Link href={`/admin/submissions/${r.id}?from=qc`} className="font-medium text-ink hover:text-pine-700 hover:underline">{r.file ?? t("noFile")}</Link>
                    <span className="block text-[12.5px] text-muted">{r.contributor}{r.agency ? `, ${r.agency}` : ""}</span>
                    {r.flags > 0 ? <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-medium text-amber-800"><Flag className="size-3" /> {t("flags", { count: r.flags })}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 align-top text-ink-2"><Link href={`/admin/projects/${r.projectId}?tab=submissions`} className="hover:underline">{r.project}</Link></td>
                  <td className="px-3 py-2.5 align-top"><div className="flex max-w-[15rem] flex-wrap gap-1">{r.segments.map((s) => <span key={s} className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] text-ink-2">{s}</span>)}</div></td>
                  <td className="px-3 py-2.5 align-top">
                    <StatusBadge status={r.status} labels={statusLabels} />
                    {r.assignee ? <span className="mt-1 block text-[12px] text-muted">{t("with", { name: r.assignee === meId ? t("you") : names.get(r.assignee) ?? t("reviewer") })}</span> : null}
                  </td>
                  <td className="tabular px-3 py-2.5 align-top text-muted">{r.waiting}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
