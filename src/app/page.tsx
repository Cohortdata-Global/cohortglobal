import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/app/brand";
import { EmailPill } from "@/components/landing/email-pill";
import { SuggestionCards } from "@/components/landing/suggestion-cards";
import { PulseBoard } from "@/components/landing/pulse-board";
import "./landing.css";

export default async function Landing() {
  const [{ userId }, t, tb] = await Promise.all([auth(), getTranslations("landing"), getTranslations("brand")]);
  return (
    <div className="cg-landing min-h-dvh">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={tb("home")}>
          <BrandMark />
          <span className="text-[19px] tracking-tight text-[var(--g-ink)]">{tb("name")}</span>
        </Link>
        <nav className="flex items-center gap-1 text-[14.5px]">
          {userId ? (
            <Link href="/home" className="rounded-full bg-[var(--g-ink)] px-5 py-2.5 text-white transition-opacity hover:opacity-90">{t("open")}</Link>
          ) : (
            <>
              <Link href="/sign-in" className="rounded-full px-4 py-2.5 text-[var(--g-muted)] transition-colors hover:bg-[var(--g-soft)] hover:text-[var(--g-ink)]">{t("signIn")}</Link>
              <Link href="/sign-up" className="rounded-full bg-[var(--g-ink)] px-5 py-2.5 text-white transition-opacity hover:opacity-90">{t("createAccount")}</Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <section className="pb-14 pt-14 sm:pt-24">
          <h1 className="text-[46px] font-medium leading-[1.05] tracking-[-0.035em] sm:text-[72px] lg:text-[88px]">
            <span className="cg-hello">{t("hello")}</span>
            <span className="cg-fade-up block text-[var(--g-faint)]" style={{ ["--d" as string]: "350ms" }}>{t("tagline")}</span>
          </h1>
          <p className="cg-fade-up mt-7 max-w-2xl text-[18px] leading-relaxed text-[var(--g-muted)]" style={{ ["--d" as string]: "500ms" }}>
            {t("intro")}
          </p>
          <div className="cg-fade-up mt-9 max-w-2xl" style={{ ["--d" as string]: "600ms" }}>
            <EmailPill />
            <p className="mt-3 ps-4 text-[13px] text-[var(--g-muted)]">{t("invited")}</p>
          </div>
        </section>

        <SuggestionCards />

        <section className="pb-24 pt-24 sm:pt-32">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-2xl text-[36px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
              {t.rich("glance", { f: (c) => <span className="text-[var(--g-faint)]">{c}</span> })}
            </h2>
            <p className="max-w-sm text-[15px] text-[var(--g-muted)]">{t("glanceBody")}</p>
          </div>
          <PulseBoard />
        </section>
      </main>

      <footer className="border-t border-[var(--g-soft-2)]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13.5px] text-[var(--g-muted)] sm:px-8">
          <span>{t("operatedBy")}</span>
          <span className="flex gap-5">
            <Link href="/legal/privacy" className="transition-colors hover:text-[var(--g-ink)]">{t("privacy")}</Link>
            <Link href="/legal/terms" className="transition-colors hover:text-[var(--g-ink)]">{t("terms")}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
