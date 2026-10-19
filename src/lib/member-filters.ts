/** Members list filters (plan B2): search, role and status. Shared by the page and the CSV export. */

type FilterableMember = { role: string; status: string; user: { full_name: string | null; email: string } | null };

const ROLES = ["AGENCY_OWNER", "AGENCY_MANAGER", "AGENCY_MEMBER"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED"] as const;

/** The two filter menus. Words come from the caller's labels (src/i18n/labels.ts). */
export function memberFilters(words: { role: (c: string) => string; status: (c: string) => string; allRoles: string; allStatuses: string }) {
  return [
    { key: "role", label: words.allRoles, options: ROLES.map((r) => ({ value: r, label: words.role(r) })) },
    { key: "status", label: words.allStatuses, options: STATUSES.map((s) => ({ value: s, label: words.status(s) })) },
  ];
}

export function filterMembers<T extends FilterableMember>(members: T[], f: { q?: string; role?: string; status?: string }): T[] {
  const term = (f.q ?? "").trim().toLowerCase();
  return members.filter((m) =>
    (!term || `${m.user?.full_name ?? ""} ${m.user?.email ?? ""}`.toLowerCase().includes(term))
    && (!f.role || m.role === f.role)
    && (!f.status || m.status === f.status));
}
