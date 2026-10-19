"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, Grid3X3, ImagePlus, LayoutTemplate, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useAction } from "@/components/app/use-action";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  BACK_SIDE, collectionSchema, EMPTY_COLLECTION, faceVideoTemplate, FIELD_TYPES, FILE_KINDS, newId, SIGNATURE_MODES,
  type CollectionConfig, type CollectionInput,
} from "@/lib/collection";
import { completeGuideImageUpload, prepareGuideImageUpload, removeGuideImage, saveCollectionSetup } from "@/server/actions/collection";

type Draft = CollectionConfig;
type Field_ = Draft["fields"][number];
type Cond = { field: string; value: string };
export type GuideImage = { id: string; fileName: string };

/** Fills defaults so the editor always works on a complete draft, even for an older or partial version. */
function toDraft(input: CollectionInput | null): Draft {
  const parsed = collectionSchema.safeParse(input ?? EMPTY_COLLECTION);
  if (parsed.success) return parsed.data;
  // An older version that no longer passes: keep what parses field by field, defaults for the rest.
  const base = collectionSchema.parse(EMPTY_COLLECTION);
  const raw = (input ?? {}) as Partial<Draft>;
  return { ...base, ...raw, intro: { ...base.intro, ...raw.intro }, consent: { ...base.consent, ...raw.consent },
    ekyc: { ...base.ekyc, ...raw.ekyc }, limits: { ...base.limits, ...raw.limits } } as Draft;
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40) || "field";

const SECTIONS = ["intro", "fields", "guides", "quotas", "consent", "files", "ekyc", "limits"] as const;

/**
 * Collection setup builder (Phase 2A, ID-53): everything the contributor page
 * will show and check. Saving creates a new version; submissions keep the
 * version they were made with.
 */
