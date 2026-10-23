"use client";

import { useState } from "react";
import { Check, Copy, Link2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { ConfirmAction } from "@/components/app/confirm-action";
import { useAction } from "@/components/app/use-action";
import { notify } from "@/lib/notify";
import { createSubmissionLink, revokeSubmissionLink } from "@/server/actions/collect";

/**
 * Public links for agency freelancers (2C, ID-55): one person per link, valid
 * 24 hours. The link is shown once, right after it is made (only its hash is stored).
 */
export function CreateLinkDialog({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const t = useTranslations("links");
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, run } = useAction();

  function close(o: boolean) {
    setOpen(o);
    if (!o) { setMade(null); setLabel(""); setCopied(false); }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild><Button disabled={disabled}><Plus /> {t("create")}</Button></DialogTrigger>
      <DialogContent title={made ? t("readyTitle") : t("createTitle")} description={made ? t("readyBody") : t("createBody")}>
        {made ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 rounded-md border border-pine-600/30 bg-pine-50 p-2.5">
              <Link2 className="size-4 shrink-0 text-pine-700" />
              <code className="min-w-0 flex-1 truncate text-[13px] text-ink">{made.url}</code>
              <Button size="sm" variant="secondary" onClick={() => {
                navigator.clipboard.writeText(made.url).then(
                  () => { setCopied(true); notify.success(t("copied"), t("copiedDetail")); },
                  () => notify.error(t("copyFailed"), t("copyFailedDetail")),
                );
              }}>{copied ? <Check /> : <Copy />} {copied ? t("copiedShort") : t("copy")}</Button>
            </div>
            <p className="text-[13px] text-muted">{t("onceOnly")}</p>
            <DialogFooter><Button onClick={() => close(false)}>{t("done")}</Button></DialogFooter>
          </div>
        ) : (
          <>
            <Field label={t("label")} htmlFor="link-label" hint={t("labelHint")}>
              <Input id="link-label" value={label} maxLength={120} autoFocus onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} />
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>{t("cancel")}</Button>
              <Button loading={pending} onClick={() => run(() => createSubmissionLink(projectId, label), { onSuccess: (d) => setMade(d) })}>{t("createButton")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeLink({ linkId, label }: { linkId: string; label: string }) {
  const t = useTranslations("links");
  return (
    <ConfirmAction label={t("turnOff")} size="sm" variant="ghost" title={t("turnOffTitle", { label })} description={t("turnOffBody")}
      reason={{ label: t("reasonOptional") }} confirmLabel={t("turnOff")} action={(r) => revokeSubmissionLink(linkId, r)} />
  );
}
