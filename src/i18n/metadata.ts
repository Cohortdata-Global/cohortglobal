import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type messages from "@/messages/en.json";

type MetaKey = keyof typeof messages.meta;

/** Page titles from the language file: `export const generateMetadata = titled("account");` */
export function titled(key: MetaKey) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("meta");
    return { title: t(key) };
  };
}

/** Section titles for layouts: "Agency" on its own, "Members | CohortGlobal" for pages inside. */
export function section(key: MetaKey) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("meta");
    return { title: { default: t(key), template: t("template") } };
  };
}
