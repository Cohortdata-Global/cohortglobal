import Link from "next/link";
import { useTranslations } from "next-intl";

/** Four starting points, each with a small illustration that comes alive on hover. */
export function SuggestionCards() {
  const t = useTranslations("landing.cards");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card href="/sign-up?as=agency" title={t("agency")} delay={0}>
        <div className="relative mx-auto mt-2 w-[118px]">
          <div className="cg-doc rounded-lg bg-white p-3 shadow-[0_6px_18px_-8px_rgb(0_0_0/0.25)]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-5 items-center justify-center rounded-[3px] bg-[#d93025] text-[7px] font-bold text-white">PDF</span>
              <span className="text-[12px] text-[var(--g-muted)]">{t("registration")}</span>
            </div>
            <div className="mt-3 space-y-1.5"><div className="h-1 w-full rounded bg-[var(--g-soft-2)]" /><div className="h-1 w-4/5 rounded bg-[var(--g-soft-2)]" /><div className="h-1 w-3/5 rounded bg-[var(--g-soft-2)]" /></div>
          </div>
          <span className="cg-plus absolute -end-3 -top-3 flex size-7 items-center justify-center rounded-full bg-[#7d8fb5] text-[18px] leading-none text-white">+</span>
        </div>
      </Card>

      <Card href="/sign-up?as=freelancer" title={t("freelancer")} delay={80}>
        <div className="mt-1 rounded-lg bg-white/70 p-3 text-[12.5px] leading-6 text-[var(--g-muted)]">
          <p>{t("languagesQ")}</p>
          <p className="text-[var(--g-ink)]"><span className="cg-type">{t("languagesA")}</span><span className="cg-caret" /></p>
          <p className="mt-1">{t("cameraQ")}</p>
          <p className="text-[var(--g-blue)]">{t("cameraA")}</p>
        </div>
      </Card>

      <Card href="/sign-in" title={t("contract")} delay={160}>
        <div className="cg-scrollmask mt-1 h-[104px] overflow-hidden text-[12.5px] leading-6 text-[var(--g-muted)]">
          <div className="cg-scrolltext">
            <p className="text-[var(--g-ink)]">{t("contractTitle")}</p>
            <p>{t("clause1")}</p>
            <p>{t("clause2")}</p>
            <p>{t("clause3")}</p>
            <svg viewBox="0 0 160 36" className="mt-1 h-8 w-36" aria-hidden>
              <path className="cg-sign" d="M4 26c10-14 18-20 22-12s-6 14 2 8 14-18 20-10-4 16 6 9 14-12 22-6 10 6 18-2 16-6 26-4" fill="none" stroke="#1f1f1f" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </Card>

      <Card href="/sign-in" title={t("track")} delay={240}>
        <div className="mt-3 flex h-[92px] items-end gap-1.5 border-b border-[#dadce0] px-1" aria-hidden>
          {[46, 30, 78, 64, 52, 24, 44, 70, 38].map((h, i) => (
            <span key={i} className="cg-bar w-full rounded-t-[3px] bg-[#4169e1]" style={{ height: `${h}%`, ["--i" as string]: i }} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ href, title, delay, children }: { href: string; title: string; delay: number; children: React.ReactNode }) {
  return (
    <Link href={href} className="cg-card cg-fade-up group flex min-h-[230px] flex-col justify-between rounded-[22px] p-5 outline-none focus-visible:shadow-[0_0_0_2px_#1a73e8]"
      style={{ ["--d" as string]: `${700 + delay}ms` }}>
      <span className="text-[19px] leading-snug text-[var(--g-ink)]">{title}</span>
      {children}
    </Link>
  );
}
