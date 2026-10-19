"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/notify";
import { useLabels } from "@/i18n/labels";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { createInvitation, type InvitationInput } from "@/server/actions/invitations";

type Purpose = InvitationInput["purpose"];

export function InviteDialog({
  purposes, organizationId, triggerLabel, title, description, variant = "primary", withName = false,
}: {
  withName?: boolean;
  purposes: { value: Purpose; label: string }[];
  organizationId?: string;
  triggerLabel?: string;
  title: string;
  description?: string;
  variant?: ButtonProps["variant"];
}) {
  const t = useTranslations("invite");
  const tc = useTranslations("common");
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<Purpose>(purposes[0]?.value ?? "AGENCY_MEMBER");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [role, setRole] = useState<"OPERATIONS_MANAGER" | "PROJECT_MANAGER" | "QC_LEAD" | "QC_REVIEWER">("PROJECT_MANAGER");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, run } = useAction();

  function reset() {
    setEmail(""); setName(""); setAgencyName(""); setMessage(""); setErrors({}); setLink(null); setCopied(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    run(() => createInvitation({
      purpose, email, organization_id: organizationId ?? null,
      role_code: purpose === "PLATFORM_STAFF" ? role : null,
      agency_name: purpose === "AGENCY_OWNER" ? agencyName : null,
      message: message || null,
      invitee_name: withName ? name || null : null,
    }), {
      onSuccess: (d) => setLink(d.link),
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button variant={variant}><UserPlus /> {triggerLabel ?? t("trigger")}</Button></DialogTrigger>
      <DialogContent title={title} description={description ?? t("defaultBody")}>
        {link ? (
          <div className="grid gap-4 animate-rise">
            <p className="text-[14px] text-ink-2">{t.rich("ready", { email, b: (c) => <span className="font-medium text-ink">{c}</span> })}</p>
            <div className="flex items-center gap-2 rounded-md border border-line bg-paper p-2">
              <code className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{link}</code>
              <Button size="sm" variant="secondary" onClick={() => {
                navigator.clipboard.writeText(link).then(
                  () => { setCopied(true); notify.success(t("copiedTitle"), t("copiedDetail")); },
                  () => notify.error(t("copyFailed"), t("copyFailedDetail")),
                );
              }}>
                {copied ? <Check /> : <Copy />}{copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>{t("another")}</Button>
              <Button onClick={() => setOpen(false)}>{t("done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {purposes.length > 1 ? (
              <Field label={t("inviteAs")} htmlFor="inv-purpose">
                <Select id="inv-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
                  {purposes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {purpose === "AGENCY_OWNER" ? (
              <Field label={t("agencyName")} htmlFor="inv-agency" required error={errors.agency_name} hint={t("agencyHint")}>
                <Input id="inv-agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
              </Field>
            ) : null}
            {purpose === "PLATFORM_STAFF" ? (
              <Field label={t("role")} htmlFor="inv-role">
                <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  {(["OPERATIONS_MANAGER", "PROJECT_MANAGER", "QC_LEAD", "QC_REVIEWER"] as const).map((r) => <option key={r} value={r}>{labels.role(r)}</option>)}
                </Select>
              </Field>
            ) : null}
            {withName ? (
              <Field label={t("name")} htmlFor="inv-name" hint={t("nameHint")} error={errors.invitee_name}>
                <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </Field>
            ) : null}
            <Field label={t("email")} htmlFor="inv-email" required error={errors.email}>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!withName} aria-invalid={!!errors.email} />
            </Field>
            <Field label={t("message")} htmlFor="inv-msg" hint={t("messageHint")}>
              <Textarea id="inv-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
              <Button type="submit" loading={pending}>{t("send")}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
