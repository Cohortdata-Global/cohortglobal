"use client";

import { useState } from "react";
import { Check, Pencil, Ban, RotateCcw, Power, X, Crown, MessageSquareText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { ConfirmAction } from "@/components/app/confirm-action";
import { AgencyForm, type AgencyFormValues } from "@/components/flows/agency-form";
import { useAction } from "@/components/app/use-action";
import { adminTransferOwnership, adminUpdateAgency, decideAgency, requestAgencyChanges, setAgencyStatus } from "@/server/actions/agencies";
import { useLabels } from "@/i18n/labels";
import { notify } from "@/lib/notify";

type ReviewDocument = { id: string; document_type: string; file_name: string; status: string };

/**
 * The three review outcomes (ID-42): approve, ask for changes, reject.
 * "Ask for changes" is only offered while the agency is waiting for a decision;
 * once the agency is fixing things the Super Admin can still approve or reject.
 */
export function AgencyDecision({ orgId, name, documents, canAskForChanges = true }: { orgId: string; name: string; documents: ReviewDocument[]; canAskForChanges?: boolean }) {
  const t = useTranslations("agencyAdmin");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction label={t("approve")} variant="primary" icon={<Check />} title={t("approveTitle", { name })}
        description={t("approveBody")}
        action={() => decideAgency(orgId, "APPROVE", "")} />
      {canAskForChanges ? <RequestChangesDialog orgId={orgId} name={name} documents={documents} /> : null}
      <ConfirmAction label={tc("reject")} variant="secondary" icon={<X />} title={t("rejectTitle", { name })}
        description={t("rejectBody")}
        reason={{ label: tc("reason"), placeholder: t("rejectPlaceholder") }} reasonRequired
        confirmLabel={t("rejectButton")} action={(r) => decideAgency(orgId, "REJECT", r)} />
    </div>
  );
}

function RequestChangesDialog({ orgId, name, documents }: { orgId: string; name: string; documents: ReviewDocument[] }) {
  const t = useTranslations("agencyAdmin");
  const tc = useTranslations("common");
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const { pending, run } = useAction();
  const docs = documents.filter((d) => d.status === "ACTIVE");

  function submit() {
    if (message.trim().length < 3) {
      setError(t("askMissing"));
      notify.error(t("askMissingTitle"), t("askMissingDetail"));
      return;
    }
    run(() => requestAgencyChanges(orgId, message.trim(), picked), {
      onError: (r) => setError(r.error),
      onSuccess: () => { setOpen(false); setMessage(""); setPicked([]); },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(undefined); }}>
      <DialogTrigger asChild><Button variant="secondary"><MessageSquareText /> {t("askChanges")}</Button></DialogTrigger>
      <DialogContent title={t("askTitle", { name })} description={t("askBody")}>
        <div className="grid gap-5">
          <Field label={t("whatToChange")} htmlFor="changes-message" required error={error}>
            <Textarea id="changes-message" rows={4} value={message} maxLength={2000} autoFocus aria-invalid={!!error}
              onChange={(e) => setMessage(e.target.value)} placeholder={t("whatPlaceholder")} />
          </Field>
          {docs.length > 0 ? (
            <fieldset className="grid gap-1">
              <legend className="mb-1.5 text-sm font-medium text-ink">{t("docsAgain")} <span className="font-normal text-muted">{t("optional")}</span></legend>
              {docs.map((d) => (
                <Checkbox key={d.id} label={labels.docType(d.document_type)} description={d.file_name}
                  checked={picked.includes(d.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))} />
              ))}
              <p className="mt-1 text-[12.5px] text-muted">{t("docsAgainHint")}</p>
            </fieldset>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button loading={pending} onClick={submit}>{t("sendToAgency")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgencyStatusActions({ orgId, name, status }: { orgId: string; name: string; status: string }) {
  const t = useTranslations("agencyAdmin");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-wrap gap-2">
      {status === "ACTIVE" ? (
        <ConfirmAction label={t("suspend")} icon={<Ban />} title={t("suspendTitle", { name })} description={t("suspendBody")}
          reason={{ label: tc("reason") }} reasonRequired confirmLabel={t("suspendButton")} action={(r) => setAgencyStatus(orgId, "SUSPENDED", r)} />
      ) : null}
      {status === "SUSPENDED" || status === "DEACTIVATED" ? (
        <ConfirmAction label={t("reactivate")} icon={<RotateCcw />} title={t("reactivateTitle", { name })} action={(r) => setAgencyStatus(orgId, "ACTIVE", r)} reason={{ label: tc("noteOptional") }} />
      ) : null}
      {status === "ACTIVE" || status === "SUSPENDED" ? (
        <ConfirmAction label={t("deactivate")} variant="danger" icon={<Power />} title={t("deactivateTitle", { name })}
          description={t("deactivateBody")}
          reason={{ label: tc("reason") }} reasonRequired confirmLabel={t("deactivateButton")} action={(r) => setAgencyStatus(orgId, "DEACTIVATED", r)} />
      ) : null}
    </div>
  );
}

export function EditAgencyDialog({ orgId, initial }: { orgId: string; initial: AgencyFormValues }) {
  const t = useTranslations("agencyAdmin");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Pencil /> {t("editProfile")}</Button></DialogTrigger>
      <DialogContent side="right" title={t("editTitle")} description={t("editBody")}>
        <AgencyForm initial={initial} submitLabel={t("saveProfile")} onSubmit={(v) => adminUpdateAgency(orgId, v)} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function TransferOwnershipDialog({ orgId, candidates, hasManager }: { orgId: string; candidates: { membershipId: string; label: string; role: string }[]; hasManager: boolean }) {
  const t = useTranslations("agencyAdmin");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(candidates[0]?.membershipId ?? "");
  const [oldAction, setOldAction] = useState<"MAKE_MANAGER" | "MAKE_MEMBER" | "REMOVE">("MAKE_MEMBER");
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  const targetIsManager = candidates.find((c) => c.membershipId === target)?.role === "AGENCY_MANAGER";
  if (candidates.length === 0) return null;
  const managerTaken = hasManager && !targetIsManager;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Crown /> {t("reassign")}</Button></DialogTrigger>
      <DialogContent title={t("reassignTitle")} description={t("reassignBody")}>
        <div className="grid gap-4">
          <Field label={t("newOwner")} htmlFor="new-owner">
            <Select id="new-owner" value={target} onChange={(e) => setTarget(e.target.value)}>
              {candidates.map((c) => <option key={c.membershipId} value={c.membershipId}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label={t("oldOwnerBecomes")} htmlFor="old-owner">
            <Select id="old-owner" value={oldAction} onChange={(e) => setOldAction(e.target.value as typeof oldAction)}>
              <option value="MAKE_MEMBER">{t("aMember")}</option>
              <option value="MAKE_MANAGER" disabled={managerTaken}>{managerTaken ? t("theManagerTaken") : t("theManager")}</option>
              <option value="REMOVE">{t("removed")}</option>
            </Select>
          </Field>
          <Field label={tc("reason")} htmlFor="own-reason" required>
            <Textarea id="own-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button loading={pending} onClick={() => run(() => adminTransferOwnership(orgId, target, oldAction, reason), { onSuccess: () => setOpen(false) })}>{t("reassign")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
