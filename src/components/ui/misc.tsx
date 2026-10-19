import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn, initials } from "@/lib/utils";

export function Avatar({ name, src, size = 32, className }: { name: string | null | undefined; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} className={cn("shrink-0 rounded-full object-cover ring-1 ring-line", className)} />;
  }
  return (
    <span style={style} className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-pine-50 font-semibold text-pine-700 ring-1 ring-pine-100", className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-sunken text-muted [&_svg]:size-5">{icon}</div> : null}
      <p className="font-display text-[16px] font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13.5px] text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-shimmer rounded-sm bg-[linear-gradient(90deg,var(--color-sunken)_0%,#f7f8fa_50%,var(--color-sunken)_100%)] bg-[length:200%_100%]", className)} />;
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-7 animate-rise">
      {back ? (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-ink">
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight text-ink sm:text-[30px]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** A count with a label. The number is the content; the label explains it. */
export function Stat({ label, value, hint, href, tone = "neutral" }: { label: string; value: number | string; hint?: string; href?: string; tone?: "neutral" | "attention" | "brand" }) {
  const body = (
    <>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cn("tabular mt-2 font-display text-[30px] font-semibold leading-none", tone === "attention" ? "text-amber-700" : tone === "brand" ? "text-pine-700" : "text-ink")}>{value}</span>
      {hint ? <span className="mt-2 text-[12.5px] text-muted">{hint}</span> : null}
    </>
  );
  const cls = "flex flex-col rounded-lg border border-line bg-surface px-4 py-4 shadow-raise";
  return href ? (
    <Link href={href} className={cn(cls, "transition-[border-color,translate] duration-150 hover:-translate-y-px hover:border-line-strong")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Tabs that are links, so each tab is a real URL (works with server pages and the back button). */
export function TabLinks({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  const t = useTranslations("common");
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label={t("sections")}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors",
              on ? "border-pine-600 font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className={cn("tabular rounded-xs px-1.5 text-[11.5px]", on ? "bg-pine-50 text-pine-700" : "bg-sunken text-muted")}>{t.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "attention" | "critical" | "positive"; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const cls = {
    info: "border-sky-600/20 bg-sky-50 text-sky-600",
    attention: "border-amber-600/25 bg-amber-50 text-amber-700",
    critical: "border-rose-600/25 bg-rose-50 text-rose-700",
    positive: "border-leaf-600/25 bg-leaf-50 text-leaf-600",
  }[tone];
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 animate-rise", cls)} role="status">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="mt-0.5 text-[13.5px] text-ink-2">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
