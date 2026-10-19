import "server-only";
import { getTranslations } from "next-intl/server";
import { makeLabels, type Labels } from "@/i18n/labels";

/** getLabels() for async server components, route handlers and server actions. */
export async function getLabels(): Promise<Labels> {
  return makeLabels(await getTranslations("labels"));
}
