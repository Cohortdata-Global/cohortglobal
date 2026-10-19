"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** URL-driven filters: search plus any number of selects. Filtering happens on the server. */
export function FilterBar({
  searchPlaceholder, filters = [], className,
}: {
  searchPlaceholder?: string;
  filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  className?: string;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  function push(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) sp.set(k, v); else sp.delete(k); }
    sp.delete("page");
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const t = setTimeout(() => { if ((params.get("q") ?? "") !== q) push({ q }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-56 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? t("search")} className="h-9 ps-9" aria-label={searchPlaceholder ?? t("search")} />
      </div>
      {filters.map((f) => (
        <div key={f.key} className="w-44">
          <Select className="h-9" value={params.get(f.key) ?? ""} onChange={(e) => push({ [f.key]: e.target.value })} aria-label={f.label}>
            <option value="">{f.label}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      ))}
      <span className={cn("text-[12.5px] text-muted transition-opacity", pending ? "opacity-100" : "opacity-0")} aria-live="polite">{t("updating")}</span>
    </div>
  );
}
