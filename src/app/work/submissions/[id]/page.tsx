import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SubmissionView } from "@/components/collect/submissions";
import { Button } from "@/components/ui/button";
import { requireSurface } from "@/server/auth/viewer";
import { loadSubmission } from "@/server/queries/submissions";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("submission");

/** The collector's own submission: status, remarks, files (their own ID included). */
export default async function WorkSubmission({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSurface("work");
  const { id } = await params;
  const [r, t] = await Promise.all([loadSubmission(id), getTranslations("submissions")]);
  if (!r || r.s.collector_user_id !== viewer.user.id) notFound();
  return (
    <>
      {r.s.status === "RESUBMIT_REQUESTED" ? (
        <div className="mb-4 flex justify-end"><Button asChild><Link href={`/work/projects/${r.s.project_id}`}>{t("submitAgain")}</Link></Button></div>
      ) : null}
      <SubmissionView s={r.s} config={r.config} tz={viewer.user.timezone} canSeeId
        backHref={`/work/projects/${r.s.project_id}?tab=submissions`} backLabel={t("backToList")} />
    </>
  );
}
