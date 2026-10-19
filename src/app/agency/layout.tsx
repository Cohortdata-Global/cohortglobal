import { getTranslations } from "next-intl/server";
import { AppShell, loadShellData } from "@/components/app/app-shell";
import { section } from "@/i18n/metadata";
import type { NavGroup } from "@/components/app/sidebar";
import { Notice } from "@/components/ui/misc";
import { can, requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";

export const generateMetadata = section("agency");

/** Agency portal: Owner and Manager. Members are routed to /work (homeFor). */
export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireSurface("agency");
  const org = viewer.organization!;
  const [db, t, ts, tl] = await Promise.all([createUserClient(), getTranslations("nav"), getTranslations("surface"), getTranslations("agencyLayout")]);
  const [shell, { count: toSign }] = await Promise.all([
    loadShellData(),
    db.from("project_assignments").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "AWAITING_SIGNATURE"),
  ]);

  const work: NavGroup = { items: [
    { href: "/agency", label: t("dashboard"), icon: "overview", exact: true },
    { href: "/agency/jobs", label: t("jobs"), icon: "jobs", badge: can(viewer, "org.contract.sign") ? toSign ?? 0 : 0 },
    { href: "/agency/projects", label: t("projects"), icon: "agencyProjects" },
  ] };
  const team: NavGroup = { label: t("agency"), items: [
    { href: "/agency/members", label: t("members"), icon: "members" },
    { href: "/agency/profile", label: t("profile"), icon: "profile" },
  ] };
  if (can(viewer, "org.audit.view")) team.items.push({ href: "/agency/activity", label: t("activity"), icon: "activity" });
  team.items.push({ href: "/account", label: t("account"), icon: "account" });

  const banner = org.status === "SUSPENDED" ? (
    <Notice tone="attention" title={tl("suspended")}>
      {org.statusReason ? tl("suspendedReason", { reason: org.statusReason }) : ""}{tl("suspendedBody")}
    </Notice>
  ) : org.status === "DEACTIVATED" ? (
    <Notice tone="critical" title={tl("deactivated")}>{tl("deactivatedBody")}</Notice>
  ) : null;

  return (
    <AppShell viewer={viewer} groups={[work, team]} surfaceLabel={ts("agency")} homeHref="/agency" banner={banner} shell={shell}>
      {children}
    </AppShell>
  );
}
