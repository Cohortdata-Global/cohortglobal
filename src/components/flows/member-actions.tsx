"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/app/use-action";
import { removeMember, setMemberStatus } from "@/server/actions/agencies";

/** Suspend, restore or remove a Manager or Member. The database enforces who may do what. */
export function MemberActions({ membershipId, name, status, canManage }: { membershipId: string; name: string; status: string; canManage: boolean }) {
  const t = useTranslations("memberActions");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<null | "remove" | "suspend">(null);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  if (!canManage || status === "REMOVED") return null;
  const close = () => { setMode(null); setReason(""); };
  return (
    <>
      <Dropdown>
        <DropdownTrigger className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label={tc("actionsFor", { name })}><MoreHorizontal className="size-4" /></DropdownTrigger>
        <DropdownContent>
          {status === "ACTIVE" ? <DropdownItem onSelect={() => setMode("suspend")}>{t("suspend")}</DropdownItem> : null}
          {status === "SUSPENDED" ? <DropdownItem onSelect={() => run(() => setMemberStatus(membershipId, "ACTIVE", ""))}>{t("restore")}</DropdownItem> : null}
          <DropdownItem destructive onSelect={() => setMode("remove")}>{t("remove")}</DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent title={mode === "remove" ? t("removeTitle", { name }) : t("suspendTitle", { name })}
          description={mode === "remove" ? t("removeBody") : t("suspendBody")}>
          <Field label={tc("reason")} htmlFor="m-reason" hint={t("reasonHint")}>
            <Textarea id="m-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>{tc("cancel")}</Button>
            <Button variant={mode === "remove" ? "danger" : "primary"} loading={pending}
              onClick={() => run(() => (mode === "remove" ? removeMember(membershipId, reason) : setMemberStatus(membershipId, "SUSPENDED", reason)), { onSuccess: close })}>
              {mode === "remove" ? t("removeButton") : t("suspendButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
