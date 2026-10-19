import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { AcceptInvitationButton } from "@/components/flows/accept-invitation";
import { previewInvitation } from "@/server/invitations/preview";
import { getViewer } from "@/server/auth/viewer";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("invitation");

const PURPOSES = ["PLATFORM_STAFF", "AGENCY_OWNER", "AGENCY_MANAGER", "AGENCY_MEMBER"] as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, { userId }, t, labels] = await Promise.all([previewInvitation(token), auth(), getTranslations("invitePage"), getLabels()]);
  const viewer = userId ? await getViewer() : null;
  const here = `/invite/${token}`;

  if (invite.state !== "PENDING") {
    const state = invite.state;
    return (
      <AuthFrame aside={{ title: t("asideTitle"), body: t("asideBody") }}>
        <div className="w-full max-w-md animate-rise">
          <h1 className="text-[26px] font-semibold text-ink">{t(state)}</h1>
          <p className="mt-2 text-[15px] text-ink-2">{t(`${state}Body`)}</p>
          <Button asChild className="mt-7" variant="secondary"><Link href="/sign-in">{t("goSignIn")}</Link></Button>
        </div>
      </AuthFrame>
    );
  }

  const orgName = invite.organization_name ?? "CohortData";
  const purpose = PURPOSES.find((p) => p === invite.purpose) ?? "AGENCY_MEMBER";
  const role = purpose === "PLATFORM_STAFF" && invite.role_code ? labels.role(invite.role_code) : null;
  const emailMismatch = viewer && viewer.user.email !== invite.email;

  return (
    <AuthFrame aside={{
      title: t("invitedYou", { name: invite.inviter_name ?? "CohortData" }),
      body: t("invitedBody"),
      points: [t("point1"), t("point2")],
    }}>
      <div className="w-full max-w-md animate-rise">
        <p className="text-[13px] text-muted">{t("for", { email: invite.email ?? "" })}</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight text-ink">
          {t("title", { what: t(`what.${purpose}`, { org: orgName }) })}
        </h1>
        {role ? <p className="mt-3 text-[15px] text-ink-2">{t("role", { role })}</p> : null}
        {invite.message ? (
          <blockquote className="mt-5 rounded-md border-s-2 border-pine-600 bg-pine-50 px-4 py-3 text-[14px] text-ink-2">{invite.message}</blockquote>
        ) : null}
        <p className="mt-4 text-[13px] text-muted">{t("validUntil", { date: formatDate(invite.expires_at, viewer?.user.timezone ?? "UTC", true) })}</p>

        <div className="mt-8">
          {!userId ? (
            <div className="flex flex-col gap-3">
              <Button asChild size="lg"><Link href={`/sign-up?email=${encodeURIComponent(invite.email ?? "")}&redirect_url=${encodeURIComponent(here)}`}>{t("create")}</Link></Button>
              <Button asChild size="lg" variant="secondary"><Link href={`/sign-in?redirect_url=${encodeURIComponent(here)}`}>{t("haveAccount")}</Link></Button>
            </div>
          ) : emailMismatch ? (
            <>
              <Notice tone="attention" title={t("signedInAs", { email: viewer?.user.email ?? "" })}>
                {t("mismatch", { email: invite.email ?? "" })}
              </Notice>
              <SignOutButton redirectUrl={here}><Button variant="secondary" size="lg" className="w-full">{t("switch")}</Button></SignOutButton>
            </>
          ) : (
            <AcceptInvitationButton token={token} label={t("accept")} />
          )}
        </div>
      </div>
    </AuthFrame>
  );
}
