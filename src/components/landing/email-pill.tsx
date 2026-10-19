"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** The prompt-style pill: type a work email, go straight to sign-up with it filled in. */
export function EmailPill() {
  const t = useTranslations("landing.pill");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [as, setAs] = useState<"agency" | "freelancer">("agency");
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  function go(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams({ as });
    if (valid) q.set("email", email.trim());
    router.push(`/sign-up?${q.toString()}`);
  }
  return (
    <form onSubmit={go} className="flex w-full items-center gap-2 rounded-full bg-[var(--g-soft)] p-2 ps-3 transition-shadow focus-within:shadow-[0_0_0_2px_#1a73e8]">
      <div className="flex shrink-0 rounded-full bg-white p-1 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.06)]" role="radiogroup" aria-label={t("joiningAs")}>
        {(["agency", "freelancer"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={as === v} onClick={() => setAs(v)}
            className={cn("rounded-full px-3 py-1.5 transition-colors", as === v ? "bg-[var(--g-ink)] text-white" : "text-[var(--g-muted)] hover:text-[var(--g-ink)]")}>
            {v === "agency" ? t("agency") : t("freelancer")}
          </button>
        ))}
      </div>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")}
        aria-label={t("email")} autoComplete="email"
        className="min-w-0 flex-1 bg-transparent px-2 text-[16px] text-[var(--g-ink)] outline-none placeholder:text-[var(--g-muted)]/70" />
      <button type="submit" aria-label={t("submit")}
        className={cn("flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-95",
          valid ? "bg-[var(--g-ink)] text-white" : "bg-[var(--g-soft-2)] text-[var(--g-muted)]")}>
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}
