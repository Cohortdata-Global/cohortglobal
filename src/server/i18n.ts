import "server-only";
import { getTranslations } from "next-intl/server";
import type messages from "@/messages/en.json";
import type { SuccessMessage } from "@/server/errors";

/**
 * Words for server actions (B4, ID-49). Pop-up messages, form problems and
 * errors live in src/messages/en.json under "server"; keys are typed, so a
 * missing key fails `pnpm typecheck`.
 */
type Server = typeof messages.server;
export type DoneKey = keyof Server["done"];
export type InvalidKey = keyof Server["invalid"];
export type ErrorKey = keyof Server["errors"];
type Values = Record<string, string | number>;
type T = { (key: string, values?: Values): string; has(key: string): boolean };

/** Marks a zod message as a key under server.invalid (translated by `field`). */
export const k = (key: InvalidKey) => key;

export async function serverText() {
  const t = (await getTranslations("server")) as unknown as T;
  return {
    done(key: DoneKey, values?: Values): SuccessMessage {
      return { title: t(`done.${key}.title`, values), detail: t.has(`done.${key}.detail`) ? t(`done.${key}.detail`, values) : undefined };
    },
    invalid: (key: InvalidKey, values?: Values) => t(`invalid.${key}`, values),
    error: (key: ErrorKey, values?: Values) => t(`errors.${key}`, values),
    /** Zod messages: our keys are translated, zod's own words pass through. */
    field: (message: string) => (t.has(`invalid.${message}`) ? t(`invalid.${message}`) : message),
  };
}

export type ServerText = Awaited<ReturnType<typeof serverText>>;
