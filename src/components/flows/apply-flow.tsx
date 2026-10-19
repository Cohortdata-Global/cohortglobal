"use client";

import { useState } from "react";
import { PenLine, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmAction } from "@/components/app/confirm-action";
import { useAction } from "@/components/app/use-action";
import { signContract, submitApplication, withdrawApplication, type AnswerValue } from "@/server/actions/applications";
import { cn } from "@/lib/utils";

export type ApplyQuestion = { id: string; prompt: string; help_text: string | null; answer_type: string; options: string[]; required: boolean };

/**
 * The application form for a job (#21). Answers can't be edited after sending (#23),
 * so the last step asks for confirmation.
 */
/** `preview`: the PM's preview of the job page. Checks run as usual, but nothing is sent. */
export function ApplyForm({ projectId, questions, applyingAs, preview = false }: { projectId: string; questions: ApplyQuestion[]; applyingAs: string; preview?: boolean }) {
  const t = useTranslations("apply");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const { pending, run } = useAction();
  const set = (id: string, v: AnswerValue) => { setAnswers((p) => ({ ...p, [id]: v })); setErrors((e) => ({ ...e, [id]: "" })); };

  function check(): boolean {
    const next: Record<string, string> = {};
    for (const q of questions) {
      const v = answers[q.id];
      const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (q.required && empty) next[q.id] = t("required");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function send() {
    if (preview) {
      setConfirming(false);
      notify.info(t("previewSent"), t("previewSentDetail"));
      return;
    }
    const payload: Record<string, AnswerValue> = Object.fromEntries(Object.entries(answers).map(([k, v]): [string, AnswerValue] => [k, typeof v === "string" ? v.trim() : v]));
    run(() => submitApplication(projectId, payload), {
      onError: (r) => { setConfirming(false); setErrors(r.fieldErrors ?? {}); },
    });
  }

  return (
    <form className="grid gap-6" noValidate onSubmit={(e) => { e.preventDefault(); if (check()) setConfirming(true); }}>
      {questions.map((q, i) => (
        <QuestionField key={q.id} index={i} q={q} value={answers[q.id]} error={errors[q.id]} onChange={(v) => set(q.id, v)} disabled={confirming || pending} />
      ))}
      {questions.length === 0 ? <p className="text-[14px] text-ink-2">{t("noQuestions")}</p> : null}

      {confirming ? (
        <div className="rounded-md border border-pine-600/30 bg-pine-50 p-4 animate-pop">
          <p className="font-medium text-ink">{t("confirmTitle", { who: applyingAs })}</p>
          <p className="mt-1 text-[13.5px] text-ink-2">{t("confirmBody")}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" loading={pending} onClick={send}>{t("send")}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>{t("keepEditing")}</Button>
          </div>
        </div>
      ) : (
        <div><Button type="submit" size="lg">{t("review")}</Button></div>
      )}
    </form>
  );
}

function QuestionField({ q, index, value, error, onChange, disabled }: {
  q: ApplyQuestion; index: number; value: AnswerValue | undefined; error?: string; onChange: (v: AnswerValue) => void; disabled: boolean;
}) {
  const t = useTranslations("apply");
  const id = `q-${q.id}`;
  const label = `${index + 1}. ${q.prompt}`;
  if (q.answer_type === "SHORT_TEXT") {
    return <Field label={label} htmlFor={id} required={q.required} hint={q.help_text ?? undefined} error={error}><Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={300} aria-invalid={!!error} /></Field>;
  }
  if (q.answer_type === "LONG_TEXT") {
    return <Field label={label} htmlFor={id} required={q.required} hint={q.help_text ?? undefined} error={error}><Textarea id={id} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={5000} aria-invalid={!!error} /></Field>;
  }
  // Yes/No answers are stored as true/false; only the words shown are translated.
  const choices = q.answer_type === "YES_NO" ? ["Yes", "No"] : q.options;
  const shown = (c: string) => (q.answer_type === "YES_NO" ? (c === "Yes" ? t("yes") : t("no")) : c);
  const multi = q.answer_type === "MULTIPLE_CHOICE";
  const selected = (c: string) => (q.answer_type === "YES_NO" ? value === (c === "Yes") : multi ? ((value as string[]) ?? []).includes(c) : value === c);
  const pick = (c: string) => {
    if (q.answer_type === "YES_NO") return onChange(c === "Yes");
    if (!multi) return onChange(c);
    const cur = (value as string[]) ?? [];
    onChange(cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]);
  };
  return (
    <fieldset className="flex flex-col gap-1.5" aria-invalid={!!error}>
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{label}{q.required ? <span className="ms-0.5 text-rose-600" aria-hidden>*</span> : null}</legend>
      <div className={cn("flex flex-wrap gap-2", q.answer_type !== "YES_NO" && choices.length > 3 && "grid sm:grid-cols-2")}>
        {choices.map((c) => {
          const on = selected(c);
          return (
            <button type="button" key={c} role={multi ? "checkbox" : "radio"} aria-checked={on} disabled={disabled} onClick={() => pick(c)}
              className={cn("flex min-h-10 items-center gap-2.5 rounded-md border px-3.5 py-2 text-start text-sm transition-[border-color,background-color,box-shadow] duration-150",
                on ? "border-pine-600 bg-pine-50 text-ink shadow-[0_0_0_1px_var(--color-pine-600)]" : "border-line-strong bg-surface text-ink-2 hover:border-ink/30 hover:bg-sunken")}>
              <span className={cn("flex size-4 shrink-0 items-center justify-center border-[1.5px] transition-colors", multi ? "rounded-[4px]" : "rounded-full", on ? "border-pine-600 bg-pine-600" : "border-line-strong")}>
                {on ? <span className={cn("bg-white", multi ? "h-[7px] w-[4px] -translate-y-px rotate-45 border-b-2 border-e-2 border-white bg-transparent" : "size-1.5 rounded-full")} /> : null}
              </span>
              {shown(c)}
            </button>
          );
        })}
      </div>
      {error ? <p className="text-[12.5px] text-rose-700 animate-fade" role="alert">{error}</p> : q.help_text ? <p className="text-[12.5px] text-muted">{q.help_text}</p> : null}
    </fieldset>
  );
}

export function WithdrawApplication({ applicationId }: { applicationId: string }) {
  const t = useTranslations("apply");
  return <ConfirmAction label={t("withdraw")} variant="ghost" size="sm" icon={<Undo2 />} title={t("withdrawTitle")}
    description={t("withdrawBody")} confirmLabel={t("withdrawButton")} action={() => withdrawApplication(applicationId)} />;
}

/** Click-to-accept signature (#26): the person reads the text, ticks the box and types their name. */
export function SignContract({ assignmentId, title, body, version, defaultName, signerLabel }: {
  assignmentId: string; title: string; body: string; version: number; defaultName: string; signerLabel: string;
}) {
  const t = useTranslations("apply");
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <div className="grid gap-5">
      <article className="max-h-[52vh] overflow-y-auto rounded-md border border-line bg-paper px-6 py-5">
        <h3 className="mb-3 font-display text-[18px] font-semibold text-ink">{title}</h3>
        <div className="whitespace-pre-wrap font-[ui-serif,Georgia,serif] text-[14.5px] leading-[1.75] text-ink-2">{body}</div>
        <p className="mt-5 text-[12px] text-muted">{t("version", { version })}</p>
      </article>
      <Checkbox checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors({}); }} label={t("agree", { signer: signerLabel })}
        description={t("agreeHint")} />
      {errors.agree ? <p className="-mt-3 text-[12.5px] text-rose-700" role="alert">{errors.agree}</p> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label={t("typeName")} htmlFor="sign-name" error={errors.signer_name}>
          <Input id="sign-name" value={name} onChange={(e) => setName(e.target.value)} className="font-display text-[17px]" autoComplete="name" />
        </Field>
        <Button size="lg" loading={pending} disabled={!agreed} onClick={() => run(() => signContract(assignmentId, name, agreed), { onError: (r) => setErrors(r.fieldErrors ?? {}) })}><PenLine /> {t("sign")}</Button>
      </div>
    </div>
  );
}
