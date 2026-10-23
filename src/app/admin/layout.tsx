import { getTranslations } from "next-intl/server";
import { AppShell, loadShellData } from "@/components/app/app-shell";
import { section } from "@/i18n/metadata";
import type { NavGroup } from "@/components/app/sidebar";
import { can, canAny, PROJECT_CONSOLE, requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";

export const generateMetadata = section("console");

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireSurface("admin");
  const [db, t, ts] = await Promise.all([createUserClient(), getTranslations("nav"), getTranslations("surface")]);
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [shell, agencies, requests, applications, contracts, qc] = await Promise.all([
    loadShellData(),
    can(viewer, "agency.decide") ? count(db.from("organizations").select("id", { count: "exact", head: true }).eq("type", "AGENCY").eq("status", "PENDING_VERIFICATION")) : 0,
    can(viewer, "agency_request.decide") ? count(db.from("agency_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING")) : 0,
    can(viewer, "application.decide") ? count(db.from("project_applications").select("id", { count: "exact", head: true }).eq("status", "PENDING")) : 0,
    can(viewer, "contract.countersign") ? count(db.from("project_assignments").select("id", { count: "exact", head: true }).eq("status", "AWAITING_COUNTERSIGNATURE")) : 0,
    // QC badge: what waits for assigning (assigners) or my open reviews (reviewers).
    can(viewer, "qc.assign") ? count(db.from("submissions").select("id", { count: "exact", head: true }).eq("status", "READY_FOR_QC"))
      : can(viewer, "qc.review") ? count(db.from("submissions").select("id", { count: "exact", head: true }).eq("status", "IN_REVIEW").eq("qc_assignee", viewer.user.id)) : 0,
  ]);

  const work: NavGroup = { items: [{ href: "/admin", label: t("overview"), icon: "overview", exact: true }] };
  if (canAny(viewer, PROJECT_CONSOLE)) work.items.push({ href: "/admin/projects", label: t("projects"), icon: "projects", badge: applications });
  if (can(viewer, "contract.countersign")) work.items.push({ href: "/admin/contracts", label: t("contracts"), icon: "contracts", badge: contracts });
  if (canAny(viewer, ["qc.assign", "qc.review"])) work.items.push({ href: "/admin/qc", label: t("qc"), icon: "qc", badge: qc });

  const partners: NavGroup = { label: t("partners"), items: [] };
  if (can(viewer, "agency.view_all")) partners.items.push({ href: "/admin/agencies", label: t("agencies"), icon: "agencies", badge: agencies });
  if (can(viewer, "agency_request.decide")) partners.items.push({ href: "/admin/requests", label: t("agencyRequests"), icon: "requests", badge: requests });

  const platform: NavGroup = { label: t("platform"), items: [] };
  if (can(viewer, "staff.invite")) platform.items.push({ href: "/admin/staff", label: t("staff"), icon: "staff" });
  if (can(viewer, "audit.view_all")) platform.items.push({ href: "/admin/audit", label: t("audit"), icon: "audit" });
  platform.items.push({ href: "/account", label: t("account"), icon: "account" });

  return (
    <AppShell viewer={viewer} groups={[work, partners, platform].filter((g) => g.items.length > 0)} surfaceLabel={ts("admin")} homeHref="/admin" shell={shell}>
      {children}
    </AppShell>
  );
}
