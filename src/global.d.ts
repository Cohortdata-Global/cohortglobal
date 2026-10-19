import type messages from "./messages/en.json";

/**
 * Typed messages (B4, ID-49): every t("…") key is checked against en.json at
 * build time, so a missing or misspelt key fails `pnpm typecheck`.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: "en";
    Messages: typeof messages;
  }
}
