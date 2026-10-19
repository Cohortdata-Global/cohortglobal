"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CountrySelect, TimezoneSelect } from "@/components/flows/form-helpers";
import { useAction } from "@/components/app/use-action";
import { updateMyProfile } from "@/server/actions/account";

export type AccountValues = {
  full_name: string; phone: string; country_code: string; timezone: string;
  contributor?: { date_of_birth: string; gender: "" | "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY"; nationality_code: string; native_language: string; other_languages: string; linkedin_url: string };
};

/** Personal details. Email and password are managed by the sign-in provider (Clerk). */
export function AccountForm({ initial }: { initial: AccountValues }) {
  const t = useTranslations("accountForm");
  const g = useTranslations("gender");
  const tf = useTranslations("forms");
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const set = (k: "full_name" | "phone" | "country_code" | "timezone") => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setC = (k: keyof NonNullable<AccountValues["contributor"]>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, contributor: { ...p.contributor!, [k]: e.target.value } }));

  return (
    <form className="grid gap-7" noValidate onSubmit={(e) => { e.preventDefault(); setErrors({}); run(() => updateMyProfile(v), { onError: (r) => setErrors(r.fieldErrors ?? {}) }); }}>
      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-[16px] font-semibold text-ink">{t("personal")}</legend>
        <Field label={t("fullName")} htmlFor="a-name" required error={errors.full_name}><Input id="a-name" value={v.full_name} onChange={set("full_name")} autoComplete="name" /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("country")} htmlFor="a-country" error={errors.country_code}><CountrySelect id="a-country" value={v.country_code} onChange={set("country_code")} /></Field>
          <Field label={t("phone")} htmlFor="a-phone" error={errors.phone} hint={t("phoneHint")}><Input id="a-phone" type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" /></Field>
        </div>
        <Field label={t("timezone")} htmlFor="a-tz" hint={t("timezoneHint")}><TimezoneSelect id="a-tz" value={v.timezone} onChange={set("timezone")} /></Field>
      </fieldset>

      {v.contributor ? (
        <fieldset className="grid gap-5">
          <legend className="mb-1 font-display text-[16px] font-semibold text-ink">{t("contributor")}</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("dob")} htmlFor="a-dob" error={errors["contributor.date_of_birth"]}><Input id="a-dob" type="date" value={v.contributor.date_of_birth} onChange={setC("date_of_birth")} /></Field>
            <Field label={t("gender")} htmlFor="a-gender">
              <Select id="a-gender" value={v.contributor.gender} onChange={setC("gender")}>
                <option value="">{tf("notSpecified")}</option><option value="FEMALE">{g("FEMALE")}</option><option value="MALE">{g("MALE")}</option>
                <option value="OTHER">{g("OTHER")}</option><option value="PREFER_NOT_TO_SAY">{g("PREFER_NOT_TO_SAY")}</option>
              </Select>
            </Field>
            <Field label={t("nationality")} htmlFor="a-nat"><CountrySelect id="a-nat" value={v.contributor.nationality_code} onChange={setC("nationality_code")} placeholder={tf("notSpecified")} /></Field>
            <Field label={t("language")} htmlFor="a-lang"><Input id="a-lang" value={v.contributor.native_language} onChange={setC("native_language")} /></Field>
            <Field label={t("otherLanguages")} htmlFor="a-langs" hint={t("otherLanguagesHint")}><Input id="a-langs" value={v.contributor.other_languages} onChange={setC("other_languages")} /></Field>
            <Field label={t("linkedin")} htmlFor="a-li" hint={t("optional")}><Input id="a-li" type="url" value={v.contributor.linkedin_url} onChange={setC("linkedin_url")} placeholder="https://" /></Field>
          </div>
        </fieldset>
      ) : null}

      <div><Button type="submit" size="lg" loading={pending}>{t("save")}</Button></div>
    </form>
  );
}
