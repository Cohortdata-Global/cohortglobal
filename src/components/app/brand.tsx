import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Mark: three contributors converging into one cohort. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-pine-600)" />
      <circle cx="11" cy="12" r="4" fill="#fff" opacity="0.55" />
      <circle cx="21" cy="12" r="4" fill="#fff" opacity="0.8" />
      <circle cx="16" cy="20.5" r="4.5" fill="#fff" />
    </svg>
  );
}

export function Brand({ href = "/", sub }: { href?: string; sub?: string }) {
  const t = useTranslations("brand");
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={t("home")}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[16px] font-semibold tracking-tight text-ink">{t("name")}</span>
        {sub ? <span className="mt-1 text-[11.5px] text-muted">{sub}</span> : null}
      </span>
    </Link>
  );
}
