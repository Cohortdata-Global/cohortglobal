import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/misc";

/** Shown instantly while a server page loads, so navigation never feels stuck. */
export function PageSkeleton() {
  const t = useTranslations("common");
  return (
    <div aria-busy="true" aria-label={t("loading")}>
      <Skeleton className="mb-3 h-8 w-64" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-lg" />)}
      </div>
      <div className="rounded-lg border border-line bg-surface p-5">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="mb-3 h-10 last:mb-0" />)}
      </div>
    </div>
  );
}
