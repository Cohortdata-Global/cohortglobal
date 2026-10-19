import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { titled } from "@/i18n/metadata";
import { homeFor, requireViewer } from "@/server/auth/viewer";

export const generateMetadata = titled("onboarding");

/** Public sign-up paths: direct freelancer or vendor/agency. Staff only join by invitation. */
export default async function OnboardingChoice() {
  const viewer = await requireViewer();
  const home = homeFor(viewer);
  if (home !== "/onboarding") redirect(home);
  const t = await getTranslations("onboarding");

  const options = [
    { href: "/onboarding/agency", icon: Building2, title: t("agencyOption"), body: t("agencyOptionBody") },
    { href: "/onboarding/freelancer", icon: UserRound, title: t("freelancerOption"), body: t("freelancerOptionBody") },
  ];
  return (
    <AuthFrame aside={{
      title: t("asideTitle"),
      body: t("asideBody"),
      points: [t("asidePoint1"), t("asidePoint2")],
    }}>
      <div className="w-full max-w-lg">
        <h1 className="text-[28px] font-semibold text-ink animate-rise">{t("title")}</h1>
        <p className="mt-2 text-[15px] text-ink-2">{t("signedInAs", { email: viewer.user.email })}</p>
        <div className="mt-8 grid gap-3">
          {options.map((o, i) => (
            <Link key={o.href} href={o.href}
              className="group flex gap-4 rounded-lg border border-line bg-surface p-5 shadow-raise transition-[border-color,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-pine-200 hover:shadow-float"
              style={{ animation: `rise .4s var(--ease-snap) ${0.08 + i * 0.07}s both` }}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-pine-50 text-pine-700 transition-colors group-hover:bg-pine-600 group-hover:text-white">
                <o.icon className="size-5" />
              </span>
              <span>
                <span className="block font-display text-[17px] font-semibold text-ink">{o.title}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-muted">{o.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AuthFrame>
  );
}
