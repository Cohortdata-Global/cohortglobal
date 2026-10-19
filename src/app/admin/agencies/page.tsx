import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageHeader, TabLinks, EmptyState } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/app/filter-bar";
import { InviteDialog } from "@/components/flows/invite-dialog";
import { InvitationActions } from "@/components/flows/invitation-actions";
import { can, requirePermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("agencies");

const TABS = [
  { key: "active", statuses: ["ACTIVE"] },
  { key: "pending", statuses: ["PENDING_VERIFICATION"] },
  { key: "changes", statuses: ["CHANGES_REQUESTED"] },
  { key: "suspended", statuses: ["SUSPENDED"] },
  { key: "closed", statuses: ["REJECTED", "DEACTIVATED"] },
  { key: "invited", statuses: [] as string[] },
] as const;

export default async function AgenciesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; country?: string }> }) {
  const viewer = await requirePermission("agency.view_all");
  const { tab = "active", q = "", country = "" } = await searchParams;
  const active = TABS.find((x) => x.key === tab) ?? TABS[0];
  const [db, t] = await Promise.all([createUserClient(), getTranslations("agencies")]);
  const tz = viewer.user.timezone;

  const counts = await Promise.all(TABS.filter((x) => x.statuses.length).map(async (x) => {
    const { count } = await db.from("organizations").select("id", { count: "exact", head: true }).eq("type", "AGENCY").in("status", [...x.statuses]);
    return [x.key, count ?? 0] as const;
  }));
  const { count: inviteCount } = await db.from("invitations").select("id", { count: "exact", head: true }).eq("purpose", "AGENCY_OWNER").eq("status", "PENDING");
  const countMap = Object.fromEntries([...counts, ["invited", inviteCount ?? 0]]);

  type OrgRow = { id: string; name: string; status: string; source: string; created_at: string; approved_at: string | null; agency_profiles: { country_code: string | null; contact_name: string | null; contact_email: string | null } | null };
  let orgs: OrgRow[] = [];
  type InviteRow = { id: string; email: string; agency_name: string | null; status: string; expires_at: string; created_at: string; send_count: number };
  let invites: InviteRow[] = [];

  if (active.key === "invited") {
    let query = db.from("invitations").select("id,email,agency_name,status,expires_at,created_at,send_count").eq("purpose", "AGENCY_OWNER").order("created_at", { ascending: false }).limit(200);
    if (q) query = query.or(`email.ilike.%${q.replace(/[,()%]/g, "")}%,agency_name.ilike.%${q.replace(/[,()%]/g, "")}%`);
    invites = ((await query).data ?? []) as InviteRow[];
  } else {
    let query = db.from("organizations")
      .select("id,name,status,source,created_at,approved_at,agency_profiles(country_code,contact_name,contact_email)")
      .eq("type", "AGENCY").in("status", [...active.statuses]).order(active.key === "pending" ? "created_at" : "name").limit(200);
    if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
    let rows = ((await query).data ?? []) as unknown as OrgRow[];
    if (country) rows = rows.filter((r) => r.agency_profiles?.country_code === country);
    orgs = rows;
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("body")}
        actions={can(viewer, "agency.invite") ? (
          <InviteDialog title={t("inviteTitle")} description={t("inviteBody")}
            purposes={[{ value: "AGENCY_OWNER", label: t("agencyOwner") }]} triggerLabel={t("inviteTrigger")} />
        ) : null}
      />
      <TabLinks active={active.key} tabs={TABS.map((x) => ({ key: x.key, label: t(`tabs.${x.key}`), href: `/admin/agencies?tab=${x.key}`, count: countMap[x.key] }))} />
      <FilterBar searchPlaceholder={active.key === "invited" ? t("searchInvites") : t("searchName")}
        filters={active.key === "invited" ? [] : [{ key: "country", label: t("allCountries"), options: ["IN", "ID", "BR", "SA", "AE", "SG"].map((c) => ({ value: c, label: countryName(c) })) }]} />

      <Panel>
        {active.key === "invited" ? (
          invites.length === 0 ? <EmptyState icon={<Building2 />} title={t("noInvites")} description={t("noInvitesBody")} /> : (
            <Table>
              <THead><tr><TH>{t("agency")}</TH><TH>{t("ownerEmail")}</TH><TH>{t("status")}</TH><TH>{t("expires")}</TH><TH /></tr></THead>
              <tbody>
                {invites.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-medium">{i.agency_name}</TD>
                    <TD className="text-ink-2">{i.email}</TD>
                    <TD><StatusBadge status={i.status === "PENDING" && new Date(i.expires_at) < new Date() ? "EXPIRED" : i.status} /></TD>
                    <TD className="tabular text-muted">{formatDate(i.expires_at, tz)}</TD>
                    <TD className="text-end"><InvitationActions id={i.id} purpose="AGENCY_OWNER" email={i.email} organizationName={i.agency_name} status={i.status === "PENDING" && new Date(i.expires_at) < new Date() ? "EXPIRED" : i.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : orgs.length === 0 ? (
          <EmptyState icon={<Building2 />} title={q ? t("noMatch") : active.key === "pending" ? t("noneWaiting") : t("noneHere")}
            description={active.key === "pending" ? t("noneWaitingBody") : undefined} />
        ) : (
          <Table>
            <THead><tr><TH>{t("agency")}</TH><TH>{t("country")}</TH><TH>{t("contact")}</TH><TH>{t("status")}</TH><TH>{active.key === "pending" ? t("applied") : t("approved")}</TH></tr></THead>
            <tbody>
              {orgs.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/admin/agencies/${o.id}`} className="font-medium text-ink hover:text-pine-700 hover:underline">{o.name}</Link>
                    {o.source === "INVITED" ? <Badge className="ms-2" tone="brand">{t("invited")}</Badge> : null}
                  </TD>
                  <TD className="text-ink-2">{countryName(o.agency_profiles?.country_code)}</TD>
                  <TD className="text-ink-2">
                    <span className="block">{o.agency_profiles?.contact_name ?? "—"}</span>
                    <span className="block text-[12.5px] text-muted">{o.agency_profiles?.contact_email}</span>
                  </TD>
                  <TD><StatusBadge status={o.status} /></TD>
                  <TD className="tabular text-muted">{formatDate(active.key === "pending" ? o.created_at : o.approved_at, tz)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
