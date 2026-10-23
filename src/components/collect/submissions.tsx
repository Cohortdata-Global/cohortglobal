import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Download, FileVideo, Flag, Inbox, Link2, Lock, Share2, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/misc";
import { FilterBar } from "@/components/app/filter-bar";
import { Timeline } from "@/components/app/timeline";
import { loadEvents } from "@/server/queries/people";
import { createUserClient } from "@/server/db/user-client";
import { loadSubmissions, PAGE_SIZE, type SubmissionDetail, type SubmissionFilter } from "@/server/queries/submissions";
import type { CollectionConfig } from "@/lib/collection";
import { cn, formatBytes, formatDate } from "@/lib/utils";

/** Status words for submissions (labels.status covers the shared ones). */
export async function submissionStatusLabels() {
  const t = await getTranslations("submissions");
  return {
    PENDING: t("status.PENDING"), READY_FOR_QC: t("status.READY_FOR_QC"), IN_REVIEW: t("status.IN_REVIEW"), APPROVED: t("status.APPROVED"),
    REJECTED: t("status.REJECTED"), RESUBMIT_REQUESTED: t("status.RESUBMIT_REQUESTED"), REPLACED: t("status.REPLACED"), DELIVERED: t("status.DELIVERED"), WITHDRAWN: t("status.WITHDRAWN"),
  } as Record<string, string>;
}

/** Plain <img>: files are short-lived signed links, so Next's image optimizer can't cache them. */
function Img({ alt = "", ...p }: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...p} />;
}

const SEGMENT_TONES = ["bg-pine-50 text-pine-700", "bg-sky-50 text-sky-700", "bg-amber-50 text-amber-700", "bg-rose-50 text-rose-700", "bg-leaf-50 text-leaf-600", "bg-sunken text-ink-2"];

function segments(config: CollectionConfig | null, profile: Record<string, string>) {
  if (!config) return [];
  return config.fields.filter((f) => f.type === "select" && profile[f.key]).map((f, i) => ({ key: f.key, label: f.label, value: profile[f.key]!, tone: SEGMENT_TONES[i % SEGMENT_TONES.length]! }));
}

/**
 * The submissions board (first-brief screenshots): status counts, filters by
 * status, source, search and every profile option, and the list. RLS decides rows.
 */
