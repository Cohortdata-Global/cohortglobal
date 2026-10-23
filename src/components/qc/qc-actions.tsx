"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquarePlus, RefreshCw, RotateCcw, Undo2, UserCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { notify } from "@/lib/notify";
import { REASON_CODES } from "@/lib/qc";
import { cn } from "@/lib/utils";
import { assignSubmissions, commentOnSubmission, decideSubmission, rerunChecks, unassignSubmission } from "@/server/actions/qc";

type Decision = "APPROVED" | "RESUBMIT_REQUESTED" | "REJECTED";

/** Assign / take / return a submission (QC Lead, the project's PM, Operations Manager, Super Admin). */
export function QcAssign({ submissionId, status, assignee, meId, reviewers, canRerun }: {
  submissionId: string; status: string; assignee: string | null; meId: string; reviewers: { id: string; label: string }[]; canRerun: boolean;
}) {
  const t = useTranslations("qc");
  const [to, setTo] = useState("");
  const { pending, run } = useAction();
  const open = status === "READY_FOR_QC" || status === "IN_REVIEW";
  return (
    <div className="grid gap-2.5">
      {open ? (
        <>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Select aria-label={t("assignTo")} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">{assignee ? t("reassignTo") : t("assignTo")}</option>
                {reviewers.filter((r) => r.id !== assignee).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </div>
            <Button variant="secondary" disabled={!to} loading={pending} onClick={() => run(() => assignSubmissions([submissionId], to), { onSuccess: () => setTo("") })}>{t("assign")}</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {assignee !== meId ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => assignSubmissions([submissionId], meId))}><UserCheck /> {t("takeIt")}</Button> : null}
            {status === "IN_REVIEW" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unassignSubmission(submissionId))}><Undo2 /> {t("returnToQueue")}</Button> : null}
          </div>
        </>
      ) : null}
      {canRerun ? <Button size="sm" variant="ghost" className="justify-self-start" disabled={pending} onClick={() => run(() => rerunChecks(submissionId))}><RefreshCw /> {t("rerun")}</Button> : null}
    </div>
  );
}

/** The assignee's decision (first brief: approve, or reject with a remark the contributor sees; plus "ask to resubmit"). */
export function QcDecide({ submissionId, nextHref }: { submissionId: string; nextHref: string }) {
  const t = useTranslations("qc");
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string>();
  const { pending, run } = useAction();
  const needsRemark = decision === "REJECTED" || decision === "RESUBMIT_REQUESTED";

  function submit() {
    if (!decision) return;
    if (needsRemark && remark.trim().length < 5) {
      setError(t("remarkNeeded"));
      notify.error(t("remarkNeededTitle"), t("remarkNeeded"));
      return;
    }
    run(() => decideSubmission(submissionId, decision, remark, reasons), { onSuccess: () => router.push(nextHref) });
  }

  const choices: { key: Decision; icon: React.ReactNode; tone: string }[] = [
    { key: "APPROVED", icon: <Check className="size-4" />, tone: "data-[on=true]:border-pine-600 data-[on=true]:bg-pine-50 data-[on=true]:text-pine-800" },
    { key: "RESUBMIT_REQUESTED", icon: <RotateCcw className="size-4" />, tone: "data-[on=true]:border-amber-600 data-[on=true]:bg-amber-50 data-[on=true]:text-amber-800" },
    { key: "REJECTED", icon: <X className="size-4" />, tone: "data-[on=true]:border-rose-600 data-[on=true]:bg-rose-50 data-[on=true]:text-rose-700" },
  ];

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t("decision")} className="grid grid-cols-3 gap-1.5">
        {choices.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={decision === c.key} data-on={decision === c.key}
            onClick={() => { setDecision(c.key); setError(undefined); }}
            className={cn("flex flex-col items-center gap-1 rounded-md border border-line px-2 py-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong", c.tone)}>
            {c.icon}{t(`decide.${c.key}`)}
          </button>
        ))}
      </div>
      {needsRemark ? (
        <div className="grid gap-2 animate-rise">
          <p className="text-[12.5px] font-medium text-ink-2">{t("reasons")}</p>
          <div className="flex flex-wrap gap-1.5">
            {REASON_CODES.map((r) => {
              const on = reasons.includes(r);
              return (
                <button key={r} type="button" aria-pressed={on} onClick={() => setReasons((p) => (on ? p.filter((x) => x !== r) : [...p, r]))}
                  className={cn("rounded-full border px-2.5 py-1 text-[12px] transition-colors", on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong")}>
                  {t(`reasonCodes.${r}`)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {decision ? (
        <div className="grid gap-1.5 animate-rise">
          <label htmlFor="qc-remark" className="text-[12.5px] font-medium text-ink-2">{needsRemark ? t("remarkLabel") : t("remarkOptional")}</label>
          <Textarea id="qc-remark" rows={4} value={remark} maxLength={2000} aria-invalid={!!error}
            placeholder={decision === "RESUBMIT_REQUESTED" ? t("remarkResubmitPh") : decision === "REJECTED" ? t("remarkRejectPh") : ""}
            onChange={(e) => { setRemark(e.target.value); setError(undefined); }} />
          {error ? <p className="text-[12.5px] text-rose-700">{error}</p> : <p className="text-[12px] text-muted">{t("remarkVisible")}</p>}
        </div>
      ) : null}
      <Button disabled={!decision} loading={pending} onClick={submit}>{decision ? t(`confirm.${decision}`) : t("chooseDecision")}</Button>
    </div>
  );
}

/** Comment: internal (CohortData only) or shared with the agency and the contributor. */
export function QcComment({ submissionId }: { submissionId: string }) {
  const t = useTranslations("qc");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const { pending, run } = useAction();
  return (
    <div className="grid gap-2">
      <Textarea rows={3} value={body} maxLength={2000} aria-label={t("comment")} placeholder={t("commentPh")} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="size-4 accent-pine-600" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t("shareWithAgency")}
        </label>
        <Button size="sm" variant="secondary" disabled={!body.trim()} loading={pending}
          onClick={() => run(() => commentOnSubmission(submissionId, body, shared), { onSuccess: () => { setBody(""); setShared(false); } })}>
          <MessageSquarePlus /> {t("post")}
        </Button>
      </div>
    </div>
  );
}
