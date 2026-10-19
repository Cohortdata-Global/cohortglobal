import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, TabLinks, Notice } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader, DetailList } from "@/components/ui/panel";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { DocumentList } from "@/components/flows/document-list";
import { FilterBar } from "@/components/app/filter-bar";
import { filterMembers, memberFilters } from "@/lib/member-filters";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { PeopleTable, InvitationsTable } from "@/components/app/people-table";
import { Timeline, AuditList } from "@/components/app/timeline";
import { InviteDialog } from "@/components/flows/invite-dialog";
import { AgencyDecision, AgencyStatusActions, EditAgencyDialog, TransferOwnershipDialog } from "@/components/flows/agency-admin-actions";
import { can, requirePermission } from "@/server/auth/viewer";
import { loadAgencyProfile, profileToForm } from "@/server/queries/agency";
import { loadAgencyPeople, loadAudit, loadEvents } from "@/server/queries/people";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("agencyDetail");

export default async function AgencyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; role?: string; status?: string }> }) {
  const viewer = await requirePermission("agency.view_all");
  const { id } = await params;
  const { tab = "profile", q = "", role = "", status = "" } = await searchParams;
  const { org, profile, documents } = await loadAgencyProfile(id);
  if (!org) notFound();
  const t = await getTranslations("agencyDetail");
  const tz = viewer.user.timezone;
  const manage = can(viewer, "agency.manage");
  const db = await createUserClient();
  const inReview = ["DRAFT", "PENDING_VERIFICATION", "CHANGES_REQUESTED", "REJECTED"].includes(org.status);

  const base = `/admin/agencies/${id}`;
  const tabs = [
    { key: "profile", label: t("tabs.profile"), href: base },
    { key: "people", label: t("tabs.people"), href: `${base}?tab=people` },
    { key: "projects", label: t("tabs.projects"), href: `${base}?tab=projects` },
    { key: "history", label: t("tabs.history"), href: `${base}?tab=history` },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/agencies", label: t("back") }}
        title={<span className="flex flex-wrap items-center gap-3">{org.name} <StatusBadge status={org.status} />{org.source === "INVITED" ? <Badge tone="brand">{t("invited")}</Badge> : null}</span>}
        description={t("joined", { country: countryName(profile?.country_code), date: formatDate(org.created_at, tz) })}
        actions={manage ? <EditAgencyDialog orgId={id} initial={profileToForm(org.name, profile)} /> : null}
      />

      {org.status === "PENDING_VERIFICATION" && can(viewer, "agency.decide") ? (
        <Notice tone="attention" title={t("waitingDecision")} action={<AgencyDecision orgId={id} name={org.name} documents={documents} />}>
          {t("waitingDecisionBody")}
        </Notice>
      ) : null}
      {org.status === "CHANGES_REQUESTED" ? (
        <Notice tone="info" title={t("waitingAgency")}
          action={can(viewer, "agency.decide") ? <AgencyDecision orgId={id} name={org.name} documents={documents} canAskForChanges={false} /> : null}>
          <p>{org.status_changed_at ? t("youAskedOn", { date: formatDate(org.status_changed_at, tz, true), message: org.status_reason ?? "" }) : t("youAsked", { message: org.status_reason ?? "" })}</p>
          <p className="mt-1">{t("comesBack")}</p>
        </Notice>
      ) : null}
      {org.status_reason && org.status !== "ACTIVE" && org.status !== "CHANGES_REQUESTED" ? (
        <Notice tone={org.status === "REJECTED" ? "critical" : "attention"} title={t("reason", { reason: org.status_reason })}>
          {org.status === "REJECTED" && org.reapply_after ? t("reapplyAfter", { date: formatDate(org.reapply_after, tz, true) }) : null}
        </Notice>
      ) : null}

      <TabLinks active={tab} tabs={tabs} />

      {tab === "profile" ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel>
            <PanelHeader title={t("companyDetails")} />
            <PanelBody>
              <DetailList items={[
                { label: t("fields.legalName"), value: profile?.legal_name },
                { label: t("fields.country"), value: countryName(profile?.country_code) },
                { label: t("fields.registration"), value: profile?.registration_number },
                { label: t("fields.tax"), value: profile?.tax_id },
                { label: t("fields.website"), value: profile?.website_url ? <a href={profile.website_url} target="_blank" rel="noreferrer" className="text-pine-700 hover:underline">{profile.website_url}</a> : null },
                { label: t("fields.address"), value: profile?.address },
                { label: t("fields.contact"), value: profile?.contact_name },
                { label: t("fields.contactEmail"), value: profile?.contact_email },
                { label: t("fields.contactPhone"), value: formatPhone(profile?.contact_phone_e164) },
                { label: t("fields.languages"), value: profile?.languages?.join(", ") || null },
                { label: t("fields.teamSize"), value: profile?.team_size },
                { label: t("fields.submitted"), value: formatDate(profile?.submitted_at, tz, true) },
              ]} />
              {profile?.description ? <p className="mt-6 whitespace-pre-line border-t border-line pt-5 text-[14px] leading-relaxed text-ink-2">{profile.description}</p> : null}
            </PanelBody>
          </Panel>
          <div className="grid content-start gap-6">
            <Panel>
              <PanelHeader title={t("documents")} description={inReview ? t("documentsReview") : undefined} />
              <PanelBody>
                {/* While an application is in review the console only shows what the agency sent (ID-43). */}
                <DocumentList organizationId={id} documents={documents} canUpload={manage && !inReview} canRemove={manage && !inReview}
                  emptyText={inReview ? t("noDocuments") : undefined}
                  uploadHint={inReview ? undefined : t("uploadHint")} />
              </PanelBody>
            </Panel>
            {manage && !inReview ? (
              <Panel>
                <PanelHeader title={t("statusTitle")} description={t("statusBody")} />
                <PanelBody><AgencyStatusActions orgId={id} name={org.name} status={org.status} /></PanelBody>
              </Panel>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "people" ? <PeopleTab orgId={id} orgName={org.name} orgStatus={org.status} tz={tz} manage={manage} filters={{ q, role, status }} /> : null}
      {tab === "projects" ? <ProjectsTab orgId={id} tz={tz} db={db} /> : null}
      {tab === "history" ? <HistoryTab orgId={id} tz={tz} showAudit={can(viewer, "audit.view_all")} /> : null}
    </>
  );
}

async function PeopleTab({ orgId, orgName, orgStatus, tz, manage, filters }: { orgId: string; orgName: string; orgStatus: string; tz: string; manage: boolean; filters: { q: string; role: string; status: string } }) {
  const [{ members, invitations }, t, tm, labels] = await Promise.all([loadAgencyPeople(orgId), getTranslations("agencyDetail"), getTranslations("members"), getLabels()]);
  const shown = filterMembers(members, filters);
  const hasManager = members.some((m) => m.role === "AGENCY_MANAGER");
  const candidates = members.filter((m) => m.role !== "AGENCY_OWNER").map((m) => ({
    membershipId: m.id, role: m.role, label: t("candidate", { name: m.user?.full_name ?? m.user?.email ?? "", role: labels.role(m.role) }),
  }));
  return (
    <div className="grid gap-6">
      <Panel>
        <PanelHeader title={t("membersTitle")} description={t("membersBody")}
          actions={manage ? (
            <div className="flex flex-wrap gap-2">
              <TransferOwnershipDialog orgId={orgId} candidates={candidates} hasManager={hasManager} />
              {orgStatus === "ACTIVE" ? (
                <InviteDialog title={t("inviteTo", { org: orgName })} organizationId={orgId} triggerLabel={t("invite")}
                  purposes={[...(hasManager ? [] : [{ value: "AGENCY_MANAGER" as const, label: labels.role("AGENCY_MANAGER") }]), { value: "AGENCY_MEMBER" as const, label: labels.role("AGENCY_MEMBER") }]} />
              ) : null}
            </div>
          ) : null} />
        <div className="px-5 pt-4"><FilterBar searchPlaceholder={tm("search")} filters={memberFilters({ role: labels.role, status: labels.status, allRoles: tm("allRoles"), allStatuses: tm("allStatuses") })} /></div>
        {shown.length === 0 && members.length > 0
          ? <p className="px-5 py-8 text-center text-[13.5px] text-muted">{t("noMatch")}</p>
          : <PeopleTable members={shown} timeZone={tz} manageable={manage ? ["AGENCY_MANAGER", "AGENCY_MEMBER"] : []} />}
      </Panel>
      <Panel>
        <PanelHeader title={t("pendingInvites")} />
        <InvitationsTable invitations={invitations} timeZone={tz} organizationName={orgName} />
      </Panel>
    </div>
  );
}

async function ProjectsTab({ orgId, tz, db }: { orgId: string; tz: string; db: Awaited<ReturnType<typeof createUserClient>> }) {
  const { data } = await db.from("project_applications")
    .select("id,status,submitted_at,project:projects!project_applications_project_id_fkey(id,code,title),assignment:project_assignments!project_assignments_application_id_fkey(id,status)")
    .eq("organization_id", orgId).order("submitted_at", { ascending: false });
  type Row = { id: string; status: string; submitted_at: string; project: { id: string; code: string; title: string } | null; assignment: { id: string; status: string }[] | { id: string; status: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  const t = await getTranslations("agencyDetail");
  return (
    <Panel>
      <PanelHeader title={t("projectsTitle")} />
      {rows.length === 0 ? <p className="px-5 py-6 text-[13.5px] text-muted">{t("noProjects")}</p> : (
        <Table>
          <THead><tr><TH>{t("project")}</TH><TH>{t("application")}</TH><TH>{t("access")}</TH><TH>{t("applied")}</TH></tr></THead>
          <tbody>
            {rows.map((r) => {
              const asg = Array.isArray(r.assignment) ? r.assignment[0] : r.assignment;
              return (
                <TR key={r.id}>
                  <TD><Link href={`/admin/projects/${r.project?.id}/applications?app=${r.id}`} className="font-medium hover:text-pine-700 hover:underline">{r.project?.code}</Link> <span className="text-ink-2">{r.project?.title}</span></TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD>{asg ? <StatusBadge status={asg.status} labels={{ AWAITING_SIGNATURE: t("waitingAgencySignature"), ACTIVE: t("workOpen") }} /> : "—"}</TD>
                  <TD className="tabular text-muted">{formatDate(r.submitted_at, tz)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

async function HistoryTab({ orgId, tz, showAudit }: { orgId: string; tz: string; showAudit: boolean }) {
  const [events, audit, t] = await Promise.all([loadEvents({ organizationId: orgId }), showAudit ? loadAudit({ organizationId: orgId }, 50) : Promise.resolve([]), getTranslations("agencyDetail")]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel><PanelHeader title={t("statusChanges")} /><Timeline events={events} timeZone={tz} /></Panel>
      {showAudit ? <Panel><PanelHeader title={t("auditLog")} /><AuditList rows={audit} timeZone={tz} /></Panel> : null}
    </div>
  );
}
