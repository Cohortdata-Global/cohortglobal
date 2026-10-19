import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("projects");

type Row = {
  id: string; status: string; activated_at: string | null;
  project: { id: string; code: string; title: string; data_type: string; status: string; closes_at: string | null } | null;
  members: { status: string }[];
};

/** Projects the agency is approved for. Work opens after both signatures (#29). */
export default async function AgencyProjects() {
  const viewer = await requireSurface("agency");
  const [db, t, labels] = await Promise.all([createUserClient(), getTranslations("agencyProjects"), getLabels()]);
  const { data } = await db.from("project_assignments")
    .select("id,status,activated_at,project:projects!project_assignments_project_id_fkey(id,code,title,data_type,status,closes_at),members:member_assignments!member_assignments_project_assignment_id_fkey(status)")
    .eq("organization_id", viewer.organization!.id).in("status", ["ACTIVE", "COMPLETED", "AWAITING_SIGNATURE", "AWAITING_COUNTERSIGNATURE"])
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const tz = viewer.user.timezone;

  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<ClipboardCheck />} title={t("none")} description={t("noneBody")}
            action={<Link href="/agency/jobs" className="text-[14px] font-medium text-pine-700 hover:underline">{t("browse")}</Link>} />
        ) : (
          <Table>
            <THead><tr><TH>{t("project")}</TH><TH>{t("access")}</TH><TH>{t("membersAssigned")}</TH><TH>{t("started")}</TH></tr></THead>
            <tbody>
              {rows.map((r) => {
                const href = r.status === "ACTIVE" || r.status === "COMPLETED" ? `/agency/projects/${r.project?.id}` : `/agency/jobs/${r.project?.id}`;
                return (
                  <TR key={r.id}>
                    <TD>
                      <Link href={href} className="group block">
                        <span className="tabular me-2 text-muted">{r.project?.code}</span>
                        <span className="font-medium text-ink group-hover:text-pine-700 group-hover:underline">{r.project?.title}</span>
                        <span className="block text-[12.5px] text-muted">{labels.dataType(r.project?.data_type)}</span>
                      </Link>
                    </TD>
                    <TD><StatusBadge status={r.status} labels={{ ACTIVE: t("workOpen"), AWAITING_SIGNATURE: t("waitingOwner") }} /></TD>
                    <TD className="tabular text-ink-2">{r.members.filter((m) => m.status === "ASSIGNED").length}</TD>
                    <TD className="tabular text-muted">{r.activated_at ? formatDate(r.activated_at, tz) : t("notYet")}</TD>
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
