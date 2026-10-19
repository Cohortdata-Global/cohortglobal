"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, FileVideo, ImageIcon, Mic, PlayCircle, Timer, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SignaturePad } from "@/components/collect/signature-pad";
import { notify } from "@/lib/notify";
import { cn, formatBytes } from "@/lib/utils";
import { KIND_EXTENSIONS, matchingGuides, openOptions, type CollectionConfig, type FileSlot, type Guide } from "@/lib/collection";
import { youtubeEmbedUrl } from "@/lib/video-url";

type Picked = { file: File; seconds: number | null; problem: string | null };

/**
 * The contributor's page (first brief): details and guides → Start session →
 * 5-hour window with consent, signature, files and ID check.
 * Phase 2A uses it as the PM's **preview** (nothing is saved or uploaded);
 * Phase 2B and 2C reuse it for the real collection page and public links.
 */
export function CollectionPage({ config, agency, imageBase, mode }: {
  config: CollectionConfig; agency: { name: string; email: string } | null; imageBase: string; mode: "preview";
}) {
  const t = useTranslations("collect");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"details" | "session">("details");
  const [showInstructions, setShowInstructions] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const guides = useMemo(() => matchingGuides(config, values), [config, values]);
  const quotaFields = useMemo(() => new Set(config.quotas.flatMap((q) => q.when.map((w) => w.field))), [config.quotas]);

  function set(key: string, v: string) {
    setValues((p) => {
      const next = { ...p, [key]: v };
      // A choice can close options in other fields; clear those that are no longer open.
      for (const f of config.fields) {
        if (f.type === "select" && f.key !== key && next[f.key] && !openOptions(config, f, next).includes(next[f.key]!)) delete next[f.key];
      }
      return next;
    });
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function startSession() {
    const next: Record<string, string> = {};
    for (const f of config.fields) {
      const v = (values[f.key] ?? "").trim();
      if (f.required && !v) next[f.key] = t("required");
      else if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) next[f.key] = t("badEmail");
      else if (v && f.type === "phone" && !/^\+?[0-9 ()-]{7,20}$/.test(v)) next[f.key] = t("badPhone");
    }
    setErrors(next);
    if (Object.keys(next).length) {
      notify.error(t("fillFirst"), t("fillFirstDetail", { count: Object.keys(next).length }));
      document.getElementById(`cf-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setStage("session");
    window.scrollTo({ top: 0, behavior: "smooth" });
    notify.success(t("sessionStarted"), t("sessionStartedDetail", { hours: config.limits.sessionHours }));
  }

  const embed = config.intro.videoUrl ? youtubeEmbedUrl(config.intro.videoUrl) : null;

  return (
    <div className="grid gap-5">
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-7">
        {agency ? (
          <div className="mb-5">
            <p className="text-[17px] font-semibold text-ink">{t("agencyName", { name: agency.name })}</p>
            <p className="text-[14px] text-muted">{t("agencyContact")} <span className="font-medium text-ink-2">{agency.email}</span></p>
          </div>
        ) : null}

        {stage === "session" ? <SessionClock hours={config.limits.sessionHours} /> : null}

        {config.intro.notice.trim() ? (
          <div className="mb-5 rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3.5 text-[14px] leading-relaxed text-amber-900">
            <p className="mb-1.5 font-semibold">{t("readFirst")}</p>
            <p className="whitespace-pre-line">{config.intro.notice}</p>
          </div>
        ) : null}

        {config.intro.instructions.trim() || config.intro.videoUrl ? (
          <div className="mb-6 rounded-lg border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="me-1 text-[14px] font-semibold text-ink">{t("uploadGuide")}</span>
              {config.intro.instructions.trim() ? (
                <Button type="button" size="sm" variant="secondary" aria-expanded={showInstructions} onClick={() => setShowInstructions((v) => !v)}>{t("viewInstructions")}</Button>
              ) : null}
              {config.intro.videoUrl ? (
                embed ? <Button type="button" size="sm" aria-expanded={showVideo} onClick={() => setShowVideo((v) => !v)}><PlayCircle /> {t("watchVideo")}</Button>
                  : <Button asChild size="sm"><a href={config.intro.videoUrl} target="_blank" rel="noopener noreferrer"><PlayCircle /> {t("watchVideo")}</a></Button>
              ) : null}
            </div>
            {showInstructions ? <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-[14px] leading-relaxed text-ink-2 animate-rise">{config.intro.instructions}</p> : null}
            {showVideo && embed ? (
              <div className="mt-3 aspect-video overflow-hidden rounded-md border border-line animate-rise">
                <iframe src={embed} title={t("watchVideo")} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Profile */}
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {config.fields.map((f) => {
            const id = `cf-${f.key}`;
            const locked = stage === "session";
            if (f.type === "select") {
              const open = openOptions(config, f, values);
              const limited = quotaFields.has(f.key);
              return (
                <Field key={f.key} label={f.label} htmlFor={id} required={f.required} error={errors[f.key]}
                  hint={limited ? t("demographicHint") : f.help || undefined}>
                  <Select id={id} disabled={locked} value={values[f.key] ?? ""} aria-invalid={!!errors[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">{t("selectPlaceholder", { field: f.label.toLowerCase() })}</option>
                    {open.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
              );
            }
            const type = f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : f.type === "number" ? "number" : "text";
            return (
              <Field key={f.key} label={f.label} htmlFor={id} required={f.required} error={errors[f.key]} hint={f.help || undefined}>
                <Input id={id} type={type} disabled={locked} value={values[f.key] ?? ""} aria-invalid={!!errors[f.key]}
                  autoComplete={f.type === "email" ? "email" : f.key === "full_name" ? "name" : f.type === "phone" ? "tel" : undefined}
                  onChange={(e) => set(f.key, e.target.value)} />
              </Field>
            );
          })}
        </div>

        {guides.length > 0 ? (
          <div className="mt-6 grid gap-4">
            {guides.map((g) => <GuideCard key={g.id} guide={g} imageBase={imageBase} />)}
          </div>
        ) : null}

        {stage === "details" ? (
          <Button type="button" size="lg" className="mt-7 w-full" onClick={startSession}>{t("startSession")}</Button>
        ) : null}
      </section>

      {stage === "session" ? (
        <SessionSteps config={config} mode={mode} onCancel={() => { setStage("details"); notify.info(t("sessionCancelled"), t("sessionCancelledDetail")); }} />
      ) : null}
    </div>
  );
}

function GuideCard({ guide, imageBase }: { guide: Guide; imageBase: string }) {
  const t = useTranslations("collect");
  const embed = guide.videoUrl ? youtubeEmbedUrl(guide.videoUrl) : null;
  return (
    <section className="rounded-lg border border-sky-600/20 bg-sky-50/50 p-4 animate-rise">
      <h3 className="text-[15.5px] font-semibold text-sky-700">{guide.title}</h3>
      {guide.imageIds.length > 0 || guide.videoUrl ? (
        <div className={cn("mt-3 grid gap-4", guide.imageIds.length > 0 && guide.videoUrl ? "md:grid-cols-2" : "")}>
          {guide.imageIds.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-muted">{t("exampleImage")}</p>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-surface p-2">
                {guide.imageIds.map((id) => (
                  <a key={id} href={`${imageBase}${id}`} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${imageBase}${id}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    <span className="absolute end-1.5 top-1.5 hidden rounded-xs bg-ink/70 p-1 text-white group-hover:block"><ExternalLink className="size-3" /></span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          {guide.videoUrl ? (
            <div>
              <p className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-muted">
                {t("exampleVideo")}
                <a href={guide.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">{t("openNewTab")} <ExternalLink className="size-3" /></a>
              </p>
              {embed ? (
                <div className="aspect-video overflow-hidden rounded-md border border-line bg-surface">
                  <iframe src={embed} title={guide.title} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {guide.description.trim() ? (
        <div className="mt-3 rounded-md bg-surface px-3.5 py-3">
          <p className="text-[12.5px] font-medium text-muted">{t("description")}</p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-ink">{guide.description}</p>
        </div>
      ) : null}
    </section>
  );
}

function SessionClock({ hours }: { hours: number }) {
  const t = useTranslations("collect");
  const [end] = useState(() => Date.now() + hours * 3600_000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, end - now);
  const h = Math.floor(left / 3600_000), m = Math.floor((left % 3600_000) / 60_000), s = Math.floor((left % 60_000) / 1000);
  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-pine-600/25 bg-pine-50 px-4 py-3">
      <Timer className="size-5 shrink-0 text-pine-700" />
      <p className="text-[14px] text-pine-900">
        <span className="font-semibold">{t("sessionOpen")}</span>{" "}
        <span className="tabular font-semibold">{`${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}</span> {t("left")}
      </p>
    </div>
  );
}

function SessionSteps({ config, mode, onCancel }: { config: CollectionConfig; mode: "preview"; onCancel: () => void }) {
  const t = useTranslations("collect");
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [files, setFiles] = useState<Record<string, Picked | null>>({});
  const [idFront, setIdFront] = useState<Picked | null>(null);
  const [idBack, setIdBack] = useState<Picked | null>(null);

  const consentOk = !config.consent.enabled || (agreed && (config.consent.signature === "none" || signature !== ""));
  const filesOk = config.files.every((f) => (f.required ? files[f.key] && !files[f.key]!.problem : !files[f.key]?.problem));
  const ekycOk = !config.ekyc.enabled || (idFront && !idFront.problem && (config.ekyc.backSide !== "required" || (idBack && !idBack.problem)) && !idBack?.problem);
  const ready = consentOk && filesOk && ekycOk;

  function submit() {
    if (!ready) { notify.error(t("notReady"), t("notReadyDetail")); return; }
    if (mode === "preview") notify.info(t("previewUpload"), t("previewUploadDetail"));
  }

  return (
    <section className="grid gap-6 rounded-xl border border-line bg-surface p-5 sm:p-7 animate-rise">
      {config.consent.enabled ? (
        <div className="grid gap-4">
          <h2 className="text-[19px] font-semibold text-ink">{config.consent.title || t("consentTitle")}</h2>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-paper px-4 py-3.5 font-[ui-serif,Georgia,serif] text-[14px] leading-[1.7] text-ink-2">{config.consent.text}</div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3.5 text-[14.5px] font-medium text-ink">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-pine-600" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            {config.consent.checkboxLabel || t("consentCheckbox")}
          </label>
          {config.consent.signature !== "none" ? <SignaturePad mode={config.consent.signature} onChange={(v) => setSignature(v.value)} /> : null}
        </div>
      ) : null}

      {config.files.map((slot) => (
        <div key={slot.key} className="grid gap-3 border-t border-line pt-6 first:border-0 first:pt-0">
          <h2 className="text-[19px] font-semibold text-ink">{slot.label}</h2>
          {slot.notice.trim() ? <p className="whitespace-pre-line rounded-lg border-2 border-rose-600/40 bg-rose-50 px-4 py-3 text-[14px] font-medium leading-relaxed text-rose-700">{slot.notice}</p> : null}
          <FilePick slot={slot} value={files[slot.key] ?? null} onChange={(p) => setFiles((x) => ({ ...x, [slot.key]: p }))} />
        </div>
      ))}

      {config.ekyc.enabled ? (
        <div className="grid gap-3 border-t border-line pt-6">
          <h2 className="text-[19px] font-semibold text-ink">{t("ekycTitle")}</h2>
          {config.ekyc.note.trim() ? <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted">{config.ekyc.note}</p> : null}
          <p className="text-[14.5px] font-semibold text-ink">{t("ekycStep")}</p>
          <div className={cn("grid gap-3", config.ekyc.backSide !== "none" && "sm:grid-cols-2")}>
            <FilePick slot={{ key: "id_front", label: t("frontSide"), kind: "image", required: true, maxMb: config.ekyc.maxMb, minSeconds: null, maxSeconds: null, notice: "" }}
              value={idFront} onChange={setIdFront} compact />
            {config.ekyc.backSide !== "none" ? (
              <FilePick slot={{ key: "id_back", label: config.ekyc.backSide === "required" ? t("backSide") : t("backSideOptional"), kind: "image", required: config.ekyc.backSide === "required", maxMb: config.ekyc.maxMb, minSeconds: null, maxSeconds: null, notice: "" }}
                value={idBack} onChange={setIdBack} compact />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
        <Button type="button" variant="secondary" size="lg" onClick={onCancel}>{t("cancelSession")}</Button>
        <Button type="button" size="lg" disabled={!ready} onClick={submit}><Upload /> {t("upload")}</Button>
      </div>
    </section>
  );
}

/** Reads the duration of a picked video or audio file in the browser (Q35: length is checked in the browser for now). */
function readDuration(file: File, kind: FileSlot["kind"]): Promise<number | null> {
  if (kind === "image") return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

function FilePick({ slot, value, onChange, compact = false }: { slot: FileSlot; value: Picked | null; onChange: (p: Picked | null) => void; compact?: boolean }) {
  const t = useTranslations("collect");
  const exts = KIND_EXTENSIONS[slot.kind];
  const accept = slot.kind === "image" && compact ? "image/jpeg,image/png" : exts.map((e) => `.${e}`).join(",") + `,${slot.kind}/*`;
  const Icon = slot.kind === "video" ? FileVideo : slot.kind === "audio" ? Mic : ImageIcon;

  async function pick(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = compact ? ["jpg", "jpeg", "png"] : exts;
    let problem: string | null = null;
    if (!allowed.includes(ext)) problem = t("wrongType", { types: allowed.join(", ").toUpperCase() });
    else if (file.size > slot.maxMb * 1024 * 1024) problem = t("tooBig", { size: formatBytes(file.size), max: slot.maxMb });
    const seconds = problem ? null : await readDuration(file, slot.kind);
    if (!problem && slot.kind !== "image") {
      if (seconds == null) problem = t("noDuration");
      else if (slot.minSeconds != null && seconds < slot.minSeconds) problem = t("tooShort", { seconds: Math.round(seconds), min: slot.minSeconds });
      else if (slot.maxSeconds != null && seconds > slot.maxSeconds) problem = t("tooLong", { seconds: Math.round(seconds), max: slot.maxSeconds });
    }
    onChange({ file, seconds, problem });
    if (problem) notify.error(t("fileProblem"), problem);
  }

  return (
    <div>
      {compact ? <p className="mb-1.5 text-[13.5px] font-semibold text-ink">{slot.label}{slot.required ? <span className="text-rose-600"> *</span> : null}</p> : null}
      <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 text-center transition-colors",
        compact ? "py-7" : "py-9",
        value?.problem ? "border-rose-600/50 bg-rose-50/50" : value ? "border-pine-600/50 bg-pine-50/50" : "border-line-strong bg-paper hover:border-pine-500")}>
        <input type="file" accept={accept} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        {value ? (
          <>
            {value.problem ? <CircleAlert className="size-6 text-rose-600" /> : <CheckCircle2 className="size-6 text-pine-600" />}
            <span className="max-w-full truncate text-[14px] font-medium text-ink">{value.file.name}</span>
            <span className="text-[12.5px] text-muted">
              {formatBytes(value.file.size)}{value.seconds != null ? `, ${t("seconds", { count: Math.round(value.seconds) })}` : ""}
            </span>
            {value.problem ? <span className="text-[12.5px] font-medium text-rose-700">{value.problem}</span> : <span className="text-[12.5px] text-pine-700">{t("looksGood")}</span>}
            <span className="text-[12.5px] text-muted underline">{t("chooseAnother")}</span>
          </>
        ) : (
          <>
            <Icon className="size-6 text-muted" />
            <span className="text-[14.5px] font-medium text-ink-2">{compact ? t("clickToUpload") : t("clickOrDrag", { kind: t(`kind.${slot.kind}`) })}</span>
            <span className="text-[12.5px] text-muted">
              {(compact ? "JPEG, PNG" : exts.join(", ").toUpperCase())}, {t("maxSize", { max: slot.maxMb })}
              {slot.minSeconds != null || slot.maxSeconds != null ? `, ${t("length", { min: slot.minSeconds ?? 0, max: slot.maxSeconds ?? "∞" })}` : ""}
            </span>
          </>
        )}
      </label>
    </div>
  );
}
