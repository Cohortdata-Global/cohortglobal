"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { useAction } from "@/components/app/use-action";
import { resendInvitation, revokeInvitation } from "@/server/actions/invitations";

export function InvitationActions({ id, purpose, email, organizationName, status }: { id: string; purpose: string; email: string; organizationName: string | null; status: string }) {
  const t = useTranslations("invitationActions");
  const tc = useTranslations("common");
  const { pending, run } = useAction();
  if (status !== "PENDING" && status !== "EXPIRED") return null;
  return (
    <Dropdown>
      <DropdownTrigger className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink disabled:opacity-50" disabled={pending} aria-label={tc("actionsFor", { name: email })}>
        <MoreHorizontal className="size-4" />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => run(() => resendInvitation(id, purpose, email, organizationName))}>{t("resend")}</DropdownItem>
        {status === "PENDING" ? <DropdownItem destructive onSelect={() => run(() => revokeInvitation(id))}>{t("revoke")}</DropdownItem> : null}
      </DropdownContent>
    </Dropdown>
  );
}
