import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SubmissionView } from "@/components/collect/submissions";
import { QcAssign, QcComment, QcDecide } from "@/components/qc/qc-actions";
import { can, canAny, requireAnyPermission, PROJECT_CONSOLE } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { callRpc } from "@/server/actions/_rpc";
import { loadSubmission } from "@/server/queries/submissions";
import { titled } from "@/i18n/metadata";
import type { Reviewer } from "@/server/actions/qc";

export const generateMetadata = titled("submission");

/**
 * A submission in the console with the QC panel (2E, ID-56): assign / take /
 * return (QC Lead, the project's PM, Operations Manager, Super Admin), the
 * assignee's decision, and comments (internal or shared).
 */
export default async function AdminSubmission({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const viewer = await requireAnyPermission([...PROJECT_CONSOLE, "qc.review", "qc.assign"]);
  const { id } = await params;
  const { from } = await searchParams;
  const [r, t, tq] = await Promise.all([loadSubmission(id), getTranslations("submissions"), getTranslations("qc")]);
  if (!r) notFound();
  const s = r.s as typeof r.s & { qc_assignee: string | null; reason_codes: string[] };
  const me = viewer.user.id;
  const db = await createUserClient();

  // Can this person assign on this project? (RLS showed the row; qc_reviewers checks the project scope.)
  let reviewers: { id: string; label: string }[] = [];
  let canAssign = false;
  if (can(viewer, "qc.assign")) {
    const res = await callRpc<Reviewer[]>("qc_reviewers", { p_project: s.project_id });
    if (res.ok) {
      canAssign = true;
      reviewers = (res.data ?? []).map((x) => ({ id: x.user_id, label: `${x.full_name || x.email} (${tq(`roles.${x.role_code}` as never)})` }));
    }
  }
  const isAssignee = s.qc_assignee === me && s.status === "IN_REVIEW";
  const { data: next } = await db.from("submissions").select("id").eq("status", "IN_REVIEW").eq("qc_assignee", me).neq("id", s.id)
    .order("qc_assigned_at", { ascending: true }).limit(1).maybeSingle();
  const nextHref = next ? `/admin/submissions/${next.id}?from=qc` : "/admin/qc?view=mine";
  const assigneeLabel = s.qc_assignee ? (s.qc_assignee === me ? tq("you") : reviewers.find((x) => x.id === s.qc_assignee)?.label ?? tq("reviewer")) : null;
  const canRerun = canAssign && (s.status === "READY_FOR_QC" || (s.status === "REJECTED" && (s.reason_codes ?? []).includes("AUTO")));
  const canComment = canAssign || isAssignee || canAny(viewer, ["qc.review"]) && s.qc_assignee === me;

  const panel = (canAssign || isAssignee || canComment) ? (
    <Panel className="border-pine-600/30">
      <PanelHeader title={tq("panelTitle")} description={assigneeLabel ? tq("assignedTo", { name: assigneeLabel }) : s.status === "READY_FOR_QC" ? tq("unassigned") : undefined} />
      <PanelBody className="grid gap-5">
        {isAssignee ? <QcDecide submissionId={s.id} nextHref={nextHref} /> : null}
        {canAssign ? <QcAssign submissionId={s.id} status={s.status} assignee={s.qc_assignee} meId={me} reviewers={reviewers} canRerun={canRerun} /> : null}
        {canComment ? <div className="border-t border-line pt-4"><QcComment submissionId={s.id} /></div> : null}
      </PanelBody>
    </Panel>
  ) : null;

  return (
    <SubmissionView s={r.s} config={r.config} tz={viewer.user.timezone} canSeeId staff qcPanel={panel}
      backHref={from === "qc" ? "/admin/qc" : `/admin/projects/${s.project_id}?tab=submissions`} backLabel={from === "qc" ? tq("backToQueue") : t("backToList")} />
  );
}
