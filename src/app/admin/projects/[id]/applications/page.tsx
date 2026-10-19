import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Inbox, User } from "lucide-react";
import { PageHeader, TabLinks, EmptyState, Notice } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader, DetailList } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { StageTrack, applicationStages } from "@/components/app/stage-track";
import { ApplicationDecision, RevokeAssignment } from "@/components/flows/project-admin-actions";
import { can, requireAnyPermission, APPLICATIONS_CONSOLE } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { getLocale, getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export const generateMetadata = titled("applications");

type AppRow = {
  id: string; applicant_kind: "AGENCY" | "INDIVIDUAL"; status: string; submitted_at: string; decided_at: string | null;
  decision_reason: string | null; via_invitation: boolean; question_version: number;
  organization: { id: string; name: string; agency_profiles: { country_code: string | null } | null } | null;
  user: { id: string; full_name: string | null; email: string; country_code: string | null } | null;
  assignment: { id: string; status: string } | { id: string; status: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const applicantName = (a: AppRow, fallback: string) => (a.applicant_kind === "AGENCY" ? a.organization?.name : a.user?.full_name ?? a.user?.email) ?? fallback;

const TABS: { key: "pending" | "approved" | "closed"; statuses: string[] }[] = [
  { key: "pending", statuses: ["PENDING"] },
  { key: "approved", statuses: ["APPROVED"] },
  { key: "closed", statuses: ["REJECTED", "WITHDRAWN"] },
];

export default async function ApplicationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; app?: string }> }) {
  const viewer = await requireAnyPermission(APPLICATIONS_CONSOLE);
  const { id } = await params;
  const { tab = "pending", app: selectedId } = await searchParams;
  const active = TABS.find((x) => x.key === tab) ?? TABS[0]!;
  const [db, t, locale] = await Promise.all([createUserClient(), getTranslations("applications"), getLocale()]);
  const tz = viewer.user.timezone;

  const { data: project } = await db.from("projects").select("id,code,title,status").eq("id", id).maybeSingle();
  if (!project) notFound();

  const { data } = await db.from("project_applications")
    .select("id,applicant_kind,status,submitted_at,decided_at,decision_reason,via_invitation,question_version,organization:organizations!project_applications_organization_id_fkey(id,name,agency_profiles(country_code)),user:users!project_applications_user_id_fkey(id,full_name,email,country_code),assignment:project_assignments!project_assignments_application_id_fkey(id,status)")
    .eq("project_id", id).order("submitted_at", { ascending: active.key !== "pending" ? false : true }).limit(300);
  const all = (data ?? []) as unknown as AppRow[];
  const counts = Object.fromEntries(TABS.map((x) => [x.key, all.filter((a) => x.statuses.includes(a.status)).length]));
  const rows = all.filter((a) => active.statuses.includes(a.status));
  const selected = all.find((a) => a.id === selectedId) ?? rows[0] ?? null;
  const href = (appId: string) => `/admin/projects/${id}/applications?tab=${active.key}&app=${appId}`;

  return (
    <>
      <PageHeader back={{ href: `/admin/projects/${id}`, label: `${project.code} ${project.title}` }} title={t("title")}
        description={t("body")} />
      <TabLinks active={active.key} tabs={TABS.map((x) => ({ key: x.key, label: t(`tabs.${x.key}`), href: `/admin/projects/${id}/applications?tab=${x.key}`, count: counts[x.key] }))} />

      {rows.length === 0 ? (
        <Panel><EmptyState icon={<Inbox />} title={active.key === "pending" ? t("nothing") : t("none")} description={active.key === "pending" ? t("nothingBody") : undefined} /></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Panel className="h-fit overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.map((a) => {
                const on = selected?.id === a.id;
                const country = a.applicant_kind === "AGENCY" ? a.organization?.agency_profiles?.country_code : a.user?.country_code;
                return (
                  <li key={a.id}>
                    <Link href={href(a.id)} scroll={false} aria-current={on ? "true" : undefined}
                      className={cn("relative flex items-start gap-3 px-4 py-3.5 transition-colors", on ? "bg-pine-50/70" : "hover:bg-sunken/70")}>
                      <span className={cn("absolute inset-y-2 start-0 w-[3px] rounded-e-full transition-colors", on ? "bg-pine-600" : "bg-transparent")} aria-hidden />
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&_svg]:size-4">
                        {a.applicant_kind === "AGENCY" ? <Building2 /> : <User />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{applicantName(a, t("applicantFallback"))}</span>
                        <span className="block text-[12.5px] text-muted">
                          {country ? t("kindCountry", { kind: a.applicant_kind === "AGENCY" ? t("agency") : t("freelancer"), country: countryName(country) }) : a.applicant_kind === "AGENCY" ? t("agency") : t("freelancer")}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[12px] text-muted">{timeAgo(a.submitted_at, new Date(), locale)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
          {selected ? <ApplicationDetail key={selected.id} app={selected} tz={tz} canDecide={can(viewer, "application.decide")} canRevoke={can(viewer, "assignment.revoke")} /> : null}
        </div>
      )}
    </>
  );
}

async function ApplicationDetail({ app, tz, canDecide, canRevoke }: { app: AppRow; tz: string; canDecide: boolean; canRevoke: boolean }) {
  const [db, t, ts] = await Promise.all([createUserClient(), getTranslations("applications"), getTranslations("stages")]);
  const assignment = one(app.assignment);
  const [{ data: answers }, { data: signatures }] = await Promise.all([
    db.from("application_answers").select("value,question:project_questions(prompt,answer_type,position)").eq("application_id", app.id),
    assignment ? db.from("contract_signatures").select("party,signer_name,signed_at").eq("assignment_id", assignment.id) : Promise.resolve({ data: [] }),
  ]);
  type Ans = { value: unknown; question: { prompt: string; answer_type: string; position: number } | null };
  const sorted = ((answers ?? []) as unknown as Ans[]).sort((a, b) => (a.question?.position ?? 0) - (b.question?.position ?? 0));
  const sig = (party: string) => (signatures ?? []).find((s: { party: string }) => s.party === party) as { signer_name: string; signed_at: string } | undefined;
  const track = applicationStages({
    submittedAt: app.submitted_at, decidedAt: app.decided_at, applicantSignedAt: sig("APPLICANT")?.signed_at, countersignedAt: sig("COHORTDATA")?.signed_at,
    applicationStatus: app.status, assignmentStatus: assignment?.status,
  }, ts);
  const name = applicantName(app, t("applicantFallback"));
  const signedBy = (s: { signer_name: string; signed_at: string } | undefined) => (s ? t("signedBy", { name: s.signer_name, date: formatDate(s.signed_at, tz, true) }) : null);

  return (
    <div className="grid h-fit gap-5 animate-rise">
      <Panel>
        <PanelHeader
          title={<span className="flex flex-wrap items-center gap-2">{name}<StatusBadge status={app.status} />{app.via_invitation ? <Badge tone="brand">{t("invited")}</Badge> : null}</span>}
          description={t("applied", { date: formatDate(app.submitted_at, tz, true), version: app.question_version })}
          actions={app.status === "PENDING" && canDecide ? <ApplicationDecision applicationId={app.id} applicant={name} /> : null}
        />
        <PanelBody className="pb-6 pt-6"><StageTrack {...track} timeZone={tz} /></PanelBody>
      </Panel>

      {app.decision_reason ? <Notice tone={app.status === "REJECTED" ? "critical" : "info"} title={app.status === "REJECTED" ? t("rejectReason") : t("decisionNote")}>{app.decision_reason}</Notice> : null}

      <Panel>
        <PanelHeader title={t("applicant")} actions={app.applicant_kind === "AGENCY" && app.organization ? <Link className="text-[13px] text-pine-700 hover:underline" href={`/admin/agencies/${app.organization.id}`}>{t("openAgency")}</Link> : null} />
        <PanelBody>
          <DetailList items={app.applicant_kind === "AGENCY" ? [
            { label: t("agency"), value: app.organization?.name },
            { label: t("country"), value: countryName(app.organization?.agency_profiles?.country_code) },
          ] : [
            { label: t("name"), value: app.user?.full_name },
            { label: t("email"), value: app.user?.email },
            { label: t("country"), value: countryName(app.user?.country_code) },
          ]} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={t("answers")} />
        <PanelBody>
          {sorted.length === 0 ? <p className="text-[13.5px] text-muted">{t("noQuestions")}</p> : (
            <ol className="grid gap-5">
              {sorted.map((a, i) => (
                <li key={i}>
                  <p className="text-[13px] text-muted">{a.question?.prompt}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[14.5px] text-ink">{formatAnswer(a.value, { yes: t("yes"), no: t("no"), none: t("noAnswer") })}</p>
                </li>
              ))}
            </ol>
          )}
        </PanelBody>
      </Panel>

      {assignment ? (
        <Panel>
          <PanelHeader title={t("access")} actions={canRevoke && assignment.status !== "REVOKED" && assignment.status !== "COMPLETED" ? <RevokeAssignment assignmentId={assignment.id} applicant={name} /> : null} />
          <PanelBody>
            <DetailList items={[
              { label: t("accessLabel"), value: <StatusBadge status={assignment.status} labels={{ AWAITING_SIGNATURE: t("waitingSignature") }} /> },
              { label: t("applicantSignature"), value: signedBy(sig("APPLICANT")) ?? t("notSigned") },
              { label: t("cohortSignature"), value: signedBy(sig("COHORTDATA")) ?? (assignment.status === "AWAITING_COUNTERSIGNATURE" ? <Link href="/admin/contracts" className="text-pine-700 hover:underline">{t("countersignNow")}</Link> : t("notSigned")) },
            ]} />
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

function formatAnswer(v: unknown, w: { yes: string; no: string; none: string }): string {
  if (v === true) return w.yes;
  if (v === false) return w.no;
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined || v === "") return w.none;
  return String(v);
}
