import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/app/brand";
import "@/app/landing.css";

/** Two-column frame for sign-in, sign-up, onboarding and invitations. Matches the homepage's light style. */
export function AuthFrame({ aside, children }: { aside: { title: string; body: string; points?: string[] }; children: React.ReactNode }) {
  const t = useTranslations("brand");
  return (
    <div className="cg-landing grid min-h-dvh lg:grid-cols-[minmax(0,480px)_1fr]">
      <aside className="hidden p-3 lg:block">
        <div className="flex h-full flex-col justify-between rounded-[28px] bg-[var(--g-soft)] px-9 py-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label={t("home")}>
            <BrandMark />
            <span className="text-[18px] tracking-tight text-[var(--g-ink)]">{t("name")}</span>
          </Link>
          <div>
            <h2 className="text-[40px] font-medium leading-[1.05] tracking-[-0.03em]"><span className="cg-hello">{aside.title}</span></h2>
            <p className="cg-fade-up mt-4 text-[16px] leading-relaxed text-[var(--g-muted)]" style={{ ["--d" as string]: "300ms" }}>{aside.body}</p>
            {aside.points ? (
              <ul className="mt-8 space-y-2.5">
                {aside.points.map((p, i) => (
                  <li key={p} className="cg-fade-up rounded-2xl bg-white/70 px-4 py-3 text-[14.5px] text-[var(--g-ink)]" style={{ ["--d" as string]: `${420 + i * 90}ms` }}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="text-[12.5px] text-[var(--g-muted)]">{t("operatedBy")}</p>
        </div>
      </aside>
      <div className="flex flex-col bg-white">
        <div className="px-5 pt-5 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5"><BrandMark /><span className="text-[17px]">{t("name")}</span></Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10">{children}</div>
      </div>
    </div>
  );
}
