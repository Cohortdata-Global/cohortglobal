import { Sidebar, type NavGroup } from "@/components/app/sidebar";
import { TopBar, type NotificationItem } from "@/components/app/top-bar";
import { getLabels } from "@/i18n/labels-server";
import { createUserClient } from "@/server/db/user-client";
import { timed } from "@/server/perf";
import type { Viewer } from "@/server/auth/viewer";

export type ShellData = { notifications: NotificationItem[]; unread: number };

/**
 * Notifications for the top bar. Layouts start this together with their own
 * queries (Promise.all) so the page doesn't wait for two rounds of requests.
 */
export async function loadShellData(): Promise<ShellData> {
  const db = await createUserClient();
  const [{ data }, { count }] = await timed("db notifications", Promise.all([
    db.from("notifications").select("id,title,body,href,read_at,created_at").order("created_at", { ascending: false }).limit(15),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]));
  return { notifications: (data ?? []) as NotificationItem[], unread: count ?? 0 };
}

/** Common frame for the three signed-in surfaces. */
export async function AppShell({
  viewer, groups, surfaceLabel, homeHref, banner, shell, children,
}: {
  viewer: Viewer; groups: NavGroup[]; surfaceLabel: string; homeHref: string; banner?: React.ReactNode; shell?: ShellData; children: React.ReactNode;
}) {
  const [{ notifications, unread }, labels] = await Promise.all([shell ?? loadShellData(), getLabels()]);
  const roleLabel = labels.primaryRole(viewer.roles, viewer.membership?.role);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar groups={groups} surfaceLabel={surfaceLabel} homeHref={homeHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={viewer.organization?.name}
          notifications={notifications}
          unread={unread}
          user={{ name: viewer.user.fullName, email: viewer.user.email, avatarUrl: viewer.user.avatarUrl }}
          roleLabel={roleLabel}
          orgName={viewer.organization?.type === "AGENCY" ? viewer.organization.name : null}
        />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-7 sm:px-8 sm:py-9">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}
