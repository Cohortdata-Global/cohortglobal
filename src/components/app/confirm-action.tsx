"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/server/errors";

/**
 * A button that asks for confirmation (and optionally a reason) before running
 * a Server Action. Used for decisions that are recorded in the audit log.
 */
export function ConfirmAction({
  label, title, description, confirmLabel, reason, reasonRequired = false, variant = "secondary", size = "md",
  action, success, icon, disabled,
}: {
  label: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  reason?: { label: string; placeholder?: string };
  reasonRequired?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  action: (reason: string) => Promise<ActionResult<unknown>>;
  success?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const t = useTranslations("confirm");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { pending, run } = useAction();

  function submit() {
    if (reason && reasonRequired && text.trim().length < 3) {
      setError(t("reasonMissing"));
      notify.error(t("reasonMissingTitle"), t("reasonMissingDetail"));
      return;
    }
    run(() => action(text.trim()), { success, onSuccess: () => { setOpen(false); setText(""); } });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(undefined); }}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>{icon}{label}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        {reason ? (
          <Field label={reason.label} htmlFor="confirm-reason" error={error} required={reasonRequired}>
            <Textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} rows={3} aria-invalid={!!error} autoFocus />
          </Field>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} loading={pending} onClick={submit}>{confirmLabel ?? label}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
