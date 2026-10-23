"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, ExternalLink, FileVideo, ImageIcon, Loader2, Mic, PlayCircle, Timer, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SignaturePad } from "@/components/collect/signature-pad";
import { notify } from "@/lib/notify";
import { cn, formatBytes } from "@/lib/utils";
import { KIND_EXTENSIONS, matchingGuides, openOptions, type CollectionConfig, type FileSlot, type Guide } from "@/lib/collection";
import { youtubeEmbedUrl } from "@/lib/video-url";
import { uploadToStorage, UploadError } from "@/lib/resumable-upload";
import type { UploadRole } from "@/lib/collect-profile";
import {
  cancelCollectSession, completeCollectUpload, prepareCollectUpload, signCollectConsent, startCollectionSession, startLinkSession, submitCollectSession,
} from "@/server/actions/collect";

export type ResumeState = {
  sessionId: string | null;
  endsAt: string;
  profile: Record<string, string>;
  consentSigned: boolean;
  files: { role: UploadRole; slotKey: string; fileName: string; size: number; seconds: number | null }[];
};

type Mode = "preview" | "live" | "link";
type SessionRef = { sessionId: string } | { linkToken: string };

/**
 * The contributor's page (first brief): details and guides → Start session →
 * 5-hour window with consent, signature, files and ID check → Upload.
 * - preview: the PM's preview; nothing is saved or uploaded (ID-54)
 * - live: logged-in Agency Member or Direct Freelancer (2B)
 * - link: public link, no account (2C)
 */
