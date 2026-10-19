import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { can, requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getLocale, getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { formatDate, timeAgo } from "@/lib/utils";

export const generateMetadata = titled("overview");

export default async function AdminOverview() {
  const viewer = await requireSurface("admin");
  const [db, t, locale] = await Promise.all([createUserClient(), getTranslations("console"), getLocale()]);
  const head = { count: "exact" as const, head: true };
  const [pendingAgencies, activeAgencies, openProjects, pendingApps, countersign, recentApps, pendingOrgs] = await Promise.all([
    db.from("organizations").select("id", head).eq("type", "AGENCY").eq("status", "PENDING_VERIFICATION"),
    db.from("organizations").select("id", head).eq("type", "AGENCY").eq("status", "ACTIVE"),
    db.from("projects").select("id", head).eq("status", "PUBLISHED"),
    db.from("project_applications").select("id", head).eq("status", "PENDING"),
    db.from("project_assignments").select("id", head).eq("status", "AWAITING_COUNTERSIGNATURE"),
    db.from("project_applications")
      .select("id,status,submitted_at,applicant_kind,project:projects!project_applications_project_id_fkey(id,code,title),organization:organizations!project_applications_organization_id_fkey(name),applicant:users!project_applications_user_id_fkey(full_name,email)")
      .order("submitted_at", { ascending: false }).limit(6),
    db.from("organizations").select("id,name,created_at").eq("type", "AGENCY").eq("status", "PENDING_VERIFICATION").order("created_at").limit(5),
  ]);
  const first = viewer.user.fullName?.split(" ")[0];

  type AppRow = { id: string; status: string; submitted_at: string; applicant_kind: string; project: { id: string; code: string; title: string } | null; organization: { name: string } | null; applicant: { full_name: string | null; email: string } | null };

  return (
    <>
      <PageHeader title={first ? t("greeting", { name: first }) : t("overview")} description={t("body")} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t("agenciesWaiting")} value={pendingAgencies.count ?? 0} tone={(pendingAgencies.count ?? 0) > 0 ? "attention" : "neutral"} href={can(viewer, "agency.view_all") ? "/admin/agencies?tab=pending" : undefined} />
        <Stat label={t("activeAgencies")} value={activeAgencies.count ?? 0} href={can(viewer, "agency.view_all") ? "/admin/agencies" : undefined} />
        <Stat label={t("openProjects")} value={openProjects.count ?? 0} tone="brand" href="/admin/projects" />
        <Stat label={t("applicationsToDecide")} value={pendingApps.count ?? 0} tone={(pendingApps.count ?? 0) > 0 ? "attention" : "neutral"} href="/admin/projects" />
        <Stat label={t("toCountersign")} value={countersign.count ?? 0} tone={(countersign.count ?? 0) > 0 ? "attention" : "neutral"} href={can(viewer, "contract.countersign") ? "/admin/contracts" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title={t("latest")} description={t("latestBody")} />
          {(recentApps.data ?? []).length === 0 ? (
            <EmptyState title={t("noApplications")} description={t("noApplicationsBody")} />
          ) : (
            <ul className="divide-y divide-line">
              {((recentApps.data ?? []) as unknown as AppRow[]).map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/projects/${a.project?.id}/applications?app=${a.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-paper">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{a.organization?.name ?? a.applicant?.full_name ?? a.applicant?.email}</p>
                      <p className="truncate text-[12.5px] text-muted"><span className="tabular me-1.5">{a.project?.code}</span>{a.project?.title}</p>
                    </div>
                    <StatusBadge status={a.status} />
                    <span className="hidden w-24 text-end text-[12.5px] text-muted sm:block">{timeAgo(a.submitted_at, new Date(), locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={t("waiting")} actions={can(viewer, "agency.view_all") ? <Link href="/admin/agencies?tab=pending" className="inline-flex items-center gap-1 text-[13px] text-pine-700 hover:underline">{t("all")} <ArrowUpRight className="size-3.5" /></Link> : null} />
          {(pendingOrgs.data ?? []).length === 0 ? (
            <EmptyState title={t("nothingWaiting")} description={t("nothingWaitingBody")} />
          ) : (
            <ul className="divide-y divide-line">
              {(pendingOrgs.data ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/agencies/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-paper">
                    <span className="truncate text-[14px] font-medium text-ink">{o.name}</span>
                    <span className="text-[12.5px] text-muted">{t("applied", { date: formatDate(o.created_at, viewer.user.timezone) })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
