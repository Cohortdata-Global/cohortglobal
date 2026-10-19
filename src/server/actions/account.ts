"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/server/actions/_rpc";
import { invalid, zodFieldErrors } from "@/server/errors";
import { toE164 } from "@/lib/phone";
import { k, serverText } from "@/server/i18n";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, k("fullName")).max(120),
  phone: z.string().trim().max(32).optional().default(""),
  country_code: z.string().trim().length(2, k("chooseCountry")).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64),
  contributor: z.object({
    date_of_birth: z.string().optional().default(""),
    gender: z.enum(["", "MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional().default(""),
    nationality_code: z.string().optional().default(""),
    native_language: z.string().max(60).optional().default(""),
    other_languages: z.string().max(200).optional().default(""),
    linkedin_url: z.string().max(200).optional().default(""),
  }).optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;

export async function updateMyProfile(input: ProfileInput) {
  const t = await serverText();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error.issues, t.field));
  const v = parsed.data;
  const phone = v.phone ? toE164(v.phone, v.country_code || null) : null;
  if (v.phone && !phone) return invalid({ phone: t.invalid("phoneWithCode") });
  const payload: Record<string, unknown> = {
    full_name: v.full_name,
    phone_e164: phone,
    country_code: v.country_code || null,
    timezone: v.timezone,
  };
  if (v.contributor) {
    payload.contributor = {
      date_of_birth: v.contributor.date_of_birth || null,
      gender: v.contributor.gender || null,
      nationality_code: v.contributor.nationality_code || null,
      native_language: v.contributor.native_language || null,
      other_languages: v.contributor.other_languages.split(",").map((s) => s.trim()).filter(Boolean),
      linkedin_url: v.contributor.linkedin_url || null,
    };
  }
  const r = await callRpc("update_my_profile", { p: payload }, t.done("profileSaved"));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
