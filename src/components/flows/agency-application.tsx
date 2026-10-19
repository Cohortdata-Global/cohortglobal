"use client";

import { useRouter } from "next/navigation";
import { AgencyForm, type AgencyFormValues } from "@/components/flows/agency-form";
import { submitAgencyApplication } from "@/server/actions/onboarding";

/** mode "save": step 1, stores details as a draft. mode "submit": stores details and sends for review. */
export function AgencyApplication({ initial, submitLabel, mode }: { initial: AgencyFormValues; submitLabel: string; mode: "save" | "submit" }) {
  const router = useRouter();
  return <AgencyForm initial={initial} submitLabel={submitLabel} onSubmit={(v) => submitAgencyApplication(v, mode)} onDone={() => router.refresh()} />;
}
