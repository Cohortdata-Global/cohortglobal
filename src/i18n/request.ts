import { getRequestConfig } from "next-intl/server";

/**
 * English only in v1 (confirmed Q9). The structure is ready for more locales:
 * add src/messages/<locale>.json and choose the locale here (cookie or profile).
 */
export default getRequestConfig(async () => {
  const locale = "en";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "UTC",
  };
});
