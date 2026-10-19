"use client";

import { useState } from "react";
import { FileText, KeyRound, PencilLine, PowerOff, UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { ConfirmAction } from "@/components/app/confirm-action";
import { useAction } from "@/components/app/use-action";
import { AgencyForm, type AgencyFormValues } from "@/components/flows/agency-form";
import {
  assignMember, cancelAgencyRequest, requestDeactivation, requestOwnershipTransfer, requestProfileChange, unassignMember,
} from "@/server/actions/agencies";

/** Approved agencies change their company details through a request (#7). */
export function ChangeRequestDialog({ initial, documents }: { initial: AgencyFormValues; documents: { id: string; file_name: string }[] }) {
  const t = useTranslations("agencyPortal");
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState<string[]>([]);
  const toggle = (id: string) => setRemove((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><PencilLine /> {t("requestChanges")}</Button></DialogTrigger>
      <DialogContent side="right" title={t("requestTitle")} description={t("requestBody")}>
        {documents.length > 0 ? (
          <fieldset className="mb-7">
            <legend className="mb-2 font-display text-[16px] font-semibold text-ink">{t("removeDocuments")}</legend>
            <ul className="grid gap-1.5">
              {documents.map((d) => (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 text-sm transition-colors hover:bg-sunken has-[:checked]:border-rose-600/40 has-[:checked]:bg-rose-50">
                    <input type="checkbox" className="size-4 accent-rose-600" checked={remove.includes(d.id)} onChange={() => toggle(d.id)} />
                    <FileText className="size-4 text-muted" />
                    <span className="truncate">{d.file_name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
        <AgencyForm initial={initial} submitLabel={t("sendRequest")} withNote onSubmit={(v, note) => requestProfileChange(v, note, remove)} onDone={() => { setOpen(false); setRemove([]); }} />
      </DialogContent>
    </Dialog>
  );
}

export function CancelRequest({ requestId }: { requestId: string }) {
  const t = useTranslations("agencyPortal");
  return <ConfirmAction label={t("cancelRequest")} variant="ghost" size="sm" title={t("cancelTitle")} description={t("cancelBody")} confirmLabel={t("cancelRequest")} action={() => cancelAgencyRequest(requestId)} />;
}

/** Owner only (#9, #10). The Super Admin decides. */
export function OwnerRequests({ hasManager, managerName, pendingTypes }: { hasManager: boolean; managerName: string | null; pendingTypes: string[] }) {
  const t = useTranslations("agencyPortal");
  const tc = useTranslations("common");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-line p-4">
        <p className="font-medium text-ink">{t("transferTitle")}</p>
        <p className="mt-1 text-[13px] text-muted">{hasManager ? t("transferWithManager", { name: managerName ?? t("yourManager") }) : t("transferNoManager")}</p>
        <div className="mt-3">
          <ConfirmAction label={pendingTypes.includes("OWNERSHIP_TRANSFER") ? t("transferRequested") : t("requestTransfer")} size="sm" icon={<KeyRound />}
            disabled={!hasManager || pendingTypes.includes("OWNERSHIP_TRANSFER")} title={t("transferConfirm")}
            description={t("transferConfirmBody")} reason={{ label: tc("noteOptional") }} action={(n) => requestOwnershipTransfer(n)} />
        </div>
      </div>
      <div className="rounded-md border border-line p-4">
        <p className="font-medium text-ink">{t("deactivateTitle")}</p>
        <p className="mt-1 text-[13px] text-muted">{t("deactivateBody")}</p>
        <div className="mt-3">
          <ConfirmAction label={pendingTypes.includes("DEACTIVATION") ? t("deactivationRequested") : t("requestDeactivation")} size="sm" variant="ghost" icon={<PowerOff />}
            disabled={pendingTypes.includes("DEACTIVATION")} title={t("deactivateConfirm")} description={t("deactivateConfirmBody")}
            reason={{ label: tc("reason") }} reasonRequired confirmLabel={t("sendRequest")} action={(n) => requestDeactivation(n)} />
        </div>
      </div>
    </div>
  );
}

/** Assign an agency Member to an active project (Owner or Manager). */
export function AssignMemberDialog({ assignmentId, members }: { assignmentId: string; members: { membershipId: string; label: string }[] }) {
  const t = useTranslations("agencyPortal");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [membershipId, setMembershipId] = useState("");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={members.length === 0}><UserPlus /> {t("assignMember")}</Button></DialogTrigger>
      <DialogContent title={t("assignMember")} description={t("assignBody")}>
        <Field label={t("member")} htmlFor="am-member">
          <Select id="am-member" value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
            <option value="">{t("chooseMember")}</option>
            {members.map((m) => <option key={m.membershipId} value={m.membershipId}>{m.label}</option>)}
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button loading={pending} disabled={!membershipId} onClick={() => run(() => assignMember(assignmentId, membershipId), { onSuccess: () => { setOpen(false); setMembershipId(""); } })}>{t("assign")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnassignMember({ memberAssignmentId, name }: { memberAssignmentId: string; name: string }) {
  const t = useTranslations("agencyPortal");
  return <ConfirmAction label={t("unassign")} size="sm" variant="ghost" icon={<UserMinus />} title={t("unassignTitle", { name })} description={t("unassignBody")} confirmLabel={t("unassign")} action={() => unassignMember(memberAssignmentId)} />;
}
