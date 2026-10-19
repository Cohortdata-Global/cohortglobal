import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, FileText, Inbox, ListChecks } from "lucide-react";
import { PageHeader, TabLinks, Notice, Stat, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader, DetailList } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/app/timeline";
import { ProjectForm, type ProjectFormValues } from "@/components/flows/project-form";
import { QuestionsEditor } from "@/components/flows/questions-editor";
import { ContractEditor } from "@/components/flows/contract-editor";
import { ProjectStatusActions } from "@/components/flows/project-status-actions";
import { InviteAgencyToProject } from "@/components/flows/project-admin-actions";
import { ProjectManagers } from "@/components/flows/project-managers";
import { CollectionBuilder } from "@/components/flows/collection-builder";
import type { CollectionInput } from "@/lib/collection";
import { can, canAny, APPLICATIONS_CONSOLE, PROJECT_CONSOLE, requireAnyPermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { loadEvents } from "@/server/queries/people";
import { countryName } from "@/lib/countries";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("project");

type Project = {
  id: string; code: string; title: string; summary: string; description: string; data_type: string; applicant_type: string;
  visibility: string; status: string; status_reason: string | null; opens_at: string | null; closes_at: string | null;
  required_languages: string[]; required_countries: string[]; requires_ekyc: boolean; target_count: number | null;
  question_version: number; collection_version: number; published_at: string | null; created_at: string; updated_at: string;
};

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireAnyPermission(PROJECT_CONSOLE);
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const [db, t, labels] = await Promise.all([createUserClient(), getTranslations("projectDetail"), getLabels()]);
  const tz = viewer.user.timezone;

  const { data: projectData } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!projectData) notFound();
  const p = projectData as Project;
  const manage = can(viewer, "project.manage") && p.status !== "ARCHIVED";

  const [{ data: questions }, { data: contracts }, { data: apps }, { data: assignments }, { data: invites }] = await Promise.all([
    db.from("project_questions").select("prompt,help_text,answer_type,options,required").eq("project_id", id).eq("version", p.question_version).order("position"),
    db.from("project_contract_templates").select("id,version,title,body,created_at").eq("project_id", id).order("version", { ascending: false }).limit(1),
    db.from("project_applications").select("id,status").eq("project_id", id),
    db.from("project_assignments").select("id,status,contract_template_id").eq("project_id", id),
    db.from("project_invitations").select("id,organization_id,message,created_at,organization:organizations(name,status)").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  const contract = contracts?.[0] as { id: string; version: number; title: string; body: string } | undefined;
  const appRows = (apps ?? []) as { id: string; status: string }[];
  const asgRows = (assignments ?? []) as { id: string; status: string; contract_template_id: string }[];
  const hasApplications = appRows.length > 0;
  let contractSigned = false;
  if (contract && asgRows.some((a) => a.contract_template_id === contract.id)) {
    const { count } = await db.from("contract_signatures").select("id", { count: "exact", head: true }).eq("template_id", contract.id);
    contractSigned = (count ?? 0) > 0;
  }

  const pending = appRows.filter((a) => a.status === "PENDING").length;
  const base = `/admin/projects/${id}`;
  const tabs = [
    { key: "overview", label: t("tabs.overview"), href: base },
    { key: "details", label: t("tabs.details"), href: `${base}?tab=details` },
    { key: "questions", label: t("tabs.questions"), href: `${base}?tab=questions`, count: questions?.length ?? 0 },
    { key: "contract", label: t("tabs.contract"), href: `${base}?tab=contract` },
    { key: "collection", label: t("tabs.collection"), href: `${base}?tab=collection` },
    { key: "agencies", label: t("tabs.agencies"), href: `${base}?tab=agencies`, count: invites?.length ?? 0 },
    { key: "history", label: t("tabs.history"), href: `${base}?tab=history` },
  ];

  const noContract = !contract;
  const noDescription = p.description.trim().length < 20;
  const missing = noContract && noDescription ? "both" : noContract ? "contract" : noDescription ? "description" : null;

  const form: ProjectFormValues = {
    code: p.code, title: p.title, summary: p.summary, description: p.description, data_type: p.data_type,
    applicant_type: p.applicant_type, visibility: p.visibility, opens_at: p.opens_at ?? "", closes_at: p.closes_at ?? "",
    required_languages: p.required_languages.join(", "), required_countries: p.required_countries, requires_ekyc: p.requires_ekyc,
    target_count: p.target_count ? String(p.target_count) : "",
  };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/projects", label: t("back") }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{p.code}</span>{p.title}<StatusBadge status={p.status} /></span>}
        description={p.summary || undefined}
        actions={
          <>
            {canAny(viewer, APPLICATIONS_CONSOLE) ? <Button asChild variant="secondary"><Link href={`${base}/applications`}><Inbox /> {pending ? t("applicationsCount", { count: pending }) : t("applications")}</Link></Button> : null}
            {manage ? <ProjectStatusActions projectId={id} status={p.status} title={p.title} /> : null}
          </>
        }
      />

      {p.status === "DRAFT" && missing ? (
        <Notice tone="attention" title={t("notReady")}>{t(`missing.${missing}`)}</Notice>
      ) : null}
      {p.status_reason && (p.status === "PAUSED" || p.status === "ARCHIVED") ? <Notice tone="attention" title={t("note", { note: p.status_reason })} /> : null}

      <TabLinks active={tab} tabs={tabs} />

      {tab === "overview" ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t("waitingReview")} value={pending} tone={pending ? "attention" : "neutral"} href={`${base}/applications`} />
            <Stat label={t("approved")} value={appRows.filter((a) => a.status === "APPROVED").length} />
            <Stat label={t("waitingSignatures")} value={asgRows.filter((a) => a.status.startsWith("AWAITING")).length} href="/admin/contracts" />
            <Stat label={t("working")} value={asgRows.filter((a) => a.status === "ACTIVE").length} tone="brand" />
          </div>
          <Panel>
            <PanelHeader title={t("summary")} actions={manage ? <Button asChild variant="ghost" size="sm"><Link href={`${base}?tab=details`}>{t("edit")}</Link></Button> : null} />
            <PanelBody>
              <DetailList items={[
                { label: t("fields.whoCanApply"), value: labels.applicantType(p.applicant_type) },
                { label: t("fields.visibility"), value: p.visibility === "INVITE_ONLY" ? t("inviteOnly") : t("everyone") },
                { label: t("fields.dataType"), value: labels.dataType(p.data_type) },
                { label: t("fields.target"), value: p.target_count ? p.target_count.toLocaleString() : null },
                { label: t("fields.opens"), value: p.opens_at ? formatDate(p.opens_at, tz, true) : t("immediately") },
                { label: t("fields.closes"), value: p.closes_at ? formatDate(p.closes_at, tz, true) : t("noEnd") },
                { label: t("fields.languages"), value: p.required_languages.join(", ") || t("any") },
                { label: t("fields.countries"), value: p.required_countries.map(countryName).join(", ") || t("any") },
                { label: t("fields.ekyc"), value: p.requires_ekyc ? t("required") : t("notRequired") },
                { label: t("fields.questions"), value: t("questionCount", { count: questions?.length ?? 0, version: p.question_version }) },
                { label: t("fields.contract"), value: contract ? t("contractVersion", { title: contract.title, version: contract.version }) : <span className="text-amber-700">{t("missingValue")}</span> },
                { label: t("fields.published"), value: p.published_at ? formatDate(p.published_at, tz) : t("notYet") },
              ]} />
            </PanelBody>
          </Panel>
          <ManagersPanel projectId={id} canAssign={can(viewer, "project.assign_managers")} viewerId={viewer.user.id} tz={tz} />
        </div>
      ) : null}

      {tab === "details" ? (
        <Panel className="max-w-4xl">
          <PanelBody className="py-6">
            {manage ? <ProjectForm projectId={id} initial={form} applicantTypeLocked={hasApplications} /> : (
              <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-2">{p.description || t("noDescription")}</div>
            )}
          </PanelBody>
        </Panel>
      ) : null}

      {tab === "questions" ? (
        <Panel className="max-w-4xl">
          <PanelHeader title={t("questionsTitle")} description={t("questionsBody", { version: p.question_version })} />
          <PanelBody className="py-5">
            <QuestionsEditor
              projectId={id}
              initial={(questions ?? []).map((q) => ({ prompt: q.prompt, help_text: q.help_text ?? "", answer_type: q.answer_type, options: (q.options as string[]) ?? [], required: q.required }))}
              locked={hasApplications || !manage}
              canRelock={manage && hasApplications && can(viewer, "project.questions.relock")}
              version={p.question_version}
            />
          </PanelBody>
        </Panel>
      ) : null}

      {tab === "contract" ? (
        <Panel className="max-w-4xl">
          <PanelHeader title={t("contractTitle")} description={t("contractBody")} />
          <PanelBody className="py-5">
            {manage ? (
              <ContractEditor projectId={id} initialTitle={contract?.title ?? t("defaultContractTitle", { title: p.title })} initialBody={contract?.body ?? ""} version={contract?.version ?? null} signed={contractSigned} />
            ) : contract ? (
              <div className="whitespace-pre-wrap font-[ui-serif,Georgia,serif] text-[14.5px] leading-[1.7] text-ink-2">{contract.body}</div>
            ) : <EmptyState icon={<FileText />} title={t("noContract")} />}
          </PanelBody>
        </Panel>
      ) : null}

      {tab === "collection" ? <CollectionTab projectId={id} version={p.collection_version} canEdit={manage && !["COMPLETED", "ARCHIVED"].includes(p.status)} /> : null}

      {tab === "agencies" ? <InvitedAgencies projectId={id} invites={invites ?? []} canInvite={can(viewer, "project.invite_agency") && manage} tz={tz} status={p.status} applicantType={p.applicant_type} /> : null}

      {tab === "history" ? (
        <Panel className="max-w-3xl">
          <PanelHeader title={t("historyTitle")} description={t("historyBody")} />
          <PanelBody><Timeline events={await loadEvents({ entityId: id })} timeZone={tz} /></PanelBody>
        </Panel>
      ) : null}
    </>
  );
}

