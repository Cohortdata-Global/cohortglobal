import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn, formatDate } from "@/lib/utils";

export type Stage = { key: string; label: string; at?: string | null; note?: string };

/**
 * The lifecycle of a piece of work, from application to active project.
 * CohortGlobal's signature element: every applicant, agency and reviewer sees
 * the same track, so "where is this?" always has one answer.
 */
export function StageTrack({
  stages, current, outcome = "progress", timeZone = "UTC", compact = false,
}: {
  stages: Stage[];
  /** Index of the stage reached (0-based). -1 means nothing yet. */
  current: number;
  outcome?: "progress" | "stopped";
  timeZone?: string;
  compact?: boolean;
}) {
  const t = useTranslations("common");
  const last = stages.length - 1;
  const reached = Math.max(-1, Math.min(current, last));
  const fill = last <= 0 ? 0 : (Math.max(0, reached) / last) * 100;
  return (
    <div className={cn("w-full", compact ? "py-1" : "py-2")} role="list" aria-label={t("progress")}>
      <div className="relative mx-3">
        <div className="absolute inset-x-0 top-[11px] h-[3px] rounded-full bg-sunken" aria-hidden />
        <div
          className={cn("absolute top-[11px] h-[3px] rounded-full motion-safe:animate-[track-fill_0.9s_var(--ease-snap)_both]", outcome === "stopped" ? "bg-rose-600" : "bg-pine-600")}
          style={{ width: `${fill}%` }}
          aria-hidden
        />
        <ol className="relative flex justify-between">
          {stages.map((s, i) => {
            const done = i <= reached;
            const isStop = outcome === "stopped" && i === reached;
            const isNext = outcome === "progress" && i === reached + 1;
            return (
              <li key={s.key} role="listitem" className="flex w-0 flex-col items-center" aria-current={i === reached ? "step" : undefined}>
                <span
                  className={cn(
                    "flex size-[25px] items-center justify-center rounded-full border-2 bg-surface text-[11px] font-semibold transition-colors",
                    done && !isStop && "border-pine-600 bg-pine-600 text-white",
                    isStop && "border-rose-600 bg-rose-600 text-white",
                    isNext && "border-pine-600 text-pine-700",
                    !done && !isNext && "border-line-strong text-faint",
                  )}
                  style={done ? { animation: `node-in .35s var(--ease-snap) ${0.12 * i}s both` } : undefined}
                >
                  {isStop ? <X className="size-3.5" strokeWidth={3} /> : done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                {!compact ? (
                  <span className="mt-2 w-24 text-center">
                    <span className={cn("block text-[12.5px] leading-tight", done || isNext ? "font-medium text-ink" : "text-muted")}>{s.label}</span>
                    {s.at ? <span className="tabular mt-0.5 block text-[11.5px] text-muted">{formatDate(s.at, timeZone)}</span> : s.note ? <span className="mt-0.5 block text-[11.5px] text-muted">{s.note}</span> : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export type StageWords = (key: "applied" | "approved" | "notApproved" | "withdrawn" | "signed" | "countersigned" | "active") => string;

/** The standard track for an application → contract → active project. `w` gives the words (messages "stages"). */
export function applicationStages(input: {
  submittedAt?: string | null; decidedAt?: string | null; applicantSignedAt?: string | null; countersignedAt?: string | null;
  applicationStatus?: string | null; assignmentStatus?: string | null;
}, w: StageWords): { stages: Stage[]; current: number; outcome: "progress" | "stopped" } {
  const stages: Stage[] = [
    { key: "applied", label: w("applied"), at: input.submittedAt },
    { key: "approved", label: input.applicationStatus === "REJECTED" ? w("notApproved") : w("approved"), at: input.decidedAt },
    { key: "signed", label: w("signed"), at: input.applicantSignedAt },
    { key: "countersigned", label: w("countersigned"), at: input.countersignedAt },
    { key: "active", label: w("active"), at: input.countersignedAt },
  ];
  let current = input.submittedAt ? 0 : -1;
  let outcome: "progress" | "stopped" = "progress";
  if (input.applicationStatus === "REJECTED" || input.applicationStatus === "WITHDRAWN") {
    current = 1;
    outcome = "stopped";
    if (input.applicationStatus === "WITHDRAWN") stages[1] = { key: "approved", label: w("withdrawn") };
  } else if (input.applicationStatus === "APPROVED") {
    current = 1;
    if (input.assignmentStatus === "AWAITING_COUNTERSIGNATURE") current = 2;
    if (input.assignmentStatus === "ACTIVE" || input.assignmentStatus === "COMPLETED") current = 4;
    if (input.assignmentStatus === "REVOKED") { outcome = "stopped"; current = Math.max(current, 2); }
  }
  return { stages, current, outcome };
}
