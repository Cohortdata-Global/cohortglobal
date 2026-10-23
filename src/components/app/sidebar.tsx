"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, Briefcase, Building2, ClipboardCheck, FileSignature, FolderKanban, Inbox, LayoutDashboard, Menu,
  ScrollText, ShieldCheck, UserCircle, Users, X, ListChecks,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/app/brand";

const ICONS = {
  overview: LayoutDashboard, agencies: Building2, requests: Inbox, projects: FolderKanban, contracts: FileSignature,
  staff: ShieldCheck, audit: ScrollText, members: Users, jobs: Briefcase, agencyProjects: ClipboardCheck,
  profile: Building2, activity: Activity, account: UserCircle, qc: ListChecks,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavList({ groups, pathname, onNavigate }: { groups: NavGroup[]; pathname: string; onNavigate?: () => void }) {
  const t = useTranslations("shell");
  return (
    <nav className="flex flex-col gap-5" aria-label={t("mainNav")}>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label ? <p className="mb-1.5 px-3 text-[12px] text-faint">{g.label}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-md px-3 text-[14px] transition-colors duration-150",
                      active ? "bg-surface font-medium text-ink shadow-raise ring-1 ring-line" : "text-ink-2 hover:bg-sunken hover:text-ink",
                    )}
                  >
                    {active ? <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-pine-600" aria-hidden /> : null}
                    <Icon className={cn("size-4 shrink-0", active ? "text-pine-600" : "text-muted group-hover:text-ink-2")} />
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="tabular ms-auto rounded-xs bg-amber-50 px-1.5 text-[11.5px] font-semibold text-amber-700">{item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ groups, surfaceLabel, homeHref, footer }: { groups: NavGroup[]; surfaceLabel: string; homeHref: string; footer?: React.ReactNode }) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-paper px-3 py-5 lg:flex">
        <div className="mb-7 px-2"><Brand href={homeHref} sub={surfaceLabel} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto"><NavList groups={groups} pathname={pathname} /></div>
        {footer ? <div className="mt-4 border-t border-line pt-4">{footer}</div> : null}
      </aside>

      <div className="flex h-14 items-center justify-between border-b border-line bg-paper px-4 lg:hidden">
        <Brand href={homeHref} sub={surfaceLabel} />
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-ink-2 hover:bg-sunken" aria-label={t("openMenu")}>
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("menu")}>
          <button className="absolute inset-0 bg-ink/30 animate-fade" onClick={() => setOpen(false)} aria-label={t("closeMenu")} />
          <div className="absolute inset-y-0 start-0 flex w-[82%] max-w-xs flex-col bg-paper px-3 py-5 shadow-float animate-[rise_.25s_var(--ease-snap)_both]">
            <div className="mb-6 flex items-center justify-between px-2">
              <Brand href={homeHref} sub={surfaceLabel} />
              <button onClick={() => setOpen(false)} className="rounded-md p-2 text-ink-2 hover:bg-sunken" aria-label={t("closeMenu")}><X className="size-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><NavList groups={groups} pathname={pathname} onNavigate={() => setOpen(false)} /></div>
            {footer ? <div className="mt-4 border-t border-line pt-4">{footer}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
