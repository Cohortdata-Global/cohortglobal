"use client";

import { useState } from "react";
import { Ban, Check, PenLine, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ConfirmAction } from "@/components/app/confirm-action";
import { useAction } from "@/components/app/use-action";
import { countersignContract, decideApplication, inviteAgencyToProject, revokeAssignment } from "@/server/actions/projects";

/** Invite one approved agency to a project (#19). The agency still applies. */
export function InviteAgencyToProject({ projectId, agencies }: { projectId: string; agencies: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("projectAdmin");
  const tc = useTranslations("common");
  const [orgId, setOrgId] = useState("");
  const [message, setMessage] = useState("");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary" disabled={agencies.length === 0}><Send /> {t("inviteAgency")}</Button></DialogTrigger>
      <DialogContent title={t("inviteTitle")} description={t("inviteBody")}>
        <div className="grid gap-4">
          <Field label={t("agency")} htmlFor="pi-org" required>
            <Select id="pi-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">{t("chooseAgency")}</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label={t("message")} htmlFor="pi-msg" hint={t("messageHint")}>
            <Textarea id="pi-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button loading={pending} disabled={!orgId} onClick={() => run(() => inviteAgencyToProject(projectId, orgId, message), { onSuccess: () => { setOpen(false); setOrgId(""); setMessage(""); } })}>{t("sendInvitation")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Approve or reject one application (#19). Rejection needs a reason the applicant sees. */
export function ApplicationDecision({ applicationId, applicant }: { applicationId: string; applicant: string }) {
  const t = useTranslations("projectAdmin");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction label={tc("approve")} variant="primary" icon={<Check />} title={t("approveTitle", { name: applicant })}
        description={t("approveBody")}
        reason={{ label: t("noteToApplicant") }} action={(r) => decideApplication(applicationId, true, r)} />
      <ConfirmAction label={tc("reject")} variant="danger" icon={<X />} title={t("rejectTitle", { name: applicant })} confirmLabel={t("rejectButton")}
        reason={{ label: tc("reason"), placeholder: t("rejectPlaceholder") }} reasonRequired action={(r) => decideApplication(applicationId, false, r)} />
    </div>
  );
}

/** CohortData countersigns (#28). Click-to-accept with a typed name (#26). */
export function CountersignDialog({ assignmentId, applicant, contractTitle, body, defaultName }: {
  assignmentId: string; applicant: string; contractTitle: string; body: string; defaultName: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("projectAdmin");
  const tc = useTranslations("common");
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><PenLine /> {t("countersign")}</Button></DialogTrigger>
      <DialogContent title={t("countersignTitle", { name: applicant })} description={contractTitle} className="max-w-2xl">
        <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-sunken/60 px-5 py-4 font-[ui-serif,Georgia,serif] text-[14px] leading-[1.7] text-ink-2">{body}</div>
        <div className="mt-4 grid gap-4">
          <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label={t("countersignAgree")} />
          <Field label={t("yourName")} htmlFor="cs-name"><Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button loading={pending} disabled={!agree || name.trim().length < 2} onClick={() => run(() => countersignContract(assignmentId, name.trim()), { onSuccess: () => setOpen(false) })}>{t("countersignButton")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeAssignment({ assignmentId, applicant }: { assignmentId: string; applicant: string }) {
  const t = useTranslations("projectAdmin");
  const tc = useTranslations("common");
  return (
    <ConfirmAction label={t("revoke")} size="sm" variant="ghost" icon={<Ban />} title={t("revokeTitle", { name: applicant })}
      description={t("revokeBody")}
      reason={{ label: tc("reason") }} reasonRequired confirmLabel={t("revoke")} action={(r) => revokeAssignment(assignmentId, r)} />
  );
}
