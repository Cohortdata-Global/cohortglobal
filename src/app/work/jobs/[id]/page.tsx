import { titled } from "@/i18n/metadata";
import { redirect } from "next/navigation";
import { JobDetail } from "@/components/app/job-pages";
import { requireSurface } from "@/server/auth/viewer";

export const generateMetadata = titled("job");

export default async function FreelancerJob({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSurface("work");
  if (!viewer.roles.includes("DIRECT_FREELANCER")) redirect("/work");
  const { id } = await params;
  return <JobDetail viewer={viewer} mode="individual" projectId={id} />;
}
