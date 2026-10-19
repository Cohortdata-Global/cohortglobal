import { ShieldCheck } from "lucide-react";
import { PageHeader, TabLinks, EmptyState, Avatar } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { InviteDialog } from "@/components/flows/invite-dialog";
import { InvitationActions } from "@/components/flows/invitation-actions";
import { StaffActions } from "@/components/flows/staff-actions";
import { can, requirePermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("staff");

type Member = { id: string; status: string; joined_at: string; user: { id: string; full_name: string | null; email: string } | null };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requirePermission("staff.invite");
  const { tab = "people" } = await searchParams;
  const [db, t, labels] = await Promise.all([createUserClient(), getTranslations("staff"), getLabels()]);
  const tz = viewer.user.timezone;
  const orgId = viewer.organization!.id;

  const [{ data: members }, { data: invites }] = await Promise.all([
    db.from("organization_memberships").select("id,status,joined_at,user:users!organization_memberships_user_id_fkey(id,full_name,email)")
      .eq("organization_id", orgId).neq("status", "REMOVED").order("joined_at"),
    db.from("invitations").select("id,email,status,expires_at,created_at,send_count,role_code").eq("purpose", "PLATFORM_STAFF")
      .in("status", ["PENDING", "EXPIRED"]).order("created_at", { ascending: false }),
  ]);
  const people = (members ?? []) as unknown as Member[];
  const ids = people.map((m) => m.user?.id).filter(Boolean) as string[];
  const { data: roles } = ids.length
    ? await db.from("user_roles").select("user_id,role_code").in("user_id", ids).eq("role_scope", "PLATFORM").is("revoked_at", null)
    : { data: [] as { user_id: string; role_code: string }[] };
  const roleOf = (userId?: string) => {
    const rs = (roles ?? []).filter((r) => r.user_id === userId).map((r) => r.role_code);
    return rs.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : rs.find((r) => r !== "STAFF") ?? null;
  };
  const manage = can(viewer, "staff.manage");
  type Invite = { id: string; email: string; status: string; expires_at: string; created_at: string; send_count: number; role_code: string | null };
  const pendingInvites = (invites ?? []) as Invite[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("body")}
        actions={<InviteDialog title={t("inviteTitle")} description={t("inviteBody")} purposes={[{ value: "PLATFORM_STAFF", label: t("staffPurpose") }]} triggerLabel={t("invite")} />}
      />
      <TabLinks active={tab} tabs={[
        { key: "people", label: t("people"), href: "/admin/staff", count: people.length },
        { key: "invitations", label: t("invitations"), href: "/admin/staff?tab=invitations", count: pendingInvites.length },
      ]} />
      <Panel>
        {tab === "invitations" ? (
          pendingInvites.length === 0 ? <EmptyState title={t("noInvites")} /> : (
            <Table>
              <THead><tr><TH>{t("email")}</TH><TH>{t("role")}</TH><TH>{t("status")}</TH><TH>{t("expires")}</TH><TH /></tr></THead>
              <tbody>
                {pendingInvites.map((i) => {
                  const status = i.status === "PENDING" && new Date(i.expires_at) < new Date() ? "EXPIRED" : i.status;
                  return (
                    <TR key={i.id}>
                      <TD className="font-medium">{i.email}</TD>
                      <TD className="text-ink-2">{i.role_code ? labels.role(i.role_code) : "—"}</TD>
                      <TD><StatusBadge status={status} /></TD>
                      <TD className="tabular text-muted">{formatDate(i.expires_at, tz)}</TD>
                      <TD className="text-end"><InvitationActions id={i.id} purpose="PLATFORM_STAFF" email={i.email} organizationName="CohortData" status={status} /></TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )
        ) : people.length === 0 ? <EmptyState icon={<ShieldCheck />} title={t("noStaff")} /> : (
          <Table>
            <THead><tr><TH>{t("name")}</TH><TH>{t("role")}</TH><TH>{t("status")}</TH><TH>{t("joined")}</TH><TH /></tr></THead>
            <tbody>
              {people.map((m) => {
                const role = roleOf(m.user?.id);
                const name = m.user?.full_name ?? m.user?.email ?? t("memberFallback");
                const isSelf = m.user?.id === viewer.user.id;
                return (
                  <TR key={m.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={name} size={30} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{name}{isSelf ? <span className="ms-1.5 text-[12.5px] font-normal text-muted">{t("you")}</span> : null}</p>
                          <p className="truncate text-[12.5px] text-muted">{m.user?.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD><Badge tone={role === "SUPER_ADMIN" ? "brand" : "neutral"}>{role ? labels.role(role) : t("noRole")}</Badge></TD>
                    <TD><StatusBadge status={m.status} /></TD>
                    <TD className="tabular text-muted">{formatDate(m.joined_at, tz)}</TD>
                    <TD className="text-end">{manage && role !== "SUPER_ADMIN" && !isSelf && m.user ? <StaffActions userId={m.user.id} name={name} role={role} /> : null}</TD>
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
