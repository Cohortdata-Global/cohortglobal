"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/server/errors";

/**
 * Runs a Server Action and reports the result with a pop-up message (ID-46).
 * Actions return ActionResult; they never throw for expected errors.
 */
export function useAction() {
  const t = useTranslations("common");
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, opts?: { success?: string; onSuccess?: (data: T) => void; onError?: (r: Extract<ActionResult<T>, { ok: false }>) => void }) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          const msg = r.message ?? opts?.success;
          if (msg) notify.success(msg, r.detail);
          opts?.onSuccess?.(r.data);
        } else {
          // Form errors: say which field and why, not only "check the fields".
          // Form errors say which field and why; longer messages become a title plus a line of detail.
          const fields = Object.values(r.fieldErrors ?? {});
          if (fields.length) {
            notify.error(t("checkFields"), fields.length > 1 ? t("andMore", { text: fields[0]!, count: fields.length - 1 }) : fields[0]);
          } else {
            const [head, ...rest] = r.error.split(/(?<=[.!?])\s+/);
            notify.error(head ?? r.error, rest.join(" ") || undefined);
          }
          opts?.onError?.(r);
        }
      } catch {
        notify.error(t("offlineTitle"), t("offlineDetail"));
      }
    });
  }
  return { pending, run };
}
