import { notFound } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader, DetailList } from "@/components/ui/panel";
import { requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("project");

/**
 * A project the contributor may work on: a Member assigned by their agency,
 * or a direct freelancer whose contract both sides signed (#29).
 */
export default async function WorkProject({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSurface("work");
  const { id } = await params;
  const [db, t, tw, labels] = await Promise.all([createUserClient(), getTranslations("workProject"), getTranslations("work"), getLabels()]);
  const freelancer = viewer.roles.includes("DIRECT_FREELANCER");

  let allowed = false;
  if (freelancer) {
    const { count } = await db.from("project_assignments").select("id", { count: "exact", head: true }).eq("project_id", id).eq("user_id", viewer.user.id).eq("status", "ACTIVE");
    allowed = (count ?? 0) > 0;
  } else {
    const { data } = await db.from("member_assignments").select("id,pa:project_assignments!member_assignments_project_assignment_id_fkey(project_id,status)").eq("user_id", viewer.user.id).eq("status", "ASSIGNED");
    allowed = ((data ?? []) as unknown as { pa: { project_id: string; status: string } | null }[]).some((r) => r.pa?.project_id === id && r.pa.status === "ACTIVE");
  }
  if (!allowed) notFound();

  const { data: p } = await db.from("projects").select("id,code,title,summary,description,data_type,closes_at,required_languages,required_countries,requires_ekyc").eq("id", id).maybeSingle();
  if (!p) notFound();
  const tz = viewer.user.timezone;

  return (
    <>
      <PageHeader back={{ href: "/work", label: freelancer ? tw("dashboard") : tw("myProjects") }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{p.code}</span>{p.title}</span>}
        description={p.summary || undefined} />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid h-fit gap-6">
          <Panel>
            <PanelHeader title={t("submissions")} />
            <EmptyState icon={<UploadCloud />} title={t("submissionsSoon")}
              description={t("submissionsBody")} />
          </Panel>
          <Panel>
            <PanelHeader title={t("instructions")} />
            <PanelBody><div className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-ink-2">{p.description || t("noInstructions")}</div></PanelBody>
          </Panel>
        </div>
        <Panel className="h-fit">
          <PanelBody>
            <DetailList className="sm:grid-cols-1" items={[
              { label: t("dataType"), value: labels.dataType(p.data_type) },
              { label: t("countries"), value: (p.required_countries as string[]).map(countryName).join(", ") || t("any") },
              { label: t("languages"), value: (p.required_languages as string[]).join(", ") || t("any") },
              { label: t("ekyc"), value: p.requires_ekyc ? t("ekycRequired") : t("ekycNo") },
              { label: t("ends"), value: p.closes_at ? formatDate(p.closes_at, tz) : t("noEnd") },
            ]} />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
