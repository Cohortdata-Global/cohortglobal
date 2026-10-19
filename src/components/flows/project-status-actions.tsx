"use client";

import { Archive, CheckCircle2, Pause, Play, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/app/confirm-action";
import { setProjectStatus } from "@/server/actions/projects";

export function ProjectStatusActions({ projectId, status, title }: { projectId: string; status: string; title: string }) {
  const t = useTranslations("projectStatus");
  const tc = useTranslations("common");
  const go = (s: string) => (reason: string) => setProjectStatus(projectId, s, reason);
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <ConfirmAction label={t("publish")} variant="primary" icon={<Send />} title={t("publishTitle", { title })}
          description={t("publishBody")} action={go("PUBLISHED")} />
      ) : null}
      {status === "PUBLISHED" ? <ConfirmAction label={t("pause")} icon={<Pause />} title={t("pauseTitle")} description={t("pauseBody")} action={go("PAUSED")} reason={{ label: tc("noteOptional") }} /> : null}
      {status === "PAUSED" || status === "COMPLETED" ? <ConfirmAction label={t("reopen")} variant="primary" icon={<Play />} title={t("reopenTitle")} action={go("PUBLISHED")} /> : null}
      {status === "PUBLISHED" || status === "PAUSED" ? <ConfirmAction label={t("complete")} icon={<CheckCircle2 />} title={t("completeTitle")} description={t("completeBody")} action={go("COMPLETED")} reason={{ label: tc("noteOptional") }} /> : null}
      {status !== "ARCHIVED" ? (
        <ConfirmAction label={t("archive")} variant="ghost" icon={<Archive />} title={t("archiveTitle")} description={t("archiveBody")}
          reason={{ label: tc("reason") }} reasonRequired confirmLabel={t("archiveButton")} action={go("ARCHIVED")} />
      ) : null}
    </div>
  );
}
