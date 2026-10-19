import Link from "next/link";
import { Briefcase, ClipboardCheck } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { StageTrack, applicationStages } from "@/components/app/stage-track";
import { requireSurface, type Viewer } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { useLabels } from "@/i18n/labels";
import { titled } from "@/i18n/metadata";
import { formatDate, timeAgo } from "@/lib/utils";

export const generateMetadata = titled("workspace");

type ProjectLite = { id: string; code: string; title: string; summary: string; data_type: string; closes_at: string | null };

export default async function WorkHome() {
  const viewer = await requireSurface("work");
  return viewer.roles.includes("DIRECT_FREELANCER") ? <FreelancerHome viewer={viewer} /> : <MemberHome viewer={viewer} />;
}

/** Agency Members see only what their agency assigned to them (#1, #4). */
async function MemberHome({ viewer }: { viewer: Viewer }) {
  const [db, t, locale] = await Promise.all([createUserClient(), getTranslations("work"), getLocale()]);
  const { data } = await db.from("member_assignments")
    .select("id,assigned_at,pa:project_assignments!member_assignments_project_assignment_id_fkey(status,project:projects!project_assignments_project_id_fkey(id,code,title,summary,data_type,closes_at))")
    .eq("user_id", viewer.user.id).eq("status", "ASSIGNED").order("assigned_at", { ascending: false });
  type Row = { id: string; assigned_at: string; pa: { status: string; project: ProjectLite | null } | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.pa?.project && r.pa.status === "ACTIVE");
  const first = viewer.user.fullName?.split(" ")[0];
  return (
    <>
      <PageHeader title={first ? t("hi", { name: first }) : t("myProjects")} description={t("assignedBy", { org: viewer.organization?.name ?? t("yourAgency") })} />
      <ProjectGrid projects={rows.map((r) => ({ project: r.pa!.project!, note: t("assignedAgo", { ago: timeAgo(r.assigned_at, new Date(), locale) }) }))} tz={viewer.user.timezone}
        empty={<EmptyState icon={<ClipboardCheck />} title={t("nothingAssigned")} description={t("nothingAssignedBody")} />} />
    </>
  );
}

async function FreelancerHome({ viewer }: { viewer: Viewer }) {
  const [db, t, ts, locale] = await Promise.all([createUserClient(), getTranslations("work"), getTranslations("stages"), getLocale()]);
  const [{ data: apps }, { count: openJobs }] = await Promise.all([
    db.from("project_applications")
      .select("id,status,submitted_at,decided_at,project:projects!project_applications_project_id_fkey(id,code,title,summary,data_type,closes_at),assignment:project_assignments!project_assignments_application_id_fkey(status,signatures:contract_signatures!contract_signatures_assignment_id_fkey(party,signed_at))")
      .eq("user_id", viewer.user.id).order("submitted_at", { ascending: false }).limit(30),
    db.from("projects").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED").in("applicant_type", ["INDIVIDUAL", "BOTH"]),
  ]);
  type Asg = { status: string; signatures: { party: string; signed_at: string }[] };
  type Row = { id: string; status: string; submitted_at: string; decided_at: string | null; project: ProjectLite | null; assignment: Asg | Asg[] | null };
  const rows = ((apps ?? []) as unknown as Row[]).map((r) => ({ ...r, asg: Array.isArray(r.assignment) ? r.assignment[0] ?? null : r.assignment }));
  const active = rows.filter((r) => r.asg?.status === "ACTIVE");
  const toSign = rows.filter((r) => r.asg?.status === "AWAITING_SIGNATURE").length;
  const inReview = rows.filter((r) => r.status === "PENDING").length;
  const tz = viewer.user.timezone;
  const first = viewer.user.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader title={first ? t("hi", { name: first }) : t("dashboard")} description={t("body")} />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("activeProjects")} value={active.length} tone="brand" />
        <Stat label={t("toSign")} value={toSign} tone={toSign ? "attention" : "neutral"} href="/work/jobs?tab=applied" />
        <Stat label={t("inReview")} value={inReview} href="/work/jobs?tab=applied" />
        <Stat label={t("openJobs")} value={openJobs ?? 0} href="/work/jobs" />
      </div>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">{t("activeProjects")}</h2>
      <ProjectGrid projects={active.map((r) => ({ project: r.project!, note: t("workOpen") }))} tz={tz}
        empty={<EmptyState icon={<Briefcase />} title={t("noActive")} description={t("noActiveBody")}
          action={<Link href="/work/jobs" className="text-[14px] font-medium text-pine-700 hover:underline">{t("browse")}</Link>} />} />

      {rows.length > 0 ? (
        <Panel className="mt-8">
          <PanelHeader title={t("applications")} />
          <ul className="divide-y divide-line">
            {rows.slice(0, 8).map((r) => {
              const sig = (party: string) => r.asg?.signatures.find((s) => s.party === party)?.signed_at;
              const track = applicationStages({ submittedAt: r.submitted_at, decidedAt: r.decided_at, applicantSignedAt: sig("APPLICANT"), countersignedAt: sig("COHORTDATA"), applicationStatus: r.status, assignmentStatus: r.asg?.status }, ts);
              return (
                <li key={r.id}>
                  <Link href={`/work/jobs/${r.project?.id}`} className="block px-5 py-4 transition-colors hover:bg-paper">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-[14px] font-medium text-ink"><span className="tabular me-1.5 text-muted">{r.project?.code}</span>{r.project?.title}</p>
                      <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(r.submitted_at, new Date(), locale)}</span>
                    </div>
                    <div className="mt-2"><StageTrack {...track} timeZone={tz} compact /></div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}

function ProjectGrid({ projects, tz, empty }: { projects: { project: ProjectLite; note: string }[]; tz: string; empty: React.ReactNode }) {
  const t = useTranslations("work");
  const labels = useLabels();
  if (projects.length === 0) return <Panel>{empty}</Panel>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {projects.map(({ project: p, note }, i) => (
        <li key={p.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <Link href={`/work/projects/${p.id}`} className="group flex h-full flex-col rounded-lg border border-line bg-surface p-5 shadow-raise transition-[border-color,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float">
            <span className="tabular w-fit rounded-xs bg-sunken px-1.5 py-0.5 text-[12px] font-medium text-ink-2">{p.code}</span>
            <h3 className="mt-3 font-display text-[18px] font-semibold leading-snug text-ink group-hover:text-pine-700">{p.title}</h3>
            {p.summary ? <p className="mt-1.5 line-clamp-2 text-[13.5px] text-ink-2">{p.summary}</p> : null}
            <div className="mt-auto flex flex-wrap gap-x-4 pt-4 text-[12.5px] text-muted">
              <span>{labels.dataType(p.data_type)}</span><span>{note}</span>{p.closes_at ? <span>{t("ends", { date: formatDate(p.closes_at, tz) })}</span> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
