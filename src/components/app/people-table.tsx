import { Users } from "lucide-react";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { MemberActions } from "@/components/flows/member-actions";
import { InvitationActions } from "@/components/flows/invitation-actions";
import { useTranslations } from "next-intl";
import { useLabels } from "@/i18n/labels";
import { countryName } from "@/lib/countries";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";
import type { InvitationRow, MemberRow } from "@/server/queries/people";

const ROLE_TONE: Record<string, "brand" | "info" | "neutral"> = { AGENCY_OWNER: "brand", AGENCY_MANAGER: "info", AGENCY_MEMBER: "neutral" };

/**
 * Members of one agency. `canManage(role)` says whether the viewer may act on a
 * person with that role (Owner manages the Manager; Owner and Manager manage Members).
 */
export function PeopleTable({ members, timeZone, manageable }: { members: MemberRow[]; timeZone: string; manageable: string[] }) {
  const t = useTranslations("people");
  const tc = useTranslations("common");
  const labels = useLabels();
  if (members.length === 0) return <EmptyState icon={<Users />} title={t("noMembersTitle")} description={t("noMembersBody")} />;
  return (
    <Table>
      <THead><tr><TH>{t("name")}</TH><TH>{t("role")}</TH><TH>{t("country")}</TH><TH>{t("phone")}</TH><TH>{t("assignedProjects")}</TH><TH>{t("status")}</TH><TH>{t("joined")}</TH><TH /></tr></THead>
      <tbody>
        {members.map((m) => {
          const name = m.user?.full_name ?? m.user?.email ?? tc("unknown");
          return (
            <TR key={m.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <Avatar name={name} size={30} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{name}</p>
                    <p className="truncate text-[12.5px] text-muted">{m.user?.email}</p>
                  </div>
                </div>
              </TD>
              <TD><Badge tone={ROLE_TONE[m.role] ?? "neutral"}>{labels.role(m.role)}</Badge></TD>
              <TD className="text-ink-2">{countryName(m.user?.country_code)}</TD>
              <TD className="tabular whitespace-nowrap text-ink-2">{formatPhone(m.user?.phone_e164)}</TD>
              <TD className="tabular text-ink-2">{m.role === "AGENCY_MEMBER" ? m.assignments.filter((a) => a.status === "ASSIGNED").length : "—"}</TD>
              <TD><StatusBadge status={m.status} /></TD>
              <TD className="tabular whitespace-nowrap text-muted">{formatDate(m.joined_at, timeZone)}</TD>
              <TD className="text-end"><MemberActions membershipId={m.id} name={name} status={m.status} canManage={manageable.includes(m.role)} /></TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

export function InvitationsTable({ invitations, timeZone, organizationName }: { invitations: InvitationRow[]; timeZone: string; organizationName: string }) {
  const t = useTranslations("people");
  const labels = useLabels();
  if (invitations.length === 0) return <EmptyState title={t("noInvitesTitle")} description={t("noInvitesBody")} />;
  return (
    <Table>
      <THead><tr><TH>{t("person")}</TH><TH>{t("invitedAs")}</TH><TH>{t("status")}</TH><TH>{t("sent")}</TH><TH>{t("expires")}</TH><TH /></tr></THead>
      <tbody>
        {invitations.map((i) => {
          const status = i.status === "PENDING" && new Date(i.expires_at) < new Date() ? "EXPIRED" : i.status;
          return (
            <TR key={i.id}>
              <TD>
                {i.invitee_name ? <span className="block font-medium text-ink">{i.invitee_name}</span> : null}
                <span className={i.invitee_name ? "text-[12.5px] text-muted" : "font-medium"}>{i.email}</span>
              </TD>
              <TD className="text-ink-2">{labels.role(i.purpose === "AGENCY_MANAGER" ? "AGENCY_MANAGER" : "AGENCY_MEMBER")}</TD>
              <TD><StatusBadge status={status} /></TD>
              <TD className="tabular text-muted">{i.send_count > 1 ? t("sentTimes", { date: formatDate(i.created_at, timeZone), count: i.send_count }) : formatDate(i.created_at, timeZone)}</TD>
              <TD className="tabular text-muted">{formatDate(i.expires_at, timeZone)}</TD>
              <TD className="text-end"><InvitationActions id={i.id} purpose={i.purpose} email={i.email} organizationName={organizationName} status={status} /></TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}