export function CollectionBuilder({ projectId, initial, version, canEdit, images: initialImages, storageLimitMb }: {
  projectId: string; initial: CollectionInput | null; version: number; canEdit: boolean; images: GuideImage[]; storageLimitMb: number;
}) {
  const t = useTranslations("collection");
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [images, setImages] = useState<GuideImage[]>(initialImages);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const { pending, run } = useAction();
  const ro = !canEdit;

  const change = (fn: (d: Draft) => Draft) => { setDraft((d) => fn(structuredClone(d))); setDirty(true); };
  const err = (path: string) => errors[path];
  const tt = t as unknown as { (key: string): string; has(key: string): boolean };
  const errorWord = (m: string) => (tt.has(`errors.${m}`) ? tt(`errors.${m}`) : m);

  function applyTemplate() {
    setDraft(toDraft(faceVideoTemplate()));
    setDirty(true);
    setErrors({});
    setConfirmTemplate(false);
    notify.info(t("templateLoaded"), t("templateLoadedDetail"));
  }

  function save() {
    const parsed = collectionSchema.safeParse(draft);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) { const k = i.path.join("."); if (!out[k]) out[k] = errorWord(i.message); }
      setErrors(out);
      const first = parsed.error.issues[0];
      notify.error(t("fixFirst"), first ? `${tt(`sections.${String(first.path[0])}`)}: ${errorWord(first.message)}` : undefined);
      document.getElementById(`cs-${String(first?.path[0] ?? "intro")}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setErrors({});
    run(() => saveCollectionSetup(projectId, parsed.data), {
      onSuccess: () => setDirty(false),
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });
  }

  const selectFields = draft.fields.filter((f) => f.type === "select" && f.options.length > 0);
  const counts: Record<(typeof SECTIONS)[number], number | null> = {
    intro: null, fields: draft.fields.length, guides: draft.guides.length, quotas: draft.quotas.length,
    consent: null, files: draft.files.length, ekyc: null, limits: null,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label={t("sectionsLabel")} className="hidden lg:block">
        <ol className="sticky top-20 grid gap-0.5 text-[13.5px]">
          {SECTIONS.map((s) => (
            <li key={s}>
              <a href={`#cs-${s}`} className={cn("flex items-center justify-between rounded-md px-3 py-1.5 text-ink-2 hover:bg-sunken hover:text-ink",
                Object.keys(errors).some((k) => k.startsWith(`${s}.`) || k === s) && "text-rose-700")}>
                {t(`sections.${s}`)}
                {counts[s] != null ? <span className="tabular text-[12px] text-muted">{counts[s]}</span> : null}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid min-w-0 gap-6 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
          <div className="text-[13.5px]">
            <p className="font-semibold text-ink">{version > 0 ? t("versionLabel", { version }) : t("notSetUp")}</p>
            <p className="text-muted">{version > 0 ? t("versionBody") : t("notSetUpBody")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {version > 0 ? (
              <Button asChild variant="ghost" title={dirty ? t("previewSavedOnly") : undefined}>
                <Link href={`/preview/projects/${projectId}?view=collect`}><Eye /> {t("previewPage")}</Link>
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="secondary" onClick={() => (version > 0 || dirty ? setConfirmTemplate(true) : applyTemplate())}>
                <LayoutTemplate /> {t("useTemplate")}
              </Button>
            ) : null}
          </div>
        </div>

        <Block id="intro" title={t("sections.intro")} description={t("introBody")}>
          <div className="grid gap-4">
            <Field label={t("notice")} htmlFor="cs-notice" hint={t("noticeHint")}>
              <Textarea id="cs-notice" rows={4} disabled={ro} value={draft.intro.notice} onChange={(e) => change((d) => { d.intro.notice = e.target.value; return d; })} />
            </Field>
            <Field label={t("instructions")} htmlFor="cs-instr" hint={t("instructionsHint")}>
              <Textarea id="cs-instr" rows={6} disabled={ro} value={draft.intro.instructions} onChange={(e) => change((d) => { d.intro.instructions = e.target.value; return d; })} />
            </Field>
            <Field label={t("videoUrl")} htmlFor="cs-video" hint={t("videoUrlHint")} error={err("intro.videoUrl")}>
              <Input id="cs-video" type="url" inputMode="url" placeholder="https://youtube.com/watch?v=…" disabled={ro} value={draft.intro.videoUrl}
                onChange={(e) => change((d) => { d.intro.videoUrl = e.target.value.trim(); return d; })} />
            </Field>
          </div>
        </Block>

        <Block id="fields" title={t("sections.fields")} description={t("fieldsBody")}>
          <FieldsEditor draft={draft} change={change} err={err} ro={ro} />
        </Block>

        <Block id="guides" title={t("sections.guides")} description={t("guidesBody")}>
          <GuidesEditor draft={draft} change={change} err={err} ro={ro} selectFields={selectFields}
            projectId={projectId} images={images} setImages={setImages} />
        </Block>

        <Block id="quotas" title={t("sections.quotas")} description={t("quotasBody")}>
          <QuotasEditor draft={draft} change={change} err={err} ro={ro} selectFields={selectFields} />
        </Block>

        <Block id="consent" title={t("sections.consent")} description={t("consentBody")}>
          <div className="grid gap-4">
            <Checkbox label={t("consentOn")} description={t("consentOnHint")} disabled={ro} checked={draft.consent.enabled}
              onChange={(e) => change((d) => { d.consent.enabled = e.target.checked; return d; })} />
            {draft.consent.enabled ? (
              <div className="grid gap-4 animate-rise">
                <Field label={t("consentTitle")} htmlFor="cs-ctitle">
                  <Input id="cs-ctitle" disabled={ro} value={draft.consent.title} onChange={(e) => change((d) => { d.consent.title = e.target.value; return d; })} />
                </Field>
                <Field label={t("consentText")} htmlFor="cs-ctext" hint={t("consentTextHint")} error={err("consent.text")}>
                  <Textarea id="cs-ctext" rows={10} className="font-[ui-serif,Georgia,serif]" disabled={ro} value={draft.consent.text}
                    onChange={(e) => change((d) => { d.consent.text = e.target.value; return d; })} />
                </Field>
                <Field label={t("checkboxLabel")} htmlFor="cs-cbox">
                  <Input id="cs-cbox" disabled={ro} value={draft.consent.checkboxLabel} onChange={(e) => change((d) => { d.consent.checkboxLabel = e.target.value; return d; })} />
                </Field>
                <Field label={t("signature")} htmlFor="cs-sig" className="max-w-xs">
                  <Select id="cs-sig" disabled={ro} value={draft.consent.signature} onChange={(e) => change((d) => { d.consent.signature = e.target.value as Draft["consent"]["signature"]; return d; })}>
                    {SIGNATURE_MODES.map((m) => <option key={m} value={m}>{t(`signatureModes.${m}`)}</option>)}
                  </Select>
                </Field>
              </div>
            ) : null}
          </div>
        </Block>

        <Block id="files" title={t("sections.files")} description={t("filesBody")}>
          <FilesEditor draft={draft} change={change} err={err} ro={ro} storageLimitMb={storageLimitMb} />
        </Block>

        <Block id="ekyc" title={t("sections.ekyc")} description={t("ekycBody")}>
          <div className="grid gap-4">
            <Checkbox label={t("ekycOn")} description={t("ekycOnHint")} disabled={ro} checked={draft.ekyc.enabled}
              onChange={(e) => change((d) => { d.ekyc.enabled = e.target.checked; return d; })} />
            {draft.ekyc.enabled ? (
              <div className="grid gap-4 animate-rise">
                <Field label={t("ekycNote")} htmlFor="cs-knote">
                  <Textarea id="cs-knote" rows={3} disabled={ro} value={draft.ekyc.note} onChange={(e) => change((d) => { d.ekyc.note = e.target.value; return d; })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("backSide")} htmlFor="cs-kback">
                    <Select id="cs-kback" disabled={ro} value={draft.ekyc.backSide} onChange={(e) => change((d) => { d.ekyc.backSide = e.target.value as Draft["ekyc"]["backSide"]; return d; })}>
                      {BACK_SIDE.map((m) => <option key={m} value={m}>{t(`backSides.${m}`)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("ekycMax")} htmlFor="cs-kmax" hint={t("ekycMaxHint")} error={err("ekyc.maxMb")}>
                    <NumberInput id="cs-kmax" disabled={ro} value={draft.ekyc.maxMb} min={1} max={50} onChange={(v) => change((d) => { d.ekyc.maxMb = v ?? 1; return d; })} />
                  </Field>
                </div>
              </div>
            ) : null}
          </div>
        </Block>

        <Block id="limits" title={t("sections.limits")} description={t("limitsBody")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("sessionLength")} hint={t("sessionLengthHint")}>
              <p className="flex h-10 items-center rounded-md border border-line bg-sunken px-3 text-sm text-ink-2">{t("hours", { count: draft.limits.sessionHours })}</p>
            </Field>
            <Field label={t("perContributor")} htmlFor="cs-per" hint={t("perContributorHint")} error={err("limits.maxPerContributor")}>
              <NumberInput id="cs-per" disabled={ro} value={draft.limits.maxPerContributor} min={1} max={1000} allowEmpty
                onChange={(v) => change((d) => { d.limits.maxPerContributor = v; return d; })} />
            </Field>
          </div>
        </Block>
      </div>

      {canEdit && dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_rgb(20_24_33/0.06)] backdrop-blur animate-rise">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">{t("unsaved")}</span> {t("unsavedBody", { next: version + 1 })}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={pending} onClick={() => { setDraft(toDraft(initial)); setErrors({}); setDirty(false); }}>{t("discard")}</Button>
              <Button loading={pending} onClick={save}>{t("save", { next: version + 1 })}</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={confirmTemplate} onOpenChange={setConfirmTemplate}>
        <DialogContent title={t("templateTitle")} description={t("templateBody")}>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTemplate(false)}>{t("cancel")}</Button>
            <Button onClick={applyTemplate}>{t("templateConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Block({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={`cs-${id}`} className="scroll-mt-24 rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 max-w-2xl text-[13.5px] text-muted">{description}</p>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function NumberInput({ value, onChange, allowEmpty = false, ...rest }: { value: number | null; onChange: (v: number | null) => void; allowEmpty?: boolean; id?: string; min?: number; max?: number; disabled?: boolean; placeholder?: string }) {
  return (
    <Input type="number" inputMode="numeric" {...rest} value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(allowEmpty ? null : null);
        const n = Math.trunc(Number(raw));
        if (Number.isFinite(n)) onChange(n);
      }} />
  );
}

type EditorProps = { draft: Draft; change: (fn: (d: Draft) => Draft) => void; err: (p: string) => string | undefined; ro: boolean };

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const n = [...list]; const other = n[i + d];
  if (other === undefined) return list;
  n[i + d] = n[i] as T; n[i] = other; return n;
}

