"use server";

import { revalidatePath } from "next/cache";
import { serverText } from "@/server/i18n";
import { callRpc, requestFingerprint } from "@/server/actions/_rpc";
import { invalid } from "@/server/errors";

export type AnswerValue = string | boolean | string[];

export async function submitApplication(projectId: string, answers: Record<string, AnswerValue>) {
  const t = await serverText();
  const r = await callRpc<string>("submit_application", { p_project: projectId, p_answers: answers }, t.done("applicationSent"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function withdrawApplication(applicationId: string) {
  const t = await serverText();
  const r = await callRpc("withdraw_application", { p_application: applicationId }, t.done("applicationWithdrawn"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function signContract(assignmentId: string, signerName: string, agreed: boolean) {
  const t = await serverText();
  if (!agreed) return invalid({ agree: t.invalid("agree") });
  if (signerName.trim().length < 2) return invalid({ signer_name: t.invalid("signerName") });
  const fp = await requestFingerprint();
  const r = await callRpc("sign_contract", { p_assignment: assignmentId, p_signer_name: signerName.trim(), p_ip: fp.ip, p_user_agent: fp.userAgent },
    t.done("contractSigned"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
