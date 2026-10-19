import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/app/auth-frame";
import { AgencyApplication } from "@/components/flows/agency-application";
import { EMPTY_AGENCY } from "@/components/flows/agency-form";
import { DocumentList } from "@/components/flows/document-list";
import { Notice } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { StageTrack } from "@/components/app/stage-track";
import { homeFor, requireViewer } from "@/server/auth/viewer";
import { loadAgencyProfile, profileToForm } from "@/server/queries/agency";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("agencyApplication");

export default async function AgencyOnboarding() {
  const viewer = await requireViewer();
  const home = homeFor(viewer);
  const org = viewer.organization?.type === "AGENCY" ? viewer.organization : null;
  if (home !== "/onboarding" && home !== "/onboarding/agency") redirect(home);
  const [t, labels] = await Promise.all([getTranslations("agencyOnboarding"), getLabels()]);
  const b = (c: React.ReactNode) => <strong>{c}</strong>;

  const aside = { title: t("asideTitle"), body: t("asideBody"), points: [t("point1"), t("point2"), t("point3")] };

  if (!org) {
    return (
      <AuthFrame aside={aside}>
        <div className="w-full max-w-2xl animate-rise">
          <p className="text-[13px] font-medium text-muted">{t("step1")}</p>
          <h1 className="mt-1 text-[28px] font-semibold text-ink">{t("detailsTitle")}</h1>
          <p className="mb-8 mt-2 text-[15px] text-ink-2">{t("detailsBody")}</p>
          <AgencyApplication mode="save" initial={{ ...EMPTY_AGENCY, contact_email: viewer.user.email, contact_name: viewer.user.fullName ?? "" }} submitLabel={t("continue")} />
        </div>
      </AuthFrame>
    );
  }

  const { profile, documents } = await loadAgencyProfile(org.id);
  const tz = viewer.user.timezone;
  const status = org.status;
  const draft = status === "DRAFT";
  const rejected = status === "REJECTED";
  const changes = status === "CHANGES_REQUESTED";
  const canReapply = rejected && (!org.reapplyAfter || new Date(org.reapplyAfter) <= new Date());
  // ID-44: the agency can change its application only in these states; the database enforces the same rule.
  const open = draft || changes || canReapply;
  const toReplace = documents.filter((d) => d.status === "REJECTED");
  const hasDocuments = documents.some((d) => d.status === "ACTIVE");
  const submitLabel = changes ? t("sendBack") : rejected ? t("applyAgain") : t("send");

  return (
    <AuthFrame aside={aside}>
      <div className="w-full max-w-2xl">
        {draft ? <p className="text-[13px] font-medium text-muted animate-rise">{t("step2")}</p> : null}
        <h1 className="text-[28px] font-semibold text-ink animate-rise">{org.name}</h1>
        <div className="mb-7 mt-5">
          <StageTrack
            timeZone={tz}
            current={draft ? -1 : rejected || changes ? 1 : 0}
            outcome={rejected ? "stopped" : "progress"}
            stages={[
              { key: "sub", label: t("submitted"), at: draft ? null : profile?.submitted_at },
              { key: "rev", label: rejected ? t("notApproved") : changes ? t("changesAsked") : t("inReview") },
              { key: "ok", label: t("approved") },
            ]}
          />
        </div>

        {draft ? (
          <Notice tone="info" title={t("draftTitle")}>{t.rich("draftBody", { b })}</Notice>
        ) : rejected ? (
          <Notice tone="critical" title={t("rejectedTitle")}>
            <p>{t("reason", { reason: org.statusReason ?? t("noReason") })}</p>
            <p className="mt-1">{canReapply ? t("canReapply") : t("reapplyAfter", { date: formatDate(org.reapplyAfter, tz, true) })}</p>
          </Notice>
        ) : changes ? (
          <Notice tone="attention" title={t("changesTitle")}>
            <p className="whitespace-pre-line">&ldquo;{org.statusReason}&rdquo;</p>
            {toReplace.length > 0 ? (
              <p className="mt-2">{t("uploadNew", { types: toReplace.map((d) => labels.docType(d.document_type)).join(", ") })}</p>
            ) : null}
            <p className="mt-2">{t.rich("whenDone", { b })}</p>
          </Notice>
        ) : (
          <Notice tone="info" title={t("reviewTitle")}>{t("reviewBody", { email: viewer.user.email })}</Notice>
        )}

        {open ? (
          <>
            <Panel className="mb-6">
              <PanelHeader title={t("documents")} description={t("documentsBody")} />
              <PanelBody>
                <DocumentList organizationId={org.id} documents={documents} canUpload canRemove
                  uploadHint={toReplace.length > 0 ? t("replaceHint") : undefined} />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title={changes ? t("checkSendBack") : rejected ? t("updateApply") : t("checkDetails")}
                description={hasDocuments ? t("sendingSaves") : t("uploadFirst")} />
              <PanelBody>
                <AgencyApplication mode="submit" initial={profileToForm(org.name, profile)} submitLabel={submitLabel} />
              </PanelBody>
            </Panel>
          </>
        ) : null}
      </div>
    </AuthFrame>
  );
}