async function InvitedAgencies({ projectId, invites, canInvite, tz, status, applicantType }: {
  projectId: string; invites: unknown[]; canInvite: boolean; tz: string; status: string; applicantType: string;
}) {
  const rows = invites as { id: string; organization_id: string; message: string | null; created_at: string; organization: { name: string; status: string } | null }[];
  let options: { id: string; name: string }[] = [];
  if (canInvite) {
    const db = await createUserClient();
    const { data } = await db.from("organizations").select("id,name").eq("type", "AGENCY").eq("status", "ACTIVE").order("name").limit(500);
    const invited = new Set(rows.map((r) => r.organization_id));
    options = (data ?? []).filter((o) => !invited.has(o.id));
  }
  const agencyAllowed = applicantType !== "INDIVIDUAL";
  const t = await getTranslations("projectDetail");
  return (
    <Panel>
      <PanelHeader title={t("invitedTitle")}
        description={t("invitedBody")}
        actions={canInvite && agencyAllowed ? <InviteAgencyToProject projectId={projectId} agencies={options} /> : null} />
      {!agencyAllowed ? (
        <EmptyState icon={<Building2 />} title={t("individualsOnly")} description={t("individualsOnlyBody")} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ListChecks />} title={t("noneInvited")} description={status === "DRAFT" ? t("noneInvitedDraft") : t("noneInvitedBody")} />
      ) : (
        <Table>
          <THead><tr><TH>{t("agency")}</TH><TH>{t("agencyStatus")}</TH><TH>{t("message")}</TH><TH>{t("invited")}</TH></tr></THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><Link className="font-medium text-ink hover:text-pine-700 hover:underline" href={`/admin/agencies/${r.organization_id}`}>{r.organization?.name ?? t("agencyFallback")}</Link></TD>
                <TD><StatusBadge status={r.organization?.status} /></TD>
                <TD className="max-w-sm truncate text-ink-2">{r.message ?? <Badge>{t("none")}</Badge>}</TD>
                <TD className="tabular text-muted">{formatDate(r.created_at, tz)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

/** Who manages this project (ID-52). The Operations Manager and Super Admin assign and remove them. */
async function ManagersPanel({ projectId, canAssign, viewerId, tz }: { projectId: string; canAssign: boolean; viewerId: string; tz: string }) {
  const [db, t] = await Promise.all([createUserClient(), getTranslations("projectDetail")]);
  const { data } = await db.from("project_managers")
    .select("user_id,assigned_at,user:users!project_managers_user_id_fkey(full_name,email)")
    .eq("project_id", projectId).is("removed_at", null).order("assigned_at");
  const managers = ((data ?? []) as unknown as { user_id: string; assigned_at: string; user: { full_name: string | null; email: string } | null }[])
    .map((m) => ({ userId: m.user_id, name: m.user?.full_name || m.user?.email || "", email: m.user?.email ?? "", since: t("assignedSince", { date: formatDate(m.assigned_at, tz) }), isYou: m.user_id === viewerId }));
  let candidates: { id: string; name: string }[] = [];
  if (canAssign) {
    const { data: pms } = await db.from("user_roles").select("user_id,user:users!user_roles_user_id_fkey(full_name,email,status)")
      .eq("role_code", "PROJECT_MANAGER").is("revoked_at", null);
    const taken = new Set(managers.map((m) => m.userId));
    candidates = ((pms ?? []) as unknown as { user_id: string; user: { full_name: string | null; email: string; status: string } | null }[])
      .filter((r) => r.user?.status === "ACTIVE" && !taken.has(r.user_id))
      .map((r) => ({ id: r.user_id, name: r.user?.full_name ? `${r.user.full_name} (${r.user.email})` : r.user?.email ?? "" }));
  }
  return (
    <Panel>
      <PanelHeader title={t("managersTitle")} description={t("managersBody")} />
      <PanelBody>
        <ProjectManagers projectId={projectId} managers={managers} candidates={candidates} canAssign={canAssign} />
      </PanelBody>
    </Panel>
  );
}

/** Phase 2A: what this project collects (ID-53). */
async function CollectionTab({ projectId, version, canEdit }: { projectId: string; version: number; canEdit: boolean }) {
  const db = await createUserClient();
  const [{ data: current }, { data: assets }] = await Promise.all([
    version > 0
      ? db.from("project_collection_versions").select("config").eq("project_id", projectId).eq("version", version).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("project_assets").select("id,file_name").eq("project_id", projectId).order("created_at"),
  ]);
  const limit = Number(process.env.STORAGE_FILE_LIMIT_MB ?? 50) || 50;
  return (
    <CollectionBuilder key={version} projectId={projectId} version={version} canEdit={canEdit} storageLimitMb={limit}
      initial={(current?.config as CollectionInput | undefined) ?? null}
      images={((assets ?? []) as { id: string; file_name: string }[]).map((a) => ({ id: a.id, fileName: a.file_name }))} />
  );
}
