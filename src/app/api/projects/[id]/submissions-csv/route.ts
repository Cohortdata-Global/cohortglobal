import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { currentConfig } from "@/server/queries/submissions";
import { toCsv } from "@/lib/utils";

/**
 * CSV of a project's submissions with every profile answer, as the person may
 * see them (RLS: CohortData staff of the project, or the agency's own rows).
 * Same filters as the board.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse((await getTranslations("exportCsv"))("notAllowed"), { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const sp = req.nextUrl.searchParams;
  const [db, { config }] = await Promise.all([createUserClient(), currentConfig(id)]);
  let q = db.from("submissions")
    .select("id,status,contributor_name,contributor_email,profile,main_file_name,duration_seconds,submitted_at,remark,link_id,organization:organizations!submissions_organization_id_fkey(name),link:submission_links!submissions_link_id_fkey(label)")
    .eq("project_id", id).order("submitted_at", { ascending: false }).limit(10000);
  const status = sp.get("status");
  if (status === "IN_QC") q = q.in("status", ["READY_FOR_QC", "IN_REVIEW"]);
  else if (status) q = q.eq("status", status);
  if (sp.get("source") === "link") q = q.not("link_id", "is", null);
  if (sp.get("source") === "member") q = q.is("link_id", null);
  const profile: Record<string, string> = {};
  for (const f of config?.fields ?? []) { const v = sp.get(`f_${f.key}`); if (v) profile[f.key] = v; }
  if (Object.keys(profile).length) q = q.contains("profile", profile);
  const { data } = await q;
  type Row = { id: string; status: string; contributor_name: string; contributor_email: string; profile: Record<string, string>; main_file_name: string | null; duration_seconds: number | null; submitted_at: string; remark: string | null; link_id: string | null; organization: { name: string } | null; link: { label: string } | null };
  const fields = config?.fields ?? [];
  const csv = toCsv(((data ?? []) as unknown as Row[]).map((r) => ({
    submission_id: r.id,
    submitted_at: r.submitted_at,
    status: r.status,
    agency: r.organization?.name ?? "",
    source: r.link_id ? `link${r.link?.label ? `: ${r.link.label}` : ""}` : "member",
    contributor_name: r.contributor_name,
    contributor_email: r.contributor_email,
    file_name: r.main_file_name ?? "",
    duration_seconds: r.duration_seconds ?? "",
    ...Object.fromEntries(fields.map((f) => [f.key, r.profile[f.key] ?? ""])),
    remark: r.remark ?? "",
  })));
  return new NextResponse(csv || "submission_id\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