function RowTools({ onUp, onDown, onRemove, first, last, labels }: { onUp: () => void; onDown: () => void; onRemove: () => void; first: boolean; last: boolean; labels: { up: string; down: string; remove: string } }) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button type="button" variant="ghost" size="icon" onClick={onUp} disabled={first} aria-label={labels.up}><ArrowUp /></Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDown} disabled={last} aria-label={labels.down}><ArrowDown /></Button>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={labels.remove}><Trash2 /></Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function FieldsEditor({ draft, change, err, ro }: EditorProps) {
  const t = useTranslations("collection");
  const tools = { up: t("moveUp"), down: t("moveDown"), remove: t("remove") };
  const used = (key: string) => draft.guides.some((g) => g.when.some((w) => w.field === key)) || draft.quotas.some((q) => q.when.some((w) => w.field === key));
  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {draft.fields.map((f, i) => (
          <li key={i} className="rounded-md border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="grid flex-1 gap-4 sm:grid-cols-[1fr_11rem_10rem]">
                <Field label={t("fieldLabel")} htmlFor={`f-l-${i}`} error={err(`fields.${i}.label`)}>
                  <Input id={`f-l-${i}`} disabled={ro} value={f.label} onChange={(e) => change((d) => {
                    const field = d.fields[i] as Field_;
                    const autoKey = field.key === slug(field.label) || field.key === "" || field.key.startsWith("field");
                    field.label = e.target.value;
                    if (autoKey && !used(field.key)) field.key = slug(e.target.value);
                    return d;
                  })} />
                </Field>
                <Field label={t("fieldKey")} htmlFor={`f-k-${i}`} hint={t("fieldKeyHint")} error={err(`fields.${i}.key`)}>
                  <Input id={`f-k-${i}`} disabled={ro || used(f.key)} className="font-mono text-[13px]" value={f.key}
                    onChange={(e) => change((d) => { (d.fields[i] as Field_).key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40); return d; })} />
                </Field>
                <Field label={t("fieldType")} htmlFor={`f-t-${i}`}>
                  <Select id={`f-t-${i}`} disabled={ro} value={f.type} onChange={(e) => change((d) => { (d.fields[i] as Field_).type = e.target.value as Field_["type"]; return d; })}>
                    {FIELD_TYPES.map((x) => <option key={x} value={x}>{t(`fieldTypes.${x}`)}</option>)}
                  </Select>
                </Field>
              </div>
              {!ro ? <RowTools labels={tools} first={i === 0} last={i === draft.fields.length - 1}
                onUp={() => change((d) => ({ ...d, fields: move(d.fields, i, -1) }))}
                onDown={() => change((d) => ({ ...d, fields: move(d.fields, i, 1) }))}
                onRemove={() => change((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }))} /> : null}
            </div>
            {f.type === "select" ? (
              <Field className="mt-4" label={t("options")} htmlFor={`f-o-${i}`} hint={t("optionsHint")} error={err(`fields.${i}.options`)}>
                <Textarea id={`f-o-${i}`} rows={Math.min(8, Math.max(3, f.options.length + 1))} disabled={ro} value={f.options.join("\n")}
                  onChange={(e) => change((d) => { (d.fields[i] as Field_).options = e.target.value.split("\n").map((o) => o.replace(/^\s+/, "")).slice(0, 60); return d; })}
                  onBlur={() => change((d) => { const fl = d.fields[i] as Field_; fl.options = fl.options.map((o) => o.trim()).filter(Boolean); return d; })} />
              </Field>
            ) : null}
            <div className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-[1fr_auto]">
              <Field label={t("fieldHelp")} htmlFor={`f-h-${i}`} hint={t("optional")}>
                <Input id={`f-h-${i}`} disabled={ro} value={f.help} onChange={(e) => change((d) => { (d.fields[i] as Field_).help = e.target.value; return d; })} />
              </Field>
              <div className="flex flex-wrap items-end gap-x-4 pt-2 sm:pt-0">
                <Checkbox label={t("required")} disabled={ro} checked={f.required} onChange={(e) => change((d) => { (d.fields[i] as Field_).required = e.target.checked; return d; })} />
                <Checkbox label={t("identity")} disabled={ro} checked={f.identity} onChange={(e) => change((d) => { (d.fields[i] as Field_).identity = e.target.checked; return d; })} />
                <Checkbox label={t("qcVisible")} disabled={ro} checked={f.qcVisible} onChange={(e) => change((d) => { (d.fields[i] as Field_).qcVisible = e.target.checked; return d; })} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      {err("fields") ? <p className="text-[12.5px] text-rose-700">{err("fields")}</p> : null}
      <p className="text-[12.5px] text-muted">{t("flagsHint")}</p>
      {!ro ? (
        <div>
          <Button type="button" variant="secondary" disabled={draft.fields.length >= 40}
            onClick={() => change((d) => ({ ...d, fields: [...d.fields, { key: `field_${d.fields.length + 1}`, label: "", type: "select", required: true, identity: false, qcVisible: true, help: "", options: [] }] }))}>
            <Plus /> {t("addField")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Conditions({ list, onChange, selectFields, ro, err, base }: {
  list: Cond[]; onChange: (next: Cond[]) => void; selectFields: Field_[]; ro: boolean; err: (p: string) => string | undefined; base: string;
}) {
  const t = useTranslations("collection");
  return (
    <div className="grid gap-2">
      {list.map((c, j) => {
        const field = selectFields.find((f) => f.key === c.field);
        return (
          <div key={j} className="flex flex-wrap items-center gap-2">
            <span className="w-8 text-[12.5px] text-muted">{j === 0 ? t("when") : t("and")}</span>
            <div className="min-w-[9rem] flex-1">
              <Select aria-label={t("conditionField")} disabled={ro} value={c.field} aria-invalid={!!err(`${base}.${j}.field`)}
                onChange={(e) => onChange(list.map((x, k) => (k === j ? { field: e.target.value, value: selectFields.find((f) => f.key === e.target.value)?.options[0] ?? "" } : x)))}>
                <option value="">{t("chooseField")}</option>
                {selectFields.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
              </Select>
            </div>
            <span className="text-[12.5px] text-muted">{t("is")}</span>
            <div className="min-w-[9rem] flex-1">
              <Select aria-label={t("conditionValue")} disabled={ro || !field} value={c.value} aria-invalid={!!err(`${base}.${j}.value`)}
                onChange={(e) => onChange(list.map((x, k) => (k === j ? { ...x, value: e.target.value } : x)))}>
                {!field ? <option value="">—</option> : null}
                {field?.options.map((o) => <option key={o} value={o}>{o}</option>)}
                {field && c.value && !field.options.includes(c.value) ? <option value={c.value}>{c.value} ({t("missingOption")})</option> : null}
              </Select>
            </div>
            {!ro ? (
              <Button type="button" variant="ghost" size="icon" aria-label={t("removeCondition")} onClick={() => onChange(list.filter((_, k) => k !== j))} disabled={list.length === 1}><X /></Button>
            ) : null}
          </div>
        );
      })}
      {(err(base) || err(`${base}.0.field`) || err(`${base}.0.value`)) ? <p className="text-[12.5px] text-rose-700">{err(base) ?? err(`${base}.0.field`) ?? err(`${base}.0.value`)}</p> : null}
      {!ro && list.length < 6 && selectFields.length > 0 ? (
        <div><Button type="button" variant="link" size="sm" onClick={() => onChange([...list, { field: "", value: "" }])}><Plus className="size-3.5" /> {t("addCondition")}</Button></div>
      ) : null}
    </div>
  );
}

function GuidesEditor({ draft, change, err, ro, selectFields, projectId, images, setImages }: EditorProps & {
  selectFields: Field_[]; projectId: string; images: GuideImage[]; setImages: React.Dispatch<React.SetStateAction<GuideImage[]>>;
}) {
  const t = useTranslations("collection");
  const tools = { up: t("moveUp"), down: t("moveDown"), remove: t("remove") };
  return (
    <div className="grid gap-5">
      <ImageLibrary projectId={projectId} images={images} setImages={setImages} ro={ro}
        usedIds={new Set(draft.guides.flatMap((g) => g.imageIds))} />
      {selectFields.length === 0 ? <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">{t("needSelect")}</p> : null}
      <ol className="grid gap-3">
        {draft.guides.map((g, i) => (
          <li key={g.id} className="rounded-md border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <Field className="flex-1" label={t("guideTitle")} htmlFor={`g-t-${i}`} error={err(`guides.${i}.title`)}>
                <Input id={`g-t-${i}`} disabled={ro} value={g.title} placeholder={t("guideTitlePlaceholder")}
                  onChange={(e) => change((d) => { d.guides[i]!.title = e.target.value; return d; })} />
              </Field>
              {!ro ? <RowTools labels={tools} first={i === 0} last={i === draft.guides.length - 1}
                onUp={() => change((d) => ({ ...d, guides: move(d.guides, i, -1) }))}
                onDown={() => change((d) => ({ ...d, guides: move(d.guides, i, 1) }))}
                onRemove={() => change((d) => ({ ...d, guides: d.guides.filter((_, j) => j !== i) }))} /> : null}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-medium text-ink-2">{t("showWhen")}</p>
              <Conditions list={g.when} selectFields={selectFields} ro={ro} err={err} base={`guides.${i}.when`}
                onChange={(next) => change((d) => { d.guides[i]!.when = next; return d; })} />
            </div>
            <Field className="mt-4" label={t("guideText")} htmlFor={`g-d-${i}`}>
              <Textarea id={`g-d-${i}`} rows={3} disabled={ro} value={g.description} onChange={(e) => change((d) => { d.guides[i]!.description = e.target.value; return d; })} />
            </Field>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-2">{t("guideImages")}</p>
                {images.length === 0 ? <p className="text-[12.5px] text-muted">{t("noImagesYet")}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {images.map((img) => {
                      const on = g.imageIds.includes(img.id);
                      return (
                        <button key={img.id} type="button" disabled={ro || (!on && g.imageIds.length >= 6)} aria-pressed={on} title={img.fileName}
                          onClick={() => change((d) => { const ids = d.guides[i]!.imageIds; d.guides[i]!.imageIds = on ? ids.filter((x) => x !== img.id) : [...ids, img.id]; return d; })}
                          className={cn("relative size-16 overflow-hidden rounded-md border-2 transition-[border-color,opacity]", on ? "border-pine-600" : "border-transparent opacity-60 hover:opacity-100")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/project-assets/${img.id}`} alt={img.fileName} className="size-full object-cover" loading="lazy" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <Field label={t("guideVideo")} htmlFor={`g-v-${i}`} hint={t("videoUrlHint")} error={err(`guides.${i}.videoUrl`)}>
                <Input id={`g-v-${i}`} type="url" disabled={ro} value={g.videoUrl} onChange={(e) => change((d) => { d.guides[i]!.videoUrl = e.target.value.trim(); return d; })} />
              </Field>
            </div>
          </li>
        ))}
      </ol>
      {!ro && selectFields.length > 0 ? (
        <div>
          <Button type="button" variant="secondary" disabled={draft.guides.length >= 80}
            onClick={() => change((d) => ({ ...d, guides: [...d.guides, { id: newId("g"), title: "", when: [{ field: selectFields[0]!.key, value: selectFields[0]!.options[0] ?? "" }], description: "", imageIds: [], videoUrl: "" }] }))}>
            <Plus /> {t("addGuide")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ImageLibrary({ projectId, images, setImages, ro, usedIds }: { projectId: string; images: GuideImage[]; setImages: React.Dispatch<React.SetStateAction<GuideImage[]>>; ro: boolean; usedIds: Set<string> }) {
  const t = useTranslations("collection");
  const tc = useTranslations("common");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { run } = useAction();

  async function upload(files: FileList) {
    for (const file of Array.from(files).slice(0, 10)) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { notify.error(t("imageType"), file.name); continue; }
      if (file.size > 10 * 1024 * 1024) { notify.error(t("imageTooLarge"), file.name); continue; }
      setBusy(file.name);
      try {
        const prep = await prepareGuideImageUpload({ projectId, fileName: file.name, size: file.size, mimeType: file.type });
        if (!prep.ok) { notify.error(t("uploadFailed"), prep.fieldErrors?.file ?? prep.error); continue; }
        const res = await fetch(prep.data.uploadUrl, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "false" }, body: file });
        if (!res.ok) { notify.error(t("uploadFailed"), t("tryAgain")); continue; }
        const done = await completeGuideImageUpload({ projectId, fileName: file.name, path: prep.data.path, ticket: prep.data.ticket });
        if (!done.ok) { notify.error(t("uploadFailed"), done.fieldErrors?.file ?? done.error); continue; }
        setImages((p) => [...p, done.data]);
        notify.success(done.message ?? t("uploaded"), done.detail);
      } catch {
        notify.error(tc("offlineTitle"), tc("offlineDetail"));
      } finally {
        setBusy(null);
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13.5px] font-semibold text-ink">{t("libraryTitle")}</p>
          <p className="text-[12.5px] text-muted">{t("libraryBody")}</p>
        </div>
        {!ro ? (
          <>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" id="cs-img"
              onChange={(e) => e.target.files && upload(e.target.files)} />
            <Button type="button" variant="secondary" size="sm" loading={!!busy} onClick={() => input.current?.click()}>
              <ImagePlus /> {busy ? t("uploading") : t("addImages")}
            </Button>
          </>
        ) : null}
      </div>
      {images.length === 0 ? <p className="text-[12.5px] text-muted">{t("noImagesYet")}</p> : (
        <ul className="flex flex-wrap gap-3">
          {images.map((img) => (
            <li key={img.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/project-assets/${img.id}`} alt={img.fileName} title={img.fileName} loading="lazy" className="size-20 rounded-md border border-line object-cover" />
              {!ro && !usedIds.has(img.id) ? (
                <button type="button" aria-label={t("removeImage", { name: img.fileName })}
                  className="absolute -end-2 -top-2 hidden size-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-rose-700 group-hover:flex group-focus-within:flex"
                  onClick={() => run(() => removeGuideImage(projectId, img.id), { onSuccess: () => setImages((p) => p.filter((x) => x.id !== img.id)) })}>
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function QuotasEditor({ draft, change, err, ro, selectFields }: EditorProps & { selectFields: Field_[] }) {
  const t = useTranslations("collection");
  const [grid, setGrid] = useState(false);
  const total = draft.quotas.reduce((s, q) => s + (Number.isFinite(q.target) ? q.target : 0), 0);
  return (
    <div className="grid gap-4">
      {draft.quotas.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">{t("noQuotas")}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[13px] text-ink-2"><Badge tone="brand">{t("quotaTotal", { total: total.toLocaleString() })}</Badge>{t("quotaRows", { count: draft.quotas.length })}</div>
          <ol className="grid gap-2">
            {draft.quotas.map((q, i) => (
              <li key={q.id} className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-start">
                <Conditions list={q.when} selectFields={selectFields} ro={ro} err={err} base={`quotas.${i}.when`}
                  onChange={(next) => change((d) => { d.quotas[i]!.when = next; return d; })} />
                <Field label={t("target")} htmlFor={`q-t-${i}`} error={err(`quotas.${i}.target`)}>
                  <NumberInput id={`q-t-${i}`} disabled={ro} value={q.target} min={1} onChange={(v) => change((d) => { d.quotas[i]!.target = v ?? 0; return d; })} />
                </Field>
                {!ro ? <Button type="button" variant="ghost" size="icon" className="sm:mt-7" aria-label={t("remove")} onClick={() => change((d) => ({ ...d, quotas: d.quotas.filter((_, j) => j !== i) }))}><Trash2 /></Button> : null}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="text-[12.5px] text-muted">{t("quotaHint")}</p>
      {!ro && selectFields.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setGrid(true)}><Grid3X3 /> {t("buildGrid")}</Button>
          <Button type="button" variant="ghost" disabled={draft.quotas.length >= 500}
            onClick={() => change((d) => ({ ...d, quotas: [...d.quotas, { id: newId("q"), when: [{ field: selectFields[0]!.key, value: selectFields[0]!.options[0] ?? "" }], target: 10 }] }))}>
            <Plus /> {t("addQuota")}
          </Button>
        </div>
      ) : null}
      {grid ? <GridDialog selectFields={selectFields} onClose={() => setGrid(false)}
        onCreate={(rows, replace) => change((d) => ({ ...d, quotas: [...(replace ? [] : d.quotas), ...rows].slice(0, 500) }))} /> : null}
    </div>
  );
}

/** Builds one quota for every combination of the chosen fields, e.g. Gender × Age group × Nationality. */
function GridDialog({ selectFields, onClose, onCreate }: { selectFields: Field_[]; onClose: () => void; onCreate: (rows: Draft["quotas"], replace: boolean) => void }) {
  const t = useTranslations("collection");
  const [keys, setKeys] = useState<string[]>(selectFields.slice(0, 2).map((f) => f.key));
  const [target, setTarget] = useState<number | null>(10);
  const [replace, setReplace] = useState(true);
  const combos = useMemo(() => {
    const fields = keys.map((k) => selectFields.find((f) => f.key === k)).filter(Boolean) as Field_[];
    return fields.reduce<Cond[][]>((acc, f) => acc.flatMap((c) => f.options.map((o) => [...c, { field: f.key, value: o }])), [[]]).filter((c) => c.length > 0);
  }, [keys, selectFields]);
  const tooMany = combos.length > 500;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t("gridTitle")} description={t("gridBody")}>
        <div className="grid gap-4">
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-[13px] font-medium text-ink-2">{t("gridFields")}</legend>
            {selectFields.map((f) => (
              <Checkbox key={f.key} label={f.label || f.key} description={f.options.join(", ")} checked={keys.includes(f.key)}
                disabled={!keys.includes(f.key) && keys.length >= 4}
                onChange={(e) => setKeys((p) => (e.target.checked ? [...p, f.key] : p.filter((x) => x !== f.key)))} />
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("gridTarget")} htmlFor="grid-target" hint={t("gridTargetHint")}>
              <NumberInput id="grid-target" value={target} min={1} onChange={setTarget} />
            </Field>
            <div className="flex flex-col justify-end text-[13.5px]">
              <p className={cn("font-semibold", tooMany ? "text-rose-700" : "text-ink")}>{t("gridCount", { count: combos.length })}</p>
              <p className="text-muted">{t("gridTotal", { total: (combos.length * (target ?? 0)).toLocaleString() })}</p>
            </div>
          </div>
          <Checkbox label={t("gridReplace")} checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={combos.length === 0 || tooMany || !target}
            onClick={() => { onCreate(combos.map((when) => ({ id: newId("q"), when, target: target ?? 1 })), replace); onClose(); notify.success(t("gridDone", { count: combos.length })); }}>
            {t("gridCreate", { count: combos.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function FilesEditor({ draft, change, err, ro, storageLimitMb }: EditorProps & { storageLimitMb: number }) {
  const t = useTranslations("collection");
  const tools = { up: t("moveUp"), down: t("moveDown"), remove: t("remove") };
  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {draft.files.map((f, i) => (
          <li key={i} className="rounded-md border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="grid flex-1 gap-4 sm:grid-cols-[1fr_9rem_9rem]">
                <Field label={t("fileLabel")} htmlFor={`fi-l-${i}`} error={err(`files.${i}.label`)}>
                  <Input id={`fi-l-${i}`} disabled={ro} value={f.label} onChange={(e) => change((d) => { d.files[i]!.label = e.target.value; return d; })} />
                </Field>
                <Field label={t("fileKind")} htmlFor={`fi-k-${i}`}>
                  <Select id={`fi-k-${i}`} disabled={ro} value={f.kind} onChange={(e) => change((d) => {
                    const slot = d.files[i]!; slot.kind = e.target.value as typeof slot.kind;
                    if (slot.kind === "image") { slot.minSeconds = null; slot.maxSeconds = null; }
                    return d;
                  })}>
                    {FILE_KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
                  </Select>
                </Field>
                <Field label={t("fileKey")} htmlFor={`fi-key-${i}`} error={err(`files.${i}.key`)}>
                  <Input id={`fi-key-${i}`} disabled={ro} className="font-mono text-[13px]" value={f.key}
                    onChange={(e) => change((d) => { d.files[i]!.key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40); return d; })} />
                </Field>
              </div>
              {!ro ? <RowTools labels={tools} first={i === 0} last={i === draft.files.length - 1}
                onUp={() => change((d) => ({ ...d, files: move(d.files, i, -1) }))}
                onDown={() => change((d) => ({ ...d, files: move(d.files, i, 1) }))}
                onRemove={() => change((d) => ({ ...d, files: d.files.filter((_, j) => j !== i) }))} /> : null}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label={t("maxMb")} htmlFor={`fi-mb-${i}`} error={err(`files.${i}.maxMb`)}
                hint={f.maxMb > storageLimitMb ? <span className="text-amber-700">{t("overStorageLimit", { limit: storageLimitMb })}</span> : t("maxMbHint")}>
                <NumberInput id={`fi-mb-${i}`} disabled={ro} value={f.maxMb} min={1} onChange={(v) => change((d) => { d.files[i]!.maxMb = v ?? 1; return d; })} />
              </Field>
              {f.kind !== "image" ? (
                <>
                  <Field label={t("minSeconds")} htmlFor={`fi-min-${i}`} hint={t("optional")}>
                    <NumberInput id={`fi-min-${i}`} disabled={ro} value={f.minSeconds} min={0} allowEmpty onChange={(v) => change((d) => { d.files[i]!.minSeconds = v; return d; })} />
                  </Field>
                  <Field label={t("maxSeconds")} htmlFor={`fi-max-${i}`} hint={t("optional")} error={err(`files.${i}.maxSeconds`)}>
                    <NumberInput id={`fi-max-${i}`} disabled={ro} value={f.maxSeconds} min={1} allowEmpty onChange={(v) => change((d) => { d.files[i]!.maxSeconds = v; return d; })} />
                  </Field>
                </>
              ) : null}
            </div>
            <Field className="mt-4" label={t("fileNotice")} htmlFor={`fi-n-${i}`} hint={t("fileNoticeHint")}>
              <Textarea id={`fi-n-${i}`} rows={2} disabled={ro} value={f.notice} onChange={(e) => change((d) => { d.files[i]!.notice = e.target.value; return d; })} />
            </Field>
            <Checkbox className="mt-3" label={t("required")} disabled={ro} checked={f.required} onChange={(e) => change((d) => { d.files[i]!.required = e.target.checked; return d; })} />
          </li>
        ))}
      </ol>
      {err("files") ? <p className="text-[12.5px] text-rose-700">{err("files")}</p> : null}
      {!ro ? (
        <div>
          <Button type="button" variant="secondary" disabled={draft.files.length >= 10}
            onClick={() => change((d) => ({ ...d, files: [...d.files, { key: `file_${d.files.length + 1}`, label: "", kind: "image", required: true, maxMb: 10, minSeconds: null, maxSeconds: null, notice: "" }] }))}>
            <Plus /> {t("addFile")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
