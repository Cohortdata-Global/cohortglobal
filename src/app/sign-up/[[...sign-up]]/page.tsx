import { SignUp } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("signUp");

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ as?: string; email?: string; redirect_url?: string }> }) {
  const { as, email, redirect_url } = await searchParams;
  const t = await getTranslations("auth");
  const kind = as === "agency" || as === "freelancer" ? as : redirect_url?.startsWith("/invite/") ? "invite" : "freelancer";
  const safe = redirect_url && redirect_url.startsWith("/") && !redirect_url.startsWith("//")
    ? redirect_url
    : kind === "agency" ? "/onboarding/agency" : kind === "freelancer" && as ? "/onboarding/freelancer" : "/home";
  return (
    <AuthFrame aside={{ title: t(`${kind}Title`), body: t(`${kind}Body`), points: [t(`${kind}Point1`), t(`${kind}Point2`)] }}>
      <SignUp forceRedirectUrl={safe} signInUrl="/sign-in" initialValues={email ? { emailAddress: email } : undefined} />
    </AuthFrame>
  );
}
