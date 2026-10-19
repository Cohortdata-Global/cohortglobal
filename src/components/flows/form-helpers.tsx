"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { countryOptions, TIMEZONES } from "@/lib/countries";
import { Select } from "@/components/ui/field";

export function CountrySelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }) {
  const t = useTranslations("forms");
  const options = useMemo(() => countryOptions(), []);
  const { placeholder = t("chooseCountry"), ...rest } = props;
  return (
    <Select {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o, i) => (
        <option key={`${o.value}-${i}`} value={o.value}>{o.label}</option>
      ))}
    </Select>
  );
}

export function TimezoneSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  // The browser's own zone is added after mount, so the server and browser first render the same list.
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => { setLocal(browserTimezone()); }, []);
  const current = typeof props.value === "string" ? props.value : null;
  const zones = Array.from(new Set([current, local, ...TIMEZONES].filter((z): z is string => !!z)));
  return (
    <Select {...props}>
      {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
    </Select>
  );
}

export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
