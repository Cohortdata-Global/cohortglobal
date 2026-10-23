import { ClipboardCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader, TabLinks, EmptyState } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { FilterBar } from "@/components/app/filter-bar";
import { QcQueueTable, type QueueRow } from "@/components/qc/qc-queue-table";
import { submissionStatusLabels } from "@/components/collect/submissions";
import { can, requireAnyPermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { callRpc } from "@/server/actions/_rpc";
import { titled } from "@/i18n/metadata";
import { timeAgo } from "@/lib/utils";
import { collectionSchema } from "@/lib/collection";
import type { Reviewer } from "@/server/actions/qc";

export const generateMetadata = titled("qc");

type Row = {
  id: string; status: string; project_id: string; collection_version: number; main_file_name: string | null; contributor_name: string;
  profile: Record<string, string>; flag_count: number; status_changed_at: string; decided_at: string | null; qc_assignee: string | null;
  project: { code: string; title: string } | null; organization: { name: string } | null;
};

/**
 * QC queue (2E, ID-56). QC Leads see every project; a PM sees the projects
 * assigned to them (owner 2026-10-21: PMs assign and see what QC Leads see);
 * a QC Reviewer sees only what is assigned to them. Rows come through RLS.
 */
export default async function QcQueue({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireAnyPermission(["qc.assign", "qc.review"]);
  const sp = await searchParams;
  const canAssign = can(viewer, "qc.assign");
  type View = "queue" | "review" | "mine" | "done";
  const views: View[] = canAssign ? ["queue", "review", "mine", "done"] : ["mine", "done"];
  const view: View = views.includes(sp.view as View) ? (sp.view as View) : views[0]!;
  const [db, t, statusLabels, locale] = await Promise.all([createUserClient(), getTranslations("qc"), submissionStatusLabels(), getLocale()]);
  const me = viewer.user.id;

  const base = (v: string) => {
    let q = db.from("submissions").select("id", { count: "exact", head: true });
    if (v === "queue") q = q.eq("status", "READY_FOR_QC");
    if (v === "review") q = q.eq("status", "IN_REVIEW");
    if (v === "mine") q = q.eq("status", "IN_REVIEW").eq("qc_assignee", me);
    if (v === "done") q = q.in("status", ["APPROVED", "REJECTED", "RESUBMIT_REQUESTED"]).not("decided_by", "is", null);
    if (v === "done" && !canAssign) q = q.eq("decided_by", me);
    if (sp.project) q = q.eq("project_id", sp.project);
    return q;
  };
  let list = db.from("submissions")
    .select("id,status,project_id,collection_version,main_file_name,contributor_name,profile,flag_count,status_changed_at,decided_at,qc_assignee,project:projects!submissions_project_id_fkey(code,title),organization:organizations!submissions_organization_id_fkey(name)")
    .limit(200);
  if (view === "queue") list = list.eq("status", "READY_FOR_QC").order("status_changed_at", { ascending: true });
  if (view === "review") list = list.eq("status", "IN_REVIEW").order("qc_assigned_at", { ascending: true });
  if (view === "mine") list = list.eq("status", "IN_REVIEW").eq("qc_assignee", me).order("qc_assigned_at", { ascending: true });
  if (view === "done") {
    list = list.in("status", ["APPROVED", "REJECTED", "RESUBMIT_REQUESTED"]).not("decided_by", "is", null).order("decided_at", { ascending: false });
    if (!canAssign) list = list.eq("decided_by", me);
  }
  if (sp.project) list = list.eq("project_id", sp.project);
  if (sp.flagged === "1") list = list.gt("flag_count", 0);
  if (sp.q) {
    const term = sp.q.replace(/[,()%_*]/g, "").slice(0, 80);
    if (term) list = list.or(`contributor_name.ilike.%${term}%,contributor_email.ilike.%${term}%,main_file_name.ilike.%${term}%`);
  }

  const [{ data }, counts, { data: projects }, reviewers] = await Promise.all([
    list,
    Promise.all(views.map(async (v) => [v, (await base(v)).count ?? 0] as const)),
    db.from("projects").select("id,code,title").in("status", ["PUBLISHED", "PAUSED", "COMPLETED"]).order("code").limit(200),
    canAssign ? callRpc<Reviewer[]>("qc_reviewers", { p_project: sp.project ?? null }) : Promise.resolve(null),
  ]);
  const rowsRaw = (data ?? []) as unknown as Row[];

  // Option fields of each setup version, for the profile chips.
  const versions = [...new Set(rowsRaw.map((r) => `${r.project_id}:${r.collection_version}`))];
  const selectKeys = new Map<string, string[]>();
  if (versions.length) {
    const { data: cvs } = await db.from("project_collection_versions").select("project_id,version,config")
      .in("project_id", [...new Set(rowsRaw.map((r) => r.project_id))]);
    for (const cv of (cvs ?? []) as { project_id: string; version: number; config: unknown }[]) {
      const parsed = collectionSchema.safeParse(cv.config);
      if (parsed.success) selectKeys.set(`${cv.project_id}:${cv.version}`, parsed.data.fields.filter((f) => f.type === "select").map((f) => f.key));
    }
  }
  const now = new Date();
  const rows: QueueRow[] = rowsRaw.map((r) => ({
    id: r.id, status: r.status, projectId: r.project_id, project: r.project?.code ?? "", file: r.main_file_name, contributor: r.contributor_name,
    agency: r.organization?.name ?? null, flags: r.flag_count, assignee: r.qc_assignee,
    waiting: timeAgo(view === "done" ? r.decided_at ?? r.status_changed_at : r.status_changed_at, now, locale),
    segments: (selectKeys.get(`${r.project_id}:${r.collection_version}`) ?? []).map((k) => r.profile[k]).filter((v): v is string => !!v),
  }));
  const reviewerOptions = (reviewers && reviewers.ok ? reviewers.data ?? [] : []).map((r) => ({
    id: r.user_id, label: `${r.full_name || r.email} (${t(`roles.${r.role_code}` as never)})`,
  }));
  const countOf = Object.fromEntries(counts);
  const href = (v: string) => {
    const q = new URLSearchParams(Object.entries({ ...sp, view: v }).filter(([, val]) => val) as [string, string][]);
    return `/admin/qc?${q.toString()}`;
  };

  return (
    <>
      <PageHeader title={t("title")} description={canAssign ? t("bodyAssign") : t("bodyReview")} />
      <TabLinks active={view} tabs={views.map((v) => ({ key: v, label: t(`views.${v}`), href: href(v), count: countOf[v] }))} />
      <FilterBar searchPlaceholder={t("search")} filters={[
        { key: "project", label: t("anyProject"), options: (projects ?? []).map((p) => ({ value: p.id as string, label: `${p.code} ${p.title}` })) },
        { key: "flagged", label: t("anyFlags"), options: [{ value: "1", label: t("flaggedOnly") }] },
      ]} />
      {rows.length === 0 ? (
        <Panel><EmptyState icon={<ClipboardCheck />} title={t(`empty.${view}`)} /></Panel>
      ) : (
        <QcQueueTable rows={rows} reviewers={reviewerOptions} canAssign={canAssign && (view === "queue" || view === "review")} meId={me} statusLabels={statusLabels} />
      )}
    </>
  );
}
