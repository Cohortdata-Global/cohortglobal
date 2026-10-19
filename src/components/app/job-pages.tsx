import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, CalendarClock, Globe2, Languages, ShieldCheck } from "lucide-react";
import { PageHeader, EmptyState, Notice, TabLinks } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StageTrack, applicationStages } from "@/components/app/stage-track";
import { ApplyForm, SignContract, WithdrawApplication, type ApplyQuestion } from "@/components/flows/apply-flow";
import { can, type Viewer } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { getLocale, getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/**
 * Job list and job page, shared by the agency portal and the freelancer area.
 * "agency" applies for the viewer's agency; "individual" applies as a direct freelancer.
 * Visibility comes from RLS (app.can_view_project): invite-only projects appear only for invited agencies.
 */
export type JobMode = "agency" | "individual";

type ProjectRow = {
  id: string; code: string; title: string; summary: string; description: string; data_type: string; applicant_type: string; visibility: string;
  status: string; opens_at: string | null; closes_at: string | null; required_languages: string[]; required_countries: string[];
  requires_ekyc: boolean; target_count: number | null; question_version: number; published_at: string | null;
};
type ApplicationRow = { id: string; project_id: string; status: string; submitted_at: string; decided_at: string | null; decision_reason: string | null };

const base = (mode: JobMode) => (mode === "agency" ? "/agency/jobs" : "/work/jobs");

async function myApplications(viewer: Viewer, mode: JobMode, projectId?: string) {
  const db = await createUserClient();
  let q = db.from("project_applications").select("id,project_id,status,submitted_at,decided_at,decision_reason").order("submitted_at", { ascending: false });
  q = mode === "agency" ? q.eq("organization_id", viewer.organization!.id) : q.eq("user_id", viewer.user.id);
  if (projectId) q = q.eq("project_id", projectId);
  return ((await q.limit(500)).data ?? []) as ApplicationRow[];
}

type JobsT = Awaited<ReturnType<typeof getTranslations<"jobs">>>;

function closingLabel(p: Pick<ProjectRow, "opens_at" | "closes_at">, tz: string, t: JobsT) {
  const now = Date.now();
  if (p.opens_at && new Date(p.opens_at).getTime() > now) return t("opens", { date: formatDate(p.opens_at, tz) });
  if (p.closes_at) return new Date(p.closes_at).getTime() < now ? t("closed") : t("closes", { date: formatDate(p.closes_at, tz) });
  return t("untilFilled");
}

export async function JobList({ viewer, mode, tab }: { viewer: Viewer; mode: JobMode; tab: string }) {
  const [t, labels, locale] = await Promise.all([getTranslations("jobs"), getLabels(), getLocale()]);
  const db = await createUserClient();
  const tz = viewer.user.timezone;
  const types = mode === "agency" ? ["AGENCY", "BOTH"] : ["INDIVIDUAL", "BOTH"];
  const [{ data }, apps] = await Promise.all([
    db.from("projects").select("id,code,title,summary,data_type,applicant_type,visibility,status,opens_at,closes_at,required_languages,required_countries,published_at")
      .in("status", ["PUBLISHED", "PAUSED", "COMPLETED"]).in("applicant_type", types).order("published_at", { ascending: false }).limit(200),
    myApplications(viewer, mode),
  ]);
  const latest = new Map<string, ApplicationRow>();
  for (const a of apps) if (!latest.has(a.project_id)) latest.set(a.project_id, a);
  const all = (data ?? []) as ProjectRow[];
  const open = all.filter((p) => p.status === "PUBLISHED" && !["PENDING", "APPROVED"].includes(latest.get(p.id)?.status ?? ""));
  const mine = all.filter((p) => latest.has(p.id));
  const rows = tab === "applied" ? mine : open;

  return (
    <>
      <PageHeader title={t("title")} description={mode === "agency" ? t("agencyBody") : t("individualBody")} />
      <TabLinks active={tab === "applied" ? "applied" : "open"} tabs={[
        { key: "open", label: t("openTab"), href: base(mode), count: open.length },
        { key: "applied", label: t("appliedTab"), href: `${base(mode)}?tab=applied`, count: mine.length },
      ]} />
      {rows.length === 0 ? (
        <Panel><EmptyState icon={<Briefcase />} title={tab === "applied" ? t("noApplications") : t("noJobs")}
          description={tab === "applied" ? t("noApplicationsBody") : t("noJobsBody")} /></Panel>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p, i) => {
            const app = latest.get(p.id);
            return (
              <li key={p.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <Link href={`${base(mode)}/${p.id}`}
                  className="group flex h-full flex-col rounded-lg border border-line bg-surface p-5 shadow-raise transition-[border-color,translate,box-shadow] duration-200 ease-[var(--ease-snap)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float">
                  <div className="flex items-start justify-between gap-3">
                    <span className="tabular rounded-xs bg-sunken px-1.5 py-0.5 text-[12px] font-medium text-ink-2">{p.code}</span>
                    {app ? <StatusBadge status={app.status} labels={{ PENDING: t("inReview") }} /> : p.visibility === "INVITE_ONLY" ? <Badge tone="brand">{t("invited")}</Badge> : null}
                  </div>
                  <h2 className="mt-3 font-display text-[18px] font-semibold leading-snug text-ink group-hover:text-pine-700">{p.title}</h2>
                  {p.summary ? <p className="mt-1.5 line-clamp-2 text-[13.5px] text-ink-2">{p.summary}</p> : null}
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[12.5px] text-muted">
                    <span>{labels.dataType(p.data_type)}</span>
                    {p.required_countries.length ? <span>{p.required_countries.map(countryName).join(", ")}</span> : null}
                    <span>{app ? t("appliedAgo", { ago: timeAgo(app.submitted_at, new Date(), locale) }) : closingLabel(p, tz, t)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export async function JobDetail({ viewer, mode, projectId }: { viewer: Viewer; mode: JobMode; projectId: string }) {
  const [t, ts, labels] = await Promise.all([getTranslations("jobs"), getTranslations("stages"), getLabels()]);
  const db = await createUserClient();
  const tz = viewer.user.timezone;
  const { data } = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) notFound();
  const p = data as ProjectRow;
  const allowedType = mode === "agency" ? p.applicant_type !== "INDIVIDUAL" : p.applicant_type !== "AGENCY";
  if (!allowedType) notFound();

  const apps = await myApplications(viewer, mode, projectId);
  const app = apps.find((a) => a.status === "PENDING" || a.status === "APPROVED") ?? apps[0] ?? null;
  const [{ data: questions }, assignmentRes] = await Promise.all([
    db.from("project_questions").select("id,prompt,help_text,answer_type,options,required").eq("project_id", projectId).eq("version", p.question_version).order("position"),
    app?.status === "APPROVED"
      ? db.from("project_assignments").select("id,status,revoke_reason,template:project_contract_templates!project_assignments_contract_template_id_fkey(title,body,version),signatures:contract_signatures!contract_signatures_assignment_id_fkey(party,signer_name,signed_at)").eq("application_id", app.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  type Assignment = { id: string; status: string; revoke_reason: string | null; template: { title: string; body: string; version: number } | null; signatures: { party: string; signer_name: string; signed_at: string }[] };
  const assignment = assignmentRes.data as Assignment | null;
  const sig = (party: string) => assignment?.signatures.find((s) => s.party === party);
  const track = app ? applicationStages({
    submittedAt: app.submitted_at, decidedAt: app.decided_at, applicantSignedAt: sig("APPLICANT")?.signed_at, countersignedAt: sig("COHORTDATA")?.signed_at,
    applicationStatus: app.status, assignmentStatus: assignment?.status,
  }, ts) : null;

  const now = Date.now();
  const windowOpen = (!p.opens_at || new Date(p.opens_at).getTime() <= now) && (!p.closes_at || new Date(p.closes_at).getTime() >= now);
  const orgActive = mode === "individual" || viewer.organization?.status === "ACTIVE";
  const canApply = mode === "agency" ? can(viewer, "org.projects.apply") : can(viewer, "individual.projects.apply");
  const canSign = mode === "agency" ? can(viewer, "org.contract.sign") : can(viewer, "individual.contract.sign");
  const applyOpen = p.status === "PUBLISHED" && windowOpen && orgActive && canApply && (!app || ["REJECTED", "WITHDRAWN"].includes(app.status));
  const workHref = mode === "agency" ? `/agency/projects/${projectId}` : `/work/projects/${projectId}`;

  const facts = [
    { icon: <CalendarClock />, label: closingLabel(p, tz, t) },
    { icon: <Globe2 />, label: p.required_countries.length ? p.required_countries.map(countryName).join(", ") : t("anyCountry") },
    { icon: <Languages />, label: p.required_languages.length ? p.required_languages.join(", ") : t("anyLanguage") },
    ...(p.requires_ekyc ? [{ icon: <ShieldCheck />, label: t("ekyc") }] : []),
  ];

  return (
    <>
      <PageHeader back={{ href: base(mode), label: t("title") }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{p.code}</span>{p.title}</span>}
        description={p.summary || undefined}
        actions={app?.status === "PENDING" && canApply ? <WithdrawApplication applicationId={app.id} /> : null} />

      {track ? (
        <Panel className="mb-6">
          <PanelBody className="pb-6 pt-6"><StageTrack {...track} timeZone={tz} /></PanelBody>
        </Panel>
      ) : null}

      {app?.status === "REJECTED" ? (
        <Notice tone="critical" title={t("notApproved")}>
          {app.decision_reason}{applyOpen ? t("applyAgainBelow") : ""}
        </Notice>
      ) : null}
      {assignment?.status === "REVOKED" ? <Notice tone="critical" title={t("revoked")}>{assignment.revoke_reason}</Notice> : null}
      {assignment?.status === "AWAITING_COUNTERSIGNATURE" ? <Notice tone="info" title={t("signedWaiting")}>{t("signedWaitingBody")}</Notice> : null}
      {assignment?.status === "ACTIVE" ? (
        <Notice tone="positive" title={t("workOpen")} action={<Button asChild size="sm"><Link href={workHref}>{t("openProject")}</Link></Button>}>
          {mode === "agency" ? t("workOpenAgency") : t("workOpenIndividual")}
        </Notice>
      ) : null}
      {p.status === "PAUSED" ? <Notice tone="attention" title={t("paused")} /> : null}
      {mode === "agency" && viewer.organization?.status !== "ACTIVE" ? <Notice tone="attention" title={t("agencyInactive")}>{t("agencyInactiveBody")}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid h-fit gap-6">
          {assignment?.status === "AWAITING_SIGNATURE" && assignment.template ? (
            <Panel className="border-pine-600/30">
              <PanelHeader title={t("signTitle")} description={canSign ? t("signBodyCan") : t("signBodyOwner")} />
              <PanelBody className="py-5">
                {canSign ? (
                  <SignContract assignmentId={assignment.id} title={assignment.template.title} body={assignment.template.body} version={assignment.template.version}
                    defaultName={viewer.user.fullName ?? ""} signerLabel={mode === "agency" ? t("signerAgency", { org: viewer.organization?.name ?? "" }) : t("signerIndividual")} />
                ) : (
                  <div className="whitespace-pre-wrap font-[ui-serif,Georgia,serif] text-[14px] leading-[1.7] text-ink-2">{assignment.template.body}</div>
                )}
              </PanelBody>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title={t("about")} />
            <PanelBody><div className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-ink-2">{p.description || t("noDescription")}</div></PanelBody>
          </Panel>

          {applyOpen ? (
            <Panel>
              <PanelHeader title={app ? t("applyAgain") : t("apply")} description={mode === "agency" ? t("applyingForAgency", { org: viewer.organization?.name ?? "" }) : t("applyingIndividual")} />
              <PanelBody className="py-5">
                <ApplyForm projectId={projectId} applyingAs={mode === "agency" ? viewer.organization?.name ?? t("yourAgency") : t("yourself")}
                  questions={((questions ?? []) as (Omit<ApplyQuestion, "options"> & { options: unknown })[]).map((q) => ({ ...q, options: (q.options as string[]) ?? [] }))} />
              </PanelBody>
            </Panel>
          ) : !app && p.status === "PUBLISHED" && !canApply && mode === "agency" ? (
            <Notice tone="info" title={t("askOwner")}>{t("askOwnerBody")}</Notice>
          ) : null}
        </div>

        <aside className="grid h-fit gap-4 lg:sticky lg:top-24">
          <Panel>
            <PanelBody>
              <ul className="grid gap-3">
                {facts.map((f) => (
                  <li key={f.label} className="flex items-start gap-3 text-[13.5px] text-ink-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted">{f.icon}{f.label}</li>
                ))}
              </ul>
              <div className={cn("mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4")}>
                <Badge>{labels.dataType(p.data_type)}</Badge>
                {p.target_count ? <Badge>{t("target", { count: p.target_count })}</Badge> : null}
                <StatusBadge status={p.status} labels={{ PUBLISHED: t("accepting") }} />
              </div>
            </PanelBody>
          </Panel>
          {questions && questions.length > 0 && !applyOpen ? (
            <Panel>
              <PanelHeader title={t("questions")} />
              <PanelBody>
                <ol className="grid list-decimal gap-2 ps-4 text-[13.5px] text-ink-2">{questions.map((q) => <li key={q.id}>{q.prompt}</li>)}</ol>
              </PanelBody>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}
