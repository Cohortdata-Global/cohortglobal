import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/app/brand";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("terms");

/** DRAFT placeholder. The final text must come from CohortData's legal review (see docs/TODO.md). */
export default async function Page() {
  const t = await getTranslations("legal");
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Brand />
      <h1 className="mt-10 text-[30px] font-semibold text-ink">{t("terms")}</h1>
      <p className="mt-4 rounded-md border border-amber-600/25 bg-amber-50 px-4 py-3 text-[14px] text-amber-700">{t("draft")}</p>
      <p className="mt-6 text-[15px] leading-relaxed text-ink-2">{t("body")}</p>
      <Link href="/" className="mt-8 inline-block text-[14px] text-pine-700 hover:underline">{t("back")}</Link>
    </div>
  );
}
