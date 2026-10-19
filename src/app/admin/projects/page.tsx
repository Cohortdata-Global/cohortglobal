import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { PageHeader, TabLinks, EmptyState } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/app/filter-bar";
import { can, PROJECT_CONSOLE, requireAnyPermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { APPLICANT_TYPES } from "@/lib/status";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("projects");

const TABS = [
  { key: "open", statuses: ["PUBLISHED"] },
  { key: "draft", statuses: ["DRAFT"] },
  { key: "paused", statuses: ["PAUSED"] },
  { key: "done", statuses: ["COMPLETED"] },
  { key: "archived", statuses: ["ARCHIVED"] },
] as const;

type Row = {
  id: string; code: string; title: string; status: string; applicant_type: string; data_type: string; visibility: string;
  closes_at: string | null; updated_at: string;
  applications: { status: string }[];
  assignments: { status: string }[];
  managers: { user_id: string; removed_at: string | null; user: { full_name: string | null; email: string } | null }[];
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; type?: string }> }) {
  const viewer = await requireAnyPermission(PROJECT_CONSOLE);
  const { tab = "open", q = "", type = "" } = await searchParams;
  const active = TABS.find((x) => x.key === tab) ?? TABS[0];
  const [db, t, labels] = await Promise.all([createUserClient(), getTranslations("projects"), getLabels()]);
  const tz = viewer.user.timezone;

  const counts = Object.fromEntries(await Promise.all(TABS.map(async (x) => {
    const { count } = await db.from("projects").select("id", { count: "exact", head: true }).in("status", [...x.statuses]);
    return [x.key, count ?? 0] as const;
  })));

  let query = db.from("projects")
    .select("id,code,title,status,applicant_type,data_type,visibility,closes_at,updated_at,applications:project_applications!project_applications_project_id_fkey(status),assignments:project_assignments!project_assignments_project_id_fkey(status),managers:project_managers(user_id,removed_at,user:users!project_managers_user_id_fkey(full_name,email))")
    .in("status", [...active.statuses]).order("updated_at", { ascending: false }).limit(200);
  if (q) {
    const term = q.replace(/[,()%_]/g, "");
    query = query.or(`title.ilike.%${term}%,code.ilike.%${term}%`);
  }
  if (type) query = query.eq("applicant_type", type);
  const rows = ((await query).data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("body")}
        actions={can(viewer, "project.manage") ? <Button asChild><Link href="/admin/projects/new"><Plus /> {t("new")}</Link></Button> : null}
      />
      <TabLinks active={active.key} tabs={TABS.map((x) => ({ key: x.key, label: t(`tabs.${x.key}`), href: `/admin/projects?tab=${x.key}`, count: counts[x.key] }))} />
      <FilterBar searchPlaceholder={t("search")}
        filters={[{ key: "type", label: t("anyApplicant"), options: APPLICANT_TYPES.map((value) => ({ value, label: labels.applicantType(value) })) }]} />

      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<FolderKanban />} title={q || type ? t("noMatch") : active.key === "draft" ? t("noDrafts") : t("nothing")}
            description={active.key === "open" ? t("openEmpty") : undefined}
            action={active.key === "open" && can(viewer, "project.manage") ? <Button asChild variant="secondary"><Link href="/admin/projects/new">{t("createDraft")}</Link></Button> : undefined} />
        ) : (
          <Table>
            <THead><tr><TH>{t("project")}</TH><TH>{t("managers")}</TH><TH>{t("applicants")}</TH><TH>{t("waitingReview")}</TH><TH>{t("working")}</TH><TH>{t("status")}</TH><TH>{t("closes")}</TH></tr></THead>
            <tbody>
              {rows.map((p) => {
                const pending = p.applications.filter((a) => a.status === "PENDING").length;
                const live = p.assignments.filter((a) => a.status === "ACTIVE").length;
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/admin/projects/${p.id}`} className="group block">
                        <span className="tabular me-2 rounded-xs bg-sunken px-1.5 py-0.5 text-[12px] font-medium text-ink-2">{p.code}</span>
                        <span className="font-medium text-ink group-hover:text-pine-700 group-hover:underline">{p.title}</span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">{labels.dataType(p.data_type)}{p.visibility === "INVITE_ONLY" ? t("inviteOnly") : ""}</span>
                      </Link>
                    </TD>
                    <TD className="text-ink-2">
                      {(() => {
                        const pms = p.managers.filter((m) => !m.removed_at);
                        if (pms.length === 0) return <Badge tone="attention">{t("unassigned")}</Badge>;
                        return pms.map((m) => m.user_id === viewer.user.id ? t("you") : (m.user?.full_name || m.user?.email)).join(", ");
                      })()}
                    </TD>
                    <TD className="text-ink-2">{labels.applicantType(p.applicant_type)}</TD>
                    <TD>
                      {pending > 0
                        ? <Link href={`/admin/projects/${p.id}/applications`}><Badge tone="attention" dot>{t("toReview", { count: pending })}</Badge></Link>
                        : <span className="text-muted">{t("none")}</span>}
                    </TD>
                    <TD className="tabular text-ink-2">{live}</TD>
                    <TD><StatusBadge status={p.status} /></TD>
                    <TD className="tabular whitespace-nowrap text-muted">{p.closes_at ? formatDate(p.closes_at, tz) : t("noEnd")}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
