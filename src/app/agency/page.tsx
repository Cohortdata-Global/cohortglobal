import Link from "next/link";
import { ArrowUpRight, Briefcase, FileSignature, UserPlus, Users } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { StageTrack, applicationStages } from "@/components/app/stage-track";
import { can, requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getLocale, getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { timeAgo } from "@/lib/utils";

export const generateMetadata = titled("dashboard");

type App = {
  id: string; status: string; submitted_at: string; decided_at: string | null;
  project: { id: string; code: string; title: string } | null;
  assignment: { status: string; signatures: { party: string; signed_at: string }[] } | { status: string; signatures: { party: string; signed_at: string }[] }[] | null;
};

export default async function AgencyDashboard() {
  const viewer = await requireSurface("agency");
  const org = viewer.organization!;
  const [db, t, ts, locale] = await Promise.all([createUserClient(), getTranslations("agencyDashboard"), getTranslations("stages"), getLocale()]);
  const head = { count: "exact" as const, head: true };

  const [members, managers, invites, active, toSign, jobs, apps, assigned] = await Promise.all([
    db.from("organization_memberships").select("id", head).eq("organization_id", org.id).eq("role", "AGENCY_MEMBER").eq("status", "ACTIVE"),
    db.from("organization_memberships").select("id", head).eq("organization_id", org.id).eq("role", "AGENCY_MANAGER").neq("status", "REMOVED"),
    db.from("invitations").select("id", head).eq("organization_id", org.id).eq("status", "PENDING"),
    db.from("project_assignments").select("id", head).eq("organization_id", org.id).eq("status", "ACTIVE"),
    db.from("project_assignments").select("id", head).eq("organization_id", org.id).eq("status", "AWAITING_SIGNATURE"),
    db.from("projects").select("id", head).eq("status", "PUBLISHED").in("applicant_type", ["AGENCY", "BOTH"]),
    db.from("project_applications")
      .select("id,status,submitted_at,decided_at,project:projects!project_applications_project_id_fkey(id,code,title),assignment:project_assignments!project_assignments_application_id_fkey(status,signatures:contract_signatures!contract_signatures_assignment_id_fkey(party,signed_at))")
      .eq("organization_id", org.id).order("submitted_at", { ascending: false }).limit(5),
    db.from("member_assignments").select("id", head).eq("organization_id", org.id).eq("status", "ASSIGNED"),
  ]);
  const tz = viewer.user.timezone;
  const first = viewer.user.fullName?.split(" ")[0];
  const isOwner = viewer.membership?.role === "AGENCY_OWNER";
  const rows = (apps.data ?? []) as unknown as App[];

  const steps: { icon: React.ReactNode; title: string; body: string; href: string }[] = [];
  if ((toSign.count ?? 0) > 0) steps.push({ icon: <FileSignature />, title: t("contractsToSign", { count: toSign.count ?? 0 }), body: isOwner ? t("signBodyOwner") : t("signBodyOther"), href: "/agency/jobs?tab=applied" });
  if (isOwner && (managers.count ?? 0) === 0) steps.push({ icon: <UserPlus />, title: t("inviteManager"), body: t("inviteManagerBody"), href: "/agency/members" });
  if ((members.count ?? 0) === 0) steps.push({ icon: <Users />, title: t("inviteTeam"), body: t("inviteTeamBody"), href: "/agency/members" });
  if ((active.count ?? 0) === 0 && (jobs.count ?? 0) > 0) steps.push({ icon: <Briefcase />, title: t("openJobs", { count: jobs.count ?? 0 }), body: t("openJobsBody"), href: "/agency/jobs" });

  return (
    <>
      <PageHeader title={first ? t("welcome", { name: first }) : org.name} description={t("onPlatform", { org: org.name })} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("activeProjects")} value={active.count ?? 0} tone="brand" href="/agency/projects" />
        <Stat label={t("toSign")} value={toSign.count ?? 0} tone={(toSign.count ?? 0) > 0 ? "attention" : "neutral"} href="/agency/jobs?tab=applied" />
        <Stat label={t("members")} value={members.count ?? 0} hint={(invites.count ?? 0) > 0 ? t("invitesPending", { count: invites.count ?? 0 }) : undefined} href="/agency/members" />
        <Stat label={t("assignments")} value={assigned.count ?? 0} href="/agency/projects" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader title={t("applications")} description={t("applicationsBody")} actions={<Link href="/agency/jobs?tab=applied" className="inline-flex items-center gap-1 text-[13px] text-pine-700 hover:underline">{t("all")} <ArrowUpRight className="size-3.5" /></Link>} />
          {rows.length === 0 ? (
            <EmptyState icon={<Briefcase />} title={t("noApplications")} description={t("noApplicationsBody")} action={can(viewer, "org.projects.apply") ? <Link href="/agency/jobs" className="text-[14px] font-medium text-pine-700 hover:underline">{t("seeJobs")}</Link> : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((a) => {
                const asg = Array.isArray(a.assignment) ? a.assignment[0] ?? null : a.assignment;
                const sig = (party: string) => asg?.signatures.find((s) => s.party === party)?.signed_at;
                const track = applicationStages({ submittedAt: a.submitted_at, decidedAt: a.decided_at, applicantSignedAt: sig("APPLICANT"), countersignedAt: sig("COHORTDATA"), applicationStatus: a.status, assignmentStatus: asg?.status }, ts);
                return (
                  <li key={a.id}>
                    <Link href={`/agency/jobs/${a.project?.id}`} className="block px-5 py-4 transition-colors hover:bg-paper">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-[14px] font-medium text-ink"><span className="tabular me-1.5 text-muted">{a.project?.code}</span>{a.project?.title}</p>
                        <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(a.submitted_at, new Date(), locale)}</span>
                      </div>
                      <div className="mt-2"><StageTrack {...track} timeZone={tz} compact /></div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={t("nextSteps")} />
          {steps.length === 0 ? <EmptyState title={t("caughtUp")} description={t("caughtUpBody")} /> : (
            <ul className="divide-y divide-line">
              {steps.map((s) => (
                <li key={s.title}>
                  <Link href={s.href} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-paper">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-pine-50 text-pine-700 [&_svg]:size-4">{s.icon}</span>
                    <span className="min-w-0"><span className="block text-[14px] font-medium text-ink">{s.title}</span><span className="block text-[13px] text-muted">{s.body}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="mt-6 text-[12.5px] text-muted">{t("part2")}</p>
    </>
  );
}
