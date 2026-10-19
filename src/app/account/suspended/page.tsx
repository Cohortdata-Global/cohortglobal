import { SignOutButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { Button } from "@/components/ui/button";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("suspended");

export default async function Suspended() {
  const t = await getTranslations("suspended");
  return (
    <AuthFrame aside={{ title: t("asideTitle"), body: t("asideBody") }}>
      <div className="w-full max-w-md animate-rise">
        <h1 className="text-[26px] font-semibold text-ink">{t("title")}</h1>
        <p className="mt-2 text-[15px] text-ink-2">{t("body")}</p>
        <SignOutButton redirectUrl="/"><Button variant="secondary" className="mt-7">{t("signOut")}</Button></SignOutButton>
      </div>
    </AuthFrame>
  );
}
