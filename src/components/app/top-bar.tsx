"use client";

import Link from "next/link";
import { Bell, KeyRound, LogOut, UserCircle } from "lucide-react";
import { SignOutButton, useClerk } from "@clerk/nextjs";
import { Avatar } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { useLocale, useTranslations } from "next-intl";
import { cn, timeAgo } from "@/lib/utils";
import { markNotificationsRead } from "@/server/actions/notifications";
import { useAction } from "@/components/app/use-action";

export type NotificationItem = { id: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string };

export function TopBar({
  title, notifications, unread, user, roleLabel, orgName,
}: {
  title?: string;
  notifications: NotificationItem[];
  unread: number;
  user: { name: string | null; email: string; avatarUrl: string | null };
  roleLabel: string;
  orgName?: string | null;
}) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const clerk = useClerk();
  const { pending, run } = useAction();
  return (
    <div className="flex h-14 items-center justify-between gap-3 border-b border-line bg-paper/80 px-4 backdrop-blur sm:px-8">
      <p className="truncate text-[13px] text-muted">{title}</p>
      <div className="flex items-center gap-1.5">
        <Dropdown>
          <DropdownTrigger className="relative rounded-md p-2 text-ink-2 transition-colors hover:bg-sunken hover:text-ink" aria-label={unread ? t("notificationsUnread", { count: unread }) : t("notifications")}>
            <Bell className="size-[18px]" />
            {unread > 0 ? <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-amber-600 ring-2 ring-paper" aria-hidden /> : null}
          </DropdownTrigger>
          <DropdownContent className="w-[min(92vw,360px)] p-0">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <span className="text-sm font-semibold">{t("notifications")}</span>
              {unread > 0 ? (
                <button className="text-[12.5px] text-pine-700 hover:underline disabled:opacity-50" disabled={pending}
                  onClick={(e) => { e.preventDefault(); run(() => markNotificationsRead()); }}>
                  {t("markAllRead")}
                </button>
              ) : null}
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-1">
              {notifications.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-muted">{t("allCaughtUp")}</p>
              ) : notifications.map((n) => (
                <DropdownItem key={n.id}>
                  <Link href={n.href ?? "#"} className="flex w-full gap-2.5">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-amber-600")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink">{n.title}</span>
                      {n.body ? <span className="line-clamp-2 block text-[12.5px] text-muted">{n.body}</span> : null}
                      <span className="mt-0.5 block text-[11.5px] text-faint">{timeAgo(n.created_at, new Date(), locale)}</span>
                    </span>
                  </Link>
                </DropdownItem>
              ))}
            </div>
          </DropdownContent>
        </Dropdown>

        <Dropdown>
          <DropdownTrigger className="flex items-center gap-2.5 rounded-md py-1 ps-1 pe-2 transition-colors hover:bg-sunken">
            <Avatar name={user.name ?? user.email} src={user.avatarUrl} size={28} />
            <span className="hidden text-start leading-tight sm:block">
              <span className="block max-w-40 truncate text-[13px] font-medium text-ink">{user.name ?? user.email}</span>
              <span className="block max-w-40 truncate text-[11.5px] text-muted">{orgName ? t("roleAtOrg", { role: roleLabel, org: orgName }) : roleLabel}</span>
            </span>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{user.email}</DropdownLabel>
            <DropdownItem><Link href="/account" className="flex w-full items-center gap-2"><UserCircle /> {t("yourAccount")}</Link></DropdownItem>
            <DropdownItem onSelect={() => clerk.openUserProfile()}><KeyRound /> {t("emailPassword")}</DropdownItem>
            <DropdownSeparator />
            <SignOutButton redirectUrl="/">
              <button className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:size-4"><LogOut /> {t("signOut")}</button>
            </SignOutButton>
          </DropdownContent>
        </Dropdown>
      </div>
    </div>
  );
}
