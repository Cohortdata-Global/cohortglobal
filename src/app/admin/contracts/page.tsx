import Link from "next/link";
import { FileSignature } from "lucide-react";
import { PageHeader, TabLinks, EmptyState } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { CountersignDialog, RevokeAssignment } from "@/components/flows/project-admin-actions";
import { can, requirePermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getLocale, getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { formatDate, timeAgo } from "@/lib/utils";

export const generateMetadata = titled("contracts");

const TABS = [
  { key: "countersign", statuses: ["AWAITING_COUNTERSIGNATURE"] },
  { key: "applicant", statuses: ["AWAITING_SIGNATURE"] },
  { key: "active", statuses: ["ACTIVE", "COMPLETED"] },
  { key: "revoked", statuses: ["REVOKED"] },
] as const;

type Row = {
  id: string; status: string; created_at: string; activated_at: string | null; application_id: string;
  project: { id: string; code: string; title: string } | null;
  organization: { name: string } | null;
  user: { full_name: string | null; email: string } | null;
  template: { title: string; version: number; body: string } | null;
  signatures: { party: string; signer_name: string; signed_at: string }[];
};

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requirePermission("contract.countersign");
  const { tab = "countersign" } = await searchParams;
  const active = TABS.find((x) => x.key === tab) ?? TABS[0];
  const [db, t, locale] = await Promise.all([createUserClient(), getTranslations("contracts"), getLocale()]);
  const tz = viewer.user.timezone;

  const counts = Object.fromEntries(await Promise.all(TABS.map(async (x) => {
    const { count } = await db.from("project_assignments").select("id", { count: "exact", head: true }).in("status", [...x.statuses]);
    return [x.key, count ?? 0] as const;
  })));

  const { data } = await db.from("project_assignments")
    .select("id,status,created_at,activated_at,application_id,project:projects!project_assignments_project_id_fkey(id,code,title),organization:organizations!project_assignments_organization_id_fkey(name),user:users!project_assignments_user_id_fkey(full_name,email),template:project_contract_templates!project_assignments_contract_template_id_fkey(title,version,body),signatures:contract_signatures!contract_signatures_assignment_id_fkey(party,signer_name,signed_at)")
    .in("status", [...active.statuses]).order("updated_at", { ascending: active.key === "countersign" }).limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const name = (r: Row) => r.organization?.name ?? r.user?.full_name ?? r.user?.email ?? t("applicantFallback");

  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />
      <TabLinks active={active.key} tabs={TABS.map((x) => ({ key: x.key, label: t(`tabs.${x.key}`), href: `/admin/contracts?tab=${x.key}`, count: counts[x.key] }))} />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<FileSignature />} title={active.key === "countersign" ? t("nothing") : t("none")}
            description={active.key === "countersign" ? t("nothingBody") : undefined} />
        ) : (
          <Table>
            <THead><tr><TH>{t("applicant")}</TH><TH>{t("project")}</TH><TH>{t("contract")}</TH><TH>{t("applicantSigned")}</TH><TH>{t("status")}</TH><TH /></tr></THead>
            <tbody>
              {rows.map((r) => {
                const applicant = r.signatures.find((s) => s.party === "APPLICANT");
                const projectId = r.project?.id ?? "";
                return (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/admin/projects/${projectId}/applications?tab=approved&app=${r.application_id}`} className="font-medium text-ink hover:text-pine-700 hover:underline">{name(r)}</Link>
                      <span className="block text-[12.5px] text-muted">{r.organization ? t("agency") : t("freelancer")}</span>
                    </TD>
                    <TD><Link href={`/admin/projects/${projectId}`} className="text-ink-2 hover:underline"><span className="tabular me-1.5 text-muted">{r.project?.code}</span>{r.project?.title}</Link></TD>
                    <TD className="text-ink-2">{r.template?.title}<span className="block text-[12.5px] text-muted">{t("version", { version: r.template?.version ?? 1 })}</span></TD>
                    <TD className="text-ink-2">
                      {applicant ? <>{applicant.signer_name}<span className="tabular block text-[12.5px] text-muted">{timeAgo(applicant.signed_at, new Date(), locale)}</span></> : <span className="text-muted">{t("approvedOn", { date: formatDate(r.created_at, tz) })}</span>}
                    </TD>
                    <TD><StatusBadge status={r.status} labels={{ AWAITING_SIGNATURE: t("waitingApplicant"), AWAITING_COUNTERSIGNATURE: t("ready") }} /></TD>
                    <TD className="text-end">
                      <div className="flex justify-end gap-1">
                        {r.status === "AWAITING_COUNTERSIGNATURE" ? (
                          <CountersignDialog assignmentId={r.id} applicant={name(r)} contractTitle={t("contractVersion", { title: r.template?.title ?? t("contractFallback"), version: r.template?.version ?? 1 })}
                            body={r.template?.body ?? ""} defaultName={viewer.user.fullName ?? ""} />
                        ) : null}
                        {can(viewer, "assignment.revoke") && !["REVOKED", "COMPLETED"].includes(r.status) ? <RevokeAssignment assignmentId={r.id} applicant={name(r)} /> : null}
                      </div>
                    </TD>
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
