import { notFound } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { PageHeader, EmptyState, TabLinks } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { CollectionPage, type ResumeState } from "@/components/collect/collection-page";
import { SubmissionsBoard } from "@/components/collect/submissions";
import { requireSurface } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { quotaCounts } from "@/server/collect/core";
import { serverEnv } from "@/server/env";
import { currentConfig, loadMySession } from "@/server/queries/submissions";
import { getTranslations } from "next-intl/server";
import { titled } from "@/i18n/metadata";
import type { UploadRole } from "@/lib/collect-profile";

export const generateMetadata = titled("project");

/**
 * A project the contributor works on (2B, ID-55): an Agency Member assigned by
 * their agency, or a Direct Freelancer whose contract both sides signed.
 * "Collect" is the contributor page; "My submissions" shows status and remarks.
 */
export default async function WorkProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireSurface("work");
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "submissions" ? "submissions" : "collect";
  const [db, t, tw] = await Promise.all([createUserClient(), getTranslations("workProject"), getTranslations("work")]);
  const freelancer = viewer.roles.includes("DIRECT_FREELANCER");

  let allowed = false;
  let agency: { name: string; email: string } | null = null;
  if (freelancer) {
    const { count } = await db.from("project_assignments").select("id", { count: "exact", head: true }).eq("project_id", id).eq("user_id", viewer.user.id).eq("status", "ACTIVE");
    allowed = (count ?? 0) > 0;
  } else {
    const { data } = await db.from("member_assignments").select("id,pa:project_assignments!member_assignments_project_assignment_id_fkey(project_id,status)").eq("user_id", viewer.user.id).eq("status", "ASSIGNED");
    allowed = ((data ?? []) as unknown as { pa: { project_id: string; status: string } | null }[]).some((r) => r.pa?.project_id === id && r.pa.status === "ACTIVE");
    if (viewer.organization) agency = { name: viewer.organization.name, email: "" };
  }
  if (!allowed) notFound();

  const [{ data: p }, { config }] = await Promise.all([
    db.from("projects").select("id,code,title,summary,status").eq("id", id).maybeSingle(),
    currentConfig(id),
  ]);
  if (!p) notFound();
  const base = `/work/projects/${id}`;

  let body: React.ReactNode;
  if (tab === "submissions") {
    body = <SubmissionsBoard scope={{ projectId: id, collectorUserId: viewer.user.id }} config={config} searchParams={sp} basePath={`${base}?tab=submissions`}
      detailHref={(sid) => `/work/submissions/${sid}`} tz={viewer.user.timezone} showSource={false} />;
  } else if (!config || p.status !== "PUBLISHED") {
    body = <Panel><EmptyState icon={<UploadCloud />} title={t("notCollecting")} description={t("notCollectingBody")} /></Panel>;
  } else {
    const [session, filled] = await Promise.all([loadMySession(id, viewer.user.id), quotaCounts(db, id)]);
    const resume: ResumeState | null = session ? {
      sessionId: session.id, endsAt: session.ends_at, profile: session.profile, consentSigned: !!session.consent_signed_at,
      files: session.files.filter((f) => !f.removed_at && f.role !== "SIGNATURE")
        .map((f) => ({ role: f.role as UploadRole, slotKey: f.role === "FILE" ? f.slot_key : f.role === "ID_FRONT" ? "id_front" : "id_back", fileName: f.file_name, size: f.size_bytes, seconds: f.duration_seconds })),
    } : null;
    const defaults: Record<string, string> = {};
    for (const f of config.fields) {
      if (f.type === "email") defaults[f.key] ??= viewer.user.email;
      if (f.key === "full_name" && viewer.user.fullName) defaults[f.key] = viewer.user.fullName;
    }
    body = (
      <div className="mx-auto max-w-3xl">
        <CollectionPage key={session?.id ?? "new"} config={config} mode="live" projectId={id} agency={agency} imageBase="/api/project-assets/"
          filled={filled} resume={resume} defaults={defaults} storageLimitMb={serverEnv().STORAGE_FILE_LIMIT_MB} />
      </div>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/work", label: freelancer ? tw("dashboard") : tw("myProjects") }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{p.code}</span>{p.title}</span>}
        description={p.summary || undefined} />
      <TabLinks active={tab} tabs={[
        { key: "collect", label: t("tabCollect"), href: base },
        { key: "submissions", label: t("tabSubmissions"), href: `${base}?tab=submissions` },
      ]} />
      {body}
    </>
  );
}
