import { PageHeader } from "@/components/ui/misc";
import { Panel, PanelBody } from "@/components/ui/panel";
import { ProjectForm, EMPTY_PROJECT } from "@/components/flows/project-form";
import { requirePermission } from "@/server/auth/viewer";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("newProject");

export default async function NewProjectPage() {
  await requirePermission("project.manage");
  const t = await getTranslations("projects");
  return (
    <>
      <PageHeader back={{ href: "/admin/projects?tab=draft", label: t("title") }} title={t("newTitle")}
        description={t("newBody")} />
      <Panel className="max-w-4xl">
        <PanelBody className="py-6"><ProjectForm initial={EMPTY_PROJECT} /></PanelBody>
      </Panel>
    </>
  );
}
