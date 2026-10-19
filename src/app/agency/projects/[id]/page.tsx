import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Link2, Users } from "lucide-react";
import { PageHeader, EmptyState, Avatar, Notice } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { AssignMemberDialog, UnassignMember } from "@/components/flows/agency-portal-actions";
import { can, requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("project");

type MA = { id: string; status: string; assigned_at: string; membership_id: string; user: { full_name: string | null; email: string } | null };

export default async function AgencyProject({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSurface("agency");
  const { id } = await params;
  const org = viewer.organization!;
  const [db, t] = await Promise.all([createUserClient(), getTranslations("agencyProjects")]);
  const tz = viewer.user.timezone;

  const { data: asg } = await db.from("project_assignments")
    .select("id,status,activated_at,project:projects!project_assignments_project_id_fkey(id,code,title,summary,status)")
    .eq("organization_id", org.id).eq("project_id", id).neq("status", "REVOKED").maybeSingle();
  if (!asg) notFound();
  type Asg = { id: string; status: string; activated_at: string | null; project: { id: string; code: string; title: string; summary: string; status: string } | null };
  const a = asg as unknown as Asg;
  if (a.status !== "ACTIVE" && a.status !== "COMPLETED") redirect(`/agency/jobs/${id}`);

  const [{ data: assigned }, { data: members }] = await Promise.all([
    db.from("member_assignments").select("id,status,assigned_at,membership_id,user:users!member_assignments_user_id_fkey(full_name,email)")
      .eq("project_assignment_id", a.id).eq("status", "ASSIGNED").order("assigned_at"),
    db.from("organization_memberships").select("id,user:users!organization_memberships_user_id_fkey(full_name,email)")
      .eq("organization_id", org.id).eq("role", "AGENCY_MEMBER").eq("status", "ACTIVE"),
  ]);
  const rows = (assigned ?? []) as unknown as MA[];
  const taken = new Set(rows.map((r) => r.membership_id));
  const options = ((members ?? []) as unknown as { id: string; user: { full_name: string | null; email: string } | null }[])
    .filter((m) => !taken.has(m.id)).map((m) => ({ membershipId: m.id, label: m.user?.full_name ? t("option", { name: m.user.full_name, email: m.user.email }) : m.user?.email ?? t("memberFallback") }));
  const canAssign = can(viewer, "org.members.assign") && a.status === "ACTIVE" && org.status === "ACTIVE" && a.project?.status !== "COMPLETED";

  return (
    <>
      <PageHeader back={{ href: "/agency/projects", label: t("title") }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{a.project?.code}</span>{a.project?.title}<StatusBadge status={a.status} labels={{ ACTIVE: t("workOpen") }} /></span>}
        description={a.activated_at ? t("workOpened", { date: formatDate(a.activated_at, tz) }) : undefined}
        actions={<Link href={`/agency/jobs/${id}`} className="text-[13.5px] text-pine-700 hover:underline">{t("jobPage")}</Link>} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title={t("assigned")} description={t("assignedBody")}
            actions={canAssign ? <AssignMemberDialog assignmentId={a.id} members={options} /> : null} />
          {rows.length === 0 ? (
            <EmptyState icon={<Users />} title={t("noneAssigned")} description={options.length === 0 ? t("inviteFirst") : t("assignBody")}
              action={options.length === 0 ? <Link href="/agency/members" className="text-[14px] font-medium text-pine-700 hover:underline">{t("inviteMembers")}</Link> : undefined} />
          ) : (
            <Table>
              <THead><tr><TH>{t("member")}</TH><TH>{t("assignedOn")}</TH><TH /></tr></THead>
              <tbody>
                {rows.map((r) => {
                  const name = r.user?.full_name ?? r.user?.email ?? t("memberFallback");
                  return (
                    <TR key={r.id}>
                      <TD><div className="flex items-center gap-3"><Avatar name={name} size={28} /><div className="min-w-0"><p className="truncate font-medium text-ink">{name}</p><p className="truncate text-[12.5px] text-muted">{r.user?.email}</p></div></div></TD>
                      <TD className="tabular text-muted">{formatDate(r.assigned_at, tz)}</TD>
                      <TD className="text-end">{canAssign ? <UnassignMember memberAssignmentId={r.id} name={name} /> : null}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel className="h-fit">
          <PanelHeader title={t("links")} />
          <PanelBody>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-muted"><Link2 className="size-4" /></span>
              <p className="text-[13.5px] text-ink-2">{t("linksBody")}</p>
            </div>
          </PanelBody>
        </Panel>
      </div>
      {org.status !== "ACTIVE" ? <div className="mt-6"><Notice tone="attention" title={t("locked")} /></div> : null}
    </>
  );
}
