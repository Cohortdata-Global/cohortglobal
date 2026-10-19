"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Unexpected errors only. Expected problems come back from Server Actions as messages. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[26px] font-semibold text-ink">{t("title")}</h1>
      <p className="mt-2 max-w-md text-[15px] text-ink-2">{t.rich("body", { ref: error.digest ?? t("none"), b: (c) => <span className="tabular font-medium">{c}</span> })}</p>
      <Button className="mt-7" onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
