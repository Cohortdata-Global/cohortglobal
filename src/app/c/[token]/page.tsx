import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CircleAlert, Clock3 } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { StatusBadge } from "@/components/ui/badge";
import { CollectionPage, type ResumeState } from "@/components/collect/collection-page";
import { submissionStatusLabels } from "@/components/collect/submissions";
import { linkProblem, linkQuotaCounts, linkSubmissions, loadLinkConfig, loadLinkResume, lookupLink } from "@/server/collect/core";
import { serverEnv } from "@/server/env";
import type { UploadRole } from "@/lib/collect-profile";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("linkPage");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Public submission link for agency freelancers (2C, ID-55). No account: the
 * link token says which agency and project; a cookie ties the session to this
 * browser. Shows only this link's own submissions and their remarks (#33).
 */
export default async function LinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("linkPage");
  const link = await lookupLink(token);
  const problem = link ? linkProblem(link) : "invalid";
  const [subs, statusLabels] = await Promise.all([link ? linkSubmissions(token) : Promise.resolve([]), submissionStatusLabels()]);

  let body: React.ReactNode;
  if (!link || problem) {
    body = (
      <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
        {problem === "expired" ? <Clock3 className="mx-auto size-8 text-muted" /> : <CircleAlert className="mx-auto size-8 text-muted" />}
        <h1 className="mt-3 font-display text-[22px] font-semibold text-ink">{t(`problem.${problem ?? "invalid"}.title`)}</h1>
        <p className="mx-auto mt-1.5 max-w-md text-[14.5px] text-ink-2">{t(`problem.${problem ?? "invalid"}.body`)}</p>
      </div>
    );
  } else {
    const [config, filled, resumeRaw] = await Promise.all([loadLinkConfig(link), linkQuotaCounts(link.project_id), loadLinkResume(token)]);
    const resume: ResumeState | null = resumeRaw ? {
      sessionId: null, endsAt: resumeRaw.endsAt, profile: resumeRaw.profile, consentSigned: resumeRaw.consentSigned,
      files: resumeRaw.files.filter((f) => f.role !== "SIGNATURE").map((f) => ({ role: f.role as UploadRole, slotKey: f.role === "FILE" ? f.slot_key : f.role === "ID_FRONT" ? "id_front" : "id_back", fileName: f.file_name, size: f.size_bytes, seconds: f.duration_seconds })),
    } : null;
    body = config ? (
      <CollectionPage key={resume ? "session" : "new"} config={config} mode="link" linkToken={token} filled={filled} resume={resume}
        imageBase={`/c/${token}/asset/`} agency={{ name: link.organization_name, email: link.organization_email }}
        storageLimitMb={serverEnv().STORAGE_FILE_LIMIT_MB} />
    ) : (
      <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-ink-2">{t("problem.closed.body")}</div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Brand sub={t("operatedBy")} />
          {link && !problem ? <span className="text-[12.5px] text-muted">{t("validUntil", { date: formatDate(link.expires_at, "UTC", true) })}</span> : null}
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:py-8">
        {body}
        {subs.length ? (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[17px] font-semibold text-ink">{t("yourSubmissions")}</h2>
            <ul className="mt-3 divide-y divide-line">
              {subs.map((s) => (
                <li key={s.submission_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">{s.main_file_name ?? t("submission")}</p>
                    <p className="text-[12.5px] text-muted">{formatDate(s.submitted_at, "UTC", true)}</p>
                    {s.remark ? <p className="mt-1.5 rounded-sm bg-paper px-2.5 py-1.5 text-[13px] text-ink-2">{s.remark}</p> : null}
                  </div>
                  <StatusBadge status={s.status} labels={statusLabels} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
