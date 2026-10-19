"use client";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { useLabels } from "@/i18n/labels";
import { revokeStaffAccess, setStaffRole } from "@/server/actions/staff";

const ROLES = ["OPERATIONS_MANAGER", "PROJECT_MANAGER", "QC_LEAD", "QC_REVIEWER"] as const;

export function StaffActions({ userId, name, role }: { userId: string; name: string; role: string | null }) {
  const t = useTranslations("staffActions");
  const tc = useTranslations("common");
  const labels = useLabels();
  const { pending, run } = useAction();
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={tc("actionsFor", { name })} disabled={pending}><MoreHorizontal /></Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownLabel>{t("changeRole")}</DropdownLabel>
          {ROLES.map((r) => (
            <DropdownItem key={r} disabled={r === role} onSelect={() => run(() => setStaffRole(userId, r))}>
              {r === role ? t("current", { role: labels.role(r) }) : labels.role(r)}
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <DropdownItem destructive onSelect={() => setRemoving(true)}>{t("removeAccess")}</DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent title={t("removeTitle", { name })} description={t("removeBody")}>
          <Field label={tc("reasonOptional")} htmlFor="staff-reason"><Textarea id="staff-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(false)}>{tc("cancel")}</Button>
            <Button variant="danger" loading={pending} onClick={() => run(() => revokeStaffAccess(userId, reason), { onSuccess: () => setRemoving(false) })}>{t("removeButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
