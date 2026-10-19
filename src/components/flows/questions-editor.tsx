"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { saveQuestions, type QuestionInput } from "@/server/actions/projects";
import { useTranslations } from "next-intl";
import { useLabels } from "@/i18n/labels";
import { ANSWER_TYPES } from "@/lib/status";

type Q = { key: string; prompt: string; help_text: string; answer_type: QuestionInput["answer_type"]; options: string[]; required: boolean };

let seq = 0;
const blank = (): Q => ({ key: `n${++seq}`, prompt: "", help_text: "", answer_type: "SHORT_TEXT", options: [], required: true });

/** Application questions (#21). Once applications exist, saving creates a new version (Super Admin only, #22). */
export function QuestionsEditor({ projectId, initial, locked, canRelock, version }: {
  projectId: string; initial: Omit<Q, "key">[]; locked: boolean; canRelock: boolean; version: number;
}) {
  const t = useTranslations("questions");
  const labels = useLabels();
  const [qs, setQs] = useState<Q[]>(initial.map((q) => ({ ...q, key: `i${++seq}` })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const readOnly = locked && !canRelock;

  const update = (i: number, patch: Partial<Q>) => setQs((p) => p.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => setQs((p) => { const n = [...p]; const other = n[i + d]; if (!other) return p; n[i + d] = n[i] as Q; n[i] = other; return n; });

  function save() {
    setErrors({});
    run(() => saveQuestions(projectId, qs.map(({ key: _k, ...q }) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))), {
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });
  }

  return (
    <div className="grid gap-4">
      {locked ? (
        <p className="rounded-md border border-amber-600/25 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-700">
          {canRelock ? t("lockedRelock", { next: version + 1 }) : t("locked")}
        </p>
      ) : null}
      {qs.length === 0 ? <p className="rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">{t("none")}</p> : null}
      <ol className="grid gap-3">
        {qs.map((q, i) => (
          <li key={q.key} className="rounded-md border border-line bg-surface p-4 animate-rise">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted">{t("number", { n: i + 1 })}</span>
              {!readOnly ? (
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label={t("moveDown")}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setQs((p) => p.filter((_, j) => j !== i))} aria-label={t("remove")}><Trash2 /></Button>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <Field label={t("question")} htmlFor={`q-${q.key}`} error={errors[`${i}.prompt`]}>
                <Input id={`q-${q.key}`} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} disabled={readOnly} />
              </Field>
              <Field label={t("answerType")} htmlFor={`t-${q.key}`}>
                <Select id={`t-${q.key}`} value={q.answer_type} onChange={(e) => update(i, { answer_type: e.target.value as Q["answer_type"] })} disabled={readOnly}>
                  {ANSWER_TYPES.map((k) => <option key={k} value={k}>{labels.answerType(k)}</option>)}
                </Select>
              </Field>
            </div>
            {q.answer_type === "SINGLE_CHOICE" || q.answer_type === "MULTIPLE_CHOICE" ? (
              <Field className="mt-4" label={t("options")} htmlFor={`o-${q.key}`} hint={t("optionsHint")} error={errors[`${i}.options`]}>
                <textarea id={`o-${q.key}`} rows={3} disabled={readOnly}
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-pine-600 focus:outline-none focus:ring-3 focus:ring-pine-100"
                  value={q.options.join("\n")} onChange={(e) => update(i, { options: e.target.value.split("\n") })} />
              </Field>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={t("help")} htmlFor={`h-${q.key}`} hint={t("optional")}>
                <Input id={`h-${q.key}`} value={q.help_text} onChange={(e) => update(i, { help_text: e.target.value })} disabled={readOnly} />
              </Field>
              <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" className="size-4 accent-pine-600" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} disabled={readOnly} />
                {t("required")}
              </label>
            </div>
          </li>
        ))}
      </ol>
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setQs((p) => [...p, blank()])} disabled={qs.length >= 30}><Plus /> {t("add")}</Button>
          <Button type="button" onClick={save} loading={pending}>{locked ? t("saveVersion", { next: version + 1 }) : t("save")}</Button>
        </div>
      ) : null}
    </div>
  );
}
