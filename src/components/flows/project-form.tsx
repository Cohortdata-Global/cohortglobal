"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLabels } from "@/i18n/labels";
import { DATA_TYPES } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { createProject, updateProject, type ProjectInput } from "@/server/actions/projects";
import { countryName, PRIORITY_COUNTRIES } from "@/lib/countries";

export type ProjectFormValues = {
  code: string; title: string; summary: string; description: string; data_type: string; applicant_type: string; visibility: string;
  opens_at: string; closes_at: string; required_languages: string; required_countries: string[]; requires_ekyc: boolean; target_count: string;
};

export const EMPTY_PROJECT: ProjectFormValues = {
  code: "", title: "", summary: "", description: "", data_type: "VIDEO", applicant_type: "BOTH", visibility: "PUBLIC",
  opens_at: "", closes_at: "", required_languages: "", required_countries: [], requires_ekyc: false, target_count: "",
};

/** ISO timestamp → value for <input type="datetime-local"> in the browser's own timezone. */
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

/** `initial.opens_at` / `closes_at` are ISO timestamps; they are shown and edited in the browser's timezone. */
export function ProjectForm({ projectId, initial, applicantTypeLocked = false }: { projectId?: string; initial: ProjectFormValues; applicantTypeLocked?: boolean }) {
  const t = useTranslations("projectForm");
  const labels = useLabels();
  const router = useRouter();
  const { pending, run } = useAction();
  const [v, setV] = useState({ ...initial, opens_at: "", closes_at: "" });
  // Localize dates after mount so server and browser render the same markup.
  useEffect(() => {
    setV((p) => ({ ...p, opens_at: toLocalInput(initial.opens_at), closes_at: toLocalInput(initial.closes_at) }));
  }, [initial.opens_at, initial.closes_at]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof ProjectFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const toggleCountry = (c: string) => setV((p) => ({ ...p, required_countries: p.required_countries.includes(c) ? p.required_countries.filter((x) => x !== c) : [...p.required_countries, c] }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const input = { ...v, opens_at: toIso(v.opens_at), closes_at: toIso(v.closes_at) } as unknown as ProjectInput;
    if (projectId) {
      run(() => updateProject(projectId, input), { onError: (r) => setErrors(r.fieldErrors ?? {}) });
    } else {
      run(() => createProject(input), { onSuccess: (id) => router.push(`/admin/projects/${id}?tab=questions`), onError: (r) => setErrors(r.fieldErrors ?? {}) });
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <Field label={t("code")} htmlFor="code" required error={errors.code} hint={t("codeHint")}>
          <Input id="code" value={v.code} onChange={set("code")} className="uppercase" aria-invalid={!!errors.code} />
        </Field>
        <Field label={t("title")} htmlFor="title" required error={errors.title}>
          <Input id="title" value={v.title} onChange={set("title")} aria-invalid={!!errors.title} />
        </Field>
      </div>
      <Field label={t("summary")} htmlFor="summary" hint={t("summaryHint")}>
        <Input id="summary" value={v.summary} onChange={set("summary")} maxLength={280} />
      </Field>
      <Field label={t("description")} htmlFor="description" hint={t("descriptionHint")}>
        <Textarea id="description" value={v.description} onChange={set("description")} rows={10} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label={t("dataType")} htmlFor="data_type">
          <Select id="data_type" value={v.data_type} onChange={set("data_type")}>
            {DATA_TYPES.map((d) => <option key={d} value={d}>{labels.dataType(d)}</option>)}
          </Select>
        </Field>
        <Field label={t("whoCanApply")} htmlFor="applicant_type" hint={applicantTypeLocked ? t("locked") : undefined}>
          <Select id="applicant_type" value={v.applicant_type} onChange={set("applicant_type")} disabled={applicantTypeLocked}>
            <option value="BOTH">{labels.applicantType("BOTH")}</option><option value="AGENCY">{t("agenciesOnly")}</option><option value="INDIVIDUAL">{t("individualsOnly")}</option>
          </Select>
        </Field>
        <Field label={t("visibility")} htmlFor="visibility" hint={t("visibilityHint")}>
          <Select id="visibility" value={v.visibility} onChange={set("visibility")}>
            <option value="PUBLIC">{t("everyone")}</option><option value="INVITE_ONLY">{t("inviteOnly")}</option>
          </Select>
        </Field>
        <Field label={t("opens")} htmlFor="opens_at">
          <Input id="opens_at" type="datetime-local" value={v.opens_at} onChange={set("opens_at")} />
        </Field>
        <Field label={t("closes")} htmlFor="closes_at" error={errors.closes_at}>
          <Input id="closes_at" type="datetime-local" value={v.closes_at} onChange={set("closes_at")} />
        </Field>
        <Field label={t("target")} htmlFor="target_count" hint={t("targetHint")}>
          <Input id="target_count" inputMode="numeric" value={v.target_count} onChange={set("target_count")} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("languages")} htmlFor="langs" hint={t("languagesHint")}>
          <Input id="langs" value={v.required_languages} onChange={set("required_languages")} placeholder={t("languagesPlaceholder")} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">{t("countries")}</span>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_COUNTRIES.map((c) => {
              const on = v.required_countries.includes(c);
              return (
                <button type="button" key={c} onClick={() => toggleCountry(c)} aria-pressed={on}
                  className={`h-8 rounded-sm border px-2.5 text-[13px] transition-colors ${on ? "border-pine-600 bg-pine-50 text-pine-700" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken"}`}>
                  {countryName(c)}
                </button>
              );
            })}
          </div>
          <span className="text-[12.5px] text-muted">{t("anyCountry")}</span>
        </div>
      </div>
      <Checkbox checked={v.requires_ekyc} onChange={set("requires_ekyc")} label={t("ekyc")} description={t("ekycHint")} />
      <div><Button type="submit" size="lg" loading={pending}>{projectId ? t("save") : t("create")}</Button></div>
    </form>
  );
}