export async function SubmissionsBoard({ scope, config, searchParams, basePath, detailHref, tz, showAgency = false, showSource = true, exportHref }: {
  scope: Pick<SubmissionFilter, "projectId" | "organizationId" | "collectorUserId">;
  config: CollectionConfig | null;
  searchParams: Record<string, string | undefined>;
  basePath: string;
  detailHref: (id: string) => string;
  tz: string;
  showAgency?: boolean;
  showSource?: boolean;
  exportHref?: string;
}) {
  const [t, statusLabels] = await Promise.all([getTranslations("submissions"), submissionStatusLabels()]);
  const profileFilter: Record<string, string> = {};
  for (const f of config?.fields ?? []) {
    const v = searchParams[`f_${f.key}`];
    if (f.type === "select" && v && f.options.includes(v)) profileFilter[f.key] = v;
  }
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const { rows, total, counts, all } = await loadSubmissions({
    ...scope, status: searchParams.status, q: searchParams.q, source: searchParams.source, profile: profileFilter, page,
  });
  const c = (...s: string[]) => s.reduce((n, k) => n + (counts[k] ?? 0), 0);
  const cards = [
    { key: "", label: t("cards.total"), value: all, tone: "border-line bg-surface text-ink" },
    { key: "PENDING", label: t("cards.pending"), value: c("PENDING"), tone: "border-amber-600/25 bg-amber-50/60 text-amber-800" },
    { key: "IN_QC", label: t("cards.inQc"), value: c("READY_FOR_QC", "IN_REVIEW"), tone: "border-sky-600/20 bg-sky-50/60 text-sky-700" },
    { key: "APPROVED", label: t("cards.approved"), value: c("APPROVED"), tone: "border-pine-600/25 bg-pine-50/70 text-pine-700" },
    { key: "RESUBMIT_REQUESTED", label: t("cards.resubmit"), value: c("RESUBMIT_REQUESTED"), tone: "border-amber-600/25 bg-amber-50/60 text-amber-800" },
    { key: "REJECTED", label: t("cards.rejected"), value: c("REJECTED"), tone: "border-rose-600/20 bg-rose-50/60 text-rose-700" },
    { key: "DELIVERED", label: t("cards.delivered"), value: c("DELIVERED"), tone: "border-line bg-surface text-ink-2" },
  ];
  const link = (status: string) => {
    const sp = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "tab" && k !== "page" && k !== "status") as [string, string][]);
    if (status) sp.set("status", status);
    return `${basePath}${basePath.includes("?") ? "&" : "?"}${sp.toString()}`;
  };
  const pageHref = (n: number) => {
    const sp = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "tab" && k !== "page") as [string, string][]);
    sp.set("page", String(n));
    return `${basePath}${basePath.includes("?") ? "&" : "?"}${sp.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selects = (config?.fields ?? []).filter((f) => f.type === "select");

  return (
    <div className="grid gap-5">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
        {cards.map((k) => {
          const active = (searchParams.status ?? "") === k.key;
          return (
            <li key={k.key || "all"}>
              <Link href={link(k.key)} aria-current={active ? "true" : undefined}
                className={cn("flex h-full flex-col rounded-lg border px-3.5 py-3 transition-[border-color,box-shadow,translate] duration-150 hover:-translate-y-px", k.tone,
                  active && "ring-2 ring-pine-600/50")}>
                <span className="text-[12.5px] font-medium opacity-90">{k.label}</span>
                <span className="tabular mt-1.5 font-display text-[26px] font-semibold leading-none">{k.value}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterBar className="mb-0 flex-1" searchPlaceholder={t("search")}
          filters={[
            { key: "status", label: t("anyStatus"), options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })) },
            ...(showSource ? [{ key: "source", label: t("anySource"), options: [{ value: "member", label: t("sourceMember") }, { value: "link", label: t("sourceLink") }] }] : []),
            ...selects.map((f) => ({ key: `f_${f.key}`, label: f.label, options: f.options.map((o) => ({ value: o, label: o })) })),
          ]} />
        {exportHref ? (
          <Button asChild variant="secondary" size="sm"><a href={`${exportHref}?${new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "page" && k !== "tab") as [string, string][]).toString()}`}><Download /> {t("export")}</a></Button>
        ) : null}
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox />} title={all === 0 ? t("none") : t("noMatch")} description={all === 0 ? t("noneBody") : undefined} />
        ) : (
          <Table>
            <THead><tr>
              <TH>{t("col.file")}</TH><TH>{t("col.collector")}</TH><TH>{t("col.segment")}</TH><TH>{t("col.status")}</TH><TH>{t("col.length")}</TH><TH>{t("col.submitted")}</TH>
            </tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={detailHref(r.id)} className="group flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-ink text-white/90"><FileVideo className="size-4" /></span>
                      <span className="min-w-0">
                        <span className="block max-w-[14rem] truncate font-medium text-ink group-hover:text-pine-700 group-hover:underline">{r.main_file_name ?? t("noFile")}</span>
                        <span className="tabular block text-[12px] text-muted">{r.id.slice(0, 8)}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    <span className="block font-medium text-ink">{r.contributor_name}</span>
                    <span className="block text-[12.5px] text-muted">{r.contributor_email}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted">
                      {r.link_id ? <><Link2 className="size-3" /> {r.link?.label ? t("viaLinkNamed", { label: r.link.label }) : t("viaLink")}</> : <><UserRound className="size-3" /> {t("member")}</>}
                      {showAgency && r.organization ? <span>, {r.organization.name}</span> : null}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {segments(config, r.profile).map((sg) => (
                        <span key={sg.key} title={sg.label} className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium", sg.tone)}>{sg.value}</span>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge status={r.status} labels={statusLabels} />
                    {r.remark && ["REJECTED", "RESUBMIT_REQUESTED"].includes(r.status) ? <p className="mt-1 line-clamp-2 max-w-[14rem] text-[12px] text-ink-2">{r.remark}</p> : null}
                  </TD>
                  <TD className="tabular text-ink-2">{r.duration_seconds != null ? t("seconds", { n: Math.round(Number(r.duration_seconds)) }) : "—"}</TD>
                  <TD className="tabular whitespace-nowrap text-muted">{formatDate(r.submitted_at, tz, true)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-2 text-[13.5px]" aria-label={t("pages")}>
          {page > 1 ? <Button asChild variant="ghost" size="icon"><Link href={pageHref(page - 1)} aria-label={t("prev")}><ChevronLeft /></Link></Button> : null}
          <span className="tabular text-ink-2">{t("pageOf", { page, pages })}</span>
          {page < pages ? <Button asChild variant="ghost" size="icon"><Link href={pageHref(page + 1)} aria-label={t("next")}><ChevronRight /></Link></Button> : null}
        </nav>
      ) : null}
    </div>
  );
}

/** One submission (first-brief screenshots): video, status history, details, files. */
export async function SubmissionView({ s, config, tz, backHref, backLabel, canSeeId, staff = false, qcPanel = null }: {
  s: SubmissionDetail; config: CollectionConfig | null; tz: string; backHref: string; backLabel: string; canSeeId: boolean;
  /** CohortData view: shows the automatic checks and marks comments internal/shared. */
  staff?: boolean;
  qcPanel?: React.ReactNode;
}) {
  const db = await createUserClient();
  const [t, tq, statusLabels, events, { data: comments }, { data: checks }] = await Promise.all([
    getTranslations("submissions"), getTranslations("qc"), submissionStatusLabels(), loadEvents({ entityId: s.id }, 50),
    db.from("submission_comments").select("id,body,shared,kind,created_at,author:users!submission_comments_author_id_fkey(full_name,email)").eq("submission_id", s.id).order("created_at"),
    staff ? db.from("submission_checks").select("id,check_code,result,detail,related_submission_id").eq("submission_id", s.id).order("id") : Promise.resolve({ data: [] }),
  ]);
  type Comment = { id: string; body: string; shared: boolean; kind: string; created_at: string; author: { full_name: string | null; email: string } | null };
  type Check = { id: number; check_code: string; result: string; detail: string | null; related_submission_id: string | null };
  const commentRows = (comments ?? []) as unknown as Comment[];
  const checkRows = (checks ?? []) as Check[];
  const video = s.files.find((f) => f.role === "FILE" && f.mime_type.startsWith("video/"));
  const other = s.files.filter((f) => f.role === "FILE" && f !== video);
  const ids = s.files.filter((f) => f.role === "ID_FRONT" || f.role === "ID_BACK");
  const sig = s.files.find((f) => f.role === "SIGNATURE");
  const fieldLabel = (k: string) => config?.fields.find((f) => f.key === k)?.label ?? k;

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-line bg-surface px-5 py-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink"><ChevronLeft className="size-4" /> {backLabel}</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 font-display text-[24px] font-semibold text-ink">
              <span className="truncate">{s.main_file_name ?? t("noFile")}</span>
              <StatusBadge status={s.status} labels={statusLabels} />
            </h1>
            <p className="text-[13.5px] text-muted">{t("submittedOn", { date: formatDate(s.submitted_at, tz, true) })}{s.project ? `, ${s.project.code} ${s.project.title}` : ""}</p>
          </div>
        </div>
      </section>

      {s.remark && ["REJECTED", "RESUBMIT_REQUESTED"].includes(s.status) ? (
        <Notice tone={s.status === "REJECTED" ? "critical" : "attention"} title={s.status === "REJECTED" ? t("rejectedRemark") : t("resubmitRemark")}>{s.remark}</Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid h-fit gap-6">
          <Panel>
            <PanelHeader title={t("videoPreview")} />
            <PanelBody>
              {video ? (
                <video controls preload="metadata" playsInline className="aspect-video w-full rounded-md bg-ink" src={`/api/submission-files/${video.id}`} />
              ) : <p className="text-[13.5px] text-muted">{t("noVideo")}</p>}
              {other.length ? (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {other.map((f) => (
                    <li key={f.id}><a href={`/api/submission-files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block rounded-md border border-line p-2 text-[12.5px] hover:border-line-strong">
                      {f.mime_type.startsWith("image/") ? <Img src={`/api/submission-files/${f.id}`} className="mb-1.5 aspect-[4/3] w-full rounded-sm object-cover" loading="lazy" /> : null}
                      <span className="block truncate text-ink">{f.file_name}</span><span className="text-muted">{formatBytes(f.size_bytes)}</span>
                    </a></li>
                  ))}
                </ul>
              ) : null}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t("metadata")} />
            <PanelBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                <div><dt className="text-[12.5px] text-muted">{t("col.file")}</dt><dd className="mt-0.5 break-all text-[14px] text-ink">{s.main_file_name ?? "—"}</dd></div>
                <div><dt className="text-[12.5px] text-muted">{t("col.collector")}</dt><dd className="mt-0.5 text-[14px] text-ink">{s.contributor_name}<span className="block text-[12.5px] text-muted">{s.contributor_email}</span></dd></div>
                <div><dt className="text-[12.5px] text-muted">{t("source")}</dt><dd className="mt-0.5 text-[14px] text-ink">{s.link_id ? (s.link?.label ? t("viaLinkNamed", { label: s.link.label }) : t("viaLink")) : t("member")}{s.organization ? <span className="block text-[12.5px] text-muted">{s.organization.name}</span> : null}</dd></div>
                <div><dt className="text-[12.5px] text-muted">{t("col.length")}</dt><dd className="tabular mt-0.5 text-[14px] text-ink">{s.duration_seconds != null ? t("seconds", { n: Math.round(Number(s.duration_seconds)) }) : "—"}</dd></div>
                {Object.entries(s.profile).map(([k, v]) => (
                  <div key={k}><dt className="text-[12.5px] text-muted">{fieldLabel(k)}</dt><dd className="mt-0.5 text-[14px] text-ink">{v}</dd></div>
                ))}
              </dl>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t("consentAndId")} />
            <PanelBody className="grid gap-4">
              <p className="text-[14px] text-ink-2">
                {s.session?.consent_signed_at
                  ? t("consentSigned", { date: formatDate(s.session.consent_signed_at, tz, true), how: s.session.consent_signature_kind === "type" ? t("typed", { name: s.session.consent_signature ?? "" }) : s.session.consent_signature_kind === "draw" ? t("drawn") : t("checkbox") })
                  : t("noConsent")}
              </p>
              {sig ? <Img src={`/api/submission-files/${sig.id}`} alt={t("signatureAlt")} className="h-20 w-auto rounded-md border border-line bg-surface p-1" /> : null}
              {canSeeId ? (
                ids.length ? (
                  <div className="flex flex-wrap gap-3">
                    {ids.map((f) => (
                      <a key={f.id} href={`/api/submission-files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block w-40 rounded-md border border-line p-2 text-[12.5px] hover:border-line-strong">
                        <Img src={`/api/submission-files/${f.id}`} className="mb-1.5 aspect-[4/3] w-full rounded-sm object-cover" loading="lazy" />
                        {f.role === "ID_FRONT" ? t("idFront") : t("idBack")}
                      </a>
                    ))}
                  </div>
                ) : <p className="text-[13.5px] text-muted">{t("noId")}</p>
              ) : <p className="text-[13px] text-muted">{t("idHidden")}</p>}
            </PanelBody>
          </Panel>
        </div>

        <aside className="grid h-fit gap-6 lg:sticky lg:top-24">
          {qcPanel}
          {staff && checkRows.length ? (
            <Panel>
              <PanelHeader title={tq("checksTitle")} />
              <ul className="grid gap-2 px-5 py-4">
                {checkRows.map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5 text-[13.5px]">
                    {c.result === "PASS" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-pine-600" /> : c.result === "FLAG" ? <Flag className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />}
                    <span className="min-w-0 text-ink">
                      {tq(`checks.${c.check_code}` as never)}{c.detail ? <span className="text-muted">: {c.detail}</span> : null}
                      {c.related_submission_id ? <Link href={`/admin/submissions/${c.related_submission_id}`} className="ms-1.5 text-[12.5px] text-pine-700 hover:underline">{tq("seeOther")}</Link> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {commentRows.length ? (
            <Panel>
              <PanelHeader title={tq("commentsTitle")} />
              <ul className="grid gap-3 px-5 py-4">
                {commentRows.map((c) => (
                  <li key={c.id} className={cn("rounded-md border px-3.5 py-2.5", c.kind === "DECISION" ? "border-amber-600/25 bg-amber-50/50" : "border-line bg-paper")}>
                    <p className="whitespace-pre-line text-[13.5px] text-ink">{c.body}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      <span>{c.author?.full_name ?? c.author?.email ?? tq("cohortData")}</span>
                      <span>{formatDate(c.created_at, tz, true)}</span>
                      {staff ? (c.shared ? <span className="inline-flex items-center gap-1 text-sky-700"><Share2 className="size-3" /> {tq("sharedTag")}</span> : <span className="inline-flex items-center gap-1"><Lock className="size-3" /> {tq("internalTag")}</span>) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel>
            <PanelHeader title={t("history")} />
            <Timeline events={events} timeZone={tz} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
