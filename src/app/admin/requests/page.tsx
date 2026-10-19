import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader, TabLinks, EmptyState } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { RequestDecision } from "@/components/flows/request-decision";
import { requirePermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { countryName } from "@/lib/countries";
import { formatPhone } from "@/lib/phone";
import { getTranslations } from "next-intl/server";
import { getLabels } from "@/i18n/labels-server";
import { titled } from "@/i18n/metadata";
import { formatDate } from "@/lib/utils";

export const generateMetadata = titled("requests");

const REQUEST_TYPES = ["PROFILE_CHANGE", "DEACTIVATION", "OWNERSHIP_TRANSFER"] as const;
const FIELDS = ["name", "legal_name", "country_code", "registration_number", "tax_id", "website_url", "contact_name", "contact_email", "contact_phone_e164", "address", "description", "languages", "team_size"] as const;

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "country_code") return countryName(String(v));
  if (key === "contact_phone_e164") return formatPhone(String(v));
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requirePermission("agency_request.decide");
  const { tab = "pending" } = await searchParams;
  const [db, t, labels] = await Promise.all([createUserClient(), getTranslations("requests"), getLabels()]);
  const typeNoun = (type: string) => t(`typeNoun.${REQUEST_TYPES.find((x) => x === type) ?? "other"}`);
  const fieldLabel = (k: string) => { const f = FIELDS.find((x) => x === k); return f ? t(`fields.${f}`) : k; };
  const statuses = tab === "pending" ? ["PENDING"] : ["APPROVED", "REJECTED", "CANCELLED"];
  const { data } = await db.from("agency_requests")
    .select("id,type,payload,note,status,requested_at,decided_at,decision_note,organization:organizations!agency_requests_organization_id_fkey(id,name,agency_profiles(*),files:agency_documents!agency_documents_organization_id_fkey(id,file_name)),requester:users!agency_requests_requested_by_fkey(full_name,email),documents:agency_documents!agency_documents_request_fk(id,file_name,document_type,status)")
    .in("status", statuses).order("requested_at", { ascending: tab === "pending" }).limit(100);
  type Profile = Record<string, unknown>;
  type Row = {
    id: string; type: string; payload: { changes?: Record<string, unknown>; to_user_id?: string; remove_document_ids?: string[] }; note: string | null; status: string;
    requested_at: string; decided_at: string | null; decision_note: string | null;
    organization: { id: string; name: string; agency_profiles: Profile | null; files: { id: string; file_name: string }[] } | null;
    requester: { full_name: string | null; email: string } | null;
    documents: { id: string; file_name: string; document_type: string; status: string }[];
  };
  const rows = (data ?? []) as unknown as Row[];
  const tz = viewer.user.timezone;

  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />
      <TabLinks active={tab} tabs={[{ key: "pending", label: t("waiting"), href: "/admin/requests" }, { key: "decided", label: t("decided"), href: "/admin/requests?tab=decided" }]} />
      {rows.length === 0 ? (
        <Panel><EmptyState icon={<Inbox />} title={tab === "pending" ? t("noneWaiting") : t("noneDecided")} /></Panel>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const current = r.organization?.agency_profiles ?? {};
            const changes = Object.entries(r.payload.changes ?? {}).filter(([k, v]) => {
              const before = k === "name" ? r.organization?.name : current[k];
              return JSON.stringify(before ?? null) !== JSON.stringify(v ?? null);
            });
            const removals = (r.payload.remove_document_ids ?? []).map((id) => r.organization?.files?.find((f) => f.id === id)).filter((f): f is { id: string; file_name: string } => !!f);
            return (
              <Panel key={r.id} className="animate-rise">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">
                      <Link href={`/admin/agencies/${r.organization?.id}`} className="hover:text-pine-700 hover:underline">{r.organization?.name}</Link>{" "}
                      <span className="font-normal text-muted">{t("askedFor", { type: typeNoun(r.type) })}</span>
                    </p>
                    <p className="text-[12.5px] text-muted">{t("byAt", { who: r.requester?.full_name ?? r.requester?.email ?? "", when: formatDate(r.requested_at, tz, true) })}</p>
                  </div>
                  {r.status === "PENDING" ? <RequestDecision requestId={r.id} label={typeNoun(r.type)} /> : <StatusBadge status={r.status} />}
                </div>
                <div className="px-5 py-4">
                  {r.note ? <p className="mb-4 rounded-sm bg-paper px-3 py-2 text-[13.5px] text-ink-2">{r.note}</p> : null}
                  {r.type === "PROFILE_CHANGE" ? (
                    changes.length === 0 && r.documents.length === 0 && removals.length === 0 ? <p className="text-[13.5px] text-muted">{t("noChanges")}</p> : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-[12.5px] text-muted"><tr><th className="py-1.5 pe-4 font-medium">{t("field")}</th><th className="py-1.5 pe-4 font-medium">{t("now")}</th><th className="py-1.5 font-medium">{t("requested")}</th></tr></thead>
                          <tbody>
                            {changes.map(([k, v]) => (
                              <tr key={k} className="border-t border-line">
                                <td className="py-2 pe-4 text-ink-2">{fieldLabel(k)}</td>
                                <td className="py-2 pe-4 text-muted line-through decoration-faint">{show(k, k === "name" ? r.organization?.name : current[k])}</td>
                                <td className="py-2 font-medium text-ink">{show(k, v)}</td>
                              </tr>
                            ))}
                            {r.documents.map((d) => (
                              <tr key={d.id} className="border-t border-line">
                                <td className="py-2 pe-4 text-ink-2">{t("newDocument")}</td>
                                <td className="py-2 pe-4 text-muted">—</td>
                                <td className="py-2"><a className="font-medium text-pine-700 hover:underline" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.file_name}</a> <span className="text-muted">({labels.docType(d.document_type)})</span></td>
                              </tr>
                            ))}
                            {removals.map((d) => (
                              <tr key={`rm-${d.id}`} className="border-t border-line">
                                <td className="py-2 pe-4 text-ink-2">{t("removeDocument")}</td>
                                <td className="py-2 pe-4"><a className="text-ink-2 hover:underline" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.file_name}</a></td>
                                <td className="py-2 font-medium text-rose-700">{t("removed")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : r.type === "DEACTIVATION" ? (
                    <p className="text-[13.5px] text-ink-2">{t("deactivationNote")}</p>
                  ) : (
                    <p className="text-[13.5px] text-ink-2">{t("transferNote")}</p>
                  )}
                  {r.decision_note ? <p className="mt-3 text-[13px] text-muted">{t("decisionNote", { note: r.decision_note })}</p> : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
