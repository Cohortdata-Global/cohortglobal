import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Eye, Globe2, Languages, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { ApplyForm, type ApplyQuestion } from "@/components/flows/apply-flow";
import { CollectionPage } from "@/components/collect/collection-page";
import { PROJECT_CONSOLE, requireAnyPermission } from "@/server/auth/viewer";
import { createUserClient } from "@/server/db/user-client";
import { getLabels } from "@/i18n/labels-server";
import { collectionSchema } from "@/lib/collection";
import { countryName } from "@/lib/countries";
import { cn, formatDate } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("preview");
  return { title: t("metaTitle") };
}

type Project = {
  id: string; code: string; title: string; summary: string; description: string; data_type: string; applicant_type: string;
  status: string; opens_at: string | null; closes_at: string | null; required_languages: string[]; required_countries: string[];
  requires_ekyc: boolean; target_count: number | null; question_version: number; collection_version: number;
};

/**
 * Preview (owner request 2026-10-19): what agencies and contributors will see,
 * before publishing. Staff of the project only (RLS). Nothing is sent or uploaded.
 */
export default async function ProjectPreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; device?: string }> }) {
  const viewer = await requireAnyPermission(PROJECT_CONSOLE);
  const { id } = await params;
  const { view = "job", device = "desktop" } = await searchParams;
  const [db, t, tj, labels] = await Promise.all([createUserClient(), getTranslations("preview"), getTranslations("jobs"), getLabels()]);
  const { data } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const tz = viewer.user.timezone;
  const href = (v: string, d = device) => `/preview/projects/${id}?view=${v}&device=${d}`;
  const phone = device === "phone";

  const header = (
    <div className="sticky top-0 z-30 border-b border-line bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href={`/admin/projects/${id}`} className="inline-flex items-center gap-1.5 text-[13.5px] text-white/80 hover:text-white"><ArrowLeft className="size-4" /> {t("back")}</Link>
        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold"><Eye className="size-4" /> {t("title", { code: p.code })}</span>
        <nav className="flex rounded-md bg-white/10 p-0.5 text-[13px]" aria-label={t("views")}>
          {(["job", "collect"] as const).map((v) => (
            <Link key={v} href={href(v)} aria-current={view === v ? "page" : undefined}
              className={cn("rounded-[5px] px-3 py-1 font-medium", view === v ? "bg-white text-ink" : "text-white/80 hover:text-white")}>{t(`view.${v}`)}</Link>
          ))}
        </nav>
        <nav className="ms-auto flex rounded-md bg-white/10 p-0.5" aria-label={t("device")}>
          <Link href={href(view, "desktop")} aria-label={t("desktop")} className={cn("rounded-[5px] px-2 py-1", !phone ? "bg-white text-ink" : "text-white/80")}><Monitor className="size-4" /></Link>
          <Link href={href(view, "phone")} aria-label={t("phone")} className={cn("rounded-[5px] px-2 py-1", phone ? "bg-white text-ink" : "text-white/80")}><Smartphone className="size-4" /></Link>
        </nav>
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (view === "collect") {
    const { data: cv } = p.collection_version > 0
      ? await db.from("project_collection_versions").select("config").eq("project_id", id).eq("version", p.collection_version).maybeSingle()
      : { data: null };
    const parsed = cv ? collectionSchema.safeParse(cv.config) : null;
    body = !parsed ? (
      <Notice tone="attention" title={t("noSetup")} action={<Button asChild size="sm" variant="secondary"><Link href={`/admin/projects/${id}?tab=collection`}>{t("openSetup")}</Link></Button>}>{t("noSetupBody")}</Notice>
    ) : !parsed.success ? (
      <Notice tone="critical" title={t("badSetup")}>{t("badSetupBody")}</Notice>
    ) : (
      <>
        <p className="mb-4 text-[13px] text-muted">{t("collectNote", { version: p.collection_version })}</p>
        <CollectionPage config={parsed.data} mode="preview" imageBase="/api/project-assets/" agency={{ name: t("sampleAgency"), email: "coordinator@agency.example" }} />
      </>
    );
  } else {
    const [{ data: questions }, { data: contracts }] = await Promise.all([
      db.from("project_questions").select("id,prompt,help_text,answer_type,options,required").eq("project_id", id).eq("version", p.question_version).order("position"),
      db.from("project_contract_templates").select("title,body,version").eq("project_id", id).order("version", { ascending: false }).limit(1),
    ]);
    const contract = contracts?.[0] as { title: string; body: string; version: number } | undefined;
    const now = Date.now();
    const closing = p.opens_at && new Date(p.opens_at).getTime() > now ? tj("opens", { date: formatDate(p.opens_at, tz) })
      : p.closes_at ? tj("closes", { date: formatDate(p.closes_at, tz) }) : tj("untilFilled");
    const facts = [
      { icon: <CalendarClock />, label: closing },
      { icon: <Globe2 />, label: p.required_countries.length ? p.required_countries.map(countryName).join(", ") : tj("anyCountry") },
      { icon: <Languages />, label: p.required_languages.length ? p.required_languages.join(", ") : tj("anyLanguage") },
      ...(p.requires_ekyc ? [{ icon: <ShieldCheck />, label: tj("ekyc") }] : []),
    ];
    const asAgency = p.applicant_type !== "INDIVIDUAL";
    body = (
      <>
        <div className="mb-6">
          <h1 className="flex flex-wrap items-center gap-3 font-display text-[26px] font-semibold text-ink">
            <span className="tabular rounded-sm bg-sunken px-2 py-0.5 text-[15px] font-medium text-ink-2">{p.code}</span>{p.title}
          </h1>
          {p.summary ? <p className="mt-1.5 text-[15px] text-ink-2">{p.summary}</p> : null}
        </div>
        <div className={cn("grid gap-6", !phone && "lg:grid-cols-[1.5fr_1fr]")}>
          <div className="grid h-fit gap-6">
            <Panel>
              <PanelHeader title={tj("about")} />
              <PanelBody><div className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-ink-2">{p.description || tj("noDescription")}</div></PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title={tj("apply")} description={asAgency ? tj("applyingForAgency", { org: t("sampleAgency") }) : tj("applyingIndividual")} />
              <PanelBody className="py-5">
                <ApplyForm preview projectId={id} applyingAs={asAgency ? t("sampleAgency") : tj("yourself")}
                  questions={((questions ?? []) as (Omit<ApplyQuestion, "options"> & { options: unknown })[]).map((q) => ({ ...q, options: (q.options as string[]) ?? [] }))} />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title={t("contractTitle")} description={t("contractBody")} />
              <PanelBody>
                {contract ? (
                  <details className="group">
                    <summary className="cursor-pointer text-[14px] font-medium text-pine-700">{t("contractShow", { title: contract.title, version: contract.version })}</summary>
                    <div className="mt-3 whitespace-pre-wrap font-[ui-serif,Georgia,serif] text-[14px] leading-[1.7] text-ink-2">{contract.body}</div>
                  </details>
                ) : <p className="text-[14px] text-amber-700">{t("noContract")}</p>}
              </PanelBody>
            </Panel>
          </div>
          <aside className="grid h-fit gap-4">
            <Panel>
              <PanelBody>
                <ul className="grid gap-3">
                  {facts.map((f) => <li key={f.label} className="flex items-start gap-3 text-[13.5px] text-ink-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted">{f.icon}{f.label}</li>)}
                </ul>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                  <Badge>{labels.dataType(p.data_type)}</Badge>
                  {p.target_count ? <Badge>{tj("target", { count: p.target_count })}</Badge> : null}
                  <Badge tone="brand">{labels.applicantType(p.applicant_type)}</Badge>
                </div>
              </PanelBody>
            </Panel>
          </aside>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      {header}
      {p.status !== "PUBLISHED" ? (
        <div className="border-b border-amber-600/25 bg-amber-50 px-4 py-2 text-center text-[13px] text-amber-800">{t("notPublished", { status: labels.status(p.status) })}</div>
      ) : null}
      <main className={cn("mx-auto px-4 py-8", phone ? "max-w-[420px]" : "max-w-5xl")}>
        <div className={cn(phone && "overflow-hidden rounded-[28px] border-[10px] border-ink bg-paper px-3 py-5 shadow-float")}>{body}</div>
      </main>
    </div>
  );
}
