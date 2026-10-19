import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { titled } from "@/i18n/metadata";
import { FreelancerForm } from "@/components/flows/freelancer-form";
import { homeFor, requireViewer } from "@/server/auth/viewer";

export const generateMetadata = titled("freelancer");

export default async function FreelancerOnboarding() {
  const viewer = await requireViewer();
  const home = homeFor(viewer);
  if (home !== "/onboarding") redirect(home);
  const t = await getTranslations("onboarding");
  return (
    <AuthFrame aside={{
      title: t("freelancerAsideTitle"),
      body: t("freelancerAsideBody"),
      points: [t("freelancerPoint1"), t("freelancerPoint2")],
    }}>
      <div className="w-full max-w-xl animate-rise">
        <h1 className="text-[28px] font-semibold text-ink">{t("freelancerTitle")}</h1>
        <p className="mb-8 mt-2 text-[15px] text-ink-2">{t("freelancerBody")}</p>
        <FreelancerForm defaultName={viewer.user.fullName ?? ""} />
      </div>
    </AuthFrame>
  );
}
