import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Link2, Users } from "lucide-react";
import { PageHeader, EmptyState, Avatar, Notice, TabLinks } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { SubmissionsBoard } from "@/components/collect/submissions";
import { CreateLinkDialog, RevokeLink } from "@/components/collect/links-manager";
import { currentConfig } from "@/server/queries/submissions";
import { AssignMemberDialog, UnassignMember } from "@/components/flows/agency-portal-actions";
import { can, requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("project");

type MA = { id: string; status: string; assigned_at: string; membership_id: string; user: { full_name: string | null; email: string } | null };

export default async function AgencyProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireSurface("agency");
  const { id } = await params;
  const sp = await searchParams;
  const tab = ["submissions", "sessions", "links"].includes(sp.tab ?? "") ? sp.tab! : "team";
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

  const base = `/agency/projects/${id}`;
  const tabs = [
    { key: "team", label: t("tabTeam"), href: base },
    ...(can(viewer, "org.submissions.view_all") ? [{ key: "submissions", label: t("tabSubmissions"), href: `${base}?tab=submissions` }, { key: "sessions", label: t("tabSessions"), href: `${base}?tab=sessions` }] : []),
    ...(can(viewer, "org.links.manage") ? [{ key: "links", label: t("tabLinks"), href: `${base}?tab=links` }] : []),
  ];
  const header = (
      <PageHeader back={{ href: "/agency/projects", label: t("title") }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{a.project?.code}</span>{a.project?.title}<StatusBadge status={a.status} labels={{ ACTIVE: t("workOpen") }} /></span>}
        description={a.activated_at ? t("workOpened", { date: formatDate(a.activated_at, tz) }) : undefined}
        actions={<Link href={`/agency/jobs/${id}`} className="text-[13.5px] text-pine-700 hover:underline">{t("jobPage")}</Link>} />
  );

  if (tab === "submissions" && can(viewer, "org.submissions.view_all")) {
    const { config } = await currentConfig(id);
    return (
      <>
        {header}
        <TabLinks active={tab} tabs={tabs} />
        <SubmissionsBoard scope={{ projectId: id, organizationId: org.id }} config={config} searchParams={sp} basePath={`${base}?tab=submissions`}
          detailHref={(sid) => `/agency/submissions/${sid}`} tz={tz} exportHref={`/api/projects/${id}/submissions-csv`} />
      </>
    );
  }
  if (tab === "sessions" && can(viewer, "org.submissions.view_all")) {
    return <>{header}<TabLinks active={tab} tabs={tabs} /><SessionsList projectId={id} orgId={org.id} tz={tz} /></>;
  }
  if (tab === "links" && can(viewer, "org.links.manage")) {
    return <>{header}<TabLinks active={tab} tabs={tabs} /><LinksList projectId={id} orgId={org.id} tz={tz} canCreate={a.status === "ACTIVE" && org.status === "ACTIVE" && a.project?.status === "PUBLISHED"} /></>;
  }

  return (
    <>
      {header}
      <TabLinks active="team" tabs={tabs} />
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
              <div className="grid gap-2">
                <p className="text-[13.5px] text-ink-2">{t("linksBodyLive")}</p>
                {can(viewer, "org.links.manage") ? <Link href={`${base}?tab=links`} className="text-[13.5px] font-medium text-pine-700 hover:underline">{t("openLinks")}</Link> : null}
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>
      {org.status !== "ACTIVE" ? <div className="mt-6"><Notice tone="attention" title={t("locked")} /></div> : null}
    </>
  );
}

