import { titled } from "@/i18n/metadata";
import { redirect } from "next/navigation";
import { JobList } from "@/components/app/job-pages";
import { requireSurface } from "@/server/auth/viewer";

export const generateMetadata = titled("jobs");

/** Direct freelancers only. Agency Members don't browse jobs (#1). */
export default async function FreelancerJobs({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireSurface("work");
  if (!viewer.roles.includes("DIRECT_FREELANCER")) redirect("/work");
  const { tab = "open" } = await searchParams;
  return <JobList viewer={viewer} mode="individual" tab={tab} />;
}
