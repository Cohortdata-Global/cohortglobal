import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/app-shell";
import { section } from "@/i18n/metadata";
import type { NavGroup } from "@/components/app/sidebar";
import { requireSurface } from "@/server/auth/viewer";

export const generateMetadata = section("workspace");

/** Contributor workspace: agency Members (assigned projects only, #1–#4) and direct freelancers. */
export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireSurface("work");
  const [t, ts] = await Promise.all([getTranslations("nav"), getTranslations("surface")]);
  const freelancer = viewer.roles.includes("DIRECT_FREELANCER");
  const items: NavGroup["items"] = [{ href: "/work", label: freelancer ? t("dashboard") : t("myProjects"), icon: "overview", exact: true }];
  if (freelancer) items.push({ href: "/work/jobs", label: t("jobs"), icon: "jobs" });
  items.push({ href: "/account", label: t("account"), icon: "account" });
  return (
    <AppShell viewer={viewer} groups={[{ items }]} surfaceLabel={freelancer ? ts("freelancer") : ts("member")} homeHref="/work">
      {children}
    </AppShell>
  );
}
