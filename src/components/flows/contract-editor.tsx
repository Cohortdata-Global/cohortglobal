"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { saveContract } from "@/server/actions/projects";

/** One contract template per project (#27). Edited in place until someone signs, then versioned. */
export function ContractEditor({ projectId, initialTitle, initialBody, version, signed }: { projectId: string; initialTitle: string; initialBody: string; version: number | null; signed: boolean }) {
  const t = useTranslations("contractEditor");
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <div className="grid gap-5">
      {signed ? (
        <p className="rounded-md border border-sky-600/20 bg-sky-50 px-4 py-3 text-[13.5px] text-sky-600">
          {t("signedNote", { version: version ?? 0, next: (version ?? 0) + 1 })}
        </p>
      ) : null}
      <Field label={t("title")} htmlFor="c-title" error={errors.title}>
        <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t("text")} htmlFor="c-body" error={errors.body} hint={t("textHint")}>
        <Textarea id="c-body" value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="font-[ui-serif,Georgia,serif] text-[14.5px] leading-[1.7]" />
      </Field>
      <div><Button onClick={() => run(() => saveContract(projectId, title, body), { onError: (r) => setErrors(r.fieldErrors ?? {}) })} loading={pending}>{t("save")}</Button></div>
    </div>
  );
}
