import "server-only";
import { createUserClient } from "@/server/db/user-client";
import type { AgencyFormValues } from "@/components/flows/agency-form";

export type AgencyProfileRow = {
  organization_id: string; legal_name: string | null; country_code: string | null; registration_number: string | null;
  tax_id: string | null; website_url: string | null; contact_name: string | null; contact_email: string | null;
  contact_phone_e164: string | null; address: string | null; description: string | null; languages: string[];
  team_size: number | null; submitted_at: string | null;
};

export async function loadAgencyProfile(orgId: string) {
  const db = await createUserClient();
  const [{ data: org }, { data: profile }, { data: documents }] = await Promise.all([
    db.from("organizations").select("id,name,status,source,status_reason,status_changed_at,reapply_after,approved_at,created_at").eq("id", orgId).maybeSingle(),
    db.from("agency_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    db.from("agency_documents").select("id,document_type,file_name,mime_type,size_bytes,status,created_at,request_id").eq("organization_id", orgId).order("created_at", { ascending: false }),
  ]);
  return { org, profile: profile as AgencyProfileRow | null, documents: documents ?? [] };
}

export function profileToForm(name: string, p: AgencyProfileRow | null): AgencyFormValues {
  return {
    name,
    legal_name: p?.legal_name ?? "",
    country_code: p?.country_code ?? "",
    registration_number: p?.registration_number ?? "",
    tax_id: p?.tax_id ?? "",
    website_url: p?.website_url ?? "",
    contact_name: p?.contact_name ?? "",
    contact_email: p?.contact_email ?? "",
    contact_phone: p?.contact_phone_e164 ?? "",
    address: p?.address ?? "",
    description: p?.description ?? "",
    languages: (p?.languages ?? []).join(", "),
    team_size: p?.team_size ? String(p.team_size) : "",
  };
}
