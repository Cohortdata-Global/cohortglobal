import { NextResponse, type NextRequest } from "next/server";
import { filterMembers } from "@/lib/member-filters";
import { getViewer, homeFor } from "@/server/auth/viewer";
import { loadAgencyPeople } from "@/server/queries/people";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { countryName } from "@/lib/countries";
import { toCsv } from "@/lib/utils";

/** CSV export of the agency's members. Same data and RLS as the members page. */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || homeFor(viewer) !== "/agency" || !viewer.permissions.includes("org.members.view")) {
    return new NextResponse((await getTranslations("exportCsv"))("notAllowed"), { status: 403 });
  }
  const [{ members: all }, labels] = await Promise.all([loadAgencyPeople(viewer.organization!.id), getLabels()]);
  const sp = req.nextUrl.searchParams;
  // Same filters as the members page (B2), so "Export filtered" matches what's on screen.
  const members = filterMembers(all, { q: sp.get("q") ?? "", role: sp.get("role") ?? "", status: sp.get("status") ?? "" });
  const csv = toCsv(members.map((m) => ({
    name: m.user?.full_name ?? "",
    email: m.user?.email ?? "",
    role: labels.role(m.role),
    status: labels.status(m.status),
    country: m.user?.country_code ? countryName(m.user.country_code) : "",
    phone: m.user?.phone_e164 ?? "",
    assigned_projects: m.assignments.filter((a) => a.status === "ASSIGNED").length,
    joined_at: m.joined_at,
  })));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
