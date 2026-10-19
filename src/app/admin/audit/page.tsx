import { PageHeader } from "@/components/ui/misc";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { FilterBar } from "@/components/app/filter-bar";
import { AuditList } from "@/components/app/timeline";
import { requirePermission } from "@/server/auth/viewer";
import { loadAudit } from "@/server/queries/people";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("audit");

const AREAS = ["agency", "member", "invitation", "project", "application", "contract", "assignment", "staff", "user", "platform"] as const;

/** Platform-wide audit (#30): Super Admin only. Entries are append-only in the database. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; area?: string }> }) {
  const viewer = await requirePermission("audit.view_all");
  const { q = "", area = "" } = await searchParams;
  const [rows, t] = await Promise.all([loadAudit({ q, action: area }, 300), getTranslations("audit")]);
  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />
      <FilterBar searchPlaceholder={t("search")} filters={[{ key: "area", label: t("allAreas"), options: AREAS.map((a) => ({ value: `${a}.`, label: t(`areas.${a}`) })) }]} />
      <Panel>
        <PanelHeader title={rows.length === 300 ? t("latest300") : t("entries", { count: rows.length })} description={t("narrow")} />
        <AuditList rows={rows} timeZone={viewer.user.timezone} empty={q || area ? t("noMatch") : t("nothing")} />
      </Panel>
    </>
  );
}
