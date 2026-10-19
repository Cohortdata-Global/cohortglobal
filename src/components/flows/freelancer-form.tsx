"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { CountrySelect, TimezoneSelect, browserTimezone } from "@/components/flows/form-helpers";
import { useAction } from "@/components/app/use-action";
import { completeFreelancerOnboarding } from "@/server/actions/onboarding";

export function FreelancerForm({ defaultName }: { defaultName: string }) {
  const t = useTranslations("freelancerForm");
  const g = useTranslations("gender");
  const router = useRouter();
  const { pending, run } = useAction();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({
    full_name: defaultName, country_code: "", phone: "", timezone: "UTC",
    date_of_birth: "", gender: "" as "" | "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY", native_language: "", accept_terms: false,
  });
  // Fill in the browser's timezone after mount (keeps server and browser markup identical).
  useEffect(() => { setV((p) => ({ ...p, timezone: browserTimezone() })); }, []);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    run(() => completeFreelancerOnboarding({ ...v, accept_terms: v.accept_terms as true }), {
      onSuccess: () => router.push("/work"),
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <Field label={t("fullName")} htmlFor="full_name" required error={errors.full_name} hint={t("fullNameHint")}>
        <Input id="full_name" value={v.full_name} onChange={set("full_name")} autoComplete="name" aria-invalid={!!errors.full_name} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("country")} htmlFor="country_code" required error={errors.country_code}>
          <CountrySelect id="country_code" value={v.country_code} onChange={set("country_code")} aria-invalid={!!errors.country_code} />
        </Field>
        <Field label={t("phone")} htmlFor="phone" required error={errors.phone} hint={t("phoneHint")}>
          <Input id="phone" type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" aria-invalid={!!errors.phone} />
        </Field>
        <Field label={t("dob")} htmlFor="dob" hint={t("dobHint")}>
          <Input id="dob" type="date" value={v.date_of_birth} onChange={set("date_of_birth")} />
        </Field>
        <Field label={t("gender")} htmlFor="gender" hint={t("genderHint")}>
          <Select id="gender" value={v.gender} onChange={set("gender")}>
            <option value="">{g("later")}</option>
            <option value="FEMALE">{g("FEMALE")}</option>
            <option value="MALE">{g("MALE")}</option>
            <option value="OTHER">{g("OTHER")}</option>
            <option value="PREFER_NOT_TO_SAY">{g("PREFER_NOT_TO_SAY")}</option>
          </Select>
        </Field>
        <Field label={t("language")} htmlFor="lang">
          <Input id="lang" value={v.native_language} onChange={set("native_language")} placeholder={t("languagePlaceholder")} />
        </Field>
        <Field label={t("timezone")} htmlFor="tz" hint={t("timezoneHint")}>
          <TimezoneSelect id="tz" value={v.timezone} onChange={set("timezone")} />
        </Field>
      </div>
      <div>
        <Checkbox
          checked={v.accept_terms}
          onChange={set("accept_terms")}
          label={t("terms")}
          description={t("termsHint")}
        />
        {errors.accept_terms ? <p className="ms-8 text-[12.5px] text-rose-700">{errors.accept_terms}</p> : null}
      </div>
      <Button type="submit" size="lg" loading={pending}>{t("submit")}</Button>
    </form>
  );
}
