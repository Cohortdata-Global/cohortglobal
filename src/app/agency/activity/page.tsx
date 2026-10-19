import { PageHeader } from "@/components/ui/misc";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { FilterBar } from "@/components/app/filter-bar";
import { AuditList } from "@/components/app/timeline";
import { requirePermission } from "@/server/auth/viewer";
import { loadAudit } from "@/server/queries/people";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("activity");

/** The agency's own audit history (#31). Owner and Manager (ID-16). */
export default async function AgencyActivity({ searchParams }: { searchParams: Promise<{ q?: string; area?: string }> }) {
  const viewer = await requirePermission("org.audit.view");
  const { q = "", area = "" } = await searchParams;
  const [rows, t] = await Promise.all([loadAudit({ organizationId: viewer.organization!.id, q, action: area }, 200), getTranslations("activity")]);
  const areas = ["invitation", "member", "application", "contract", "agency"] as const;
  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />
      <FilterBar searchPlaceholder={t("search")} filters={[{ key: "area", label: t("all"), options: areas.map((a) => ({ value: `${a}.`, label: t(`areas.${a}`) })) }]} />
      <Panel>
        <PanelHeader title={t("latest")} />
        <AuditList rows={rows} timeZone={viewer.user.timezone} empty={q || area ? t("noMatch") : t("nothing")} />
      </Panel>
    </>
  );
}
