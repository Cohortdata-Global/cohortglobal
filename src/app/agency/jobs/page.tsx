import { titled } from "@/i18n/metadata";
import { JobList } from "@/components/app/job-pages";
import { requireSurface } from "@/server/auth/viewer";

export const generateMetadata = titled("jobs");

export default async function AgencyJobs({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireSurface("agency");
  const { tab = "open" } = await searchParams;
  return <JobList viewer={viewer} mode="agency" tab={tab} />;
}
