import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Converts what a person typed into E.164 (+6591234567), or null if it is not a valid number. */
export function toE164(input: string, defaultCountry?: string | null): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, (defaultCountry ?? undefined) as CountryCode | undefined);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}
