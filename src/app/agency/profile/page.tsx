import { PageHeader, Notice } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader, DetailList } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { DocumentList, type DocumentRow } from "@/components/flows/document-list";
import { ChangeRequestDialog, CancelRequest, OwnerRequests } from "@/components/flows/agency-portal-actions";
import { can, requireSurface } from "@/server/auth/viewer";
import { loadAgencyProfile, profileToForm } from "@/server/queries/agency";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { formatPhone } from "@/lib/phone";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("profile");

type Req = { id: string; type: string; status: string; note: string | null; requested_at: string; decided_at: string | null; decision_note: string | null; payload: { remove_document_ids?: string[] } };

export default async function AgencyProfile() {
  const viewer = await requireSurface("agency");
  const orgId = viewer.organization!.id;
  const { org, profile, documents } = await loadAgencyProfile(orgId);
  const [db, t, tf, labels] = await Promise.all([createUserClient(), getTranslations("agencyProfile"), getTranslations("agencyDetail.fields"), getLabels()]);
  const tz = viewer.user.timezone;
  const [{ data: reqData }, { data: manager }] = await Promise.all([
    db.from("agency_requests").select("id,type,status,note,requested_at,decided_at,decision_note,payload").eq("organization_id", orgId).order("requested_at", { ascending: false }).limit(10),
    db.from("organization_memberships").select("id,user:users!organization_memberships_user_id_fkey(full_name,email)").eq("organization_id", orgId).eq("role", "AGENCY_MANAGER").eq("status", "ACTIVE").maybeSingle(),
  ]);
  const requests = (reqData ?? []) as Req[];
  const pending = requests.filter((r) => r.status === "PENDING");
  const pendingChange = pending.find((r) => r.type === "PROFILE_CHANGE");
  const docs = documents as (DocumentRow & { request_id: string | null })[];
  const canRequest = can(viewer, "org.profile.request_change") && (org?.status === "ACTIVE" || org?.status === "SUSPENDED");
  const isOwner = viewer.membership?.role === "AGENCY_OWNER";
  const managerUser = (manager as unknown as { user: { full_name: string | null; email: string } | null } | null)?.user;

  return (
    <>
      <PageHeader title={t("title")}
        description={t("body")}
        actions={canRequest && !pendingChange ? <ChangeRequestDialog initial={profileToForm(org?.name ?? "", profile)} documents={docs.filter((d) => d.status === "ACTIVE").map((d) => ({ id: d.id, file_name: d.file_name }))} /> : null} />

      {pendingChange ? (
        <Notice tone="info" title={t("pendingTitle")} action={<CancelRequest requestId={pendingChange.id} />}>
          {t("pendingBody", { date: formatDate(pendingChange.requested_at, tz, true) })}
          {pendingChange.payload.remove_document_ids?.length ? t("removeCount", { count: pendingChange.payload.remove_document_ids.length }) : ""}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader title={<span className="flex items-center gap-2">{org?.name}<StatusBadge status={org?.status} /></span>} description={org?.approved_at ? t("approved", { date: formatDate(org.approved_at, tz) }) : undefined} />
          <PanelBody>
            <DetailList items={[
              { label: tf("legalName"), value: profile?.legal_name },
              { label: tf("country"), value: countryName(profile?.country_code) },
              { label: tf("registration"), value: profile?.registration_number },
              { label: tf("tax"), value: profile?.tax_id },
              { label: tf("website"), value: profile?.website_url },
              { label: tf("address"), value: profile?.address },
              { label: tf("contact"), value: profile?.contact_name },
              { label: tf("contactEmail"), value: profile?.contact_email },
              { label: tf("contactPhone"), value: formatPhone(profile?.contact_phone_e164) },
              { label: tf("languages"), value: profile?.languages?.join(", ") || null },
              { label: tf("teamSize"), value: profile?.team_size },
            ]} />
            {profile?.description ? <p className="mt-5 whitespace-pre-wrap border-t border-line pt-4 text-[14px] text-ink-2">{profile.description}</p> : null}
          </PanelBody>
        </Panel>

        <div className="grid h-fit gap-6">
          <Panel>
            <PanelHeader title={t("documents")} description={pendingChange ? t("documentsPending") : t("documentsStart")} />
            <PanelBody>
              <DocumentList organizationId={orgId} documents={docs} canUpload={!!pendingChange && canRequest} canRemove={false} requestId={pendingChange?.id}
                uploadHint={t("uploadHint")} />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t("requests")} />
            {requests.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-muted">{t("noRequests")}</p> : (
              <ul className="divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-medium text-ink">{labels.requestType(r.type)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-[12.5px] text-muted">{r.decided_at ? t("sentDecided", { date: formatDate(r.requested_at, tz), decided: formatDate(r.decided_at, tz) }) : t("sent", { date: formatDate(r.requested_at, tz) })}</p>
                    {r.decision_note ? <p className="mt-1.5 rounded-sm bg-paper px-2.5 py-1.5 text-[13px] text-ink-2">{r.decision_note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {isOwner && org?.status === "ACTIVE" ? (
        <Panel className="mt-6">
          <PanelHeader title={t("ownership")} description={t("ownershipBody")} />
          <PanelBody>
            <OwnerRequests hasManager={!!managerUser} managerName={managerUser?.full_name ?? managerUser?.email ?? null} pendingTypes={pending.map((r) => r.type)} />
          </PanelBody>
        </Panel>
      ) : null}
    </>
  );
}
