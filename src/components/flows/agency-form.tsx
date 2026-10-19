"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CountrySelect } from "@/components/flows/form-helpers";
import { useAction } from "@/components/app/use-action";
import type { ActionResult } from "@/server/errors";
import type { AgencyApplicationInput } from "@/server/actions/onboarding";

export type AgencyFormValues = Required<{ [K in keyof AgencyApplicationInput]: string }>;

export const EMPTY_AGENCY: AgencyFormValues = {
  name: "", legal_name: "", country_code: "", registration_number: "", tax_id: "", website_url: "",
  contact_name: "", contact_email: "", contact_phone: "", address: "", description: "", languages: "", team_size: "",
};

/** Company details form, used for the application, change requests and Super Admin edits (#12). */
export function AgencyForm({
  initial, submitLabel, onSubmit, withNote = false, onDone,
}: {
  initial: AgencyFormValues;
  submitLabel: string;
  onSubmit: (values: AgencyFormValues, note: string) => Promise<ActionResult<unknown>>;
  withNote?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("agencyForm");
  const { pending, run } = useAction();
  // Every field starts as a string (never undefined), so inputs stay controlled.
  const [v, setV] = useState<AgencyFormValues>(() => {
    const out = { ...EMPTY_AGENCY };
    for (const k of Object.keys(EMPTY_AGENCY) as (keyof AgencyFormValues)[]) out[k] = initial?.[k] ?? "";
    return out;
  });
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof AgencyFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  const err = (k: string) => errors[k];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    run(() => onSubmit(v, note), { onSuccess: () => onDone?.(), onError: (r) => setErrors(r.fieldErrors ?? {}) });
  }

  return (
    <form onSubmit={submit} className="grid gap-7" noValidate>
      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-[16px] font-semibold text-ink">{t("company")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="name" required error={err("name")} hint={t("nameHint")}>
            <Input id="name" value={v.name} onChange={set("name")} aria-invalid={!!err("name")} />
          </Field>
          <Field label={t("legalName")} htmlFor="legal_name" required error={err("legal_name")}>
            <Input id="legal_name" value={v.legal_name} onChange={set("legal_name")} aria-invalid={!!err("legal_name")} />
          </Field>
          <Field label={t("country")} htmlFor="country_code" required error={err("country_code")}>
            <CountrySelect id="country_code" value={v.country_code} onChange={set("country_code")} aria-invalid={!!err("country_code")} />
          </Field>
          <Field label={t("website")} htmlFor="website_url" required error={err("website_url")}>
            <Input id="website_url" type="url" inputMode="url" placeholder="https://" value={v.website_url} onChange={set("website_url")} aria-invalid={!!err("website_url")} />
          </Field>
          <Field label={t("registration")} htmlFor="registration_number" error={err("registration_number")} hint={t("registrationHint")}>
            <Input id="registration_number" value={v.registration_number} onChange={set("registration_number")} aria-invalid={!!err("registration_number")} />
          </Field>
          <Field label={t("tax")} htmlFor="tax_id" error={err("tax_id")}>
            <Input id="tax_id" value={v.tax_id} onChange={set("tax_id")} />
          </Field>
        </div>
        <Field label={t("address")} htmlFor="address">
          <Input id="address" value={v.address} onChange={set("address")} autoComplete="street-address" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-[16px] font-semibold text-ink">{t("contact")}</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t("contactName")} htmlFor="contact_name" required error={err("contact_name")}>
            <Input id="contact_name" value={v.contact_name} onChange={set("contact_name")} aria-invalid={!!err("contact_name")} />
          </Field>
          <Field label={t("contactEmail")} htmlFor="contact_email" required error={err("contact_email")}>
            <Input id="contact_email" type="email" value={v.contact_email} onChange={set("contact_email")} aria-invalid={!!err("contact_email")} />
          </Field>
          <Field label={t("contactPhone")} htmlFor="contact_phone" required error={err("contact_phone")} hint={t("phoneHint")}>
            <Input id="contact_phone" type="tel" value={v.contact_phone} onChange={set("contact_phone")} aria-invalid={!!err("contact_phone")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-[16px] font-semibold text-ink">{t("about")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("languages")} htmlFor="languages" hint={t("languagesHint")}>
            <Input id="languages" value={v.languages} onChange={set("languages")} placeholder={t("languagesPlaceholder")} />
          </Field>
          <Field label={t("teamSize")} htmlFor="team_size" hint={t("teamSizeHint")}>
            <Input id="team_size" inputMode="numeric" value={v.team_size} onChange={set("team_size")} />
          </Field>
        </div>
        <Field label={t("description")} htmlFor="description" hint={t("descriptionHint")}>
          <Textarea id="description" value={v.description} onChange={set("description")} rows={4} />
        </Field>
      </fieldset>

      {withNote ? (
        <Field label={t("note")} htmlFor="note" hint={t("noteHint")}>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
      ) : null}

      <div><Button type="submit" size="lg" loading={pending}>{submitLabel}</Button></div>
    </form>
  );
}
