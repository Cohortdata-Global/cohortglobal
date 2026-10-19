import { useTranslations } from "next-intl";
import { statusTone } from "@/lib/status";
import { useLabels } from "@/i18n/labels";
import { cn, formatDate } from "@/lib/utils";
import type { AuditRow, EventRow } from "@/server/queries/people";

const DOT: Record<string, string> = {
  positive: "bg-leaf-600", critical: "bg-rose-600", attention: "bg-amber-600", info: "bg-sky-600", brand: "bg-pine-600", neutral: "bg-faint",
};

/** Status history: who moved what, from where to where, and why. */
export function Timeline({ events, timeZone, empty }: { events: EventRow[]; timeZone: string; empty?: string }) {
  const t = useTranslations("timeline");
  const tc = useTranslations("common");
  const labels = useLabels();
  const b = (chunks: React.ReactNode) => <span className="font-medium">{chunks}</span>;
  if (events.length === 0) return <p className="px-5 py-6 text-[13.5px] text-muted">{empty ?? t("noHistory")}</p>;
  return (
    <ol className="relative px-5 py-4">
      <span className="absolute bottom-6 start-[27px] top-6 w-px bg-line" aria-hidden />
      {events.map((e) => {
        const tone = statusTone(e.to_status);
        const entity = labels.entity(e.entity_type);
        const to = labels.status(e.to_status).toLowerCase();
        return (
          <li key={e.id} className="relative flex gap-4 py-2.5">
            <span className={cn("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface", DOT[tone])} aria-hidden />
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink">
                {e.from_status
                  ? t.rich("moved", { entity, from: labels.status(e.from_status).toLowerCase(), to, b })
                  : t.rich("set", { entity, to, b })}
              </p>
              <p className="text-[12.5px] text-muted">{t("byAt", { who: e.actor?.full_name ?? e.actor?.email ?? tc("system"), when: formatDate(e.created_at, timeZone, true) })}</p>
              {e.reason ? <p className="mt-1 rounded-sm bg-paper px-2.5 py-1.5 text-[13px] text-ink-2">{e.reason}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AuditList({ rows, timeZone, empty }: { rows: AuditRow[]; timeZone: string; empty?: string }) {
  const t = useTranslations("timeline");
  const tc = useTranslations("common");
  if (rows.length === 0) return <p className="px-5 py-6 text-[13.5px] text-muted">{empty ?? t("nothingRecorded")}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[170px_1fr] sm:gap-4">
          <span className="tabular text-[12.5px] text-muted">{formatDate(r.occurred_at, timeZone, true)}</span>
          <span className="min-w-0">
            <span className="block text-[13.5px] text-ink">{r.summary}</span>
            <span className="block text-[12.5px] text-muted">{t("actionBy", { who: r.actor_kind === "SYSTEM" ? tc("system") : r.actor?.full_name ?? r.actor?.email ?? tc("unknown"), action: r.action })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
