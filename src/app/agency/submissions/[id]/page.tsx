import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SubmissionView } from "@/components/collect/submissions";
import { requireSurface } from "@/server/auth/viewer";
import { loadSubmission } from "@/server/queries/submissions";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("submission");

/** One of the agency's submissions (Q40: own agency only, enforced by RLS). ID documents stay hidden (ID-55). */
export default async function AgencySubmission({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSurface("agency");
  const { id } = await params;
  const [r, t] = await Promise.all([loadSubmission(id), getTranslations("submissions")]);
  if (!r || r.s.organization_id !== viewer.organization?.id) notFound();
  return <SubmissionView s={r.s} config={r.config} tz={viewer.user.timezone} canSeeId={false}
    backHref={`/agency/projects/${r.s.project_id}?tab=submissions`} backLabel={t("backToList")} />;
}
