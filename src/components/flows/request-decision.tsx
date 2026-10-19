"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/app/confirm-action";
import { decideAgencyRequest } from "@/server/actions/agencies";

/** `label` is the request's name in the viewer's language, e.g. "profile change". */
export function RequestDecision({ requestId, label }: { requestId: string; label: string }) {
  const t = useTranslations("requestDecision");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction label={tc("approve")} variant="primary" size="sm" icon={<Check />} title={t("approveTitle", { label })}
        description={t("approveBody")} reason={{ label: tc("noteOptional") }}
        action={(n) => decideAgencyRequest(requestId, true, n)} />
      <ConfirmAction label={tc("reject")} size="sm" icon={<X />} title={t("rejectTitle", { label })} reason={{ label: tc("reason") }} reasonRequired
        confirmLabel={t("rejectButton")} action={(n) => decideAgencyRequest(requestId, false, n)} />
    </div>
  );
}
