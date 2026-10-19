import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader, DetailList } from "@/components/ui/panel";
import { AccountForm } from "@/components/flows/account-form";
import { homeFor, requireViewer } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatPhone } from "@/lib/phone";

export const generateMetadata = titled("account");

/** Personal profile for every signed-in person. Sign-in email and password stay with Clerk. */
export default async function AccountPage() {
  const viewer = await requireViewer();
  const [t, labels] = await Promise.all([getTranslations("account"), getLabels()]);
  const home = homeFor(viewer);
  const freelancer = viewer.roles.includes("DIRECT_FREELANCER");
  let contributor: Record<string, unknown> | null = null;
  if (freelancer) {
    const db = await createUserClient();
    contributor = (await db.from("contributor_profiles").select("*").eq("user_id", viewer.user.id).maybeSingle()).data;
  }
  const c = contributor as null | { date_of_birth: string | null; gender: string | null; nationality_code: string | null; native_language: string | null; other_languages: string[]; linkedin_url: string | null };

  return (
    <AppShell viewer={viewer} surfaceLabel={t("surface")} homeHref={home}
      groups={[{ items: [{ href: home, label: t("back"), icon: "overview", exact: true }, { href: "/account", label: t("title"), icon: "account", exact: true }] }]}>
      <PageHeader title={t("title")} description={t("body")} />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelBody className="py-6">
            <AccountForm initial={{
              full_name: viewer.user.fullName ?? "", phone: viewer.user.phoneE164 ?? "", country_code: viewer.user.countryCode ?? "", timezone: viewer.user.timezone,
              contributor: freelancer ? {
                date_of_birth: c?.date_of_birth ?? "", gender: (c?.gender ?? "") as "", nationality_code: c?.nationality_code ?? "",
                native_language: c?.native_language ?? "", other_languages: (c?.other_languages ?? []).join(", "), linkedin_url: c?.linkedin_url ?? "",
              } : undefined,
            }} />
          </PanelBody>
        </Panel>
        <Panel className="h-fit">
          <PanelHeader title={t("access")} />
          <PanelBody>
            <DetailList className="sm:grid-cols-1" items={[
              { label: t("email"), value: viewer.user.email },
              { label: t("role"), value: labels.primaryRole(viewer.roles, viewer.membership?.role) },
              { label: t("organization"), value: viewer.organization?.name ?? t("independent") },
              { label: t("phone"), value: formatPhone(viewer.user.phoneE164) },
            ]} />
            <p className="mt-5 border-t border-line pt-4 text-[13px] text-muted">{t("changeLogin")}</p>
          </PanelBody>
        </Panel>
      </div>
    </AppShell>
  );
}
