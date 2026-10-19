import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader, TabLinks } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { PeopleTable, InvitationsTable } from "@/components/app/people-table";
import { InviteDialog } from "@/components/flows/invite-dialog";
import { BulkInviteDialog, SampleCsvButton } from "@/components/flows/bulk-invite";
import { FilterBar } from "@/components/app/filter-bar";
import { filterMembers, memberFilters } from "@/lib/member-filters";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { can, requireSurface } from "@/server/auth/viewer";
import { loadAgencyPeople } from "@/server/queries/people";

export const generateMetadata = titled("members");

export default async function AgencyMembers({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; role?: string; status?: string }> }) {
  const viewer = await requireSurface("agency");
  const org = viewer.organization!;
  const { tab = "people", q = "", role = "", status = "" } = await searchParams;
  const [{ members, invitations }, t, labels] = await Promise.all([loadAgencyPeople(org.id), getTranslations("members"), getLabels()]);
  const isOwner = viewer.membership?.role === "AGENCY_OWNER";
  const hasManager = members.some((m) => m.role === "AGENCY_MANAGER") || invitations.some((i) => i.purpose === "AGENCY_MANAGER" && i.status === "PENDING");
  const canInvite = can(viewer, "org.members.invite") && org.status === "ACTIVE";

  // Owner manages the Manager and Members; the Manager manages Members only (#5–#7).
  const manageable = can(viewer, "org.members.manage") ? (can(viewer, "org.manager.manage") ? ["AGENCY_MANAGER", "AGENCY_MEMBER"] : ["AGENCY_MEMBER"]) : [];
  const filtered = filterMembers(members, { q, role, status });
  const filtering = filtered.length !== members.length;
  const exportQuery = new URLSearchParams(Object.entries({ q, role, status }).filter(([, v]) => v)).toString();

  const purposes: { value: "AGENCY_MEMBER" | "AGENCY_MANAGER"; label: string }[] = [{ value: "AGENCY_MEMBER", label: labels.role("AGENCY_MEMBER") }];
  if (isOwner && can(viewer, "org.manager.manage") && !hasManager) purposes.push({ value: "AGENCY_MANAGER", label: labels.role("AGENCY_MANAGER") });

  return (
    <>
      <PageHeader title={t("title")} description={t("body")}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/agency/members/export${exportQuery ? `?${exportQuery}` : ""}`} prefetch={false} title={filtering ? t("exportFilteredTitle") : undefined}>
                <Download /> {filtering ? t("exportFiltered") : t("export")}
              </Link>
            </Button>
            {canInvite ? (
              <>
                <SampleCsvButton allowManager={purposes.length > 1} />
                <BulkInviteDialog organizationId={org.id} allowManager={purposes.length > 1} />
                <InviteDialog title={t("inviteTitle")} description={t("inviteBody")} purposes={purposes} organizationId={org.id} triggerLabel={t("invite")} withName />
              </>
            ) : null}
          </>
        } />
      <TabLinks active={tab === "invitations" ? "invitations" : "people"} tabs={[
        { key: "people", label: t("people"), href: "/agency/members", count: members.length },
        { key: "invitations", label: t("invitations"), href: "/agency/members?tab=invitations", count: invitations.filter((i) => i.status === "PENDING").length },
      ]} />
      {tab !== "invitations" ? <FilterBar searchPlaceholder={t("search")} filters={memberFilters({ role: labels.role, status: labels.status, allRoles: t("allRoles"), allStatuses: t("allStatuses") })} /> : null}
      <Panel>
        {tab === "invitations"
          ? <InvitationsTable invitations={invitations} timeZone={viewer.user.timezone} organizationName={org.name} />
          : filtering && filtered.length === 0
            ? <p className="px-5 py-8 text-center text-[13.5px] text-muted">{t("noMatch")}</p>
            : <PeopleTable members={filtered} timeZone={viewer.user.timezone} manageable={manageable} />}
      </Panel>
    </>
  );
}
