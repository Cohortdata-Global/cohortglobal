import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app/brand";
import { titled } from "@/i18n/metadata";

export const generateMetadata = titled("notFound");

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Brand />
      <h1 className="mt-10 text-[28px] font-semibold text-ink">{t("notFoundTitle")}</h1>
      <p className="mt-2 max-w-md text-[15px] text-ink-2">{t("notFoundBody")}</p>
      <Button asChild className="mt-7"><Link href="/home">{t("goHome")}</Link></Button>
    </main>
  );
}
