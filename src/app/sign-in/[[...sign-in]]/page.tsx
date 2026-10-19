import { SignIn } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("signIn");

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  const t = await getTranslations("auth");
  const safe = redirect_url && redirect_url.startsWith("/") && !redirect_url.startsWith("//") ? redirect_url : "/home";
  return (
    <AuthFrame aside={{ title: t("signInTitle"), body: t("signInBody"), points: [t("signInPoint1"), t("signInPoint2")] }}>
      <SignIn forceRedirectUrl={safe} signUpUrl="/sign-up" />
    </AuthFrame>
  );
}