/** Open and recent sessions of the agency on this project (2B/2C). */
async function SessionsList({ projectId, orgId, tz }: { projectId: string; orgId: string; tz: string }) {
  const [db, t] = await Promise.all([createUserClient(), getTranslations("agencyProjects")]);
  const { data } = await db.from("collection_sessions")
    .select("id,status,contributor_name,contributor_email,started_at,ends_at,submitted_at,link_id,link:submission_links!collection_sessions_link_id_fkey(label)")
    .eq("project_id", projectId).eq("organization_id", orgId).order("started_at", { ascending: false }).limit(200);
  type Row = { id: string; status: string; contributor_name: string; contributor_email: string; started_at: string; ends_at: string; submitted_at: string | null; link_id: string | null; link: { label: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();
  const state = (r: Row) => (r.status === "ACTIVE" && new Date(r.ends_at).getTime() < now ? "EXPIRED" : r.status);
  return (
    <Panel>
      <PanelHeader title={t("sessionsTitle")} description={t("sessionsBody")} />
      {rows.length === 0 ? <EmptyState icon={<Users />} title={t("noSessions")} /> : (
        <Table>
          <THead><tr><TH>{t("contributor")}</TH><TH>{t("source")}</TH><TH>{t("started")}</TH><TH>{t("endsOrEnded")}</TH><TH>{t("state")}</TH></tr></THead>
          <tbody>
            {rows.map((r) => {
              const st = state(r);
              const left = new Date(r.ends_at).getTime() - now;
              return (
                <TR key={r.id}>
                  <TD><p className="font-medium text-ink">{r.contributor_name}</p><p className="text-[12.5px] text-muted">{r.contributor_email}</p></TD>
                  <TD className="text-ink-2">{r.link_id ? (r.link?.label ? t("viaLinkNamed", { label: r.link.label }) : t("viaLink")) : t("member")}</TD>
                  <TD className="tabular text-muted">{formatDate(r.started_at, tz, true)}</TD>
                  <TD className="tabular text-muted">{st === "ACTIVE" ? t("leftTime", { h: Math.floor(left / 3600000), m: Math.floor((left % 3600000) / 60000) }) : formatDate(r.submitted_at ?? r.ends_at, tz, true)}</TD>
                  <TD><StatusBadge status={st} labels={{ ACTIVE: t("sessionOpen"), SUBMITTED: t("sessionSubmitted"), CANCELLED: t("sessionCancelled"), EXPIRED: t("sessionExpired") }} /></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

/** Public links for agency freelancers (2C). */
async function LinksList({ projectId, orgId, tz, canCreate }: { projectId: string; orgId: string; tz: string; canCreate: boolean }) {
  const [db, t] = await Promise.all([createUserClient(), getTranslations("agencyProjects")]);
  const [{ data }, { data: subs }] = await Promise.all([
    db.from("submission_links").select("id,label,contributor_name,contributor_email,max_submissions,created_at,expires_at,revoked_at,revoke_reason")
      .eq("project_id", projectId).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(300),
    db.from("submissions").select("link_id,status").eq("project_id", projectId).eq("organization_id", orgId).not("link_id", "is", null).limit(5000),
  ]);
  type Row = { id: string; label: string; contributor_name: string | null; contributor_email: string | null; max_submissions: number; created_at: string; expires_at: string; revoked_at: string | null; revoke_reason: string | null };
  const used = new Map<string, number>();
  for (const s of (subs ?? []) as { link_id: string; status: string }[]) used.set(s.link_id, (used.get(s.link_id) ?? 0) + 1);
  const rows = (data ?? []) as Row[];
  const now = Date.now();
  return (
    <Panel>
      <PanelHeader title={t("linksTitle")} description={t("linksTitleBody")} actions={<CreateLinkDialog projectId={projectId} disabled={!canCreate} />} />
      {rows.length === 0 ? <EmptyState icon={<Link2 />} title={t("noLinks")} description={canCreate ? t("noLinksBody") : t("linksClosed")} /> : (
        <Table>
          <THead><tr><TH>{t("linkLabel")}</TH><TH>{t("freelancer")}</TH><TH>{t("submissionsCol")}</TH><TH>{t("expires")}</TH><TH>{t("state")}</TH><TH /></tr></THead>
          <tbody>
            {rows.map((r) => {
              const st = r.revoked_at ? "REVOKED" : new Date(r.expires_at).getTime() < now ? "EXPIRED" : "ACTIVE";
              return (
                <TR key={r.id}>
                  <TD><p className="font-medium text-ink">{r.label || t("noLabel")}</p><p className="text-[12.5px] text-muted">{t("createdOn", { date: formatDate(r.created_at, tz, true) })}</p></TD>
                  <TD>{r.contributor_email ? <><p className="text-ink">{r.contributor_name}</p><p className="text-[12.5px] text-muted">{r.contributor_email}</p></> : <span className="text-muted">{t("notUsedYet")}</span>}</TD>
                  <TD className="tabular text-ink-2">{t("usedOf", { used: used.get(r.id) ?? 0, max: r.max_submissions })}</TD>
                  <TD className="tabular text-muted">{formatDate(r.expires_at, tz, true)}</TD>
                  <TD>
                    <StatusBadge status={st} labels={{ ACTIVE: t("linkActive"), EXPIRED: t("linkExpired"), REVOKED: t("linkOff") }} />
                    {r.revoke_reason ? <p className="mt-1 max-w-[12rem] text-[12px] text-muted">{r.revoke_reason}</p> : null}
                  </TD>
                  <TD className="text-end">{st === "ACTIVE" ? <RevokeLink linkId={r.id} label={r.label || t("noLabel")} /> : <Badge>{t("closed")}</Badge>}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