export function CollectionPage({ config, agency, imageBase, mode, projectId, linkToken, filled = {}, resume = null, defaults = {}, storageLimitMb = 50 }: {
  config: CollectionConfig; agency: { name: string; email: string } | null; imageBase: string; mode: Mode;
  projectId?: string; linkToken?: string; filled?: Record<string, number>; resume?: ResumeState | null; defaults?: Record<string, string>;
  /** Largest file storage accepts (STORAGE_FILE_LIMIT_MB); slots never allow more. */
  storageLimitMb?: number;
}) {
  const t = useTranslations("collect");
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(resume?.profile ?? defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewStarted, setPreviewStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const guides = useMemo(() => matchingGuides(config, values), [config, values]);
  const quotaFields = useMemo(() => new Set(config.quotas.flatMap((q) => q.when.map((w) => w.field))), [config.quotas]);
  const inSession = mode === "preview" ? previewStarted : !!resume;
  const endsAt = resume?.endsAt ?? null;
  const ref: SessionRef | null = mode === "link" && linkToken ? { linkToken } : mode === "live" && resume?.sessionId ? { sessionId: resume.sessionId } : null;

  function set(key: string, v: string) {
    setValues((p) => {
      const next = { ...p, [key]: v };
      for (const f of config.fields) {
        if (f.type === "select" && f.key !== key && next[f.key] && !openOptions(config, f, next, filled).includes(next[f.key]!)) delete next[f.key];
      }
      return next;
    });
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function check(): boolean {
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
      return false;
    }
    return true;
  }

  async function startSession() {
    if (!check()) return;
    if (mode === "preview") {
      setPreviewStarted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      notify.success(t("sessionStarted"), t("sessionStartedDetail", { hours: config.limits.sessionHours }));
      return;
    }
    setStarting(true);
    try {
      const r = mode === "link" ? await startLinkSession(linkToken!, values) : await startCollectionSession(projectId!, values);
      if (!r.ok) {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        notify.error(r.error, Object.values(r.fieldErrors ?? {})[0]);
        return;
      }
      notify.success(r.message ?? t("sessionStarted"), r.detail);
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch {
      notify.error(t("offline"), t("offlineDetail"));
    } finally {
      setStarting(false);
    }
  }

  const embed = config.intro.videoUrl ? youtubeEmbedUrl(config.intro.videoUrl) : null;

  return (
    <div className="grid gap-5">
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-7">
        {agency ? (
          <div className="mb-5">
            <p className="text-[17px] font-semibold text-ink">{t("agencyName", { name: agency.name })}</p>
            {agency.email ? <p className="text-[14px] text-muted">{t("agencyContact")} <span className="font-medium text-ink-2">{agency.email}</span></p> : null}
          </div>
        ) : null}

        {inSession ? <SessionClock endsAt={endsAt} hours={config.limits.sessionHours} /> : null}

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

        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {config.fields.map((f) => {
            const id = `cf-${f.key}`;
            if (f.type === "select") {
              const open = openOptions(config, f, values, filled);
              const shown = inSession && values[f.key] && !open.includes(values[f.key]!) ? [values[f.key]!, ...open] : open;
              return (
                <Field key={f.key} label={f.label} htmlFor={id} required={f.required} error={errors[f.key]}
                  hint={quotaFields.has(f.key) ? t("demographicHint") : f.help || undefined}>
                  <Select id={id} disabled={inSession || starting} value={values[f.key] ?? ""} aria-invalid={!!errors[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">{t("selectPlaceholder", { field: f.label.toLowerCase() })}</option>
                    {shown.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
              );
            }
            const type = f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : f.type === "number" ? "number" : "text";
            return (
              <Field key={f.key} label={f.label} htmlFor={id} required={f.required} error={errors[f.key]} hint={f.help || undefined}>
                <Input id={id} type={type} disabled={inSession || starting} value={values[f.key] ?? ""} aria-invalid={!!errors[f.key]}
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

        {!inSession ? (
          <Button type="button" size="lg" className="mt-7 w-full" loading={starting} onClick={startSession}>{t("startSession")}</Button>
        ) : null}
      </section>

      {inSession ? (
        <SessionSteps config={config} mode={mode} sessionRef={ref} resume={resume} storageLimitMb={storageLimitMb}
          onPreviewCancel={() => { setPreviewStarted(false); notify.info(t("sessionCancelled"), t("sessionCancelledDetail")); }} />
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

function SessionClock({ endsAt, hours }: { endsAt: string | null; hours: number }) {
  const t = useTranslations("collect");
  const [end] = useState(() => (endsAt ? new Date(endsAt).getTime() : Date.now() + hours * 3600_000));
  // The clock starts after the page loads in the browser: the server's time and the browser's differ by a second, which React reports as a mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = now === null ? end : Math.max(0, end - now);
  const h = Math.floor(left / 3600_000), m = Math.floor((left % 3600_000) / 60_000), s = Math.floor((left % 60_000) / 1000);
  return (
    <div className={cn("mb-5 flex items-center gap-3 rounded-lg border px-4 py-3", left < 15 * 60_000 ? "border-amber-600/30 bg-amber-50" : "border-pine-600/25 bg-pine-50")}>
      <Timer className={cn("size-5 shrink-0", left < 15 * 60_000 ? "text-amber-700" : "text-pine-700")} />
      <p className="text-[14px] text-ink">
        {left > 0 ? (
          <><span className="font-semibold">{t("sessionOpen")}</span> <span className="tabular font-semibold">{now === null ? "–:––:––" : `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}</span> {t("left")}</>
        ) : <span className="font-semibold">{t("sessionOver")}</span>}
      </p>
    </div>
  );
}

type Picked = { fileName: string; size: number; seconds: number | null; problem: string | null; progress: number | null; uploaded: boolean };

function SessionSteps({ config, mode, sessionRef, resume, onPreviewCancel, storageLimitMb }: {
  config: CollectionConfig; mode: Mode; sessionRef: SessionRef | null; resume: ResumeState | null; onPreviewCancel: () => void; storageLimitMb: number;
}) {
  const t = useTranslations("collect");
  const router = useRouter();
  const [agreed, setAgreed] = useState(!!resume?.consentSigned);
  const [signature, setSignature] = useState<{ kind: "draw" | "type"; value: string } | null>(null);
  const initial = useMemo(() => {
    const out: Record<string, Picked> = {};
    for (const f of resume?.files ?? []) out[`${f.role}:${f.slotKey}`] = { fileName: f.fileName, size: f.size, seconds: f.seconds, problem: null, progress: null, uploaded: true };
    return out;
  }, [resume]);
  const [files, setFiles] = useState<Record<string, Picked>>(initial);
  const [busy, setBusy] = useState<"submit" | "cancel" | null>(null);
  const [done, setDone] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const consentAlready = !!resume?.consentSigned;

  const slotOk = (role: UploadRole, key: string, required: boolean) => {
    const p = files[`${role}:${key}`];
    if (!p) return !required;
    return !p.problem && (mode === "preview" || p.uploaded);
  };
  const uploading = Object.values(files).some((p) => p.progress != null && !p.uploaded && !p.problem);
  const consentOk = !config.consent.enabled || consentAlready || (agreed && (config.consent.signature === "none" || !!signature?.value));
  const filesOk = config.files.every((f) => slotOk("FILE", f.key, f.required));
  const ekycOk = !config.ekyc.enabled || (slotOk("ID_FRONT", "id_front", true) && slotOk("ID_BACK", "id_back", config.ekyc.backSide === "required"));
  const ready = consentOk && filesOk && ekycOk && !uploading;

  async function submit() {
    if (!ready) { notify.error(uploading ? t("stillUploading") : t("notReady"), uploading ? t("stillUploadingDetail") : t("notReadyDetail")); return; }
    if (mode === "preview") { notify.info(t("previewUpload"), t("previewUploadDetail")); return; }
    if (!sessionRef) return;
    setBusy("submit");
    try {
      if (config.consent.enabled && !consentAlready) {
        const c = await signCollectConsent(sessionRef, signature ? { kind: signature.kind, value: signature.value } : { kind: "none", value: "" });
        if (!c.ok) { notify.error(c.error, Object.values(c.fieldErrors ?? {})[0]); return; }
      }
      const r = await submitCollectSession(sessionRef);
      if (!r.ok) { notify.error(r.error); return; }
      notify.success(r.message ?? t("submittedTitle"), r.detail);
      setDone(true);
      router.refresh();
    } catch {
      notify.error(t("offline"), t("offlineDetail"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (mode === "preview") { onPreviewCancel(); return; }
    if (!sessionRef) return;
    if (!confirmCancel) { setConfirmCancel(true); return; }
    setConfirmCancel(false);
    setBusy("cancel");
    try {
      const r = await cancelCollectSession(sessionRef);
      if (!r.ok) { notify.error(r.error); return; }
      notify.info(r.message ?? t("sessionCancelled"), r.detail);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <section className="grid place-items-center gap-3 rounded-xl border border-pine-600/30 bg-pine-50 px-6 py-12 text-center animate-rise">
        <CheckCircle2 className="size-10 text-pine-600" />
        <h2 className="text-[20px] font-semibold text-ink">{t("submittedTitle")}</h2>
        <p className="max-w-md text-[14.5px] text-ink-2">{t("submittedBody")}</p>
      </section>
    );
  }

  const pick = (role: UploadRole, slot: FileSlot) => (
    <FilePick key={`${role}:${slot.key}`} role={role} slot={{ ...slot, maxMb: Math.min(slot.maxMb, storageLimitMb) }} mode={mode} sessionRef={sessionRef} value={files[`${role}:${slot.key}`] ?? null}
      onChange={(p) => setFiles((x) => ({ ...x, [`${role}:${slot.key}`]: p }))} compact={role !== "FILE"} />
  );

  return (
    <section className="grid gap-6 rounded-xl border border-line bg-surface p-5 sm:p-7 animate-rise">
      {config.consent.enabled ? (
        <div className="grid gap-4">
          <h2 className="text-[19px] font-semibold text-ink">{config.consent.title || t("consentTitle")}</h2>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-paper px-4 py-3.5 font-[ui-serif,Georgia,serif] text-[14px] leading-[1.7] text-ink-2">{config.consent.text}</div>
          {consentAlready ? (
            <p className="flex items-center gap-2 rounded-lg border border-pine-600/30 bg-pine-50 px-3.5 py-3 text-[14px] font-medium text-pine-800"><CheckCircle2 className="size-4" /> {t("consentDone")}</p>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3.5 text-[14.5px] font-medium text-ink">
                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-pine-600" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                {config.consent.checkboxLabel || t("consentCheckbox")}
              </label>
              {config.consent.signature !== "none" ? <SignaturePad mode={config.consent.signature} onChange={(v) => setSignature(v.value ? v : null)} /> : null}
            </>
          )}
        </div>
      ) : null}

      {config.files.map((slot) => (
        <div key={slot.key} className="grid gap-3 border-t border-line pt-6 first:border-0 first:pt-0">
          <h2 className="text-[19px] font-semibold text-ink">{slot.label}</h2>
          {slot.notice.trim() ? <p className="whitespace-pre-line rounded-lg border-2 border-rose-600/40 bg-rose-50 px-4 py-3 text-[14px] font-medium leading-relaxed text-rose-700">{slot.notice}</p> : null}
          {pick("FILE", slot)}
        </div>
      ))}

      {config.ekyc.enabled ? (
        <div className="grid gap-3 border-t border-line pt-6">
          <h2 className="text-[19px] font-semibold text-ink">{t("ekycTitle")}</h2>
          {config.ekyc.note.trim() ? <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted">{config.ekyc.note}</p> : null}
          <p className="text-[14.5px] font-semibold text-ink">{t("ekycStep")}</p>
          <div className={cn("grid gap-3", config.ekyc.backSide !== "none" && "sm:grid-cols-2")}>
            {pick("ID_FRONT", { key: "id_front", label: t("frontSide"), kind: "image", required: true, maxMb: config.ekyc.maxMb, minSeconds: null, maxSeconds: null, notice: "" })}
            {config.ekyc.backSide !== "none"
              ? pick("ID_BACK", { key: "id_back", label: config.ekyc.backSide === "required" ? t("backSide") : t("backSideOptional"), kind: "image", required: config.ekyc.backSide === "required", maxMb: config.ekyc.maxMb, minSeconds: null, maxSeconds: null, notice: "" })
              : null}
          </div>
        </div>
      ) : null}

      {confirmCancel ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-600/30 bg-rose-50 px-4 py-3 animate-rise">
          <p className="text-[14px] text-rose-800">{t("cancelConfirm")}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>{t("keepGoing")}</Button>
            <Button type="button" size="sm" variant="danger" onClick={cancel}>{t("yesCancel")}</Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
        <Button type="button" variant="secondary" size="lg" loading={busy === "cancel"} disabled={!!busy} onClick={cancel}>{t("cancelSession")}</Button>
        <Button type="button" size="lg" loading={busy === "submit"} disabled={!!busy || !ready} onClick={submit}><Upload /> {t("upload")}</Button>
      </div>
    </section>
  );
}

/** SHA-256 of the file, for the "same file submitted twice" check (2D). Null if the browser can't. */
async function fileHash(file: File): Promise<string | null> {
  try {
    if (!crypto?.subtle || file.size > 600 * 1024 * 1024) return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** Reads the duration of a video or audio file in the browser (Q35). */
function readDuration(file: File, kind: FileSlot["kind"]): Promise<number | null> {
  if (kind === "image") return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (v: number | null) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

function FilePick({ role, slot, mode, sessionRef, value, onChange, compact }: {
  role: UploadRole; slot: FileSlot; mode: Mode; sessionRef: SessionRef | null; value: Picked | null; onChange: (p: Picked) => void; compact: boolean;
}) {
  const t = useTranslations("collect");
  const exts = compact ? ["jpg", "jpeg", "png"] : KIND_EXTENSIONS[slot.kind];
  const accept = exts.map((e) => `.${e}`).join(",") + (compact ? ",image/jpeg,image/png" : `,${slot.kind}/*`);
  const Icon = slot.kind === "video" ? FileVideo : slot.kind === "audio" ? Mic : ImageIcon;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function pick(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    let problem: string | null = null;
    if (!exts.includes(ext)) problem = t("wrongType", { types: exts.join(", ").toUpperCase() });
    else if (file.size > slot.maxMb * 1024 * 1024) problem = t("tooBig", { size: formatBytes(file.size), max: slot.maxMb });
    const seconds = problem ? null : await readDuration(file, slot.kind);
    if (!problem && slot.kind !== "image") {
      if (seconds == null) problem = t("noDuration");
      else if (slot.minSeconds != null && seconds < slot.minSeconds) problem = t("tooShort", { seconds: Math.round(seconds), min: slot.minSeconds });
      else if (slot.maxSeconds != null && seconds > slot.maxSeconds) problem = t("tooLong", { seconds: Math.round(seconds), max: slot.maxSeconds });
    }
    const base: Picked = { fileName: file.name, size: file.size, seconds, problem, progress: null, uploaded: false };
    onChange(base);
    if (problem) { notify.error(t("fileProblem"), problem); return; }
    if (mode === "preview" || !sessionRef) return;

    // Upload now, while the contributor carries on with the rest of the page.
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const failed = (msg: string) => { onChange({ ...base, problem: msg }); notify.error(t("uploadFailed"), msg); };
    try {
      onChange({ ...base, progress: 0 });
      const hashing = fileHash(file);
      const prep = await prepareCollectUpload(sessionRef, { role, slotKey: slot.key, fileName: file.name, size: file.size });
      if (!prep.ok) return failed(prep.fieldErrors?.file ?? prep.error);
      await uploadToStorage(file, prep.data, (f) => onChange({ ...base, progress: f }), ctrl.signal);
      const done = await completeCollectUpload(sessionRef, { role, slotKey: slot.key, fileName: file.name, path: prep.data.path, ticket: prep.data.ticket, durationSeconds: seconds, sha256: await hashing });
      if (!done.ok) return failed(done.fieldErrors?.file ?? done.error);
      onChange({ ...base, progress: 1, uploaded: true });
      notify.success(t("uploaded"), file.name);
    } catch (e) {
      if (e instanceof UploadError && e.kind === "aborted") return;
      failed(e instanceof UploadError && e.kind === "too-large" ? t("tooBigStorage") : t("uploadInterrupted"));
    }
  }

  const sending = value && value.progress != null && !value.uploaded && !value.problem;
  return (
    <div>
      {compact ? <p className="mb-1.5 text-[13.5px] font-semibold text-ink">{slot.label}{slot.required ? <span className="text-rose-600"> *</span> : null}</p> : null}
      <label className={cn("relative flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border-2 border-dashed px-4 text-center transition-colors",
        compact ? "py-7" : "py-9", sending && "pointer-events-none",
        value?.problem ? "border-rose-600/50 bg-rose-50/50" : value ? "border-pine-600/50 bg-pine-50/50" : "border-line-strong bg-paper hover:border-pine-500")}>
        <input type="file" accept={accept} className="sr-only" disabled={!!sending} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        {value ? (
          <>
            {value.problem ? <CircleAlert className="size-6 text-rose-600" /> : sending ? <Loader2 className="size-6 animate-spin text-pine-600" /> : <CheckCircle2 className="size-6 text-pine-600" />}
            <span className="max-w-full truncate text-[14px] font-medium text-ink">{value.fileName}</span>
            <span className="text-[12.5px] text-muted">{formatBytes(value.size)}{value.seconds != null ? `, ${t("seconds", { count: Math.round(value.seconds) })}` : ""}</span>
            {value.problem ? <span className="text-[12.5px] font-medium text-rose-700">{value.problem}</span>
              : sending ? <span className="tabular text-[12.5px] font-medium text-pine-700">{t("uploadingPct", { pct: Math.round((value.progress ?? 0) * 100) })}</span>
              : <span className="text-[12.5px] text-pine-700">{mode === "preview" ? t("looksGood") : t("uploadedShort")}</span>}
            {!sending ? <span className="text-[12.5px] text-muted underline">{t("chooseAnother")}</span> : null}
            {sending ? <span className="absolute inset-x-0 bottom-0 h-1 bg-pine-100"><span className="block h-full bg-pine-600 transition-[width]" style={{ width: `${Math.round((value.progress ?? 0) * 100)}%` }} /></span> : null}
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
