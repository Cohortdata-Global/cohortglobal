import { titled } from "@/i18n/metadata";
import { JobDetail } from "@/components/app/job-pages";
import { requireSurface } from "@/server/auth/viewer";

export const generateMetadata = titled("job");

export default async function AgencyJob({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSurface("agency");
  const { id } = await params;
  return <JobDetail viewer={viewer} mode="agency" projectId={id} />;
}
